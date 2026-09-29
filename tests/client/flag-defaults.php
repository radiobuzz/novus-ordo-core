<?php
// Regression coverage for creation without an editor recipe, on guarded temporary data only.
$app = require __DIR__ . '/isolated-app.php';
class_exists(App\Http\Controllers\UiController::class);
$game = App\Models\Game::where('is_active', true)->firstOrFail();
foreach (['entry-recovery' => true, 'entry-legacy' => false] as $username => $upload) {
    $user = App\Models\User::where('name', $username)->firstOrFail();
    Illuminate\Support\Facades\Auth::login($user);
    $context = new App\Services\LoggedInGameContext();
    $available = $game->freeSuitableTerritoriesInTurn()->get();
    $ids = [];
    foreach ($available as $first) {
        $candidate = [$first->getId()];
        for ($i = 0; $i < count($candidate) && count($candidate) < App\Models\Game::NUMBER_OF_STARTING_TERRITORIES; $i++) {
            foreach ($available->firstWhere('id', $candidate[$i])->connectedLands()->pluck('connected_territory_id') as $id) {
                if ($available->contains('id', $id) && !in_array($id, $candidate) && count($candidate) < App\Models\Game::NUMBER_OF_STARTING_TERRITORIES) $candidate[] = $id;
            }
        }
        if (count($candidate) === App\Models\Game::NUMBER_OF_STARTING_TERRITORIES) { $ids = $candidate; break; }
    }
    $request = new App\Http\Controllers\CreateNationUiRequest($context);
    Illuminate\Http\Request::createFrom(Illuminate\Http\Request::create('/client/setup/nation', 'POST'), $request);
    $request->setContainer($app)->setRedirector(app('redirect'));
    $request->replace(['nation_name' => 'Flag Fixture ' . $username, 'leader_name' => 'Fixture Leader', 'territory_ids_as_json' => json_encode($ids)]);
    if ($upload) $request->files->set('nation_flag', Illuminate\Http\UploadedFile::fake()->image('uploaded.jpg', 160, 90));
    $request->validateResolved();
    $nation = app(App\Services\NationCreationService::class)->create($request, $context);
    if ($nation->getDetail()->flag_design !== null || !$nation->getDetail()->flag_src) throw new RuntimeException('Default/uploaded flag contract changed');
}
echo "PASS: ordinary JPEG uploads and assigned default flags create nations with no invented recipe.\n";
