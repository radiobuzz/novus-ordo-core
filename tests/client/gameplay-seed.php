<?php
// Explicit isolated bootstrap is mandatory. No live game/user is ever modified.
$app = require __DIR__ . '/isolated-app.php';
Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
$classic = ($argv[1] ?? '') === 'classic';
$map = $classic ? null : App\Domain\GeneratedMapData::fromArray(json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR));
// This legacy single-game journey explicitly archives prior isolated fixtures.
App\Models\Game::query()->update(['is_active' => false]);
$game = App\Models\Game::createNew($map);
$user = App\Models\User::where('name', 'map-player')->first() ?? new App\Models\User();
$user->name = 'map-player'; $user->email = 'map-player@example.test';
$user->password = Illuminate\Support\Facades\Hash::make('fixture-password');
$user->is_admin = false; $user->save();
$eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id');
$connections = App\Models\Territory::getTerritoryConnections($game);
$home = [];
foreach ($eligible->sortByDesc('usable_land_ratio') as $start) {
    $queue = [$start->getId()]; $seen = [];
    while ($queue && count($seen) < App\Models\Game::NUMBER_OF_STARTING_TERRITORIES) {
        $id = array_shift($queue);
        if (isset($seen[$id])) continue;
        $seen[$id] = true;
        foreach ($connections[$id] as $edge)
            if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
    }
    if (count($seen) === App\Models\Game::NUMBER_OF_STARTING_TERRITORIES) { $home = array_keys($seen); break; }
}
if (!$home) throw new RuntimeException('Fixture has no connected homeland.');
$nation = App\Models\NewNation::create($game, $user, 'Gameplay Test Nation')->finishSetup(homeTerritoryIds: $home, leaderName: 'Test Leader');
echo 'Isolated ' . ($classic ? 'classic' : 'beta') . " gameplay fixture: game {$game->getId()}, nation {$nation->getId()}.\n";
