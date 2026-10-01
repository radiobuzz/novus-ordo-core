<?php

require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\{ProductionEconomySeason as Season, CivilianProduction};
use App\Domain\Resources\{GeographicProduction, Quantity as Q};
use App\Services\Policies\{PolicyRules, PolicyEffectRegistry};
use App\Services\Resources\ResourceCatalogue;

$resources = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/resource-templates/civilian.json'), true, flags: JSON_THROW_ON_ERROR)['resources'], null, 'key');
$policies = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/policy-templates/economy.json'), true, flags: JSON_THROW_ON_ERROR)['policies'], null, 'key');
$settings = (new PolicyEffectRegistry)->compile($policies, (new PolicyRules)->defaults($policies), new ResourceCatalogue([], $resources, []));
$opening = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/peaceful-founding.json'), true, flags: JSON_THROW_ON_ERROR)['state'];
foreach ($opening['territories'] as &$t) foreach ($resources as $key => $r) {
    if ($r['kind'] !== 'stock') continue;
    $seed = $r['rules']['production.founding'];
    $potential = GeographicProduction::potential($r['rules'], $key, $t['geography'], $t['population']);
    $capacity = Q::mul($potential, $seed['core_developed_fraction']);
    $t['capacity']['government'][$key] = Q::mul($capacity, $seed['public_share']);
    $t['capacity']['producer'][$key] = Q::sub($capacity, $t['capacity']['government'][$key]);
}
unset($t);
foreach ($resources as $key => $r) if ($r['kind'] === 'stock') {
    $quantity = Q::output(5000000, $r['rules']['production.founding']['private_inventory_per_million']);
    $opening['inventories']['producer'][$key] = ['quantity' => $quantity, 'cost' => Q::mul($quantity, $r['rules']['production.founding']['private_inventory_unit_cost'])];
}
$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$cash = fn ($s) => array_reduce($s['accounts'], fn ($a, $b) => Q::add($a, $b['cash']), '0.000000');
$resolve = fn ($s) => Season::resolve($resources, $s, ['settings' => $settings]);
$normal = $resolve($opening);
$check($normal === $resolve($opening), 'Deterministic civilian production');
$check($normal['report']['civilian']['enabled'], 'Civilian activities active');
$check($normal['report']['civilian']['maintenance_delivered'] === $normal['report']['civilian']['maintenance_required'], 'Founding equipment supplies upkeep');
$check(Q::cmp($normal['report']['civilian']['subsistence']['food'], '0') > 0, 'Subsistence contributes food');
$check($cash($normal['state']) === $cash($opening), 'Conserved money');
foreach ($normal['resources'] as $key => $r) $check(Q::add($r['civilian']['unaffordable'], $r['civilian']['unavailable']) === $r['civilian']['unmet'], 'Shortage causes reconcile: ' . $key);

$shock = $opening;
$shock['inventories']['producer']['equipment'] = ['quantity' => '0', 'cost' => '0'];
$outage = $resolve($shock);
$check($outage['report']['civilian']['maintenance_delivered'] === '0.000000', 'Newly made equipment cannot perform opening-stock maintenance');
$check(Q::cmp($outage['resources']['equipment']['production']['producer'], '0') > 0, 'Equipment output continues with opening ore');
$check($outage['report']['civilian']['minimum_condition'] === '0.920000', 'Unmaintained installed assets deteriorate');
$restored = $resolve($outage['state']);
$check(Q::cmp($restored['report']['civilian']['maintenance_delivered'], '0') > 0, 'Following season can use prior equipment output');
$check(Q::cmp($restored['report']['civilian']['minimum_condition'], '0.92') > 0, 'Restored maintenance repairs assets');
$check(in_array('productive_maintenance_shortfall', array_column($outage['warnings'], 'type'), true), 'Outage has a visible warning');

$noOre = $opening;
$noOre['inventories']['producer']['ore'] = ['quantity' => '0', 'cost' => '0'];
$noOre['inventories']['producer']['household_goods'] = ['quantity' => '0', 'cost' => '0'];
$missing = $resolve($noOre);
$check($missing['resources']['household_goods']['production']['producer'] === '0.000000', 'Same-owner newly mined ore cannot bypass input timing');
$check(in_array('input:ore', $missing['resources']['household_goods']['constraints'], true), 'Missing input is explained');
$check(Q::cmp($missing['resources']['ore']['production']['producer'], '0') > 0, 'Ore is produced for the following season');

$reversed = $opening;
$reversed['territories'] = array_reverse($reversed['territories'], true);
$check($normal === Season::resolve(array_reverse($resources, true), $reversed, ['settings' => $settings]), 'Enumeration order cannot change settlement');
$renamed = $resources; $renamed['metal'] = $renamed['ore']; unset($renamed['ore']);
foreach ($renamed as &$r) if (isset($r['rules']['production.inputs']['resources']['ore'])) {
    $r['rules']['production.inputs']['resources']['metal'] = $r['rules']['production.inputs']['resources']['ore'];
    unset($r['rules']['production.inputs']['resources']['ore']);
}
unset($r);
$renamedState = $opening;
foreach ($renamedState['inventories'] as &$stocks) if (isset($stocks['ore'])) { $stocks['metal'] = $stocks['ore']; unset($stocks['ore']); }
unset($stocks);
foreach ($renamedState['territories'] as &$t) {
    $t['geography']['resources']['metal'] = $t['geography']['resources']['ore']; unset($t['geography']['resources']['ore']);
    foreach ($t['capacity'] as &$c) { $c['metal'] = $c['ore']; unset($c['ore']); } unset($c);
}
unset($t);
$renamedSettings = $settings;
foreach (['production.development_funding', 'allocation.production_priority'] as $type) {
    $renamedSettings[$type]['metal'] = $renamedSettings[$type]['ore']; unset($renamedSettings[$type]['ore']);
}
$renamedResult = Season::resolve($renamed, $renamedState, ['settings' => $renamedSettings]);
$check($normal['state']['accounts'] === $renamedResult['state']['accounts'], 'Resource identity does not select a hardcoded recipe');
$check(CivilianProduction::condition('0.5', '1', '0.5', '0.08', '0.04') === '0.460000', 'Partial upkeep slows decay, not free repair');
echo "PASS: $checks live civilian production checks: input timing, asset damage/recovery, subsistence, cash and generic resource identity.\n";
