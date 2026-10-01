<?php

// Includes existing action, capture, policy, replay and browser-fixture regressions.
require __DIR__ . '/production-lifecycle.php';

use App\Models\Game;
use App\Domain\Resources\Quantity as Quantity;
use App\Services\Resources\ResourceRuleRegistry;
use Illuminate\Support\Facades\DB;

$document = json_decode(file_get_contents(database_path('resource-templates/civilian.json')), true, flags: JSON_THROW_ON_ERROR);
$registry = app(ResourceRuleRegistry::class);
$registry->validate($document);
foreach (['missing', 'cycle', 'currency', 'condition', 'manufacturing', 'subsistence'] as $bad) {
    $invalid = $document;
    $indices = array_flip(array_column($invalid['resources'], 'key'));
    if ($bad === 'missing') $invalid['resources'][$indices['equipment']]['rules']['production.inputs']['resources'] = ['unknown' => '1'];
    if ($bad === 'cycle') $invalid['resources'][$indices['ore']]['rules']['production.inputs']['resources'] = ['equipment' => '1'];
    if ($bad === 'currency') $invalid['resources'][$indices['food']]['rules']['production.maintenance']['resource'] = 'money';
    if ($bad === 'condition') $invalid['resources'][$indices['food']]['rules']['production.maintenance']['condition_decay'] = '1.1';
    if ($bad === 'manufacturing') $invalid['resources'][$indices['equipment']]['rules']['production.territorial_labor']['geographic'] = true;
    if ($bad === 'subsistence') $invalid['resources'][$indices['ore']]['rules']['production.subsistence'] = $invalid['resources'][$indices['food']]['rules']['production.subsistence'];
    try { $registry->validate($invalid); throw new RuntimeException('Invalid civilian catalogue accepted: ' . $bad); }
    catch (\Illuminate\Validation\ValidationException) { $check(true, $bad); }
}

$civilianGame = Game::createNew(generatedMapFixture(), fn (Game $g) => app(\ExperimentalAI\Setup::class)->populate($g, ['count' => 2]));
$cash = static function ($game, $turn): string {
    $treasury = \App\Services\Resources\ResourceCatalogue::forGame($game)->get('money')['id'];
    $sum = Quantity::parse(DB::table('nation_resource_stockpiles')->where('turn_id', $turn->id)->where('resource_id', $treasury)->where('owner_kind', 'government')->sum('available_quantity'));
    $sum = Quantity::add($sum, Quantity::parse(DB::table('nation_economic_accounts')->where('turn_id', $turn->id)->sum('cash')));
    foreach ($game->nations()->get() as $n) $sum = Quantity::add($sum, $n->getDetail($turn)->economy_state['lender_cash']);
    return $sum;
};
$first = $civilianGame->getCurrentTurn();
$initialCash = $cash($civilianGame, $first);
$civilianChecks = $checks;
$metalProduced = '0.000000';
for ($season = 1; $season <= 20; ++$season) {
    $openingTurn = $civilianGame->fresh()->getCurrentTurn();
    $forecasts = [];
    $snapshotBefore = $store->snapshot($civilianGame, $openingTurn);
    foreach ($civilianGame->nations()->get() as $n) {
        $f = $economy->resolve($n->getDetail($openingTurn));
        $check($f['report']['civilian']['enabled'], 'Fresh game did not use civilian catalogue.');
        $check($f === $economy->resolve($n->getDetail($openingTurn)), 'Civilian forecast is not deterministic.');
        $check(Quantity::cmp($f['report']['civilian']['workers_used'], $f['report']['civilian']['workforce']) <= 0, 'Shared workforce overused.');
        $forecasts[$n->id] = $f;
        $production = $f['report']['civilian']['production'];
        if ($season > 5) $metalProduced = Quantity::add($metalProduced, $production['ore']);
        $check($f['resources']['food']['civilian']['unmet'] === '0.000000', "Season $season food shortage in ordinary opening.");
        $check($f['resources']['household_goods']['civilian']['unmet'] === '0.000000', "Season $season household-goods shortage in ordinary opening.");
        $check($f['report']['civilian']['maintenance_delivered'] === $f['report']['civilian']['maintenance_required'], "Season $season productive maintenance shortage in ordinary opening.");
        $check($f['report']['fiscal']['closing_debt'] === '0.000000', "Season $season peaceful opening borrowed.");
        $check(Quantity::cmp($f['report']['closing_treasury'], $f['report']['opening_treasury']) > 0, "Season $season peaceful opening ran a deficit.");
        foreach ($f['report']['civilian']['maintenance'] as $m) {
            $check(Quantity::cmp($m['closing_condition'], '0') >= 0 && Quantity::cmp($m['closing_condition'], '1') <= 0, 'Invalid asset condition.');
            $check(Quantity::cmp($m['delivered'], $m['required']) <= 0, 'Overdelivered maintenance.');
        }
    }
    $check($snapshotBefore === $store->snapshot($civilianGame, $openingTurn), 'Civilian forecast wrote seasonal state.');
    while (($status = $adapter->status($civilianGame->fresh()))['next_nation_id'] !== null)
        $runner->step($civilianGame->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
    $closedTurn = $civilianGame->fresh()->tryNextTurnIfNationsReady($openingTurn);
    $check($closedTurn->number === $openingTurn->number + 1, 'Ready did not advance civilian game.');
    $check($cash($civilianGame, $closedTurn) === $initialCash, 'Live season created or lost money.');
    foreach ($civilianGame->nations()->get() as $n) {
        $d = $n->getDetail($closedTurn); $actual = $d->economy_report; unset($actual['deserted_divisions']);
        $check($actual === json_decode(json_encode($forecasts[$n->id]['report']), true), 'Actual civilian report differs from preview.');
        foreach ($actual['territories'] as $t) {
            $stored = json_decode(DB::table('territory_details')->where('turn_id', $closedTurn->id)->where('territory_id', $t['id'])->value('economy_state'), true);
            $check($stored['productive_condition'] === $t['state']['productive_condition'], 'Productive condition was not persisted.');
        }
    }
    if (in_array($season, [1, 10, 20], true)) {
        $r = $d->economy_report;
        echo "Civilian live season $season: food {$r['food']['civilian']['fulfilled']}/{$r['food']['civilian_requested']}; upkeep {$r['civilian']['maintenance_delivered']}/{$r['civilian']['maintenance_required']}; treasury {$r['closing_treasury']}.\n";
    }
}
$beforeReplay = $store->snapshot($civilianGame, $closedTurn);
$check(Quantity::cmp($metalProduced, '0') > 0, 'Civilian demand failed to sustain metal production after the founding-stock period.');
$conditionsBefore = DB::table('territory_details')->where('turn_id', $closedTurn->id)->orderBy('territory_id')->pluck('economy_state')->all();
$civilianGame->fresh()->rollbackLastTurn($closedTurn->id);
$replay = $civilianGame->fresh()->tryNextTurn($civilianGame->fresh()->getCurrentTurn());
$check($beforeReplay === $store->snapshot($civilianGame, $replay), 'Twenty-season rollback/replay changed civilian accounts or stocks.');
$check($conditionsBefore === DB::table('territory_details')->where('turn_id', $replay->id)->orderBy('territory_id')->pluck('economy_state')->all(), 'Rollback/replay changed productive condition.');
echo 'PASS: ' . ($checks - $civilianChecks) . " additional civilian lifecycle checks across 20 real ready-driven turns, two nations, persistence and replay.\n";

// Recreate an older catalogue in this disposable game only. The additive upgrade
// must work without opening arbitrary definition editing or replacing player choices.
$catalogues = app(\App\Services\Policies\PolicyCatalogue::class);
$installed = $catalogues->forGame($civilianGame);
$investmentIds = DB::table('policies')->where('policy_set_id', $installed['set']['id'])->where('category_key', 'public_industry')->pluck('id');
$check(count($investmentIds) === 5, 'Fresh game lacks generated public investment controls.');
foreach (['nation_policy_choices', 'nation_policy_pending_changes'] as $table)
    DB::table($table)->where('game_id', $civilianGame->id)->whereIn('policy_id', $investmentIds)->delete();
DB::table('policies')->where('policy_set_id', $installed['set']['id'])->whereIn('id', $investmentIds)->delete();
DB::table('games')->where('id', $civilianGame->id)->update(['policy_testing_enabled' => false]);
$civilianGame = $civilianGame->fresh();
$legacy = $catalogues->forGame($civilianGame);
$legacyIds = array_values($legacy['ids']['policies']);
$testNation = $civilianGame->nations()->first();
$tax = $policies->state($testNation, $replay)['current']['income_tax'];
$tax['parameters']['rate'] = '0.26';
$policies->submit($testNation, $replay, $legacy['set']['edit_counter'], ['income_tax' => $tax]);
$choiceRows = static fn ($table) => DB::table($table)->where('game_id', $civilianGame->id)->whereIn('policy_id', $legacyIds)->orderBy('id')->get()->toJson();
$choicesBefore = $choiceRows('nation_policy_choices');
$pendingBefore = $choiceRows('nation_policy_pending_changes');
$stocksBefore = $store->snapshot($civilianGame, $replay);
$upgrade = $catalogues->installPublicInvestment($civilianGame, $legacy['set']['edit_counter']);
$check(count($upgrade['added']) === 5 && $upgrade['diagnostics'] === [], 'Legacy upgrade did not add valid investment controls.');
$check($choiceRows('nation_policy_choices') === $choicesBefore && $choiceRows('nation_policy_pending_changes') === $pendingBefore, 'Upgrade changed existing choices or pending orders.');
$check($store->snapshot($civilianGame, $replay) === $stocksBefore, 'Upgrade changed economic stocks, cash or capacity.');
$check($civilianGame->fresh()->getCurrentTurn()->id === $replay->id && !$civilianGame->fresh()->policy_testing_enabled, 'Upgrade advanced the turn or enabled test editing.');
foreach ($civilianGame->nations()->get() as $n) foreach ($upgrade['added'] as $key)
    $check(Quantity::cmp($policies->state($n, $replay)['current'][$key]['parameters']['funding_ratio'], '0') === 0, 'Upgrade enabled recurring spending.');
$again = $catalogues->installPublicInvestment($civilianGame, $upgrade['edit_counter']);
$check($again['added'] === [] && $again['edit_counter'] === $upgrade['edit_counter'], 'Upgrade is not idempotent.');
try { $catalogues->installPublicInvestment($civilianGame, $legacy['set']['edit_counter']); throw new RuntimeException('Stale upgrade accepted.'); }
catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $check($e->getStatusCode() === 409, 'Stale upgrade should conflict.'); }
echo "PASS: additive public investment upgrade preserves choices, pending laws, stocks, turn and permissions; zero defaults and stale/idempotent checks.\n";
