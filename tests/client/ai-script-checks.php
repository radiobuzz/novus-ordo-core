<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Integrations\AIPlayers\GameAdapter;
use App\Models\{Game, Turn};
use ExperimentalAI\{Memory, ScriptCatalog, Runner, Setup};
use Illuminate\Support\Facades\{Artisan, DB};

Artisan::call('migrate', ['--force' => true]);
$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
$reject = function ($fn, $code) use ($check) {
    try { $fn(); } catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) {
        $check($error->getStatusCode() === $code, 'Unexpected error code'); return;
    }
    throw new RuntimeException('Expected rejection');
};
$game = Game::createNew(null, fn ($game) => app(Setup::class)->populate($game, ['count' => 3, 'seed' => 'author-kit-fixture']));
$adapter = app(GameAdapter::class);
$status = $adapter->status($game);
$id = $status['next_nation_id'];
$view = $adapter->observe($game, $id);
$initialAssignment = DB::table('ai_players')->where('nation_id', $id)->first();
$input = ['view' => $view, 'memory' => [], 'settings' => ['aggression' => $initialAssignment->aggression,
    'seed' => $initialAssignment->seed, 'protect_humans' => $status['protect_humans']]];
$dir = getenv('NO7_ENTRY_TEST_ROOT') . '/scripts';
if (!is_dir($dir)) mkdir($dir);
foreach (glob(__DIR__ . '/ai-script-fixtures/*.php') as $file) copy($file, $dir . '/' . basename($file));
copy(base_path('modules/ai-player/scripts/experimental-v1.php'), $dir . '/experimental-v1.php');
config(['ai-player.scripts_path' => $dir]);
$scripts = app(ScriptCatalog::class);
$check(in_array('holding', array_column($scripts->all(), 'id')), 'Discovery failed');
$check(isset($view['workspace']['divisions'], $view['public_territories'], $view['battle_logs']), 'Player information missing');
$check(json_encode($view['workspace']) === json_encode(json_decode(json_encode(app(App\Services\PlayerWorkspace::class)->export($game->nations()->findOrFail($id))), true)), 'Client owner payload differs');
$check($scripts->decide('holding', $input)['memory']['count'] === 1, 'Standalone worker failed');
try { $scripts->decide('malformed', $input); throw new LogicException('Accepted malformed plan'); }
catch (RuntimeException $error) { $check(str_contains($error->getMessage(), 'Unknown decision field'), 'Wrong format error'); }
config(['ai-player.timeout_seconds' => .2]);
try { $scripts->decide('timeout', $input); throw new LogicException('Timeout missing'); }
catch (Symfony\Component\Process\Exception\ProcessTimedOutException) {}
config(['ai-player.timeout_seconds' => 20]);
echo "PASS discovery, shared client information, worker format and timeout\n";

$switch = function ($script) use ($game, $adapter, $id) {
    $adapter->control($game, $adapter->status($game), 'script', $id, null, $script);
};
$switch('holding');
$stale = $adapter->status($game);
$switch('broken');
$reject(fn () => app(Runner::class)->step($game, $stale), 409);
$result = app(Runner::class)->step($game, $adapter->status($game) + ['nation_id' => $id]);
$check($result['script'] === 'experimental-v1' && $result['fallback']['script'] === 'broken', 'Execution fallback failed');
$assignment = DB::table('ai_players')->where('nation_id', $id)->first();
$check($assignment->script === 'broken', 'Fallback replaced selected script');
$books = Memory::notebooks(json_decode($assignment->memory, true));
$check(!isset($books['broken']), 'Failed script memory was saved');
echo "PASS changed selection rejects stale work; failure falls back without changing assignment\n";

// Restore unready within the disposable fixture to exercise another decision.
DB::table('nations')->where('id', $id)->update(['is_ready_for_next_turn' => false]);
$switch('holding');
$preview = app(Runner::class)->step($game, $adapter->status($game) + ['nation_id' => $id], true);
$check($preview['plan']['memory']['count'] === 1 && !$game->nations()->find($id)->isReadyForNextTurn(), 'Preview committed state');
app(Runner::class)->step($game, $adapter->status($game) + ['nation_id' => $id]);
$switch('experimental-v1');
$switch('holding');
$books = Memory::notebooks(json_decode(DB::table('ai_players')->where('nation_id', $id)->value('memory'), true));
$check($books['holding']['count'] === 1 && isset($books['experimental-v1']), 'Per-script memory lost');
$check($game->nations()->find($id)->isReadyForNextTurn(), 'Switch changed readiness');
echo "PASS preview and separate notebooks; switching preserves readiness\n";

DB::table('nations')->where('id', $id)->update(['is_ready_for_next_turn' => false]);
$switch('illegal');
// Compare the default preview against the final default decision after a rejected partial application.
$baseline = $scripts->decide('experimental-v1', ['view' => $adapter->observe($game, $id),
    'memory' => $books['experimental-v1'], 'settings' => $input['settings']]);
$result = app(Runner::class)->step($game, $adapter->status($game) + ['nation_id' => $id]);
$check($result['script'] === 'experimental-v1' && $result['fallback']['script'] === 'illegal', 'Illegal orders did not fall back');
$report = json_decode(DB::table('ai_player_turns')->where('nation_id', $id)->latest('id')->value('result'), true);
$check($report['commands']['bids'] === $baseline['bids'], 'Rejected bids leaked into fallback');
$check(!isset($report['memory_store']['_scripts']['illegal']), 'Illegal notebook committed');
echo "PASS illegal action transaction rolls back before fallback\n";

// Real turn progression and rollback restore the entire notebook snapshot.
while (($status = $adapter->status($game))['next_nation_id']) app(Runner::class)->step($game, $status + ['nation_id' => $status['next_nation_id']]);
$game->tryNextTurnIfNationsReady(Turn::getCurrentForGame($game));
$turn2 = Turn::getCurrentForGame($game);
$check($turn2->getNumber() === 2, 'Fixture did not advance');
$developed = $input;
$developed['view'] = $adapter->observe($game->fresh(), $id);
$switch('holding');
app(Runner::class)->step($game, $adapter->status($game) + ['nation_id' => $id]);
$game->rollbackLastTurn($turn2->getId());
$restored = Memory::notebooks(json_decode(DB::table('ai_players')->where('nation_id', $id)->value('memory'), true));
$check($restored['holding']['count'] === 1, 'Rollback leaked future notebook');
echo "PASS rollback restores per-script memory\n";

// Keep demonstrably synthetic snapshots in the distributable kit; never export the active application game.
$out = base_path('modules/ai-player/author-kit/novus-ai-author/snapshots');
if (!is_dir($out)) mkdir($out, 0775, true);
file_put_contents($out . '/opening.json', json_encode($input, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
$after = $input;
$after['view'] = $adapter->observe($game->fresh(), $id);
file_put_contents($out . '/pending-orders.json', json_encode($after, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
file_put_contents($out . '/second-turn.json', json_encode($developed, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
echo "PASS generated standalone kit snapshots from synthetic fixture only\n";
