<?php

// Destructive setup is confined to the explicitly isolated temporary database.
$app = require __DIR__ . '/isolated-app.php';
set_exception_handler(function (Throwable $error) { fwrite(STDERR, (string) $error . PHP_EOL); exit(1); });
require_once __DIR__ . '/generated-map-fixture.php';

use App\Integrations\AIPlayers\GameAdapter;
use App\Models\{Game, Turn};
use ExperimentalAI\{Runner, Setup};
use Illuminate\Support\Facades\{Artisan, DB, Route, Schema};
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$checks = 0;
$check = function (bool $condition, string $message) use (&$checks): void {
    $checks++;
    if (!$condition) throw new RuntimeException($message);
};
$reject409 = function (callable $work) use ($check): void {
    try {
        $work();
        throw new RuntimeException('Expected a stale or paused passive-player rejection.');
    } catch (HttpExceptionInterface $error) {
        $check($error->getStatusCode() === 409, $error->getMessage());
    }
};

Artisan::call('migrate:fresh', ['--force' => true]);
config(['ai-player.enabled' => true, 'cache.default' => 'array']);
$game = Game::createNew(
    generatedMapFixture(),
    fn (Game $new) => app(Setup::class)->populate($new, ['count' => 2]),
);
$adapter = app(GameAdapter::class);
$runner = app(Runner::class);
$status = $adapter->status($game);

$check($status !== null && $status['mode'] === 'passive', 'Game did not acquire passive participants.');
$check(count($status['players']) === 2 && $status['next_nation_id'] !== null, 'Passive participants were not provisioned.');
foreach (['strategy', 'aggression', 'script', 'memory', 'protect_humans', 'enabled'] as $retired) {
    $check(!Schema::hasColumn('ai_players', $retired) && !Schema::hasColumn('ai_player_games', $retired), "Retired strategic field remains: $retired");
}
$check(Route::getRoutes()->getByName('admin.ai-author-kit') === null, 'Strategic author-kit route remains.');
$check(Route::getRoutes()->getByName('admin.ai-snapshot') === null, 'Strategic snapshot route remains.');

// Pausing blocks both the passive step and turn advancement; resuming rotates context.
$beforePauseGeneration = $status['generation'];
$adapter->control($game, $status, 'pause');
$paused = $adapter->status($game);
$check($paused['paused'] && $paused['generation'] !== $beforePauseGeneration, 'Pause did not invalidate the active context.');
$reject409(fn () => $runner->step($game, $paused + ['nation_id' => $paused['next_nation_id']]));
$reject409(fn () => $game->fresh()->tryNextTurn(Turn::getCurrentForGame($game)));
$adapter->control($game, $paused, 'resume');
$status = $adapter->status($game);
$check(!$status['paused'] && $status['generation'] !== $paused['generation'], 'Resume did not reopen a fresh context.');

$commandTables = ['deployments', 'orders', 'nation_resource_acquisitions', 'nation_policy_pending_changes', 'nation_messages', 'nation_offers'];
$counts = fn () => array_map(fn ($table) => DB::table($table)->count(), $commandTables);
$firstTurnId = $game->getCurrentTurn()->id;

for ($season = 1; $season <= 3; $season++) {
    $turn = Turn::getCurrentForGame($game->fresh());
    $before = $counts();
    $processed = [];
    while (($status = $adapter->status($game->fresh()))['next_nation_id'] !== null) {
        $result = $runner->step($game->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
        $check($result['status'] === 'ready' && $result['mode'] === 'passive', 'Passive step attempted strategic execution.');
        $processed[] = $result['nation_id'];
    }
    $check(count(array_unique($processed)) === 2, "Season $season did not ready each passive nation exactly once.");
    $check($counts() === $before, "Season $season passive steps issued a game command.");
    $rows = DB::table('ai_player_turns')->where('game_id', $game->id)->where('turn_id', $turn->id)->get();
    $check($rows->count() === 2 && $rows->every(function ($row) {
        $result = json_decode($row->result, true, flags: JSON_THROW_ON_ERROR);
        return $row->status === 'complete' && $result['mode'] === 'passive'
            && !array_intersect(array_keys($result), ['plan', 'commands', 'strategy', 'memory']);
    }), "Season $season completion history contains strategic output.");
    $next = $game->fresh()->tryNextTurnIfNationsReady($turn);
    $check($next->id !== $turn->id && $next->number === $turn->number + 1, "Season $season did not advance normally.");
    $check(DB::table('nation_details')->where('game_id', $game->id)->where('turn_id', $next->id)->count() === 2,
        "Season $season skipped ordinary national simulation.");
    $check(DB::table('nation_resource_stockpiles')->where('game_id', $game->id)->where('turn_id', $next->id)->exists(),
        "Season $season skipped ordinary resource settlement.");
}

$latest = Turn::getCurrentForGame($game->fresh());
$latestGeneration = $adapter->status($game->fresh())['generation'];
$turnCount = $game->turns()->count();
$game->fresh()->rollbackLastTurn($latest->id);
$restored = Turn::getCurrentForGame($game->fresh());
$rolledBack = $adapter->status($game->fresh());
$check($game->turns()->count() === $turnCount - 1 && $restored->id !== $firstTurnId,
    'Rollback did not restore the preceding simulated season.');
$check($rolledBack['generation'] !== $latestGeneration && !$rolledBack['paused'], 'Rollback did not reset passive lifecycle context.');
$check($rolledBack['next_nation_id'] === null && collect($rolledBack['players'])->every(fn ($player) => $player['ready']),
    'Rollback lost recorded passive readiness for the reopened season.');
$replayed = $game->fresh()->tryNextTurnIfNationsReady($restored);
$check($replayed->number === $latest->number, 'Reopened completed season could not be resolved again.');
$check(DB::table('nation_details')->where('game_id', $game->id)->where('turn_id', $replayed->id)->count() === 2,
    'Rollback replay skipped ordinary national simulation.');

echo "PASS: $checks passive-player checks across pause/resume, three seasons, ordinary simulation and rollback/replay.\n";
