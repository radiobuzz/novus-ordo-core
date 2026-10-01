<?php

require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, Quantity as Q};

$fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/civilian-homeland.json'), true, flags: JSON_THROW_ON_ERROR);
// Preserve historical fiscal settings here to isolate the input-chain regression.
// Current opening balance is covered separately by civilian-balance.php.
echo "Historical-rule supply-chain replay (old upkeep and farm-funding settings retained):\n";
$resources = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/resource-templates/civilian.json'), true, flags: JSON_THROW_ON_ERROR)['resources'], null, 'key');
$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$cash = fn ($s) => array_reduce($s['accounts'], fn ($sum, $a) => Q::add($sum, Q::parse($a['cash'])), '0.000000');
$resolve = fn ($state, $case, $extra = []) => Season::resolve($resources, $state, $extra + [
    'settings' => $fixture[$case]['settings'], 'acquisitions' => $fixture[$case]['acquisitions'],
    'release_limits' => ['food' => $state['inventories']['government']['food']['quantity']],
], $fixture['rules']); // Old saved rules intentionally lack input_stock_buffer: defaults must upgrade safely.

$first = $resolve($fixture['founding']['state'], 'founding');
$check(Q::cmp($first['resources']['ore']['development']['producer'], '0') > 0, 'Industrial demand must fund ore expansion before founding stocks run out.');
$check($first['resources']['ore']['civilian_requested'] === '0.000000', 'Ore investment must not depend on direct household demand.');
$check($first['resources']['ore']['acquisition_requested'] === '0.000000', 'Ore investment must not depend on government orders.');
$check($first['resources']['ore']['production']['government'] === '0.000000', 'Idle public mines must not masquerade as private supply.');
$blocked = $resolve($fixture['founding']['state'], 'founding', ['investors' => ['government']]);
$check($blocked['resources']['ore']['development']['producer'] === '0.000000', 'Industrial opportunities must respect investment permissions.');
$noCash = $fixture['founding']['state'];
foreach ($noCash['accounts'] as &$account) $account['cash'] = '0';
unset($account); // No buyer or lender can fund investment via otherwise legitimate sales.
$unfunded = $resolve($noCash, 'founding');
$check($unfunded['resources']['ore']['development']['producer'] === '0.000000', 'Industrial demand cannot conjure construction money.');

foreach (['founding', 'recovery'] as $case) {
    $state = $fixture[$case]['state']; $openingCash = $cash($state);
    $firstFullySupplied = null;
    for ($season = 1; $season <= 30; ++$season) {
        $before = $state;
        $r = $resolve($state, $case);
        $c = $r['report']['civilian'];
        $check($before === $state, "$case/$season forecast mutated input state.");
        $check($r === $resolve($state, $case), "$case/$season forecast changed on repetition.");
        $check($cash($r['state']) === $openingCash, "$case/$season created or lost money.");
        $check($r['resources']['food']['civilian']['unmet'] === '0.000000', "$case/$season food shortage.");
        $check(Q::cmp($c['workers_used'], $c['workforce']) <= 0, "$case/$season workforce exceeded.");
        $fullySupplied = $r['resources']['household_goods']['civilian']['unmet'] === '0.000000'
            && $c['maintenance_delivered'] === $c['maintenance_required'];
        if ($fullySupplied && $firstFullySupplied === null) $firstFullySupplied = $season;
        if ($case === 'founding' || $season >= 4) $check($fullySupplied, "$case/$season ordinary civilian needs or upkeep unmet.");
        if ($case === 'founding' || $season >= 12) $check(Q::cmp($c['minimum_condition'], '1') === 0, "$case/$season assets not fully maintained/repaired.");
        foreach ($c['maintenance'] as $m) {
            $check(Q::cmp($m['delivered'], $m['required']) <= 0, "$case/$season overdelivered maintenance.");
            $check(Q::cmp($m['closing_condition'], '0') >= 0 && Q::cmp($m['closing_condition'], '1') <= 0, "$case/$season invalid condition.");
        }
        $state = $r['state'];
        // Bounded supply-chain stress: actual normal growth, without terrain population caps.
        // Fiscal equilibrium is separate: this test reports debt rather than claiming none.
        $growth = .01 * Agriculture::growthMultiplier($r['resources']['food'], []);
        foreach ($state['territories'] as &$t) {
            $t['population'] = (int) floor($t['population'] * (1 + $growth));
            $t['workforce'] = (string) $t['population'];
        }
        unset($t);
    }
    echo "$case: first fully supplied season $firstFullySupplied; 30-season treasury {$r['report']['closing_treasury']}; debt {$r['report']['fiscal']['closing_debt']}.\n";
}
echo "PASS: $checks actual-homeland checks: peaceful supply, industrial investment, recovery, permissions, cash, workers and deterministic forecasts.\n";
