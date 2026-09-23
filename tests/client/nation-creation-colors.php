<?php
// Real request validation and creation; all writes roll back in an isolated database.
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, User, NationColorAssignment, NationDetail};
use Illuminate\Support\Facades\{DB, Auth};
use Illuminate\Validation\ValidationException;

function checkCreationColor(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
DB::beginTransaction();
try {
    $game = Game::getCurrent();
    $available = $game->freeSuitableTerritoriesInTurn()->get();
    $ids = [];
    foreach ($available as $first) {
        $candidate = [$first->getId()];
        for ($i = 0; $i < count($candidate) && count($candidate) < Game::NUMBER_OF_STARTING_TERRITORIES; $i++) {
            foreach ($available->firstWhere('id', $candidate[$i])->connectedLands()->pluck('connected_territory_id') as $id) {
                if ($available->contains('id', $id) && !in_array($id, $candidate) && count($candidate) < Game::NUMBER_OF_STARTING_TERRITORIES) $candidate[] = $id;
            }
        }
        if (count($candidate) === Game::NUMBER_OF_STARTING_TERRITORIES) { $ids = $candidate; break; }
    }
    checkCreationColor(count($ids) === Game::NUMBER_OF_STARTING_TERRITORIES, 'Fixture needs a free homeland');
    $user = new User;
    $user->name = 'creation-colour-fixture'; $user->email = 'creation-colour@example.test';
    $user->password = 'not-a-login-fixture'; $user->save(); Auth::login($user);
    $context = new App\Services\LoggedInGameContext();
    class_exists(App\Http\Controllers\UiController::class);
    $primary = DB::table('nation_colors')->where('primary_allowed', true)->whereNotIn('id', NationColorAssignment::where('game_id', $game->getId())->pluck('primary_color_id'))->orderByDesc('id')->value('id');
    $make = function (array $colors) use ($app, $context, $ids) {
        $request = new App\Http\Controllers\CreateNationUiRequest($context);
        Illuminate\Http\Request::createFrom(Illuminate\Http\Request::create('/create-nation', 'POST'), $request);
        $request->setContainer($app)->setRedirector(app('redirect'));
        $request->replace(array_merge(['nation_name' => 'Creation Colour Fixture', 'leader_name' => 'Fixture Leader', 'territory_ids_as_json' => json_encode($ids)], $colors));
        $request->validateResolved();
        return $request;
    };
    $make([]); // Legacy form remains valid.
    foreach ([['primary_color_id' => 25, 'secondary_color_id' => 1], ['primary_color_id' => $primary]] as $invalid) {
        try { $make($invalid); throw new RuntimeException('Invalid colour pair accepted'); }
        catch (ValidationException) {}
    }
    $request = $make(['primary_color_id' => $primary, 'secondary_color_id' => 25]);
    $nation = app(App\Services\NationCreationService::class)->create($request, $context);
    $assignment = NationColorAssignment::findOrFail($nation->getId());
    checkCreationColor($assignment->primary_color_id === $primary && $assignment->secondary_color_id === 25, 'Chosen colours not persisted through creation');
    checkCreationColor($nation->getDetail() instanceof NationDetail, 'Nation setup did not finish');
    echo "PASS: request validates primary/secondary pair, rejects neutral primary, accepts legacy omission, and creation persists both chosen colours.\n";
} finally { DB::rollBack(); }
