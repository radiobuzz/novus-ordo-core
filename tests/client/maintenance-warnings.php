<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\MaintenanceWarnings;

$checks = 0;
$check = function ($ok, $why) use (&$checks) { $checks++; if (!$ok) throw new RuntimeException($why); };
$warnings = [['type'=>'acquisition_shortfall','resource'=>'ore'], ['type'=>'maintenance_shortfall'], ['type'=>'productive_maintenance_shortfall'], ['type'=>'infrastructure_shortfall']];
$result = ['warnings'=>$warnings, 'opening_territories'=>['42'=>['population'=>250000,'workforce'=>'0']],
    'report'=>['infrastructure_budget'=>'0.1875', 'infrastructure'=>['42'=>['maintenance'=>'0.0625','improvement'=>'0.125','requested'=>'0.1875','maintenance_paid'=>'0','paid'=>'0']],
    'civilian'=>['maintenance'=>[['territory'=>'42','required'=>'0.002','delivered'=>'0']]]]];
$before = $result;
$explained = MaintenanceWarnings::explain($result, [42]);
$check($explained === [['type'=>'annexed_maintenance_no_workforce','territory_id'=>42], $warnings[0]], 'One specific warning replaces the three consequences, preserving acquisition warning.');
$check($before === $result, 'Explanations must not change workforce, funding, settlement or the source warnings.');
$check(MaintenanceWarnings::explain($result, []) === $warnings, 'Do not assume zero workforce implies a new annexation.');
$lowBudget = $result; $lowBudget['report']['infrastructure_budget']='0.1';
$check(MaintenanceWarnings::explain($lowBudget,[42]) === $warnings, 'Insufficient reserved cash must not be called sufficient funding.');
$lowPolicy = $result; $lowPolicy['report']['infrastructure']['42']['requested']='0.05';
$check(MaintenanceWarnings::explain($lowPolicy,[42]) === $warnings, 'A low policy request must not be called sufficient funding.');
$workers = $result; $workers['opening_territories']['42']['workforce']='125000';
$check(MaintenanceWarnings::explain($workers,[42]) === $warnings, 'Do not blame opening workforce when workers are present.');
$mixed = $result;
$mixed['report']['infrastructure_budget']='0.375';
$mixed['report']['infrastructure']['43']=$mixed['report']['infrastructure']['42'];
$mixed['report']['civilian']['maintenance'][]=['territory'=>'43','required'=>'0.002','delivered'=>'0'];
$mixed['opening_territories']['43']=['population'=>250000,'workforce'=>'125000'];
$check(MaintenanceWarnings::explain($mixed,[42]) === [['type'=>'annexed_maintenance_no_workforce','territory_id'=>42], ...$warnings], 'Keep general warnings when a different territory still has unexplained failures.');
$healthy = $result; $healthy['report']['infrastructure']['42']['maintenance_paid']='0.0625';$healthy['report']['infrastructure']['42']['paid']='0.1875';$healthy['report']['civilian']['maintenance'][0]['delivered']='0.002';
$check(MaintenanceWarnings::explain($healthy,[42]) === $warnings, 'Do not add a maintenance warning without an observed shortfall.');
echo "PASS: $checks maintenance explanation checks.\n";
