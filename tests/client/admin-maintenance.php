<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, User};
use App\Services\WorldResetService;
use Illuminate\Support\Facades\{Artisan, DB};
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
set_exception_handler(function (Throwable $e) { fwrite(STDERR, (string) $e . PHP_EOL); exit(1); });
$root = getenv('NO7_ENTRY_TEST_ROOT');
// Artisan down/up must never write the application's real maintenance files.
$app->useStoragePath($root . '/maintenance-storage');
@mkdir(storage_path('framework'), 0700, true);
$checks = 0;
$check = function ($ok, $message) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($message); };
$service = app(WorldResetService::class);
$game = Game::firstOrFail();
User::create('maintenance-member', \App\Domain\Password::fromString('fixture-password'));
$users = User::count(); $migrations = DB::table('migrations')->count();
$site = DB::table('entry_slideshows')->get()->toJson();
$directory = public_path('var/turn-status');
@mkdir($directory, 0755, true);
file_put_contents("$directory/game-{$game->id}.json", 'live');
file_put_contents("$directory/game-999999999.json", 'orphan');
file_put_contents("$directory/keep.txt", 'source');
$before = $service->preview();
$check($before['counts']['games'] === Game::count() && Game::count() > 0, 'Preview preserves games');
$result = $service->cleanStatusFiles();
$check($result['removed'] >= 1 && !$result['failed'], 'Orphan hints removed');
$check(is_file("$directory/game-{$game->id}.json") && is_file("$directory/keep.txt"), 'Live hints and unrelated files preserved');
try { $service->reset(str_repeat('0',64), true); throw new RuntimeException('Stale confirmation accepted'); }
catch (HttpExceptionInterface $e) { $check($e->getStatusCode() === 409, 'Stale reset is rejected'); }
$check(!app()->isDownForMaintenance(), 'Stale confirmation does not put app down');
Game::deleting(function () { throw new RuntimeException('Injected reset failure'); });
try { $service->reset($service->preview()['token'], true); throw new RuntimeException('Failure not injected'); }
catch (RuntimeException $e) { $check($e->getMessage() === 'Injected reset failure', 'Reset surfaces its original error'); }
$check(!app()->isDownForMaintenance() && !is_file(storage_path('framework/maintenance.php')), 'Handled reset failure restores access');
Game::flushEventListeners();
$check(Game::count() === $before['counts']['games'], 'Failed first deletion rolls back');
$result = $service->reset($service->preview()['token'], true);
$check($result['reset_complete'] && !$result['cleanup_failed_game_ids'] && !$result['status_cleanup']['failed'], 'Reset and generated-file cleanup complete');
$check(!app()->isDownForMaintenance(), 'Successful reset restores access');
$check(array_sum($service->preview()['counts']) === 0, 'Entire game/map/template domain empty');
$check(User::count() === $users && DB::table('migrations')->count() === $migrations && DB::table('entry_slideshows')->get()->toJson() === $site, 'Accounts, migrations and homepage data preserved');
Artisan::call('down');
$service->reset($service->preview()['token'], true);
$check(app()->isDownForMaintenance(), 'Pre-existing maintenance remains owned by the operator');
Artisan::call('up');
$check(Artisan::call('game:reset-worlds') === 0 && Artisan::call('game:reset-worlds', ['--execute'=>true]) === 0, 'CLI reuses the same service after reset');
echo "PASS: $checks maintenance checks.\n";
