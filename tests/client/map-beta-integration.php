<?php
// Run only with isolated-app.php's explicit temporary database configuration.
$app = require __DIR__ . '/isolated-app.php';

use App\Domain\GeneratedMapData;
use App\Models\{Game, GameMap, Territory, User};
use Illuminate\Support\Facades\Artisan;
use Illuminate\Validation\ValidationException;

function checkMap(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
Artisan::call('migrate', ['--force' => true]);
$snapshot = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$map = GeneratedMapData::fromArray($snapshot);
checkMap(count($map->mapData->territories) === $snapshot['regionColumns']*$snapshot['regionRows'], 'Incomplete map adapter');
$beforeValidation = Game::count();
foreach (['duplicate', 'missing', 'terrain', 'geometry'] as $invalid) {
    $bad = $snapshot;
    if ($invalid === 'duplicate') $bad['cells'][1] = $bad['cells'][0];
    if ($invalid === 'missing') array_pop($bad['cells']);
    if ($invalid === 'terrain') $bad['cells'][0][3] = 'unexpected';
    if ($invalid === 'geometry') $bad['cells'][0][0] = 10000;
    try { GeneratedMapData::fromArray($bad); throw new RuntimeException('Bad map accepted'); }
    catch (ValidationException) {}
    checkMap(Game::count() === $beforeValidation, 'Validation created a game');
}
$game = Game::createNew($map);
checkMap($game->territories()->count() === $snapshot['regionColumns']*$snapshot['regionRows'], 'Territories not persisted');
checkMap($game->map()->first()->getSnapshot() == $snapshot, 'Saved geography differs from preview');
$land = $game->territories()->where(Territory::whereIsControllable())->get();
$expectedLand = count(array_filter($map->mapData->territories, fn($t) => $t->usableLandRatio > 0));
checkMap($land->count() === $expectedLand, 'Land cells discarded');
foreach ($land as $territory) checkMap($territory->usable_land_ratio > 0, 'Non-positive land area');
$connections = Territory::getTerritoryConnections($game);
foreach ($connections as $from => $edges) foreach ($edges as $edge) {
    checkMap($connections[$edge->connectedTerritoryId]->contains(fn ($reverse) => $reverse->connectedTerritoryId === $from && $reverse->isConnectedByLand === $edge->isConnectedByLand), 'Asymmetric connection');
}
$count = Game::count();
GameMap::created(fn () => throw new RuntimeException('injected-map-failure'));
try { Game::createNew($map); throw new RuntimeException('Expected injected failure'); }
catch (RuntimeException $error) { checkMap($error->getMessage() === 'injected-map-failure', 'Unexpected transaction failure'); }
GameMap::flushEventListeners();
checkMap(Game::count() === $count && $game->fresh()->isActive(), 'Creation was not atomic');
foreach (['map-admin' => true, 'map-player' => false] as $name => $admin) {
    $user = User::where('name', $name)->first() ?? new User();$user->name=$name;$user->email=$name.'@example.test';
    $user->password=Illuminate\Support\Facades\Hash::make('fixture-password');$user->is_admin=$admin;$user->save();
}
echo "PASS: validated snapshot, exact persistence, all sampled land regions, symmetric connections, simultaneous active games and atomic rollback.\n";
