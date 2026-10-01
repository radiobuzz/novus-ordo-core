<?php
// Pure replay of an anonymized snapshot; never connects to the application database.
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, GeographicProduction, Quantity as Q};
$fixture = json_decode(file_get_contents(__DIR__ . '/../../tests/client/fixtures/production-accounting/resource-capacity.json'), true, flags: JSON_THROW_ON_ERROR);
$variants = ['baseline' => [], 'ore-2' => ['ore'=>2], 'ore-3' => ['ore'=>3], 'ore-4' => ['ore'=>4], 'all-2' => ['food'=>2,'material'=>2,'ore'=>2,'oil'=>2], 'industrial' => ['ore'=>3,'material'=>1.5,'oil'=>2],
    'ore-2-reserve-075'=>['ore'=>2], 'ore-3-reserve-075'=>['ore'=>3], 'ore-3-payout-06'=>['ore'=>3]];
$selected = $argv[1] ?? 'audit'; $seasons = (int) ($argv[2] ?? 50); $mode = $argv[3] ?? 'peace';
if ($selected === 'audit') {
    $r = Season::resolve($fixture['resources'], $fixture['state'], $fixture['plan'], $fixture['rules']);
    foreach ($r['resources'] as $key => $row) {
        $potential = $installed = 0;
        foreach ($fixture['state']['territories'] as $t) {
            $potential += (float) GeographicProduction::potential($fixture['resources'][$key]['rules'], $key, $t['geography'], $t['population']);
            $installed += (float) ($t['capacity']['government'][$key] ?? 0) + (float) ($t['capacity']['producer'][$key] ?? 0);
        }
        echo json_encode(['resource'=>$key,'potential'=>$potential,'installed'=>$installed,'output'=>$row['production'],
            'household_need'=>$row['civilian_requested'],'industrial_need'=>$row['industrial_requested'],'state_order'=>$row['acquisition_requested'],
            'unmet'=>$row['civilian']['unmet'],'subsistence'=>$r['report']['civilian']['subsistence'][$key]??'0','constraints'=>$row['constraints']]), "\n";
    }
    exit;
}
foreach ($variants as $name => $multipliers) {
    if ($selected !== 'all' && $selected !== $name) continue;
    $state = $fixture['state']; $plan = $fixture['plan']; $resources = $fixture['resources']; $rules=$fixture['rules'];
    if (str_contains($name,'reserve-075')) $rules['operating_reserve']='0.75';
    if (str_contains($name,'payout-06')) $rules['profit_distribution']='0.6';
    // Catalogue conversion only: no rewritten geography or free mines/stocks/repairs.
    foreach ($multipliers as $key=>$factor) $resources[$key]['rules']['production.territorial_labor']['potential_multiplier']=(string)$factor;
    $plan['committed_goods'] = []; $plan['committed_payroll'] = '0';
    foreach ($plan['acquisitions'] as &$order) if($mode!=='as-saved') { $order['quantity']='0'; $order['spending_limit']='0'; }
    unset($order);
    $built = 0; $firstGoods = null; $lastShortage = 0; $firstDebt = null;
    if (str_starts_with($mode, 'buildup')) {
        $plan['acquisitions']['ore'] = ['quantity'=>'0.25','spending_limit'=>'0.5','priority'=>100];
        $plan['settings']['production.development_funding']['ore'] = '0.25';
    }
    for ($n=1;$n<=$seasons;++$n) {
        $plan['committed_goods']=[]; $plan['committed_payroll']='0';
        if (str_starts_with($mode,'buildup') && $built < 3 && Q::cmp($state['inventories']['government']['ore']['quantity'],'1')>=0 && Q::cmp($state['accounts']['government']['cash'],'14')>=0) {
            $plan['committed_goods']=['ore'=>'1']; $plan['committed_payroll']='4'; ++$built;
        }
        if ($mode === 'buildup-managed' && $built===3 && Q::cmp(Q::sub($state['inventories']['government']['ore']['quantity'], $plan['committed_goods']['ore']??'0'),'1')>=0) {
            $plan['acquisitions']['ore']['quantity']='0'; $plan['acquisitions']['ore']['spending_limit']='0';
            $plan['settings']['production.development_funding']['ore']='0';
        }
        $plan['public_payroll']=Q::add($fixture['plan']['public_payroll'], (string)$built);
        $plan['release_limits']['food']=$state['inventories']['government']['food']['quantity'];
        $r=Season::resolve($resources,$state,$plan,$rules); $c=$r['report']['civilian'];
        if ($r['resources']['household_goods']['civilian']['unmet']==='0.000000') $firstGoods??=$n; else $lastShortage=$n;
        if (Q::cmp($r['report']['fiscal']['closing_debt'],'0')>0) $firstDebt??=$n;
        if(in_array($n,[1,10,20,30,50,80],true)||$n===$seasons) echo json_encode(['variant'=>$name,'mode'=>$mode,'season'=>$n,'built_extra_artillery'=>$built,
            'first_full_goods'=>$firstGoods,'last_goods_shortage'=>$lastShortage,'food_unmet'=>$r['resources']['food']['civilian']['unmet'],
            'goods_unmet'=>$r['resources']['household_goods']['civilian']['unmet'],'maintenance'=>[$c['maintenance_delivered'],$c['maintenance_required']],
            'ore_output'=>$r['resources']['ore']['production'],'ore_need'=>$r['resources']['ore']['industrial_requested'],'ore_stock'=>$r['resources']['ore']['government_closing'],
            'treasury'=>$r['report']['closing_treasury'],'private_cash'=>$state['accounts']['producer']['cash'],'private_development'=>$r['report']['private_development'],
            'goods_constraints'=>$r['resources']['household_goods']['constraints'],'ore_sale'=>[$r['resources']['ore']['public_industry_requested'],$r['resources']['ore']['public_industry_planned']],
            'debt'=>$r['report']['fiscal']['closing_debt'],'first_debt'=>$firstDebt,'warnings'=>$r['warnings']]),"\n";
        $state=$r['state']; $growth=.01*Agriculture::growthMultiplier($r['resources']['food'],[]);
        foreach($state['territories'] as $id=>&$t) {
            $share=$fixture['state']['territories'][$id]['workforce']/$fixture['state']['territories'][$id]['population'];
            $t['population']=min($fixture['population_caps'][$id],(int)floor($t['population']*(1+$growth)));
            $t['workforce']=(string)(int)floor($t['population']*$share);
        } unset($t);
    }
}
