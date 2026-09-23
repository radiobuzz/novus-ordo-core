<?php
// Destructive fixtures are confined to this explicit, temporary test database/public root.
$app = require __DIR__ . '/isolated-app.php';

use App\Domain\GeneratedMapData;
use App\Integrations\AIPlayers\GameAdapter;
use App\Models\{Game, Nation, NewNation, Territory, Turn, User};
use App\Services\{AdminGameService, GameTurnStatus, SelectedGame, StaticJavascriptResource};
use ExperimentalAI\{Runner, Setup};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Artisan, Cache, DB, Hash};
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$check = function ($ok, string $message): void { if (!$ok) throw new RuntimeException($message); };
$reject = function (callable $work, int $status) use ($check): void {
    try { $work(); throw new RuntimeException('Expected rejection'); }
    catch (HttpExceptionInterface $error) { $check($error->getStatusCode() === $status, $error->getMessage()); }
    catch (Illuminate\Database\Eloquent\ModelNotFoundException $error) { $check($status === 404, $error->getMessage()); }
};
Artisan::call('migrate:fresh', ['--force' => true]);
$map = GeneratedMapData::fromArray(json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR));
$a = Game::createNew();
$resolver = app(SelectedGame::class);
$check($resolver->resolve(Request::create('/game'))->getId() === $a->getId(), 'Single-game compatibility failed');
$b = Game::createNew($map, fn ($game) => app(Setup::class)->populate($game, ['count' => 1, 'seed' => 'multi-game-test']));
$check($a->fresh()->isActive() && $b->isActive(), 'Creation deactivated a game');
$check($a->map()->first() === null && $b->map()->first()->getSnapshot() === $map->snapshot, 'Map identity changed');
$reject(fn () => Game::getCurrent(), 409);
$reject(fn () => $resolver->resolve(Request::create('/game')), 409);
$check($resolver->resolve(Request::create('/client/entry'), false) === null, 'Unselected login chose a game');
foreach ([$a, $b] as $game) {
    $id = $game->getId();
    $check($resolver->resolve(Request::create('/game?game_id=' . $id))->getId() === $id, 'Query selection failed');
    $check($resolver->resolve(Request::create('/nation', 'POST', ['game_id' => $id]))->getId() === $id, 'Body selection failed');
    $check($resolver->resolve(Request::create('/nation', 'POST', ['client_context' => ['game_id' => $id]]))->getId() === $id, 'Command selection failed');
    $request = Request::create('/game', 'GET', [], [], [], ['HTTP_X_GAME_ID' => (string) $id]);
    $check($resolver->resolve($request)->getId() === $id, 'Header selection failed');
}
$reject(fn () => $resolver->resolve(Request::create('/game?game_id=' . $a->getId(), 'GET', [], [], [], ['HTTP_X_GAME_ID' => $b->getId()])), 409);
$reject(fn () => $resolver->resolve(Request::create('/nation?game_id=' . $a->getId(), 'POST', ['game_id' => $b->getId()])), 409);
$reject(fn () => $resolver->resolve(Request::create('/nation', 'POST', ['game_id' => $a->getId(), 'client_context' => ['game_id' => $b->getId()]])), 409);
foreach ([null, '', 0, -1, 'no', [], 1.2, true] as $bad) {
    try { $resolver->resolve(Request::create('/game', 'GET', ['game_id' => $bad])); throw new RuntimeException('Invalid game accepted'); }
    catch (Illuminate\Validation\ValidationException) {}
}
$reject(fn () => $resolver->resolve(Request::create('/game?game_id=99999999')), 404);

$makeUser = function (string $name, bool $admin = false) {
    $user = new User(); $user->name = $name; $user->email = $name . '@example.test';
    $user->password = Hash::make('fixture-password'); $user->is_admin = $admin; $user->save();
    return $user;
};
$user = $makeUser('multi-player');
$makeUser('multi-spectator'); $makeUser('multi-joiner'); $makeUser('multi-admin', true);
$home = function (Game $game) {
    $eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id');
    $connections = Territory::getTerritoryConnections($game);
    foreach ($eligible as $start) {
        $queue = [$start->getId()]; $seen = [];
        while ($queue && count($seen) < Game::NUMBER_OF_STARTING_TERRITORIES) {
            $id = array_shift($queue);
            if (isset($seen[$id])) continue;
            $seen[$id] = true;
            foreach ($connections[$id] as $edge)
                if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
        }
        if (count($seen) === Game::NUMBER_OF_STARTING_TERRITORIES) return array_keys($seen);
    }
    throw new RuntimeException('No connected fixture homeland');
};
$na = NewNation::create($a->fresh(), $user, 'Shared Name')->finishSetup($home($a->fresh()), 'Leader A');
$nb = NewNation::create($b->fresh(), $user, 'Shared Name')->finishSetup($home($b->fresh()), 'Leader B');
$check(Nation::getForUserOrNull($a, $user)->getId() === $na->getId(), 'Nation A not scoped');
$check(Nation::getForUserOrNull($b, $user)->getId() === $nb->getId(), 'Nation B not scoped');
$check($na->getId() !== $nb->getId(), 'Same account did not get two nations');

// The creation transaction cannot change existing activity or leave a partial game behind.
$counts = [Game::count(), DB::table('territories')->count(), DB::table('turns')->count()];
try { Game::createNew(null, fn () => throw new RuntimeException('injected-create-failure')); }
catch (RuntimeException $error) { $check($error->getMessage() === 'injected-create-failure', $error->getMessage()); }
$check($counts === [Game::count(), DB::table('territories')->count(), DB::table('turns')->count()], 'Partial game survived creation failure');
$check($a->fresh()->isActive() && $b->fresh()->isActive(), 'Failed creation changed active games');

$status = app(GameTurnStatus::class);
$bHint = file_get_contents($status->path($b->getId()));
$creationLock = Cache::lock(Game::CacheLockKeyCritalSectionCreateGame, 60);
$check($creationLock->get(), 'Fixture lock failed');
try {
    $reject(fn () => Game::createNew(), 409);
    $check(!$a->isUpkeeping() && !$b->isUpkeeping(), 'Creation blocked existing games');
    app(AdminGameService::class)->changeTurn($a->fresh(), Turn::getCurrentForGame($a)->getId(), 'advance');
} finally { $creationLock->release(); }
$check(Turn::getCurrentForGame($a)->getNumber() === 2 && Turn::getCurrentForGame($b)->getNumber() === 1, 'Advance affected wrong game');
$check(file_get_contents($status->path($b->getId())) === $bHint, 'Game A changed Game B notification');
$check($status->read($a->getId())['turn_number'] === 2, 'Game A hint not advanced');
$reject(fn () => $a->tryNextTurn(Turn::getCurrentForGame($b)), 409);
$reject(fn () => app(AdminGameService::class)->changeTurn($a, Turn::getCurrentForGame($b)->getId(), 'advance'), 409);

// AI work in B can proceed while A is locked, and may not consume A's identity.
$adapter = app(GameAdapter::class);
$ai = $adapter->status($b);
$reject(fn () => $adapter->assertContext($b, [...$ai, 'game_id' => $a->getId()]), 409);
$aLock = Cache::lock($a->getCacheLockKeyForChangeTurn(), 60);
$check($aLock->get(), 'Fixture turn lock failed');
try {
    $check($a->isUpkeeping() && !$b->isUpkeeping(), 'Upkeep leaked between games');
    $played = app(Runner::class)->step($b->fresh(), $ai + ['nation_id' => $ai['next_nation_id']]);
    $check($played['status'] === 'played', 'Non-first active game AI failed');
    app(AdminGameService::class)->changeTurn($b->fresh(), Turn::getCurrentForGame($b)->getId(), 'advance');
} finally { $aLock->release(); }
$check(Turn::getCurrentForGame($a)->getNumber() === 2 && Turn::getCurrentForGame($b)->getNumber() === 2, 'Independent B advance failed');
$aHint = file_get_contents($status->path($a->getId()));
app(AdminGameService::class)->changeTurn($b->fresh(), Turn::getCurrentForGame($b)->getId(), 'rollback');
$check(Turn::getCurrentForGame($a)->getNumber() === 2 && Turn::getCurrentForGame($b)->getNumber() === 1, 'Rollback affected wrong game');
$check(file_get_contents($status->path($a->getId())) === $aHint, 'B rollback changed A notification');

// Static resources and cached territory lookups must stay game-specific.
$ra = StaticJavascriptResource::permanentForGame('multi-scope', fn () => 'A', $a);
$rb = StaticJavascriptResource::permanentForGame('multi-scope', fn () => 'B', $b);
$check($ra->renderAsRelativeUri() !== $rb->renderAsRelativeUri(), 'Static resource keys collided');
$ta = $a->territories()->first(); $tb = $b->territories()->first();
$check($a->getTerritoryWithId($ta->getId(), true)->game_id === $a->getId(), 'Cached A territory changed game');
$check($b->getTerritoryWithId($tb->getId(), true)->game_id === $b->getId(), 'Cached B territory changed game');
try { $b->getTerritoryWithId($ta->getId(), true); throw new RuntimeException('Foreign cached territory leaked'); }
catch (TypeError) {} // Existing non-null lookup contract rejects a missing territory.

$archived = Game::createNew(); $archived->disable(); $archived->save();
$reject(fn () => $resolver->resolve(Request::create('/game?game_id=' . $archived->getId())), 403);
$reject(fn () => $archived->tryNextTurn($archived->getCurrentTurn()), 409);
$reject(fn () => $archived->rollbackLastTurn(), 409);
$check(app(AdminGameService::class)->summary($archived)['active'] === false, 'Archived inspection unavailable');

// Scheduled upkeep visits all active games; no global current-game lookup.
foreach ([$a, $b] as $game) {
    $turn = Turn::getCurrentForGame($game); $turn->expires_at = now()->subMinute(); $turn->save();
}
$before = [Turn::getCurrentForGame($a)->getNumber(), Turn::getCurrentForGame($b)->getNumber()];
Artisan::call('app:server-upkeep');
$check([Turn::getCurrentForGame($a)->getNumber(), Turn::getCurrentForGame($b)->getNumber()] === [$before[0] + 1, $before[1] + 1], 'Scheduler did not advance both eligible games');
$check(Turn::getCurrentForGame($archived)->getNumber() === 1 && !$archived->fresh()->isActive(), 'Archived game was changed');
Artisan::call('app:ai-play', ['game' => $b->getId(), '--preview' => true]);
$check(str_contains(Artisan::output(), 'preview'), 'CLI AI did not target the second game');

$fixture = ['a' => $a->getId(), 'b' => $b->getId(), 'archived' => $archived->getId(),
    'user' => $user->getId(), 'nation_a' => $na->getId(), 'nation_b' => $nb->getId()];
file_put_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/multi-game.json', json_encode($fixture));
echo "PASS: independent classic/generated games, shared account, explicit contexts, creation rollback, locks, AI, advance/rollback, scheduler, caches, notifications and archive isolation.\n";
