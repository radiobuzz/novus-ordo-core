<?php

require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, Quantity as Q};

// Anonymized, read-only captures of the nine-territory economy before and after
// its maintenance spiral. Saved rules, policies, armies and orders are retained.
$fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/civilian-maintenance-crisis.json'), true, flags: JSON_THROW_ON_ERROR);
$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$cash = fn ($state) => array_reduce($state['accounts'], fn ($sum, $a) => Q::add($sum, Q::parse($a['cash'])), '0.000000');
$events = fn ($r, $type) => array_values(array_filter($r['events'], fn ($e) => $e['type'] === $type));
$resolve = fn ($state, $plan) => Season::resolve($fixture['resources'], $state, $plan, $fixture['rules']);
$cases = $fixture['cases'];
$cases['cold_restart'] = $cases['damaged'];
foreach ($cases['cold_restart']['state']['territories'] as &$t) {
    foreach ($t['productive_condition'] as &$conditions) foreach ($conditions as &$condition) $condition = '0';
    unset($conditions, $condition);
}
unset($t);
foreach (['ore', 'equipment'] as $key) $cases['cold_restart']['state']['inventories']['producer'][$key] = ['quantity' => '0', 'cost' => '0'];

foreach ($cases as $name => $input) {
    $state = $input['state']; $plan = $input['plan']; $totalCash = $cash($state);
    $firstFood = $firstMaintenance = $firstRestored = null;
    for ($n = 1; $n <= 50; ++$n) {
        $plan['release_limits']['food'] = $state['inventories']['government']['food']['quantity'] ?? '0';
        if ($n > 1) { $plan['committed_goods'] = []; $plan['committed_payroll'] = '0'; }
        $r = $resolve($state, $plan); $c = $r['report']['civilian'];
        $food = $r['resources']['food']['civilian']['unmet'] === '0.000000';
        $maintenance = $c['maintenance_delivered'] === $c['maintenance_required'];
        if ($food) $firstFood ??= $n;
        if ($maintenance) $firstMaintenance ??= $n;
        if (Q::cmp($c['minimum_condition'], '1') === 0) $firstRestored ??= $n;
        $check($cash($r['state']) === $totalCash, "$name/$n: cash conservation");
        foreach ($r['state']['accounts'] as $a) $check(Q::cmp($a['cash'], '0') >= 0, "$name/$n: nonnegative cash");
        foreach ($r['used_workers'] as $id => $used) $check(Q::cmp($used, $state['territories'][$id]['workforce']) <= 0, "$name/$n: shared labor ceiling");
        foreach ($c['maintenance'] as $m) {
            $check(Q::cmp($m['closing_condition'], Q::min('1', Q::add($m['opening_condition'], $m['recovery']))) <= 0, "$name/$n: bounded repair rate");
            $check(Q::cmp($m['closing_condition'], '0') >= 0, "$name/$n: nonnegative condition");
        }
        $capital = array_reduce(array_merge($events($r, 'investment'), $events($r, 'rebuilding')), fn ($sum, $e) => $e['owner'] === 'producer' ? Q::add($sum, $e['cost']) : $sum, '0.000000');
        $check($r['report']['private_development'] === $capital, "$name/$n: replacement expense appears in financial report");
        if ($name === 'before_shortage') $check($food && $maintenance, "$name/$n: no maintenance-driven food collapse");
        if ($name === 'damaged' && $n >= 2) $check($maintenance, "$name/$n: restored maintenance stays supplied");
        if ($name === 'damaged' && $n >= 10) $check($food, "$name/$n: food recovers within ten seasons and stays supplied");
        if ($name === 'cold_restart' && $n === 1) {
            $check($r['resources']['ore']['production']['producer'] === '0.000000' && $r['resources']['equipment']['production']['producer'] === '0.000000', 'Rebuilding cannot make same-season output');
            $check(count($events($r, 'rebuilding')) > 0, 'Fully broken essential industry has a paid restart path');
        }
        if ($n === 1 || $n === 50) $check($r === $resolve($state, $plan), "$name/$n: deterministic forecast");
        $state = $r['state'];
        $growth = .01 * Agriculture::growthMultiplier($r['resources']['food'], []);
        foreach ($state['territories'] as $id => &$t) {
            // Preserve opening loyalty's workforce share; do not create additional workers.
            $share = $input['state']['territories'][$id]['workforce'] / $input['state']['territories'][$id]['population'];
            $t['population'] = min($input['population_caps'][$id], (int) floor($t['population'] * (1 + $growth)));
            $t['workforce'] = (string) (int) floor($t['population'] * $share);
        }
        unset($t);
    }
    $check($firstFood !== null && $firstMaintenance !== null && $firstRestored !== null, "$name: bounded recovery");
    $check($food && $maintenance, "$name: recovery persists to season 50");
    $check(Q::cmp($r['resources']['household_goods']['civilian']['unmet'], '0') > 0, "$name: real geological scarcity is not hidden");
    echo "$name: first food/maintenance/full-condition seasons $firstFood/$firstMaintenance/$firstRestored; 50-season treasury {$r['report']['closing_treasury']}.\n";
}

// Restart is not a bailout: investment permissions, money and workers still bind.
$cold = $cases['cold_restart'];
$plan = $cold['plan']; $plan['investors'] = [];
$check($events($resolve($cold['state'], $plan), 'rebuilding') === [], 'No unauthorized private rebuilding');
$plan = $cold['plan']; $plan['investors'] = ['producer'];
$dry = $cold['state'];
foreach ($dry['accounts'] as &$a) $a['cash'] = '0';
unset($a);
$check($events($resolve($dry, $plan), 'rebuilding') === [], 'No free rebuilding without money');
$dry = $cold['state'];
foreach ($dry['territories'] as &$t) $t['workforce'] = '0';
unset($t);
$check($events($resolve($dry, $plan), 'rebuilding') === [], 'No rebuilding without workers');

// A real, funded state order still purchases surplus, but cannot empty the
// industrial pipeline even when its requested priority is above household goods.
$input = $fixture['cases']['before_shortage']; $state = $input['state']; $plan = $input['plan'];
$state['inventories']['producer']['ore'] = ['quantity' => '3', 'cost' => '3'];
$plan['acquisitions']['ore'] = ['quantity' => '10', 'spending_limit' => '20', 'priority' => 0];
$r = $resolve($state, $plan); $row = $r['resources']['ore'];
$check(Q::cmp($row['private_delivery'], '0') > 0, 'State procurement still receives paid private surplus');
$check(Q::cmp($row['private_closing'], Q::mul($row['industrial_requested'], '1.2')) >= 0, 'Procurement preserves next-season industrial inputs');
$check($r['resources']['food']['civilian']['unmet'] === '0.000000', 'Funded ore order does not displace food');
$check($cash($r['state']) === $cash($state), 'Procurement is funded, not a grant');
echo "PASS: $checks maintenance-priority and collapse-recovery checks.\n";
