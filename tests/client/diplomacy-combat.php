<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Domain\{DivisionType, RelationState};
use App\Models\{Division, DivisionDetail, Game, Nation, NationMessage, Order, Territory, Turn};
use App\Services\{DiplomacyService, GameMutation};
use Illuminate\Support\Facades\DB;

$fixture = json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/diplomacy-fixture.json'), true);
$game = Game::findOrFail($fixture['game_id']); [$a, $b, $c] = array_map(fn ($id) => Nation::findOrFail($id), array_slice($fixture['nations'], 0, 3));
$rules = app(DiplomacyService::class);
$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$unit = function ($nation, $territory, $type = DivisionType::Infantry) {
    $division = new Division(); $division->game_id = $nation->game_id; $division->nation_id = $nation->id; $division->division_type = $type->value; $division->save();
    DivisionDetail::create($division, $territory); return $division;
};
$case = function (string $label, callable $work) use ($game) {
    DB::beginTransaction();
    try { app(GameMutation::class)->run($game, $work); echo "PASS: $label\n"; }
    finally { DB::rollBack(); }
};
$homeA = $a->getDetail()->territories()->first(); $homeB = $b->getDetail()->territories()->first();
$turn = Turn::getCurrentForGame($game);
$case('peace forbids attacks; alliance permits passage and cancels queued hostile orders', function () use ($rules, $a, $b, $homeA, $homeB, $turn, $unit, $check) {
    $d = $unit($a, $homeA); $pair = $rules->pair($a, $b->id);
    $check(!$d->getDetail()->canMoveTo($homeB), 'Peace destination permitted');
    $rules->change($pair, $turn, RelationState::NoRelations);
    Order::createRaidOrder($d, $homeB);
    $rules->change($pair, $turn, RelationState::Allied); $rules->cancelProtectedOrders($pair, $turn);
    $check(!$d->getDetail()->getOrderOrNull(), 'Incompatible attack survived pact');
    $check($a->getDetail()->hasSafePassageThrough($homeB) && !$a->getDetail()->isHostileTerritory($homeB), 'Allied passage unavailable');
});
$case('shared defence includes eligible allies and excludes protected bystanders', function () use ($rules, $a, $b, $c, $homeB, $turn, $unit, $check) {
    $rules->change($rules->pair($a, $b->id), $turn, RelationState::NoRelations);
    $rules->change($rules->pair($b, $c->id, true), $turn, RelationState::Allied);
    $visitor = $unit($c, $homeB);
    $check($rules->defenders($homeB, $a, $turn)->contains('id', $visitor->id), 'Ally did not defend');
    $rules->change($rules->pair($a, $c->id, true), $turn, RelationState::Peace);
    $check(!$rules->defenders($homeB, $a, $turn)->contains('id', $visitor->id), 'Protected visitor fought');
    $rules->change($rules->pair($a, $c->id), $turn, RelationState::Allied);
    $check(!$rules->defenders($homeB, $a, $turn)->contains('id', $visitor->id), 'Shared ally fought against ally');
});
$case('deliberate combat starts war with participating defenders and grants their report access', function () use ($game, $rules, $a, $b, $c, $homeA, $homeB, $turn, $unit, $check) {
    $rules->change($rules->pair($a, $b->id), $turn, RelationState::NoRelations);
    $rules->change($rules->pair($b, $c->id, true), $turn, RelationState::Allied);
    $unit($c, $homeB); $attacker = $unit($a, $homeA); Order::createRaidOrder($attacker, $homeB);
    $battle = $rules->resolveAttack($homeB, $turn, $turn, collect([$attacker]));
    $check($battle && $rules->state($a, $b) === RelationState::War && $rules->state($a, $c) === RelationState::War, 'Participation did not start war');
    $check($c->getDetail()->getAllBattlesWhereParticipant()->contains('id', $battle->id), 'Defending ally cannot see battle');
});
$case('changed neutral target causes accidental combat without war; later allies reinforce first owner', function () use ($game, $rules, $a, $b, $homeA, $turn, $unit, $check) {
    $rules->change($rules->pair($a, $b->id), $turn, RelationState::NoRelations);
    $neutral = $game->freeSuitableTerritoriesInTurn()->first();
    $d = $unit($a, $homeA); $order = Order::createRaidOrder($d, $neutral);
    $check($order->intent_captured && $order->intended_owner_nation_id === null, 'Neutral intent not captured');
    $neutral->getDetail()->conquer($b);
    $battle = $rules->resolveAttack($neutral, $turn, $turn, collect([$d]));
    $check($battle && $rules->state($a, $b) === RelationState::NoRelations, 'Accidental collision declared war');
    $rules->change($rules->pair($a, $b->id), $turn, RelationState::Allied);
    $neutral->getDetail()->conquer($b); $d2 = $unit($a, $homeA); Order::createRaidOrder($d2, $neutral);
    $check($rules->resolveAttack($neutral, $turn, $turn, collect([$d2])) === null, 'Allies fought over conquest');
    $check($d2->getDetail()->territory_id === $neutral->id && $neutral->getDetail()->getOwnerOrNull()->id === $b->id, 'First conqueror ownership/reinforcement wrong');
});
$case('five protected resolutions precede expiry; visiting troops return and rollback restores alliance', function () use ($game, $rules, $a, $b, $homeA, $homeB, $turn, $unit, $check) {
    $pair = $rules->pair($a, $b->id); $rules->change($pair, $turn, RelationState::Allied);
    $d = $unit($a, $homeB);
    $rules->cancelTreaty($a, $b->id, $rules->detail($pair, $turn)->revision);
    for ($i = 2; $i <= 6; $i++) {
        $game->fresh()->tryNextTurn(Turn::getCurrentForGame($game));
        $state = $rules->state($a, $b);
        $check($state === ($i < 6 ? RelationState::Allied : RelationState::NoRelations), 'Expiry happened on wrong turn ' . $i);
        if ($i < 6) $check($d->getDetail()->territory_id === $homeB->id, 'Troops returned too early');
    }
    $check($d->getDetail()->getTerritory()->getDetail()->getOwnerOrNull()->id === $a->id, 'Troops did not return home');
    $check(NationMessage::where('relation_id', $pair->id)->where('event_type', 'troops_returned')->exists(), 'Return notice missing');
    $game->fresh()->rollbackLastTurn(Turn::getCurrentForGame($game)->id);
    $check($rules->state($a, $b) === RelationState::Allied && $d->getDetail()->territory_id === $homeB->id, 'Rollback did not restore visiting troops');
});
$case('nation without home disbands stranded visitors with a notice', function () use ($game, $rules, $a, $b, $homeB, $turn, $unit, $check) {
    $pair = $rules->pair($a, $b->id); $rules->change($pair, $turn, RelationState::NoRelations);
    $d = $unit($a, $homeB);
    DB::table('territory_details')->where('turn_id', $turn->id)->where('owner_nation_id', $a->id)->update(['owner_nation_id' => null]);
    $rules->finishTurn($game, $turn);
    $check(!$d->getDetail()->isActive(), 'Stranded division remained active');
    $check(NationMessage::where('relation_id', $pair->id)->where('event_type', 'troops_disbanded')->exists(), 'Disband notice missing');
});

$case('queued deployments reserve grantable stock; projected output cannot be given away', function () use ($a, $homeA, $check) {
    $grants = app(\App\Services\NationGrantService::class);
    $before = (float) $grants->available($a)['Capital'];
    app(\App\Services\NationCommands::class)->deploy($a, [new \App\Domain\DeploymentCommand($homeA->id, DivisionType::Infantry)]);
    $check((float) $grants->available($a)['Capital'] <= $before - 3, 'Queued deployment did not reserve money');
    DB::table('nation_resource_stockpiles')->where('nation_id', $a->id)->where('turn_id', $a->getDetail()->turn_id)
        ->where('resource_type', \App\Domain\ResourceType::Capital->value)->update(['available_quantity' => 0]);
    $check($grants->available($a)['Capital'] === '0.0000', 'Unproduced Capital was grantable');
});

$initial = Turn::getCurrentForGame($game); $revision = $game->fresh()->turn_context_revision;
try {
    app(GameMutation::class)->run($game, function () use ($game, $initial, $check) {
        $game->fresh()->tryNextTurn($initial);
        $game->fresh()->exportReadyStatus();
        $check(app(\App\Services\GameTurnStatus::class)->read($game->id)['state'] === 'processing', 'Ready hint published before outer commit');
        throw new RuntimeException('outer-command-failure');
    });
} catch (RuntimeException $error) { $check($error->getMessage() === 'outer-command-failure', $error->getMessage()); }
$check(Turn::getCurrentForGame($game)->id === $initial->id && $game->fresh()->turn_context_revision === $revision, 'Outer failure partially committed turn');
$check(app(\App\Services\GameTurnStatus::class)->read($game->id)['state'] === 'failed', 'Rolled-back command left processing hint');
$game->fresh()->exportReadyStatus();
echo "PASS: nested turn commits its ready hint only after outer commit; outer failure rolls back all state and repairs hints.\n";

$case('ordinary turn pipeline records diplomatic battle participants and reaches victory', function () use ($game, $rules, $a, $b, $homeA, $homeB, $unit, $check) {
    $turn = Turn::getCurrentForGame($game);
    $rules->change($rules->pair($a, $b->id), $turn, RelationState::NoRelations);
    // A synthetic final-turn position: one supplied army, dominant loyal territory, one hostile target.
    $territories = $game->territories()->where(\App\Models\Territory::whereIsControllable())->get();
    foreach ($territories as $territory) {
        $territory->getDetail($turn)->conquer($territory->id === $homeB->id ? $b : $a);
    }
    DB::table('nation_territory_loyalties')->where('turn_id', $turn->id)->update(['loyalty' => 0]);
    foreach ($territories as $territory) {
        if ($territory->id === $homeB->id) continue;
        \App\Models\NationTerritoryLoyalty::setLoyaltyRatioIfNotSet($a, $territory, $turn, 1);
        \App\Models\NationTerritoryLoyalty::getLoyaltyOrNull($a, $territory, $turn)->setLoyaltyRatio(1);
    }
    DB::table('nation_resource_stockpiles')->where('nation_id', $a->id)->where('turn_id', $turn->id)->update(['available_quantity' => 100000]);
    $attacker = $unit($a, $homeA); Order::createRaidOrder($attacker, $homeB);
    $a->getDetail()->onDeployment();
    $game->fresh()->tryNextTurn($turn);
    $check($rules->state($a, $b) === RelationState::War, 'Turn pipeline omitted deliberate war');
    $check($a->getDetail()->getAllBattlesWhereParticipant()->count() === 1, 'Battle not recorded in next turn');
    $check($game->fresh()->getVictoryStatus()->name === 'HasBeenWon', 'Diplomacy interfered with victory resolution');
});
