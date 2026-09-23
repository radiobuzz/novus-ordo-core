<?php
// Only the dedicated temporary database/public root is accepted by this bootstrap.
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, Nation, Turn};
use App\Integrations\AIPlayers\GameAdapter;
use ExperimentalAI\{Runner, Setup};
use Illuminate\Support\Facades\DB;

$mode = $argv[1] ?? 'setup';
$adapter = app(GameAdapter::class);
$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
if (in_array($mode, ['setup', 'verify'], true)) {
    $count = (int) ($argv[2] ?? 6);
    $map = ($argv[3] ?? '') === 'generated' ? App\Domain\GeneratedMapData::fromArray(json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR)) : null;
    if ($mode === 'setup') Game::query()->update(['is_active' => false]); // Single-game simulation fixture only.
    $game = $mode === 'verify' ? Game::getCurrent()->fresh() : Game::createNew($map,
        fn ($game) => app(Setup::class)->populate($game, ['count' => $count, 'seed' => 'viability-1', 'behavior' => 'mixed']));
    $check($game->nations()->count() === $count, 'Bot creation count differs');
    $check($game->freeSuitableTerritoriesInTurn()->count() >= 5, 'No human start remains');
    $status = $adapter->status($game);
    $context = $status + ['nation_id' => $status['next_nation_id']];
    $before = [DB::table('orders')->count(), DB::table('deployments')->count(), DB::table('production_bids')->count()];
    $preview = app(Runner::class)->step($game, $context, true);
    $check($before === [DB::table('orders')->count(), DB::table('deployments')->count(), DB::table('production_bids')->count()], 'Preview wrote commands');
    $result = app(Runner::class)->step($game, $context);
    $check($result['status'] === 'played', 'First step failed');
    $check($game->nationsReadyForNextTurn()->count() === 1, 'More than one player became ready');
    $before = DB::table('deployments')->count();
    $check(app(Runner::class)->step($game, $context)['status'] === 'already_processed', 'Duplicate step replayed');
    $check(DB::table('deployments')->count() === $before, 'Duplicate built units');
    echo json_encode(['bots' => $count, 'generated_map' => $game->map()->exists(), 'preview' => $preview['plan']['explanation'], 'step' => $result]) . "\n";
} elseif ($mode === 'run') {
    $limit = (int) ($argv[2] ?? 20);
    for ($i = 0; $i < $limit; $i++) {
        $game = Game::getCurrent()->fresh(); $turn = Turn::getCurrentForGame($game);
        if ($game->getVictoryStatus()->name === 'HasBeenWon') { echo "VICTORY\n"; break; }
        $start = microtime(true);
        while (($status = $adapter->status($game))['next_nation_id']) {
            app(Runner::class)->step($game, $status + ['nation_id' => $status['next_nation_id']]);
        }
        $summary = [];
        foreach ($game->nations()->get() as $nation) {
            $detail = $nation->getDetail(); $budget = $detail->exportBudget();
            $row = DB::table('ai_players')->where('nation_id', $nation->getId())->first();
            $summary[] = ['nation' => $nation->getInternalName(), 'pop' => round($detail->getPopulationSize() / 1000000, 2),
                'land' => $detail->territories()->count(), 'army' => $detail->getNumberOfDivisions(),
                'capital' => round($budget->stockpiles['Capital'], 1), 'net' => round($budget->balances['Capital'], 1),
                'food' => round($budget->stockpiles['Food'], 1), 'state' => json_decode($row->memory ?? '[]', true)['state'] ?? null];
        }
        $next = $game->tryNextTurn($turn);
        $check($next->getNumber() === $turn->getNumber() + 1, 'Simulation did not advance');
        echo json_encode(['turn' => $turn->getNumber(), 'seconds' => round(microtime(true) - $start, 2), 'nations' => $summary]) . "\n";
        flush();
    }
} elseif ($mode === 'summary') {
    $game = Game::getCurrent();
    echo json_encode(['game' => $game->getId(), 'turn' => $game->getCurrentTurn()->getNumber(),
        'bots' => DB::table('ai_players')->where('game_id', $game->getId())->count(),
        'neutral_battles' => DB::table('battles')->where('game_id', $game->getId())->whereNull('defender_nation_id')->count(),
        'nation_battles' => DB::table('battles')->where('game_id', $game->getId())->whereNotNull('defender_nation_id')->count(),
        'failures' => DB::table('ai_player_turns')->where('game_id', $game->getId())->where('status', 'failed')->count(),
        'reports' => $adapter->report($game)]) . "\n";
} else throw new RuntimeException('Unknown fixture mode');
