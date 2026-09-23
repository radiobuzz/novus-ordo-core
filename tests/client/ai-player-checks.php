<?php
$app = require __DIR__ . '/isolated-app.php';

use App\Domain\{DeploymentCommand, DivisionType};
use App\Integrations\AIPlayers\GameAdapter;
use App\Models\{Game, Turn};
use App\Services\NationCommands;
use ExperimentalAI\{Runner, Setup, V1Experimental};
use Illuminate\Support\Facades\DB;

$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
$reject = function (callable $work, int $code) use ($check) {
    try { $work(); } catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e) {
        $check($e->getStatusCode() === $code, 'Wrong rejection: ' . $e->getMessage()); return;
    }
    throw new RuntimeException('Expected rejection ' . $code);
};
$game = Game::getCurrent()->fresh(); $adapter = app(GameAdapter::class);
$nation = $game->nations()->firstOrFail(); $other = $game->nations()->where('id', '!=', $nation->getId())->firstOrFail();
$state = fn () => [$game->nations()->orderBy('id')->get()->toJson(), DB::table('orders')->orderBy('id')->get()->toJson(),
    DB::table('deployments')->orderBy('id')->get()->toJson(), DB::table('production_bids')->orderBy('id')->get()->toJson()];

// Compare the extracted pure forecast with the authoritative allocator, including cutoff and reserve fallback.
foreach ([['Food' => 0], ['Food' => 2, 'Ore' => 1], ['Food' => 100, 'Ore' => 100], ['Oil' => 20]] as $index => $values) {
    DB::beginTransaction();
    try {
        $view = $adapter->observe($game, $nation->getId());
        $bids = array_map(fn ($name) => ['resource_type' => $name, 'max_quantity' => ($values[$name] ?? 0) * 1000000,
            'max_labor_allocation_per_unit' => $index === 3 ? 250000 : 2147483647], ['Food', 'Material', 'Ore', 'Oil']);
        $forecast = $adapter->forecast($view['planning'], $view['pools'], $bids, $view['production_raw']);
        $nation->getDetail()->placeProductionPlan($bids);
        $actual = $nation->fresh()->getDetail()->exportBudget();
        foreach ($forecast as $name => $row) $check(abs($row['production'] - $actual->production[$name] * 1000000) < 2, "Forecast diverges: case $index $name");
    } finally { DB::rollBack(); }
}
echo "PASS allocator/forecast parity (four plans)\n";

$territory = $other->getDetail()->territories()->firstOrFail();
$reject(fn () => app(NationCommands::class)->deploy($nation, [new DeploymentCommand($territory->getId(), DivisionType::Infantry)]), 422);
DB::beginTransaction();
try {
    DB::table('ai_player_games')->where('game_id', $game->getId())->update(['protect_humans' => true]);
    DB::table('ai_players')->where('nation_id', $other->getId())->delete();
    $check(!$adapter->canEngage($nation, $territory), 'Protected human can be attacked');
    $check($adapter->canEngage($other, $nation->getDetail()->territories()->firstOrFail()), 'Protection stopped human attack');
    $check($adapter->canCommand($other), 'Released nation is not playable');
    $check($game->nations()->whereKey($other->getId())->exists(), 'Deleting controller deleted nation');
    $neutral = $game->freeSuitableTerritoriesInTurn()->firstOrFail();
    $check($adapter->canEngage($nation, $neutral), 'Neutral incorrectly protected');
    $next = Turn::getCurrentForGame($game)->createNext();
    $copy = $neutral->getDetail(Turn::getForGameByNumberOrNull($game, $next->getNumber() - 1))->replicateForTurn($next);
    $copy->owner_nation_id = $other->getId(); $copy->save();
    $check(!$adapter->canEngage($nation, $neutral, $next), 'Protection missed same-turn change of ownership');
    DB::table('ai_players')->where('game_id', $game->getId())->delete();
    config(['ai-player.enabled' => false]);
    $check($adapter->canAdvance($game, $next), 'Handed-over human-only game depends on disabled bot module');
    config(['ai-player.enabled' => true]);
} finally { DB::rollBack(); }
echo "PASS ownership, human protection, same-turn ownership change, controller removal preserves nation\n";

$manual = $game->nations()->firstOrFail();
DB::beginTransaction();
try {
    $adapter->control($game, $adapter->status($game), 'takeover', $manual->getId());
    $check(!$adapter->isAI($manual->getId()), 'Controller release did not create a manual nation');
    $wasReady = (bool) $manual->fresh()->isReadyForNextTurn();
    $status = $adapter->status($game);
    $adapter->control($game, $status, 'assign', $manual->getId(), 85);
    $assignment = DB::table('ai_players')->where('nation_id', $manual->getId())->first();
    $check($assignment && (int) $assignment->aggression === 85, 'Manual nation was not assigned to AI');
    $check((bool) $manual->fresh()->isReadyForNextTurn() === $wasReady, 'AI assignment changed current readiness');
    $check(!in_array($manual->getId(), array_column($adapter->report($game)['manual_nations'], 'nation_id')), 'Assigned nation remains in manual list');
    $adapter->control($game, $adapter->status($game), 'takeover', $manual->getId());
    $check(!$adapter->isAI($manual->getId()), 'Released reassigned nation remains AI-controlled');
    $check(!$manual->fresh()->isReadyForNextTurn(), 'Released nation was not returned to Planning');
} finally { DB::rollBack(); }
echo "PASS reversible manual and AI control assignment\n";

$status = $adapter->status($game);
$context = $status + ['nation_id' => $status['next_nation_id']];
$adapter->control($game, $context, 'pause');
$check(!$adapter->canAdvance($game, Turn::getCurrentForGame($game)), 'Paused AI game can advance');
$reject(fn () => app(Runner::class)->step($game, $context), 409);
$status = $adapter->status($game); $adapter->control($game, $status, 'resume');
echo "PASS pause and stale generation fences\n";

$status = $adapter->status($game); $context = $status + ['nation_id' => $status['next_nation_id']];
$before = $state();
$broken = new class extends GameAdapter {
    public function apply(Game $game, int $id, array $plan): void {
        parent::apply($game, $id, $plan);
        throw new RuntimeException('injected-after-ready');
    }
};
try { (new Runner($broken, new ExperimentalAI\ScriptCatalog))->step($game, $context); throw new RuntimeException('Failure not injected'); }
catch (RuntimeException $e) { $check($e->getMessage() === 'injected-after-ready', $e->getMessage()); }
$check($state() === $before, 'Failed step leaked orders, bids, deployments or Ready');
$check($adapter->status($game)['paused'], 'Failure did not pause game');
$check(DB::table('ai_player_turns')->where('nation_id', $context['nation_id'])->where('turn_id', $context['turn_id'])->where('generation', $context['generation'])->value('status') === 'failed', 'Failure not recorded');
$adapter->control($game, $adapter->status($game), 'resume');
echo "PASS atomic decision rollback and failure reporting\n";

$status = $adapter->status($game); $context = $status + ['nation_id' => $status['next_nation_id']];
app(Runner::class)->step($game, $context);
$check(app(Runner::class)->step($game, $context)['status'] === 'already_processed', 'Duplicate request selected next AI');
if ($game->getCurrentTurn()->getNumber() > 1) {
    $game->rollbackLastTurn($context['turn_id']);
    $restored = $adapter->status($game->fresh());
    $check($restored['generation'] !== $context['generation'], 'Rollback kept generation');
    $reject(fn () => app(Runner::class)->step($game->fresh(), $context), 409);
    $check(!$restored['next_nation_id'], 'Restored completed AI turns became eligible for replay');
    echo "PASS rollback restores completed AI readiness without replay\n";
}
echo "PASS duplicate step and context fences\n";
