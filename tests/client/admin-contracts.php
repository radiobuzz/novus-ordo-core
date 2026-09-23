<?php
// Database contracts run ONLY through the explicit isolated test bootstrap.
$app = require __DIR__ . '/isolated-app.php';

use App\Http\Controllers\AdminController;
use App\Models\{Deployment, Division, Game, Turn};
use App\Services\AdminGameService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpKernel\Exception\HttpException;

$check = function (bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); };
$reject = function (callable $operation, int $status) use ($check): void {
    try { $operation(); throw new RuntimeException('Expected rejection'); }
    catch (HttpException $error) { $check($error->getStatusCode() === $status, 'Unexpected rejection status'); }
};
$controller = app(AdminController::class);
$active = Game::getCurrent();
$turn = Turn::getCurrentForGame($active);
$before = [$active->getId(), $turn->getId(), Game::count()];
foreach (['division' => Division::whereHas('details')->first(), 'deployment' => Deployment::first()] as $kind => $object) {
    $check($object !== null, 'Run a gameplay fixture journey before these object contracts.');
    $request = Request::create('/inspect', 'GET', ['kind' => $kind, 'id' => $object->getId()]);
    $game = $object->getGame();
    $response = $controller->inspect($request, $game)->getData(true);
    $check($response[$kind . '_id'] === $object->getId() && $response['game_id'] === $game->getId(), 'Inspector lost its game scope');
    $wrongGame = Game::where('id', '<>', $game->getId())->firstOrFail();
    $reject(fn () => $controller->inspect($request, $wrongGame), 404);
}
$service = app(AdminGameService::class);
$reject(fn () => $service->changeTurn($active, $turn->getId() + 1000000, 'advance'), 409);
$reject(fn () => $active->rollbackLastTurn($turn->getId() + 1000000), 409);

$lock = Cache::lock(Game::CacheLockKeyCritalSectionCreateGame, 20);
$check($lock->get(), 'Could not acquire fixture creation lock');
try {
    $reject(fn () => Game::createNew(), 409);
    $check(!$active->isUpkeeping(), 'Game creation blocked an existing game');
}
finally { $lock->release(); }
$check([Game::getCurrent()->getId(), Turn::getCurrentForGame($active)->getId(), Game::count()] === $before, 'Rejected operations changed game data');
echo "PASS: division/deployment inspection, cross-game rejection, stale turn/rollback, creation contention and independent upkeep (isolated DB).\n";
