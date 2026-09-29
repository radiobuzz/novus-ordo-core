<?php
// All destructive setup and gameplay mutations use the guarded temporary database.
$app = require __DIR__ . '/isolated-app.php';
require_once __DIR__ . '/generated-map-fixture.php';

use App\Domain\{NationOfferKind, NationOfferStatus, RelationState};
use App\Models\{Game, Nation, NationMessage, NationOffer, NationOfferDetail, NationResourceStockpile, NewNation, Territory, Turn, User};
use App\Services\{DiplomacyService, GameMutation, NationCommunicationService, NationGrantService};
use Illuminate\Support\Facades\{Artisan, DB, Hash};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$reject = function (callable $work, int $status) use ($check) {
    try { $work(); throw new RuntimeException('Expected rejection ' . $status); }
    catch (HttpExceptionInterface $error) { $check($error->getStatusCode() === $status, $error->getMessage()); }
    catch (Illuminate\Database\Eloquent\ModelNotFoundException $error) { $check($status === 404, $error->getMessage()); }
};
Artisan::call('migrate:fresh', ['--force' => true]);
$game = Game::createNew(generatedMapFixture());
$otherGame = Game::createNew(generatedMapFixture());
$home = function (Game $game): array {
    $eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id');
    $edges = Territory::getTerritoryConnections($game);
    foreach ($eligible as $start) {
        $queue = [$start->getId()]; $seen = [];
        while ($queue && count($seen) < 5) {
            $id = array_shift($queue); if (isset($seen[$id])) continue; $seen[$id] = true;
            foreach ($edges[$id] as $edge) if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
        }
        if (count($seen) === 5) return array_keys($seen);
    }
    throw new RuntimeException('No connected home');
};
$nations = [];
foreach (['diplomat-a', 'diplomat-b', 'diplomat-c', 'diplomat-foreign'] as $i => $name) {
    $g = $i === 3 ? $otherGame : $game;
    $user = new User(); $user->name = $name; $user->email = $name . '@example.test';
    $user->password = Hash::make('fixture-password'); $user->is_admin = false; $user->save();
    $nation = NewNation::create($g->fresh(), $user, $name)->finishSetup($home($g->fresh()), $name . ' leader');
    $nations[] = $nation;
    foreach (['money', 'food', 'material', 'ore', 'oil'] as $key) {
        $resourceId = $nation->getDetail()->resources()->get($key)['id'];
        $stock = NationResourceStockpile::where('nation_id', $nation->getId())->where('turn_id', $g->getCurrentTurn()->getId())->where('resource_id', $resourceId)->first();
        if (!$stock) $stock = NationResourceStockpile::create($nation, $g->getCurrentTurn(), $key, '0');
        $stock->available_quantity = 1000; $stock->save();
    }
    $nation->getDetail()->onDeployment();
}
[$a, $b, $c, $foreign] = $nations;
$messages = app(NationCommunicationService::class); $diplomacy = app(DiplomacyService::class);
$key = fn () => (string) Str::uuid();
$balance = fn ($nation, $resource = 'money') => $nation->fresh()->getDetail()->getStockpiledQuantity($resource);
$check($game->fresh()->diplomacy_enabled && $game->fresh()->turn_context_revision, 'New game missing diplomacy/context');
$textKey = $key(); $first = $messages->send($a, $b->getId(), 'Meet at the border <script>no execution</script>', $textKey);
$check($messages->send($a, $b->getId(), 'Meet at the border <script>no execution</script>', $textKey) === $first, 'Text request duplicated');
$reject(fn () => $messages->send($a, $b->getId(), 'Different text', $textKey), 409);
$reject(fn () => $messages->send($a, $foreign->getId(), 'Foreign game', $key()), 404);
$reject(fn () => $messages->send($a, $a->getId(), 'Self', $key()), 422);
$check($messages->inbox($c)['conversations'] === [], 'Private conversation leaked to third nation');
$check($messages->inbox($b)['conversations'][0]['unread'] === 1, 'Incoming message not unread');
$messages->markRead($b, $a->getId(), $first['message_id']);
$check($messages->inbox($b)['conversations'][0]['unread'] === 0, 'Read position failed');
$offerKey = $key();
$offer = $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $offerKey, 'money', '12.3456');
$check($messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $offerKey, 'money', '12.3456') === $offer, 'Offer request duplicated');
$reject(fn () => $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $offerKey, 'money', '13'), 409);
$before = [$balance($a), $balance($b)];
$reject(fn () => $messages->respond($a, $offer['offer_id'], 'accept'), 403);
$reject(fn () => $messages->respond($c, $offer['offer_id'], 'accept'), 404);
$result = $messages->respond($b, $offer['offer_id'], 'accept');
$check($result['status'] === 'Accepted', 'Grant was not accepted');
$after = [$balance($a), $balance($b)];
$check(abs($after[0] - $before[0] + 12.3456) < 0.000001 && abs(array_sum($after) - array_sum($before)) < 0.000001, 'Grant did not conserve balances');
$messages->respond($b, $offer['offer_id'], 'accept');
$check([$balance($a), $balance($b)] === $after, 'Repeated acceptance debited again');
$reject(fn () => $messages->respond($a, $offer['offer_id'], 'cancel'), 409);
foreach (['food', 'material', 'ore', 'oil'] as $resource) {
    $o = $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $key(), $resource, '0.0001');
    $before = $balance($a, $resource) + $balance($b, $resource);
    $check($messages->respond($b, $o['offer_id'], 'accept')['status'] === 'Accepted', 'Resource grant rejected');
    $check(abs($balance($a, $resource) + $balance($b, $resource) - $before) < 0.000001, 'Resource conservation failed');
}
$reject(fn () => $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $key(), 'recruitment', 1), 422);
foreach (['0', '-1', '0.0000001', '1e3', [], true, '1000000000000000'] as $invalid) {
    try { NationGrantService::quantity($invalid); throw new RuntimeException('Invalid amount accepted'); }
    catch (HttpExceptionInterface $error) { $check($error->getStatusCode() === 422, $error->getMessage()); }
    catch (Illuminate\Validation\ValidationException) {}
}
$huge = $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $key(), 'money', '1000000');
$before = [$balance($a), $balance($b)];
$check($messages->respond($b, $huge['offer_id'], 'accept')['status'] === 'Invalid', 'Unavailable stock not rejected');
$check($before === [$balance($a), $balance($b)], 'Invalid grant moved resources');
$failing = $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $key(), 'money', '1');
NationOfferDetail::updating(fn () => throw new RuntimeException('injected-offer-failure'));
try { $messages->respond($b, $failing['offer_id'], 'accept'); throw new RuntimeException('Failure not injected'); }
catch (RuntimeException $error) { $check($error->getMessage() === 'injected-offer-failure', $error->getMessage()); }
finally { NationOfferDetail::flushEventListeners(); }
$check($before === [$balance($a), $balance($b)], 'Failed status write left a partial grant');
$check(NationOfferDetail::where('offer_id', $failing['offer_id'])->first()->status === NationOfferStatus::Pending, 'Failed grant lost pending state');
$messages->respond($a, $failing['offer_id'], 'cancel');

$pair = $diplomacy->pair($a, $b->getId()); $turn = Turn::getCurrentForGame($game);
$revision = $diplomacy->detail($pair, $turn)->revision;
$peaceKey = $key(); $peace = $messages->propose($a, $b->getId(), NationOfferKind::Peace, $peaceKey, basisRevision: $revision);
$check($messages->propose($a, $b->getId(), NationOfferKind::Peace, $peaceKey, basisRevision: $revision) === $peace, 'Peace request duplicated');
$messages->respond($b, $peace['offer_id'], 'accept');
$check($diplomacy->state($a, $b) === RelationState::Peace, 'Peace not established');
$revision = $diplomacy->detail($pair, $turn)->revision;
app(GameMutation::class)->run($game, fn () => $diplomacy->cancelTreaty($a, $b->getId(), $revision));
$check($diplomacy->detail($pair, $turn)->ends_on_turn_number === 6, 'Five-turn notice wrong');
$check($diplomacy->state($a, $b) === RelationState::Peace, 'Cancellation removed protection immediately');
$oldRevision = $game->fresh()->turn_context_revision;
$game->fresh()->tryNextTurn($turn);
$check($game->fresh()->turn_context_revision !== $oldRevision, 'Advance did not rotate context');
$turn2 = Turn::getCurrentForGame($game);
$prior = [$balance($a), $balance($b)];
$text2 = $messages->send($a, $b->getId(), 'Text survives rollback', $key());
$gift2 = $messages->propose($a, $b->getId(), NationOfferKind::ResourceGrant, $key(), 'money', '2');
$messages->respond($b, $gift2['offer_id'], 'accept');
$game->fresh()->rollbackLastTurn($turn2->getId());
$check($game->fresh()->turn_context_revision !== $oldRevision, 'Rollback reused old context');
$check(NationMessage::find($text2['message_id'])->body === 'Text survives rollback', 'Rollback removed human text');
$check(NationOffer::find($gift2['offer_id']) === null, 'Rolled-back offer remains actionable');
$check(NationOfferDetail::where('offer_id', $offer['offer_id'])->first()->status === NationOfferStatus::Accepted, 'Rollback reverted an earlier planning-turn gift');
$check(abs($balance($a) - $after[0]) < 0.000001, 'Rollback did not restore prior treasury');

file_put_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/diplomacy-fixture.json', json_encode(['game_id' => $game->id,
    'other_game_id' => $otherGame->id, 'nations' => array_map(fn ($n) => $n->id, $nations)], JSON_THROW_ON_ERROR));
echo "PASS: isolated conversations, authorization, unread markers, request deduplication, five resources, conservation, duplicate acceptance, invalid/failing transfers, peace/cancellation, advance and rollback.\n";
