<?php
$app = require __DIR__ . '/isolated-app.php';
require_once __DIR__ . '/generated-map-fixture.php';
use App\Models\{Game, Nation, NewNation, Territory, User};
use App\Services\{AdminGameService, LoggedInGameContext, NationCreationService};
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\{Request, UploadedFile};

$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
$game = Game::createNew(generatedMapFixture());
$user = User::create('lifecycle-join-' . $game->id, App\Domain\Password::randomize());
Auth::login($user);
$app->instance('request', Request::create('/client/setup/nation?game_id=' . $game->id, 'POST'));
$context = new LoggedInGameContext();
$eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id');
$edges = Territory::getTerritoryConnections($game);
$home = [];
foreach ($eligible as $start) {
    $queue = [$start->id]; $seen = [];
    while ($queue && count($seen) < 5) {
        $id = array_shift($queue); if (isset($seen[$id])) continue; $seen[$id] = true;
        foreach ($edges[$id] as $edge) if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
    }
    if (count($seen) === 5) { $home = array_keys($seen); break; }
}
class_exists(App\Http\Controllers\UiController::class);
$request = new App\Http\Controllers\CreateNationUiRequest($context);
Request::createFrom(Request::create('/client/setup/nation', 'POST'), $request);
$request->setContainer($app)->setRedirector(app('redirect'));
$request->replace(['nation_name' => 'Lifecycle Join', 'leader_name' => 'Fixture Leader', 'territory_ids_as_json' => json_encode($home)]);
$request->files->set('nation_flag', UploadedFile::fake()->image('flag.png', 300, 200));
$request->validateResolved();
$files = count(glob(public_path('var/entry-*.png')));
$service = app(AdminGameService::class);
$service->lifecycle($game, 'deactivate', $game->fresh()->turn_context_revision);
try { app(NationCreationService::class)->create($request, $context); throw new RuntimeException('Late join was accepted'); }
catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e) { $check($e->getStatusCode() === 409, 'Wrong late-join rejection'); }
$check(Nation::getForUserOrNull($game, $user) === null, 'Inactive game received a completed nation');
$check(NewNation::getForUserOrNull($game, $user) !== null, 'Pending setup was lost');
$check(count(glob(public_path('var/entry-*.png'))) === $files, 'Rejected join leaked an upload');
$service->lifecycle($game, 'activate', $game->fresh()->turn_context_revision);
$nation = app(NationCreationService::class)->create($request, $context);
$check($nation->getGame()->getId() === $game->id, 'Resumed setup changed game');
$check(count(glob(public_path('var/entry-*.png'))) === $files + 1, 'Successful join upload missing');
$service->lifecycle($game, 'delete', $game->fresh()->turn_context_revision);
$check(count(glob(public_path('var/entry-*.png'))) === $files, 'Created flag was not cleaned up');
echo "PASS: a validated join cannot finish after deactivation, failed upload is cleaned up, pending setup survives, reactivation allows completion, deletion cleans the created flag.\n";
