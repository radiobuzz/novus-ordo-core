<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\MaintenanceWarnings;
$checks = 0;
$check = function ($ok,$why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$warning = ['type'=>'infrastructure_maintenance_shortfall','territory_id'=>42,'cause'=>'no_workforce'];
$other = ['type'=>'acquisition_shortfall','resource_key'=>'ore','missing'=>'1'];
$result = ['warnings'=>[$warning,$other], 'opening_territories'=>[42=>['population'=>250000,'workforce'=>'0']],
    'report'=>['infrastructure'=>[42=>['maintenance'=>'0.0625','maintenance_allocation'=>'0.0625','maintenance_paid'=>'0']]]];
$before=$result;
$check(MaintenanceWarnings::explain($result,[42])===[['type'=>'annexed_maintenance_no_workforce','territory_id'=>42],$other], 'Explain the verified annexation without hiding acquisitions');
$check($before===$result,'Explanation cannot change settlement');
$check(MaintenanceWarnings::explain($result,[])===$result['warnings'],'Zero workforce alone does not prove annexation');
$insufficient=$result;$insufficient['report']['infrastructure'][42]['maintenance_allocation']='0.01';
$check(MaintenanceWarnings::explain($insufficient,[42])===$result['warnings'],'Cannot describe insufficient allocation as sufficient funding');
$workers=$result;$workers['opening_territories'][42]['workforce']='125000';
$check(MaintenanceWarnings::explain($workers,[42])===$result['warnings'],'Cannot blame absent workforce when workers exist');
$multiple=$result;$multiple['warnings'][]=['type'=>'infrastructure_maintenance_shortfall','territory_id'=>43,'cause'=>'policy_funding'];
$check(MaintenanceWarnings::explain($multiple,[42])[2]===$multiple['warnings'][2],'Keep other territorial causes');
echo "PASS: $checks maintenance explanation checks.\n";
