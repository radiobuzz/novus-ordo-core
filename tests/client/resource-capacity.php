<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, GeographicProduction as Geography, Quantity as Q};
$f = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/resource-capacity.json'), true, flags: JSON_THROW_ON_ERROR);
$source = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/resource-templates/civilian.json'), true, flags: JSON_THROW_ON_ERROR)['resources'], null, 'key');
$resources = $f['resources']; $resources['ore']['rules']['production.territorial_labor']['potential_multiplier'] = $source['ore']['rules']['production.territorial_labor']['potential_multiplier'];
$rules = $f['rules']; $rules['operating_reserve'] = Season::defaults()['operating_reserve'];
$checks=0; $check=function($ok,$why)use(&$checks){++$checks;if(!$ok)throw new RuntimeException($why);};
$cash=fn($s)=>array_reduce($s['accounts'],fn($sum,$a)=>Q::add($sum,$a['cash']),'0.000000');
$oldPotential=$newPotential='0.000000';
foreach($f['state']['territories'] as $t) {
    $old=Geography::potential($f['resources']['ore']['rules'],'ore',$t['geography'],$t['population']);
    $new=Geography::potential($resources['ore']['rules'],'ore',$t['geography'],$t['population']);
    $check($new===Q::mul($old,'3'),'Ore headroom follows saved geography without changing deposits.');
    $oldPotential=Q::add($oldPotential,$old); $newPotential=Q::add($newPotential,$new);
}
$check($oldPotential==='0.708895' && $newPotential==='2.126685','Current-game capacity regression.');
$empty=['resources'=>[]];
$check(Geography::potential($resources['ore']['rules'],'ore',$empty,1000000)==='0.000000','No fabricated deposits in barren territory.');
$geo=['resources'=>['ore'=>['capacity'=>1,'terrainWeights'=>['Plain'=>1]]]];
$facility=Geography::facility($resources['ore']['rules']['production.territorial_labor'],'ore',$geo,'Plain',10000000);
$check($facility['capacity']===3000000 && $facility['productivity']==='1.000000','Capacity scaling does not secretly multiply labor productivity.');
$original=Season::resolve($f['resources'],$f['state'],$f['plan'],$f['rules']);
$updated=Season::resolve($resources,$f['state'],$f['plan'],$rules);
$check($updated['resources']['ore']['production']===$original['resources']['ore']['production'],'A larger ceiling cannot instantly produce ore from unbuilt mines.');
$check(Q::cmp($updated['report']['private_development'],'0')>0,'Reserve calibration restores paid private investment.');
foreach(['continuation'=>60,'saved_orders'=>30,'buildup'=>30,'diversified'=>30] as $case=>$seasons) {
    $state=$f['state']; $plan=$f['plan']; $total=$cash($state); $built=0; $lastShortage=0; $deliveries=[];
    foreach($plan['acquisitions'] as &$o)if($case!=='saved_orders'){$o['quantity']='0';$o['spending_limit']='0';}unset($o);
    if($case==='buildup') {$plan['acquisitions']['ore']=['quantity'=>'0.25','spending_limit'=>'0.5','priority'=>100];$plan['settings']['production.development_funding']['ore']='0.25';}
    if($case==='diversified') foreach(['food'=>'0.1','material'=>'0.1','ore'=>'0.1','oil'=>'0.2','equipment'=>'0.02','household_goods'=>'0.05'] as $key=>$quantity) {
        $plan['acquisitions'][$key]=['quantity'=>$quantity,'spending_limit'=>Q::mul($quantity,$resources[$key]['rules']['exchange.reference_price']['price']),'priority'=>100];
        $plan['settings']['production.development_funding'][$key]='0.1';
    }
    for($n=1;$n<=$seasons;++$n) {
        $plan['committed_goods']=[];$plan['committed_payroll']='0';
        if($case==='buildup'&&$built<3&&Q::cmp($state['inventories']['government']['ore']['quantity'],'1')>=0&&Q::cmp($state['accounts']['government']['cash'],'14')>=0){$plan['committed_goods']=['ore'=>'1'];$plan['committed_payroll']='4';++$built;}
        $plan['public_payroll']=Q::add($f['plan']['public_payroll'],(string)$built);
        $plan['release_limits']['food']=$state['inventories']['government']['food']['quantity'];
        $r=Season::resolve($resources,$state,$plan,$rules);$c=$r['report']['civilian'];
        $check($cash($r['state'])===$total,"$case/$n cash conservation");
        foreach($r['state']['accounts'] as $a)$check(Q::cmp($a['cash'],'0')>=0,"$case/$n nonnegative accounts");
        foreach($r['used_workers'] as $id=>$used)$check(Q::cmp($used,$state['territories'][$id]['workforce'])<=0,"$case/$n shared workforce");
        $check($r['resources']['food']['civilian']['unmet']==='0.000000',"$case/$n food shortage");
        $check($c['maintenance_required']===$c['maintenance_delivered'],"$case/$n maintenance shortage");
        if($r['resources']['household_goods']['civilian']['unmet']!=='0.000000')$lastShortage=$n;
        if($n>=10)$check($r['resources']['household_goods']['civilian']['unmet']==='0.000000',"$case/$n goods shortage after recovery");
        if($n<=30)$check($r['report']['fiscal']['closing_debt']==='0.000000',"$case/$n opening 30-season runway needs debt");
        if($case==='saved_orders'&&$n===10)$check(Q::cmp($r['resources']['ore']['government_closing'],'5')>0,'Saved orders should accumulate ore as mines expand.');
        foreach($r['resources'] as $key=>$row)$deliveries[$key]=Q::add($deliveries[$key]??'0',Q::add($row['public_delivery'],$row['private_delivery']));
        if($n===1||$n===$seasons)$check($r===Season::resolve($resources,$state,$plan,$rules),"$case/$n deterministic forecast");
        $state=$r['state'];$growth=.01*Agriculture::growthMultiplier($r['resources']['food'],[]);
        foreach($state['territories'] as $id=>&$t){$share=$f['state']['territories'][$id]['workforce']/$f['state']['territories'][$id]['population'];$t['population']=min($f['population_caps'][$id],(int)floor($t['population']*(1+$growth)));$t['workforce']=(string)(int)floor($t['population']*$share);}unset($t);
    }
    if($case==='buildup')$check($built===3,'Funded supply can actually pay three additional artillery deployment costs.');
    if($case==='diversified')foreach($deliveries as $key=>$quantity)$check(Q::cmp($quantity,'0')>0,"No funded state delivery for $key");
    echo json_encode(['case'=>$case,'seasons'=>$seasons,'last_goods_shortage'=>$lastShortage,'extra_artillery'=>$built,'deliveries'=>$deliveries,'treasury'=>$r['report']['closing_treasury'],'debt'=>$r['report']['fiscal']['closing_debt']]),"\n";
}
// The more investable economy must still recover the previously damaged homeland.
$crisis=json_decode(file_get_contents(__DIR__.'/fixtures/production-accounting/civilian-maintenance-crisis.json'),true,flags:JSON_THROW_ON_ERROR);
$input=$crisis['cases']['damaged'];$state=$input['state'];$plan=$input['plan'];$total=$cash($state);$firstFood=$firstMaintenance=null;
for($n=1;$n<=50;++$n){
    $plan['committed_goods']=[];$plan['committed_payroll']='0';$plan['release_limits']['food']=$state['inventories']['government']['food']['quantity'];
    $r=Season::resolve($resources,$state,$plan,$rules);$c=$r['report']['civilian'];
    $food=$r['resources']['food']['civilian']['unmet']==='0.000000';$maintenance=$c['maintenance_required']===$c['maintenance_delivered'];
    if($food)$firstFood??=$n;if($maintenance)$firstMaintenance??=$n;
    $check($cash($r['state'])===$total,"damaged/$n cash conservation");
    if($n>=15)$check($food&&$maintenance,"damaged/$n recovery did not persist");
    foreach($r['used_workers'] as $id=>$used)$check(Q::cmp($used,$state['territories'][$id]['workforce'])<=0,"damaged/$n workforce");
    $state=$r['state'];$growth=.01*Agriculture::growthMultiplier($r['resources']['food'],[]);
    foreach($state['territories'] as $id=>&$t){$share=$input['state']['territories'][$id]['workforce']/$input['state']['territories'][$id]['population'];$t['population']=min($input['population_caps'][$id],(int)floor($t['population']*(1+$growth)));$t['workforce']=(string)(int)floor($t['population']*$share);}unset($t);
}
echo "Calibrated damaged homeland: food/maintenance recover in $firstFood/$firstMaintenance seasons; maintained through 50.\n";
echo "PASS: $checks resource headroom, investment and buildup checks.\n";
