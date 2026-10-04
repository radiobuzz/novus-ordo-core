<?php
// Private temporary database/socket only. The bootstrap also verifies passive Ready-only seasons.
require __DIR__.'/passive-player-engine.php';
use App\Domain\Resources\Quantity as Q;
use App\Services\{EconomyService, GameMutation, PlayerWorkspace, FinanceService, NationGrantService, EconomicHistoryService};
use App\Services\Policies\{PolicyService, PolicyCatalogue};
use App\Services\Resources\{ResourceCatalogue, ResourceLedger, ProductionStateStore};
use App\Models\{TerritoryDetail, NationResourceStockpile};
use Illuminate\Support\Facades\{DB, Schema, Artisan};

$economy=app(EconomyService::class);$store=app(ProductionStateStore::class);$ledger=app(ResourceLedger::class);$policies=app(PolicyService::class);
$game=$game->fresh();$turn=$game->getCurrentTurn();$nation=$game->nations()->orderBy('id')->first();$other=$game->nations()->orderByDesc('id')->first();
$cat=ResourceCatalogue::forGame($game);$detail=$nation->getDetail($turn);
$check(!Schema::hasTable('nation_economic_accounts'),'Retired cash table survives');
$check(!Schema::hasColumn('nation_resource_stockpiles','cost_basis') && !Schema::hasColumn('territory_production_states','owner_kind'),'Retired split ownership/basis survives');
$check($detail->economy_state!==null && count($economy->facts($detail)[0]['economy_state'])===10,'All territorial indicators initialized');
$snapshot=$store->snapshot($game,$turn);$forecast=$economy->resolve($detail);
$workspace=app(PlayerWorkspace::class)->export($nation);
$check($workspace['economy']['forecast']['expected']===$forecast['report'],'Workspace and preview use a different resolver');
$check($snapshot===$store->snapshot($game,$turn),'Preview wrote seasonal state');
$check(count($snapshot['territory_production_states'])===$game->territories()->count()*count($cat->producers()),'Capacity is not one row per territory/resource/season, including neutral territory');
foreach($workspace['production_planning']['territories'] as $id=>$territory)foreach($territory['resources'] as $key=>$r)
    $check(Q::add($r['capacity'],$r['development'])===$forecast['state']['territories'][$id]['capacity'][$key],'Inspector current and future capacity disagree');
$counter=$workspace['policies']['edit_counter'];$plans=$ledger->plans($detail);$plans['ore']=['quantity'=>'0.123456','spending_limit'=>'2','priority'=>0];
$changes=['income_tax'=>['option'=>'standard','parameters'=>['rate'=>'0.3']],
    'infrastructure_investment'=>['option'=>'moderate','parameters'=>['funding_ratio'=>'1']]];
$preview=$policies->preview($nation,$turn,$counter,$changes,$plans);
$check($preview['valid'] && $snapshot===$store->snapshot($game,$turn),'Combined draft preview invalid or wrote state');
$check(Q::cmp($preview['settings']['budget.program_target']['infrastructure'],'0.5')===0,'Named commitment missing from combined preview');
$policies->submit($nation,$turn,$counter,$changes,$plans);
$check($ledger->plans($detail)['ore']['quantity']==='0.123456','Exact acquisition intent lost');
$check($policies->state($nation,$turn)['current']['income_tax']['parameters']['rate']==='0.25','Pending choice applied before seasonal boundary');
$check($policies->state($nation,$turn)['current']['infrastructure_investment']['option']==='high','Named commitment applied before seasonal boundary');
$check($economy->resolve($detail)['report']===$preview['indicator_forecast']['expected'],'Saved draft forecast differs');
$saved=$store->snapshot($game,$turn);$bad=$plans;$bad['ore']['spending_limit']='-1';
try{$policies->submit($nation,$turn,$counter,[],$bad);throw new RuntimeException('Invalid acquisition accepted');}catch(\Illuminate\Validation\ValidationException){}
$check($saved===$store->snapshot($game,$turn),'Rejected package changed stocks or intent');

// Owned goods transfer; there is no producer inventory to accidentally grant.
$stock=$detail->stockpiles()->where('resource_id',$cat->get('ore')['id'])->firstOrFail();$stock->available_quantity='10';$stock->save();
$target=$other->getDetail($turn)->stockpiles()->where('resource_id',$cat->get('ore')['id'])->firstOrFail();$targetBefore=$target->available_quantity;
app(GameMutation::class)->run($game,fn()=>app(NationGrantService::class)->transfer($nation,$other,'ore','2'));
$check($stock->fresh()->available_quantity==='8.000000' && $target->fresh()->available_quantity===Q::add($targetBefore,'2'),'Grant quantities do not reconcile');
$neutral=TerritoryDetail::where('turn_id',$turn->id)->whereNull('owner_nation_id')->firstOrFail();
$neutralState=$neutral->economy_state;$capacityBefore=DB::table('territory_production_states')->where('turn_id',$turn->id)->where('territory_id',$neutral->territory_id)->pluck('installed_capacity','resource_id')->all();
app(GameMutation::class)->run($game,fn()=>$neutral->conquer($nation));
$check($neutral->fresh()->economy_state===$neutralState,'Annexation reseeded territorial indicators');
$check($capacityBefore===DB::table('territory_production_states')->where('turn_id',$turn->id)->where('territory_id',$neutral->territory_id)->pluck('installed_capacity','resource_id')->all(),'Annexation reseeded capacity');

$definitions=[];foreach(['resource_definitions','resource_rules','policies','policy_options'] as $table)$definitions[$table]=DB::table($table)->count();
$peacefulIncome=$other->getDetail($turn)->economy_report['earned_income'];
for($season=0;$season<20;$season++){
    $turn=$game->fresh()->getCurrentTurn();$before=$store->snapshot($game,$turn);$forecasts=[];
    foreach($game->nations()->get() as $n)$forecasts[$n->id]=$economy->resolve($n->getDetail($turn));
    $check($before===$store->snapshot($game,$turn),'Forecast mutated opening state');
    while(($status=$adapter->status($game->fresh()))['next_nation_id']!==null)$runner->step($game->fresh(),$status+['nation_id'=>$status['next_nation_id']]);
    $next=$game->fresh()->tryNextTurnIfNationsReady($turn);$check($next->number===$turn->number+1,'Passive ready did not advance season');
    foreach($game->nations()->get() as $n){
        $d=$n->getDetail($next);$actual=$d->economy_report;unset($actual['deserted_divisions']);
        $check($actual===json_decode(json_encode($forecasts[$n->id]['report']),true),'Settled seasonal report differs from preview');
        $check($d->resource_report===$forecasts[$n->id]['resources'],'Persisted resource report differs');
        $check($d->economy_report['infrastructure'][array_key_first($d->economy_report['infrastructure'])]['target']===($n->id===$nation->id?'0.500000':'0.750000'),'Named policy target was not settled per nation');
        $check($d->getStockpiledQuantity($cat->role('treasury'))===$actual['closing_treasury'],'Stored treasury differs from report');
    }
}
foreach($definitions as $table=>$count)$check(DB::table($table)->count()===$count,'Policy/resource definitions copied or changed each season');
$peaceful=$other->getDetail($next);
$check($peaceful->economy_state['debt']==='0.000000','Unchanged peaceful defaults accumulated debt');
$check(Q::cmp($peaceful->economy_report['earned_income'],$peacefulIncome)>0,'Unchanged peaceful income did not grow');
$check(Q::cmp($peaceful->economy_report['tax_receipts'],$peaceful->economy_report['treasury_outflows'])>0,'Peaceful settled budget lacks a surplus');
$beforeReplay=$store->snapshot($game,$next);$reports=DB::table('nation_details')->where('turn_id',$next->id)->orderBy('nation_id')->pluck('economy_report')->all();
$conditions=DB::table('territory_details')->where('turn_id',$next->id)->orderBy('territory_id')->pluck('economy_state')->all();
$game->fresh()->rollbackLastTurn($next->id);$replayed=$game->fresh()->tryNextTurnIfNationsReady($game->fresh()->getCurrentTurn());
$check($beforeReplay===$store->snapshot($game,$replayed),'Rollback replay changes capacity, acquisition or owned stock');
$check($reports===DB::table('nation_details')->where('turn_id',$replayed->id)->orderBy('nation_id')->pluck('economy_report')->all(),'Rollback replay changes financial history');
$check($conditions===DB::table('territory_details')->where('turn_id',$replayed->id)->orderBy('territory_id')->pluck('economy_state')->all(),'Rollback replay changes indicators');
$history=(array)app(EconomicHistoryService::class)->export($nation,$replayed,24);
$check(count($history['seasons'])>=20 && isset($history['seasons'][array_key_last($history['seasons'])]['economy']['industries']['household_goods']['production']),'Industry history lacks recorded actual output');

// Manual repayment uses existing cash and changes current state, preserving closed seasonal observations.
$d=$nation->getDetail($replayed);$cash=$d->stockpiles()->where('resource_id',$cat->get('money')['id'])->firstOrFail();$cash->available_quantity='100';$cash->save();
$s=$d->economy_state;$s['debt']='50';$d->economy_state=$s;$d->save();$report=$d->economy_report;
$repayment=app(FinanceService::class)->repay($d,'7');
$check($repayment['debt']==='43.000000' && $repayment['treasury']==='93.000000','Manual repayment lost money or principal');
$check($d->fresh()->economy_report===$report,'Manual action rewrote past history');
echo "PASS: $checks indicator lifecycle checks, 20 additional real seasons, founding, previews, seasonal choices, grants, capture, history and replay.\n";

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
// Actual deployments consume only opening government goods and pay setup costs exactly once.
$humanDetail = $human->getDetail(); $humanTurn = $humanDetail->getTurn();
foreach ($humanDetail->stockpiles()->get() as $owned) {
    $owned->available_quantity = '1000'; $owned->save();
}
app(GameMutation::class)->run($game, fn () => $human->deploy(new \App\Domain\DeploymentCommand($homes[0], \App\Domain\DivisionType::Infantry)));
$commandCosts = $ledger->costs($humanDetail)['commands'];
$check(Q::cmp($commandCosts[$cat->role('treasury')], '0') > 0, 'Deployment did not commit cash.');
foreach ($cat->producers() as $resourceKey => $_) $check($ledger->available($humanDetail)[$resourceKey] === Q::sub('1000', $commandCosts[$resourceKey]), 'Opening goods were not reserved for deployment.');
$militaryForecast = $economy->resolve($humanDetail);
while (($status = $adapter->status($game->fresh()))['next_nation_id'] !== null) $runner->step($game->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
$militaryTurn = $game->fresh()->tryNextTurn($humanTurn); $closedHuman = $human->getDetail($militaryTurn);
$check($closedHuman->economy_report['command_costs'] === $commandCosts[$cat->role('treasury')], 'Deployment costs were omitted or double charged.');
$check($closedHuman->getStockpiledQuantity($cat->role('treasury')) === $militaryForecast['report']['closing_treasury'], 'Military settlement differs from preview.');
$check($closedHuman->activeDivisions()->count() === 1, 'Funded division did not deploy.');


// Reactive Guard spending debits only government cash/goods; it cannot mint income or tax again.
$stocks = $closedHuman->stockpiles()->get()->keyBy(fn ($stock) => $human->id . ':' . $cat->key($stock->resource_id));
$remaining = $stocks->mapWithKeys(fn ($stock, $key) => [$key => $stock->available_quantity])->all();
$cashBefore = $closedHuman->getStockpiledQuantity($cat->role('treasury'));
$guard = new ReflectionMethod(\App\Services\GuardAllocator::class, 'payResponse');
$key = 'ore'; $goodsBefore = $closedHuman->getStockpiledQuantity($key);
$guardCosts = [$cat->role('treasury') => '2.000000', $key => '1.000000'];
app(GameMutation::class)->run($game, function () use ($guard, $human, $guardCosts, $stocks, &$remaining) { $guard->invokeArgs(app(\App\Services\GuardAllocator::class), [$human->id, $guardCosts, $stocks, &$remaining]); });
$closedHuman = $closedHuman->fresh(); $r = $closedHuman->economy_report;
$check($closedHuman->getStockpiledQuantity($cat->role('treasury')) === Q::sub($cashBefore, '2'), 'Guard cash was omitted or charged twice');
$check(Q::add(Q::sub($r['opening_treasury'], $r['treasury_outflows']), $r['treasury_inflows']) === $r['closing_treasury'], 'Guard report no longer reconciles');
$check($r['earned_income'] === $militaryForecast['report']['earned_income'] && $r['tax_receipts'] === $militaryForecast['report']['tax_receipts'], 'Guard response minted income or taxed twice');
$check($r['response_costs'] === '2.000000' && $closedHuman->getStockpiledQuantity($key) === Q::sub($goodsBefore,'1'), 'Guard goods/costs lost');
$check($closedHuman->resource_report[$key]['government_closing'] === $closedHuman->getStockpiledQuantity($key), 'Guard goods report diverged');

// Insolvency, forced desertion and rollback remain meaningful without a lender account.
DB::beginTransaction();
try {
    $crisisGame = $game->fresh(); $crisisRules = $crisisGame->economy_rules; $crisisRules['desertion_rate'] = 1;
    $crisisGame->economy_rules = $crisisRules; $crisisGame->save();
    $crisisTurn = $crisisGame->getCurrentTurn(); $crisisDetail = $human->fresh()->getDetail($crisisTurn);
    $crisisState = $crisisDetail->economy_state; $crisisState['debt'] = '100000';
    $crisisState['fiscal'] = ['receipts' => ['0'], 'credit_lock' => 0, 'default_episode' => false];
    $crisisDetail->economy_state = $crisisState; $crisisDetail->save();
    DB::table('nation_resource_stockpiles')->where('nation_id', $human->id)->where('turn_id', $crisisTurn->id)->update(['available_quantity' => '0']);
    $divisionId = $crisisDetail->activeDivisions()->firstOrFail()->id;
    while (($status = $adapter->status($crisisGame->fresh()))['next_nation_id'] !== null) $runner->step($crisisGame->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
    $crisisNext = $crisisGame->fresh()->tryNextTurn($crisisTurn);
    $crisisClosed = $human->fresh()->getDetail($crisisNext);
    $check($crisisClosed->economy_report['fiscal']['new_default'], 'Unpaid interest did not start default');
    $check(in_array($divisionId, $crisisClosed->economy_report['deserted_divisions']), 'Forced unfunded division did not desert');
    $check(!\App\Models\Order::where('division_id', $divisionId)->where('turn_id', $crisisNext->id)->exists(), 'Desertion retained orders');
    $crisisGame->fresh()->rollbackLastTurn($crisisNext->id);
    $check($human->fresh()->getDetail($crisisTurn)->activeDivisions()->whereKey($divisionId)->exists(), 'Rollback did not restore the deserted division');
} finally { DB::rollBack(); }

// Definition copies are independent of their templates; test edits affect future forecasts only.
$game = $game->fresh(); $game->policy_testing_enabled = true; $game->save();
$ownedCatalogue = app(PolicyCatalogue::class)->forGame($game);
$source = app(PolicyCatalogue::class)->load($ownedCatalogue['set']['source_policy_set_id']);
$document = $source['document']; $document['description'] = 'Changed template after creation';
app(PolicyCatalogue::class)->edit($source['set']['id'], $source['set']['edit_counter'], $document);
$check(app(PolicyCatalogue::class)->forGame($game)['document'] === $ownedCatalogue['document'], 'Template changes leaked into game-owned policies');
$gameRules = $game->economy_rules; $changedRules = $gameRules['indicator']; $changedRules['reference_income_per_million'] = 41;
$rulesPath = getenv('NO7_ENTRY_TEST_ROOT') . '/rules.json'; file_put_contents($rulesPath, json_encode($changedRules));
$historyBefore = DB::table('nation_details')->where('game_id',$game->id)->pluck('economy_report')->all();
$check(Artisan::call('app:economy-rules', ['action'=>'import','game'=>$game->id,'--file'=>$rulesPath]) === 0, 'Valid test rules import failed');
$check($game->fresh()->economy_rules['indicator']['reference_income_per_million'] == 41.0, 'Rules import did not persist');
$check($historyBefore === DB::table('nation_details')->where('game_id',$game->id)->pluck('economy_report')->all(), 'Rule edit rewrote closed seasons');
file_put_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/production-fixture.json', json_encode(['game_id'=>$game->id,'user'=>$user->name,'nation_id'=>$human->id]));

try { app(\App\Services\Policies\PolicyEffectRegistry::class)->validate(['effect_type'=>'indicator.target_shift','arguments'=>['indicator'=>'health','offset'=>'1.1']],[],'test'); throw new RuntimeException('Unbounded shift accepted'); } catch (\Illuminate\Validation\ValidationException) { $check(true,'Rejected unbounded shift'); }

echo "PASS: $checks indicator lifecycle checks including deployment, Guard, default, desertion, rules editing and rollback.\n";
