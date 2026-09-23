<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Integrations\AIPlayers\GameAdapter;
use App\Models\Game;
use ExperimentalAI\Runner;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

// Share real file-backed locks between two independent processes, never live cache files.
config(['cache.default' => 'file', 'cache.stores.file.path' => getenv('NO7_ENTRY_TEST_ROOT') . '/ai-cache',
    'cache.stores.file.lock_path' => getenv('NO7_ENTRY_TEST_ROOT') . '/ai-locks']);
$game = Game::getCurrent();
if (isset($argv[1])) {
    $result = app(Runner::class)->step($game, json_decode($argv[1], true, flags: JSON_THROW_ON_ERROR));
    echo json_encode($result); exit;
}
$adapter = app(GameAdapter::class); $status = $adapter->status($game);
if (!$status['next_nation_id']) throw new RuntimeException('Race fixture requires an unready AI.');
$context = $status + ['nation_id' => $status['next_nation_id']];
$before = $game->nationsReadyForNextTurn()->count();
$processes = [];
for ($i = 0; $i < 2; $i++) {
    $process = new Process([PHP_BINARY, __FILE__, json_encode($context)]);
    $process->setTimeout(60); $process->start(); $processes[] = $process;
}
$results = [];
foreach ($processes as $process) {
    $process->wait();
    $result = json_decode($process->getOutput(), true);
    if (!$process->isSuccessful() || !$result) throw new RuntimeException($process->getOutput() . $process->getErrorOutput());
    $results[] = $result['status'];
}
sort($results);
if ($results !== ['already_processed', 'played'] || $game->nationsReadyForNextTurn()->count() !== $before + 1)
    throw new RuntimeException('Concurrent requests did not commit exactly once: ' . json_encode($results));
if (DB::table('ai_player_turns')->where('nation_id', $context['nation_id'])->where('turn_id', $context['turn_id'])
    ->where('generation', $context['generation'])->where('status', 'complete')->count() !== 1) throw new RuntimeException('Duplicate completion records');
echo "PASS two processes, shared game locks, exactly one committed AI turn\n";
