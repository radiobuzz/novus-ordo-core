<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\ProductionAccounts as Accounts;
use App\Domain\Resources\Quantity as Q;

$fixture = require __DIR__ . '/fixtures/production-accounting/scenarios.php';
$rules = $fixture['resources'];
$seed = $fixture['state'];
$checks = 0;
$check = function (bool $ok, string $message) use (&$checks): void {
    ++$checks;
    if (!$ok) throw new RuntimeException($message);
};
$eq = fn ($actual, $expected, $message) => $check($actual === $expected, "$message: " . json_encode(['actual' => $actual, 'expected' => $expected]));
$decimal = fn ($actual, $expected, $message) => $eq($actual, Q::parse($expected, true), $message);
$throws = function (callable $action, string $message) use ($check): void {
    try { $action(); } catch (DomainException) { $check(true, $message); return; }
    $check(false, $message);
};
$events = fn ($result, $type) => array_values(array_filter($result['events'], fn ($e) => $e['type'] === $type));
$cash = fn ($result, $id) => $result['state']['accounts'][$id]['cash'];
$summaries = [];

// The approved ten-unit story, with separately funded initial producer working capital.
$a = new Accounts($rules, $seed);
$a->reserve('ore_order', 'government', '100');
$decimal($a->produce('core', 'producers', 'ore', '10', 'households'), '10', 'Private production');
$decimal($a->purchase('government', 'producers', 'ore', '10', 'ore_order'), '10', 'Paid acquisition');
$private = $a->close();
$decimal($cash($private, 'government'), '120', 'Government closing cash');
$decimal($cash($private, 'producers'), '116', 'Working capital plus retained earnings');
$decimal($cash($private, 'households'), '48', 'Net wages');
$decimal($private['state']['inventories']['government']['ore']['quantity'], '10', 'Government owns only purchased output');
$decimal($events($private, 'earnings')[0]['realized_profit'], '40', 'Sales less cost, not sales plus wages');
$decimal($events($private, 'earnings')[0]['tax'], '8', 'Profit tax');
$eq($a->close(), $private, 'Closing twice cannot charge tax twice');
$throws(fn () => $a->produce('core', 'producers', 'ore', '1', 'households'), 'Closed season rejects more work');
$summaries['private_purchase'] = $private;

$publicSeed = $seed;
$publicSeed['territories']['core']['capacity'] = ['government' => ['ore' => '14', 'food' => '14']];
$a = new Accounts($rules, $publicSeed);
$a->produce('core', 'government', 'ore', '10', 'households');
$throws(fn () => $a->purchase('government', 'government', 'ore', '10'), 'No internal fictional sale');
$public = $a->close();
$decimal($cash($public, 'government'), '152', 'Public operating expense minus withheld tax');
$eq(count($events($public, 'sale')), 0, 'Public output has no invented revenue');
$decimal($public['state']['inventories']['government']['ore']['quantity'], '10', 'Public output owned directly');
$summaries['public_production'] = $public;

$mixedSeed = $seed;
$mixedSeed['territories']['core']['capacity'] = ['government' => ['ore' => '5'], 'producers' => ['ore' => '5']];
$a = new Accounts($rules, $mixedSeed);
$a->reserve('buy', 'government', '50');
$a->produce('core', 'government', 'ore', '5', 'households');
$a->produce('core', 'producers', 'ore', '5', 'households');
$a->purchase('government', 'producers', 'ore', '5', 'buy');
$mixed = $a->close();
$decimal($cash($mixed, 'government'), '136', 'Mixed funding reconciles');
$decimal($mixed['state']['inventories']['government']['ore']['quantity'], '10', 'Mixed sourcing without double delivery');
$decimal($cash($mixed, 'households'), '48', 'Same work earns same wages across ownership');
$summaries['mixed_production'] = $mixed;

// A complete household cycle: opening funds -> wages -> food/services -> earnings distribution.
// Income support recycles taxes; it is a funded public transfer, not newly created income.
$cycle = $seed;
$cycle['accounts']['producers']['cash'] = '200';
$cycle['accounts']['households']['cash'] = '80';
$history = [];
for ($season = 1; $season <= 4; $season++) {
    $a = new Accounts($rules, $cycle);
    $a->support('government', 'households', '24');
    $a->produce('core', 'producers', 'food', '10', 'households');
    $a->prepareService('core', 'producers', '2', '6', 'households');
    $meal = $a->consumeDemand('households', 'food', '10', ['producers'], 'government');
    $decimal($meal['fulfilled'], '10', "Season $season households can afford food");
    $decimal($a->purchaseService('core', 'households', 'producers', '2', '10'), '2', 'Residual activity has real buyers');
    $decimal($a->distributeProfit('producers', 'households', '38.4'), '38.4', 'Profit distribution is not a second income tax');
    $result = $a->close();
    $decimal($cash($result, 'government'), '200', 'Public support funded by receipts');
    $decimal($cash($result, 'producers'), '200', 'Working capital recovered without replenishment');
    $decimal($cash($result, 'households'), '80', 'Household savings persist');
    $decimal($events($result, 'earnings')[0]['realized_profit'], '48', 'Food and services share one earnings account');
    $decimal($result['used_workers']['core'], '12', 'No second workforce for residual activity');
    $history[] = $result;
    $cycle = $result['state'];
}
$summaries['four_season_household_cycle'] = $history;

// Without transfers/distributions, retained funds must stay with their owners: no hidden bailout.
$contracting = $seed;
$contracting['accounts']['producers']['cash'] = '200';
$contracting['accounts']['households']['cash'] = '80';
$unmet = [];
for ($season = 0; $season < 3; $season++) {
    $a = new Accounts($rules, $contracting);
    $a->produce('core', 'producers', 'food', '10', 'households');
    $a->prepareService('core', 'producers', '2', '6', 'households');
    $meal = $a->consumeDemand('households', 'food', '10', ['producers'], 'government');
    $a->purchaseService('core', 'households', 'producers', '2', '10');
    $unmet[] = $meal['unmet'];
    $r = $a->close(); $contracting = $r['state'];
}
$decimal($unmet[0], '0', 'Initial savings fund first season consumption');
$check(Q::cmp($unmet[1], '0') > 0 && Q::cmp($unmet[2], $unmet[1]) > 0, 'Missing income circulation creates visible shortages');
$summaries['no_hidden_bailout'] = ['unmet_food' => $unmet, 'last_season' => $r];

// Rollback is replay from preserved value snapshots; no definitions or balances are mutated.
$replay = new Accounts($rules, $history[1]['state']);
$replay->support('government', 'households', '24');
$replay->produce('core', 'producers', 'food', '10', 'households');
$replay->prepareService('core', 'producers', '2', '6', 'households');
$replay->consumeDemand('households', 'food', '10', ['producers'], 'government');
$replay->purchaseService('core', 'households', 'producers', '2', '10');
$replay->distributeProfit('producers', 'households', '38.4');
$eq($replay->close(), $history[2], 'Rollback/replay has identical accounts and reports');
$eq($seed['accounts']['government']['cash'], '200', 'Caller-owned opening snapshot not changed');

// Food shortages report physical consumption; private inventory cannot be requisitioned for free.
$poor = $seed;
$poor['accounts']['households']['cash'] = '15';
$poor['inventories'] = ['producers' => ['food' => ['quantity' => '10', 'cost' => '60']], 'government' => ['food' => ['quantity' => '2', 'cost' => '12']]];
$a = new Accounts($rules, $poor);
$meal = $a->consumeDemand('households', 'food', '5', ['producers'], 'government', '1');
$decimal($meal['purchased'], '1.5', 'Household purchase limited by own cash');
$decimal($meal['released'], '1', 'Public support respects explicit release limit');
$decimal($meal['fulfilled'], '2.5', 'Purchased and released food consumed once');
$decimal($meal['unmet'], '2.5', 'Actual shortage survives abundant private inventory');
$foodShortage = $a->close();
$decimal($foodShortage['state']['inventories']['producers']['food']['quantity'], '8.5', 'No free taking of private food');
$summaries['food_shortage_and_reserve_release'] = $foodShortage;

$protected = $poor;
$protected['accounts']['households']['cash'] = '100';
$a = new Accounts($rules, $protected);
$a->reserveStock('strategic_buffer', 'government', 'food', '2');
$decimal($a->purchase('households', 'government', 'food', '2'), '0', 'Owned strategic reserve is not automatically commercial supply');
$a->releaseStock('strategic_buffer');
$decimal($a->purchase('households', 'government', 'food', '2'), '2', 'Explicitly released goods become saleable');
$a->close();
$a = new Accounts($rules, $seed);
$throws(fn () => $a->reserveStock('future', 'government', 'ore', '1'), 'Cannot reserve undelivered future government goods');
$a->close();

$a = new Accounts($rules, $publicSeed);
$a->produce('core', 'government', 'food', '10', 'households');
$meal = $a->consumeDemand('households', 'food', '10', ['government'], 'government', '10');
$decimal($meal['purchased'], '4.8', 'Public sales paid by households');
$decimal($meal['released'], '5.2', 'Emergency public delivery is distinct from sale');
$r = $a->close();
$decimal($cash($r, 'government'), '200', 'Public wages/sales cycle creates no cash');
$decimal($meal['unmet'], '0', 'Public sales and support can fulfill nutrition');

// Unsold stock retains cost, no profit tax; later sale recognizes only the recovered margin.
$a = new Accounts($rules, $seed);
$a->produce('core', 'producers', 'ore', '10', 'households');
$idle = $a->close();
$decimal($events($idle, 'earnings')[0]['tax'], '0', 'No tax on unsold output value');
$decimal($idle['state']['inventories']['producers']['ore']['cost'], '60', 'Cost carried in inventory');
$a = new Accounts($rules, $idle['state']);
$a->purchase('government', 'producers', 'ore', '5');
$sold = $a->close();
$decimal($events($sold, 'earnings')[0]['realized_profit'], '20', 'Older wages are not deducted or earned twice');
$decimal($sold['state']['inventories']['producers']['ore']['cost'], '30', 'Remaining cost basis');
$summaries['unsold_then_sold'] = [$idle, $sold];

// Working capital, labor, capacity, holds and atomic failure.
$small = $seed; $small['accounts']['producers']['cash'] = '12';
$a = new Accounts($rules, $small);
$a->reserve('order', 'government', '100');
$decimal($a->produce('core', 'producers', 'ore', '10', 'households'), '2', 'Future sale cannot fund earlier wages');
$decimal($a->purchase('government', 'producers', 'ore', '10', 'order'), '2', 'Partial actual delivery only');
$decimal($a->availableCash('government'), '182.4', 'Unused purchase commitment released');
$a->close();

$publicLimited = $publicSeed;
$publicLimited['accounts']['government']['cash'] = '12';
$a = new Accounts($rules, $publicLimited);
$a->produce('core', 'government', 'ore', '2', 'households');
$decimal($a->produce('core', 'government', 'food', '2', 'households'), '0', 'Withheld tax does not restart the opening operating budget');
$a->close();
$a = new Accounts($rules, $seed);
$a->produce('core', 'producers', 'ore', '2', 'households');
$a->purchase('government', 'producers', 'ore', '2');
$throws(fn () => $a->produce('core', 'producers', 'ore', '2', 'households'), 'Sale proceeds cannot restart the work phase');
$throws(fn () => $a->borrow('government', 'lender', '10'), 'No late credit to retroactively fund a failed request');
$a->close();
$shared = $seed; $shared['territories']['core']['workforce'] = '3';
$a = new Accounts($rules, $shared);
$a->produce('core', 'producers', 'ore', '2', 'households');
$decimal($a->produce('core', 'producers', 'food', '2', 'households'), '1', 'Resources share workers');
$decimal($a->prepareService('core', 'producers', '2', '6', 'households'), '0', 'Services cannot reuse workers');
$a->close();
$bad = $seed; $bad['territories']['core']['capacity']['government']['ore'] = '20';
$throws(fn () => new Accounts($rules, $bad), 'Public/private capacity cannot duplicate potential');
$a = new Accounts($rules, $seed);
$before = $a->availableCash('producers');
$throws(fn () => $a->produce('core', 'producers', 'ore', '1', 'missing'), 'Invalid wage destination rejected atomically');
$eq($a->availableCash('producers'), $before, 'Rejected work does not spend cash');
$decimal($a->produce('core', 'producers', 'ore', '14', 'households'), '14', 'Rejected work does not use capacity/workers');
$a->close();

// A shrinking treasury/household pool is observable if taxes are retained, not silently replenished.
$a = new Accounts($rules, $seed);
$throws(fn () => $a->reserve('unfunded', 'government', '201'), 'Cannot reserve hypothetical tax receipts');
$a->reserve('all', 'government', '200');
$throws(fn () => $a->support('government', 'households', '1'), 'Cash commitment cannot be spent twice');
$a->release('all'); $a->support('government', 'households', '1'); $a->close();

// New development is paid construction with shared labor, usable in the destination season only.
$development = $seed;
$development['territories']['core']['capacity']['producers']['ore'] = '2';
$development['territories']['frontier'] = ['government' => 'government', 'workforce' => '10', 'potential' => ['ore' => '10'], 'capacity' => ['producers' => ['ore' => '0']], 'background_capacity' => []];
$a = new Accounts($rules, $development);
$decimal($a->develop('frontier', 'producers', 'ore', '2', 'households'), '2', 'Domestic investment can cross territories');
$throws(fn () => $a->produce('frontier', 'producers', 'ore', '2', 'households'), 'New capacity cannot restart production');
$built = $a->close();
$decimal($cash($built, 'producers'), '64', 'Investment has a payer');
$decimal($cash($built, 'households'), '16', 'Construction has an income recipient');
$a = new Accounts($rules, $built['state']);
$decimal($a->produce('frontier', 'producers', 'ore', '2', 'households'), '2', 'New capacity produces next season');
$a->close();
$summaries['private_development'] = $built;

// Replacement uses existing construction funding/labor but cannot create stock or capacity.
$repairSeed = $seed;
$repairSeed['accounts']['producers']['cash'] = '15';
$repairSeed['territories']['core']['workforce'] = '1';
$a = new Accounts($rules, $repairSeed);
$decimal($a->rebuild('core', 'producers', 'ore', '10', '2', 'households'), '1', 'Rebuilding shares the territorial workforce');
$repaired = $a->close();
$decimal($cash($repaired, 'producers'), '5', 'Rebuilding is paid, not a grant');
$decimal($repaired['used_workers']['core'], '1', 'Rebuilding workers are accounted');
$decimal($repaired['state']['territories']['core']['capacity']['producers']['ore'], '14', 'Rebuilding does not expand installed capacity');
$decimal($repaired['state']['inventories']['producers']['ore']['quantity'] ?? '0.000000', '0', 'Rebuilding cannot create immediate goods');
$decimal($events($repaired, 'rebuilding')[0]['cost'], '10', 'Replacement expense is auditable');
$repairSeed['territories']['core']['workforce'] = '30';
$a = new Accounts($rules, $repairSeed);
$decimal($a->rebuild('core', 'producers', 'ore', '10', '2', 'households'), '1.5', 'Rebuilding is cash limited');
$a->close();
$a = new Accounts($rules, $seed);
$decimal($a->rebuild('core', 'producers', 'ore', '10', '0.5', 'households'), '0.5', 'Rebuilding cannot exceed damaged capacity');
$a->close();
$a = new Accounts($rules, $seed);
$throws(fn () => $a->rebuild('core', 'lender', 'ore', '1', '1', 'households'), 'Non-domestic investors cannot rebuild');
$a->close();
$a = new Accounts($rules, $seed);
$a->produce('core', 'producers', 'ore', '10', 'households');
$a->purchase('government', 'producers', 'ore', '10');
$a->develop('core', 'producers', 'ore', '3', 'households');
$reinvested = $a->close();
$decimal($cash($reinvested, 'government'), '126', 'Construction wages also pay funded wage tax');
$decimal($cash($reinvested, 'producers'), '86', 'Investment cannot spend the profit tax provision');
$decimal($events($reinvested, 'earnings')[0]['realized_profit'], '40', 'Capital spending is not deducted again as operating cost');
$a = new Accounts($rules, $publicSeed);
$decimal($a->develop('core', 'government', 'ore', '20', 'households'), '16', 'Expansion capped at remaining potential');
$publicBuilt = $a->close();
$decimal($publicBuilt['state']['territories']['core']['capacity']['government']['ore'], '30', 'Public assets expand without private double count');

// Explicit lender and liability; write-off changes claims, not cash.
$a = new Accounts($rules, $seed);
$a->borrow('government', 'lender', '100');
$debt = $a->serviceDebt('government', 'lender', '10', '30', '20');
$r = $a->close();
$decimal($r['state']['debts']['government']['lender'], '50', 'Principal and relief identity');
$decimal($cash($r, 'government'), '260', 'Loan proceeds minus interest and repayment');
$decimal($cash($r, 'lender'), '940', 'Counterparty funded the loan and received cash');
$summaries['funded_debt'] = $r;
$empty = $seed; $empty['accounts']['government']['cash'] = '0'; $empty['debts']['government']['lender'] = '100';
$a = new Accounts($rules, $empty);
$arrears = $a->serviceDebt('government', 'lender', '10', '0', '50');
$r = $a->close();
$decimal($arrears['arrears'], '10', 'Unpaid interest capitalized explicitly');
$decimal($r['state']['debts']['government']['lender'], '60', 'Restructuring includes arrears');
$decimal($cash($r, 'government'), '0', 'Debt relief is not cash');
$a = new Accounts($rules, $seed);
$throws(fn () => $a->borrow('government', 'lender', '1001'), 'No unlimited external funding'); $a->close();

// Capture moves physical assets between domestic aggregate pools, never national cash/stocks.
$capture = $mixedSeed;
$capture['accounts']['new_government'] = ['kind' => 'government', 'cash' => '17', 'tax_rate' => '0.2'];
$capture['accounts']['new_producers'] = ['kind' => 'producer', 'cash' => '9', 'treasury' => 'new_government'];
$capture['accounts']['new_households'] = ['kind' => 'household', 'cash' => '0', 'treasury' => 'new_government'];
$capture['inventories']['government']['ore'] = ['quantity' => '3', 'cost' => '18'];
$a = new Accounts($rules, $capture);
$throws(fn () => $a->capture('core', 'new_government', 'new_producers'), 'Capture happens after economic settlement');
$beforeCapture = $a->close();
$a->capture('core', 'new_government', 'new_producers');
$captured = $a->close();
$eq($captured['state']['accounts'], $beforeCapture['state']['accounts'], 'Capture does not mint/transfer pooled cash');
$eq($captured['state']['inventories'], $beforeCapture['state']['inventories'], 'Capture does not duplicate or seize national stockpiles');
$decimal($captured['state']['territories']['core']['capacity']['new_government']['ore'], '5', 'Public physical assets follow territorial control');
$decimal($captured['state']['territories']['core']['capacity']['new_producers']['ore'], '5', 'Private productive share remains private');
$summaries['territory_capture'] = $captured;
$a = new Accounts($rules, $captured['state']);
$throws(fn () => $a->produce('core', 'new_producers', 'ore', '1', 'households'), 'Capture cannot leave wages/taxes assigned to old national household pool');
$decimal($a->produce('core', 'new_producers', 'ore', '1', 'new_households'), '1', 'Captured private assets operate through new domestic pools');
$throws(fn () => $a->purchase('government', 'new_producers', 'ore', '1'), 'Accounting foundation does not implicitly introduce foreign trade');
$a->close();

// Old military commitments cannot spend the newly acquired forecast stock in this season.
$a = new Accounts($rules, $seed);
$a->produce('core', 'producers', 'ore', '2', 'households');
$a->purchase('government', 'producers', 'ore', '2');
$throws(fn () => $a->militaryUse('government', 'ore', '1'), 'Forecast acquisition cannot fund opening military use');
$next = $a->close();
$a = new Accounts($rules, $next['state']);
$a->militaryUse('government', 'ore', '2');
$r = $a->close();
$decimal($r['state']['inventories']['government']['ore']['quantity'], '0', 'Owned next-season goods are usable');

// Identity is configuration. This deliberately never names the synthetic good inside domain code.
$custom = $seed; $custom['territories']['core']['potential'] = ['synthetic_seventh' => '30'];
$custom['territories']['core']['capacity'] = ['producers' => ['synthetic_seventh' => '14']];
$a = new Accounts(['synthetic_seventh' => $rules['ore']], $custom);
$a->produce('core', 'producers', 'synthetic_seventh', '10', 'households');
$a->purchase('government', 'producers', 'synthetic_seventh', '10');
$generic = $a->close();
$eq($generic['state']['accounts'], $private['state']['accounts'], 'Renaming resource leaves accounting unchanged');
$decimal($generic['state']['inventories']['government']['synthetic_seventh']['quantity'], '10', 'Reduced single-resource fixture works');
$throws(fn () => new Accounts(['cash' => ['kind' => 'currency']], $seed), 'Currency cannot enter physical production');
$throws(fn () => new Accounts(['recruits' => ['kind' => 'capacity']], $seed), 'Recruitment cannot become stored goods');

// Return unspent financing below the ordinary reserve, bounded by actual cash and debt.
foreach ([['5','100','5'], ['50','100','50'], ['50','10','10']] as [$openingCash,$principal,$expected]) {
    $unused = $seed; $unused['accounts']['government']['cash'] = $openingCash;
    $unused['debts']['government']['lender'] = $principal;
    $a = new Accounts($rules, $unused);
    $r = $a->close(['government'=>['lender'=>'lender','reserve'=>'100','minimum_repayment'=>'80']]);
    $decimal($cash($r, 'government'), Q::sub(Q::parse($openingCash), Q::parse($expected)), 'Unused repayment capped by cash');
    $decimal($r['state']['debts']['government']['lender'], Q::sub(Q::parse($principal), Q::parse($expected)), 'Unused repayment capped by principal');
}

// Rounding: weighted-average withdrawal conserves the final micro-unit of inventory cost.
$round = $seed; $round['inventories']['producers']['ore'] = ['quantity' => '3', 'cost' => '1'];
$a = new Accounts($rules, $round);
for ($i = 0; $i < 3; $i++) $a->purchase('government', 'producers', 'ore', '1');
$r = $a->close();
$sales = $events($r, 'sale');
$decimal(Q::add(Q::add($sales[0]['cost'], $sales[1]['cost']), $sales[2]['cost']), '1', 'Rounded cost allocations exhaust exact basis');
$decimal($r['state']['inventories']['producers']['ore']['cost'], '0', 'No cost dust after final sale');

// Loss offsets across activities happen once per producer, without a cash tax rebate.
$loss = $seed; $loss['inventories']['producers']['ore'] = ['quantity' => '2', 'cost' => '40'];
$a = new Accounts($rules, $loss);
$a->purchase('government', 'producers', 'ore', '2');
$r = $a->close();
$decimal($events($r, 'earnings')[0]['realized_profit'], '-20', 'Loss recognized against carried inventory cost');
$decimal($events($r, 'earnings')[0]['tax'], '0', 'Negative profit does not create tax refund money');
$a = new Accounts($rules, $seed);
$a->prepareService('core', 'producers', '2', '6', 'households');
$unbought = $a->close();
$decimal($events($unbought, 'earnings')[0]['realized_profit'], '-12', 'Unsold service work remains a real expense');
$eq($unbought['state']['inventories'], [], 'Residual services cannot become stored goods');

// Decimal and funding variation: independently sum cash and reconcile all produced goods.
foreach (['0', '0.2', '1'] as $taxRate) foreach (['0', '0.000001', '7.5', '84'] as $workingCash) foreach (['0', '0.125', '3', '20'] as $request) {
    $varied = $seed;
    $varied['accounts']['government']['tax_rate'] = $taxRate;
    $varied['accounts']['producers']['cash'] = $workingCash;
    $a = new Accounts($rules, $varied);
    $output = $a->produce('core', 'producers', 'ore', $request, 'households');
    $bought = $a->purchase('government', 'producers', 'ore', $request);
    $r = $a->close();
    $total = array_reduce($r['state']['accounts'], fn ($sum, $account) => Q::add($sum, $account['cash']), '0.000000');
    $decimal($total, Q::add('1200.000000', Q::parse($workingCash)), 'All counterparties conserve exact cash across fractional cases');
    $decimal(Q::add($r['state']['inventories']['government']['ore']['quantity'], $r['state']['inventories']['producers']['ore']['quantity']), $output, 'All owners reconcile physical output');
    $check(Q::cmp($bought, $output) <= 0 && Q::cmp($output, '14') <= 0, 'Fractional allocation respects actual output and installed capacity');
}

if (($argv[1] ?? null) === '--report') {
    echo json_encode(['checks' => $checks, 'scenarios' => $summaries], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
} else {
    echo "PASS: $checks production-accounting checks; four-season household cycle, public/private/mixed output, shortages, investment, debt, capture and replay.\n";
}
