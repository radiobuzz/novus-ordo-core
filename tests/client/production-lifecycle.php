<?php
// Runs only through the guarded disposable database bootstrap.
require __DIR__ . '/passive-player-engine.php';
set_exception_handler(function (Throwable $e) { fwrite(STDERR, (string) $e); exit(1); });
use App\Services\{EconomyService, GameMutation, PlayerWorkspace, NationGrantService};
use App\Services\Policies\PolicyService;
use App\Services\Resources\{ProductionStateStore, ResourceLedger};
use App\Domain\Resources\Quantity as Q;
use App\Models\{NationResourceStockpile, TerritoryDetail};

$game = $game->fresh(); $nation = $game->nations()->orderBy('id')->first(); $other = $game->nations()->orderByDesc('id')->first();
$turn = $game->getCurrentTurn(); $detail = $nation->getDetail($turn); $cat = $detail->resources();
$economy = app(EconomyService::class); $ledger = app(ResourceLedger::class); $store = app(ProductionStateStore::class); $policies = app(PolicyService::class);
$before = $store->snapshot($game, $turn); $forecast = $economy->resolve($detail);
$check($forecast === $economy->resolve($detail), 'Identical stored inputs produced a different forecast.');
$check($before === $store->snapshot($game, $turn), 'Forecast wrote state.');
$workspace = app(PlayerWorkspace::class)->export($nation);
$check($workspace['economy']['forecast']['expected'] === $forecast['report'], 'Workspace uses another economy.');
$check(!isset($workspace['bids']) && count($workspace['acquisitions']) === count($cat->producers()), 'Retired bid payload or missing catalogue acquisitions.');
foreach ($cat->producers() as $key => $r) {
    $row = $workspace['production_planning']['rows'][$key];
    $check(Q::cmp($row['available'], $row['opening']) <= 0, 'Forecast output made actions affordable.');
}
foreach ($workspace['production_planning']['territories'] as $id => $local) {
    $check((int) $local['workforce'] === (int) $forecast['opening_territories'][$id]['workforce'], 'Inspector workforce differs from resolver.');
    foreach ($local['resources'] as $resource => $sector) foreach ($sector['owners'] as $owner => $activity) {
        $check(Q::add($activity['capacity'], $activity['development']) === Q::parse($forecast['state']['territories'][$id]['capacity'][$owner][$resource] ?? '0'), 'Inspector confuses current and newly built capacity.');
    }
}
$check($workspace['production_planning']['last_resources'] === $detail->resource_report, 'Saved forecast presented as historical resource result.');
$counter = $workspace['policies']['edit_counter'];
$plan = $ledger->plans($detail); $key = array_key_first(array_filter($cat->producers(), fn ($r) => $r['role'] !== 'nutrition'));
$plan[$key] = ['quantity' => '4.123456', 'spending_limit' => '20', 'priority' => 1];
$change = ['income_tax' => ['option' => 'standard', 'parameters' => ['rate' => '0.3']]];
$preview = $policies->preview($nation, $turn, $counter, $change, $plan);
$check($preview['valid'] && $before === $store->snapshot($game, $turn), 'Combined preview mutated or rejected valid intent.');
$policies->submit($nation, $turn, $counter, $change, $plan);
$check($ledger->plans($detail)[$key]['quantity'] === '4.123456', 'Combined save lost exact acquisition quantity.');
$saved = $store->snapshot($game, $turn);
$invalid = $plan; $invalid[$key]['spending_limit'] = '-1';
try { $policies->submit($nation, $turn, $counter, [], $invalid); throw new RuntimeException('Invalid plan accepted.'); }
catch (\Illuminate\Validation\ValidationException) {}
$check($saved === $store->snapshot($game, $turn) && $policies->state($nation, $turn)['pending'] === $change, 'Rejected combined save partially changed state.');
$forecast = $economy->resolve($detail);
$check($forecast['report'] === $preview['indicator_forecast']['expected'], 'Saved package differs from its draft forecast.');
// Transfers carry cost basis, cannot donate private stocks, and never rely on future output.
$stock = NationResourceStockpile::where('nation_id', $nation->id)->where('turn_id', $turn->id)->where('resource_id', $cat->get($key)['id'])->where('owner_kind', 'government')->firstOrFail();
$stock->available_quantity = '10'; $stock->cost_basis = '15'; $stock->save();
$target = $other->getDetail()->stockpiles()->where('resource_id', $cat->get($key)['id'])->firstOrFail(); $targetQuantity = $target->available_quantity; $targetBasis = $target->cost_basis;
app(GameMutation::class)->run($game, function () use ($nation, $other, $key, $check) { $check(app(NationGrantService::class)->transfer($nation, $other, $key, '2.000000'), 'Funded grant failed.'); });
$check($stock->fresh()->available_quantity === '8.000000' && $stock->fresh()->cost_basis === '12.000000', 'Grant did not debit carried basis.');
$check($target->fresh()->available_quantity === Q::add($targetQuantity, '2') && $target->fresh()->cost_basis === Q::add($targetBasis, '3'), 'Grant did not credit carried basis.');
// Capture transfers territorial capacity, not national civilian accounts or a fresh founding subsidy.
$neutral = TerritoryDetail::where('turn_id', $turn->id)->whereNull('owner_nation_id')->firstOrFail();
$capacityBefore = \Illuminate\Support\Facades\DB::table('territory_production_states')->where('turn_id', $turn->id)->where('territory_id', $neutral->territory_id)->pluck('installed_capacity', 'id')->all();
$accountsBefore = \Illuminate\Support\Facades\DB::table('nation_economic_accounts')->where('turn_id', $turn->id)->pluck('cash','id')->all();
app(GameMutation::class)->run($game, function () use ($neutral, $nation) { $neutral->conquer($nation); $neutral->resetLaborPool(); });
$check($accountsBefore === \Illuminate\Support\Facades\DB::table('nation_economic_accounts')->where('turn_id', $turn->id)->pluck('cash','id')->all(), 'Capture reseeded cash.');
$check($capacityBefore === \Illuminate\Support\Facades\DB::table('territory_production_states')->where('turn_id', $turn->id)->where('territory_id', $neutral->territory_id)->pluck('installed_capacity', 'id')->all(), 'Capture reseeded capacity.');
$forecasts = [];
foreach ($game->nations()->get() as $n) $forecasts[$n->id] = $economy->resolve($n->getDetail($turn));
$definitionCounts = [];
foreach (['resource_definitions','resource_rules','policies','policy_options'] as $table) $definitionCounts[$table] = \Illuminate\Support\Facades\DB::table($table)->count();
while (($status = $adapter->status($game->fresh()))['next_nation_id'] !== null) $runner->step($game->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
$next = $game->fresh()->tryNextTurn($turn);
foreach ($game->nations()->get() as $n) {
    $settled = $n->getDetail($next); $actual = $settled->economy_report; unset($actual['deserted_divisions']);
    $check($actual === json_decode(json_encode($forecasts[$n->id]['report'], JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR), 'Settlement differs from forecast.');
    $check($settled->resource_report === $forecasts[$n->id]['resources'], 'Owned goods report differs from forecast.');
    $check($settled->getStockpiledQuantity($cat->role('treasury')) === $actual['closing_treasury'], 'Treasury and report diverged.');
    $check(Q::add(Q::sub($actual['opening_treasury'], $actual['treasury_outflows']), $actual['treasury_inflows']) === $actual['closing_treasury'], 'Cash flow did not reconcile.');
}
$closed = $store->snapshot($game, $next);
$game->fresh()->rollbackLastTurn($next->id); $restored = $game->fresh()->getCurrentTurn();
$replayed = $game->fresh()->tryNextTurn($restored);
$check($closed === $store->snapshot($game, $replayed), 'Rollback/replay changed owned stocks, cost basis, civilian cash, capacity or requests.');
foreach ($definitionCounts as $table => $count) $check($count === \Illuminate\Support\Facades\DB::table($table)->count(), 'Season duplicated definitions.');
echo "PASS: $checks production lifecycle checks including passive seasons, exact forecasts, atomic plans, grants, capture and replay.\n";
// Add a real human participant for endpoint/browser checks in this disposable world.
$eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id'); $edges = \App\Models\Territory::getTerritoryConnections($game); $homes = [];
foreach ($eligible as $start) {
    $queue = [$start->id]; $seen = [];
    while ($queue && count($seen) < 5) {
        $id = array_shift($queue); if (isset($seen[$id])) continue; $seen[$id] = true;
        foreach ($edges[$id] as $edge) if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
    }
    if (count($seen) === 5) { $homes = array_keys($seen); break; }
}
$user = new \App\Models\User(); $user->name = 'production-player'; $user->email = 'production-player@example.test';
$user->password = \Illuminate\Support\Facades\Hash::make('fixture-password'); $user->is_admin = true; $user->save();
$human = \App\Models\NewNation::create($game->fresh(), $user, 'Production Republic')->finishSetup($homes, 'Test leader');
// Actual deployments consume only opening government goods and pay setup wages exactly once.
$humanDetail = $human->getDetail(); $humanTurn = $humanDetail->getTurn();
foreach ($humanDetail->stockpiles()->get() as $owned) {
    $owned->available_quantity = '1000'; $owned->cost_basis = $cat->get($cat->key($owned->resource_id))['kind'] === 'stock' ? '2000' : '0'; $owned->save();
}
app(GameMutation::class)->run($game, fn () => $human->deploy(new \App\Domain\DeploymentCommand($homes[0], \App\Domain\DivisionType::Infantry)));
$commandCosts = $ledger->costs($humanDetail)['commands'];
$check(Q::cmp($commandCosts[$cat->role('treasury')], '0') > 0, 'Deployment did not commit cash.');
foreach ($cat->producers() as $resourceKey => $_) $check($ledger->available($humanDetail)[$resourceKey] === Q::sub('1000', $commandCosts[$resourceKey]), 'Opening goods were not reserved for deployment.');
$militaryForecast = $economy->resolve($humanDetail);
while (($status = $adapter->status($game->fresh()))['next_nation_id'] !== null) $runner->step($game->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
$militaryTurn = $game->fresh()->tryNextTurn($humanTurn); $closedHuman = $human->getDetail($militaryTurn);
$check($closedHuman->economy_report['command_costs'] === $commandCosts[$cat->role('treasury')], 'Deployment wages were omitted or double charged.');
$check($closedHuman->getStockpiledQuantity($cat->role('treasury')) === $militaryForecast['report']['closing_treasury'], 'Military settlement differs from preview.');
$check($closedHuman->activeDivisions()->count() === 1, 'Funded division did not deploy.');
// Exercise the reactive Guard payment boundary and weighted stock basis.
$stocks = $closedHuman->stockpiles()->get()->keyBy(fn ($stock) => $human->id . ':' . $cat->key($stock->resource_id));
$remaining = $stocks->mapWithKeys(fn ($stock, $key) => [$key => $stock->available_quantity])->all();
$cashBefore = $closedHuman->getStockpiledQuantity($cat->role('treasury'));
$householdQuery = \Illuminate\Support\Facades\DB::table('nation_economic_accounts')->where('turn_id', $militaryTurn->id)->where('nation_id', $human->id)->where('account_kind', 'household');
$householdBefore = $householdQuery->value('cash');
$guard = new ReflectionMethod(\App\Services\GuardAllocator::class, 'payResponse');
$guardCosts = [$cat->role('treasury') => '2.000000', $key => '1.000000'];
app(GameMutation::class)->run($game, function () use ($guard, $human, $guardCosts, $stocks, &$remaining) { $guard->invokeArgs(app(\App\Services\GuardAllocator::class), [$human->id, $guardCosts, $stocks, &$remaining]); });
$closedHuman = $closedHuman->fresh(); $r = $closedHuman->economy_report;
$check(Q::add($cashBefore, $householdBefore) === Q::add($closedHuman->getStockpiledQuantity($cat->role('treasury')), $householdQuery->value('cash')), 'Guard response destroyed cash.');
$check(Q::add(Q::sub($r['opening_treasury'], $r['treasury_outflows']), $r['treasury_inflows']) === $r['closing_treasury'], 'Guard response report no longer reconciles.');
$check($r['earned_income'] === Q::add($militaryForecast['report']['earned_income'], '2'), 'Response wages missing from earned income.');
$check($closedHuman->resource_report[$key]['government_closing'] === $closedHuman->getStockpiledQuantity($key), 'Guard goods report diverged.');
echo "PASS: $checks lifecycle checks including opening commitments and reactive Guard cash/goods.\n";
// Preserve the previous economy suite's crisis/desertion/rollback invariant in the live resolver.
\Illuminate\Support\Facades\DB::beginTransaction();
try {
    $crisisGame = $game->fresh(); $crisisRules = $crisisGame->economy_rules; $crisisRules['desertion_rate'] = 1;
    $crisisGame->economy_rules = $crisisRules; $crisisGame->save();
    $crisisTurn = $crisisGame->getCurrentTurn(); $crisisDetail = $human->fresh()->getDetail($crisisTurn);
    $crisisState = $crisisDetail->economy_state; $crisisState['debt'] = '100';
    $crisisState['fiscal'] = ['receipts' => ['0'], 'credit_lock' => 0, 'default_episode' => false];
    $crisisDetail->economy_state = $crisisState; $crisisDetail->save();
    \Illuminate\Support\Facades\DB::table('nation_resource_stockpiles')->where('nation_id', $human->id)->where('turn_id', $crisisTurn->id)->update(['available_quantity' => '0', 'cost_basis' => '0']);
    \Illuminate\Support\Facades\DB::table('nation_economic_accounts')->where('nation_id', $human->id)->where('turn_id', $crisisTurn->id)->update(['cash' => '0']);
    $divisionId = $crisisDetail->activeDivisions()->firstOrFail()->id;
    while (($status = $adapter->status($crisisGame->fresh()))['next_nation_id'] !== null) $runner->step($crisisGame->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
    $crisisNext = $crisisGame->fresh()->tryNextTurn($crisisTurn);
    $crisisClosed = $human->fresh()->getDetail($crisisNext);
    $check($crisisClosed->economy_report['fiscal']['new_default'], 'Unpaid interest did not start the default episode.');
    $check(in_array($divisionId, $crisisClosed->economy_report['deserted_divisions']), 'Forced unfunded division did not desert.');
    $check(!\App\Models\Order::where('division_id', $divisionId)->where('turn_id', $crisisNext->id)->exists(), 'Desertion retained orders.');
    $crisisGame->fresh()->rollbackLastTurn($crisisNext->id);
    $check($human->fresh()->getDetail($crisisTurn)->activeDivisions()->whereKey($divisionId)->exists(), 'Rollback did not restore the deserted division.');
} finally { \Illuminate\Support\Facades\DB::rollBack(); }
echo "PASS: $checks lifecycle checks including crisis, desertion and rollback.\n";
file_put_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/production-fixture.json', json_encode(['game_id' => $game->id, 'user' => $user->name, 'nation_id' => $human->id]));
