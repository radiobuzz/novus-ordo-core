<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\{IndicatorEconomySeason as Season, IndicatorRules, GoodsAllocation};
use App\Domain\Resources\{GeographicProduction, ProductionRecipes, Quantity as Q};

$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$throws = function ($fn, $why) use ($check) { try { $fn(); } catch (DomainException|Illuminate\Validation\ValidationException $e) { $check(true,$why); return; } $check(false,$why); };
$rules = IndicatorRules::defaults();
$document = json_decode(file_get_contents(__DIR__.'/../../database/resource-templates/civilian.json'),true,flags:JSON_THROW_ON_ERROR);
$resources = array_column($document['resources'],null,'key');
$geography = json_decode(file_get_contents(__DIR__.'/fixtures/indicator-economy/saved-homeland-geography.json'),true,flags:JSON_THROW_ON_ERROR);
$fixture = function (bool $synthetic = false) use ($resources,$rules,&$geography) {
    $state = ['treasury'=>'50','debt'=>'0','fiscal'=>['receipts'=>[],'credit_lock'=>0,'default_episode'=>false],'stocks'=>[],'territories'=>[]];
    foreach ($geography['territories'] as $i=>$source) {
        $t = $source + ['economy'=>$rules['initial_core'],'capacity'=>[]];
        foreach ($resources as $key=>$r) if ($r['kind']==='stock') {
            if ($synthetic) $t['geography']['resources'][$key] = ['capacity'=>1,'terrainWeights'=>['Plain'=>1]];
            $potential = GeographicProduction::potential($r['rules'],$key,$t['geography'],$t['population']);
            $t['capacity'][$key] = Q::mul($potential,'0.6'); $state['stocks'][$key]='0';
        }
        $state['territories'][(string)($i+1)] = $t;
    }
    return $state;
};
$plan = ['settings'=>['finance.income_tax'=>['taxable_income'=>'0.25'],
    'budget.program_funding'=>array_fill_keys(['health','education','police','welfare','environment','public_development','infrastructure'],'1'),
    'production.development_funding'=>array_fill_keys(['food','ore','oil','material','household_goods'],'1')]];

$worked = [];
foreach (['homeland','fertile'] as $geographyKind) {
    $geography=json_decode(file_get_contents(__DIR__.'/fixtures/indicator-economy/saved-'.$geographyKind.'-geography.json'),true,flags:JSON_THROW_ON_ERROR);
foreach (['mixed'=>'.25','private'=>'.2','public'=>'.45'] as $ownership=>$tax) {
    $p=$plan; $p['settings']['institutions.development_ownership']['production']=$ownership;
    $p['settings']['finance.income_tax']['taxable_income']='0'.$tax;
    $state=$fixture(); $openingIncome=null;
    for ($season=1;$season<=100;$season++) {
        $result=Season::resolve($resources,$state,$p,$rules);
        $check($result === Season::resolve($resources,$state,$p,$rules), 'Preview and settlement are identical');
        $check(Q::add(Q::sub(Q::parse($state['treasury']),$result['report']['treasury_outflows']),$result['report']['treasury_inflows']) === $result['state']['treasury'], 'Treasury identity');
        $check($result['state']['debt'] === '0.000000', "$ownership peaceful saved homeland needs no credit in season $season");
        $check($result['resources']['food']['civilian']['unmet'] === '0.000000', 'Saved geography feeds the founding population');
        foreach ($result['state']['territories'] as $id=>$t) {
            $check(Q::cmp($result['used_workers'][$id],$t['workforce'])<=0,'Shared construction and production labor bounded');
            foreach ($t['economy'] as $v) $check(Q::cmp($v,'0')>=0 && Q::cmp($v,'1')<=0,'Indicators bounded');
            foreach ($t['capacity'] as $key=>$v) $check(Q::cmp($v,GeographicProduction::potential($resources[$key]['rules'],$key,$t['geography'],$t['population']))<=0,'Geographic opportunity bounds expansion');
        }
        $openingIncome ??= $result['report']['earned_income'];
        if (in_array($season,[1,20,80,100])) $worked[$geographyKind][$ownership][]=['season'=>$season,'income'=>$result['report']['earned_income'],'taxes'=>$result['report']['tax_receipts'],'treasury'=>$result['state']['treasury'],
            'debt'=>$result['state']['debt'],'public_development'=>$result['report']['public_development'],'household_goods'=>$result['resources']['household_goods']['civilian'],'infrastructure'=>array_sum(array_column($result['report']['infrastructure'],'paid'))];
        $state=$result['state'];
    }
    $check(Q::cmp($result['report']['earned_income'],$openingIncome)>0,"$ownership prospers without monthly policy babysitting");
    $check(Q::cmp($result['state']['treasury'],'50')>0,"$ownership peaceful treasury grows");
}

}
// Every ownership arrangement pays the same single delivery price. Civilian flows pay no government invoice.
$p=['settings'=>['finance.income_tax'=>['taxable_income'=>'0']], 'acquisitions'=>['ore'=>['quantity'=>'0.1','spending_limit'=>'1','priority'=>0]]];
foreach (['private','mixed','public'] as $ownership) {
    $p['settings']['institutions.development_ownership']['production']=$ownership;
    $r=Season::resolve($resources,$fixture(true),$p,$rules);
    $check($r['resources']['ore']['acquired']==='0.100000','Delivered requested acquisition');
    $check($r['report']['government_purchases']==='0.200000','One reference-price charge under every ownership');
    $check($r['report']['treasury_outflows']==='0.200000','No duplicate operation/public-sales/wage invoice');
    $check(!isset($r['state']['accounts']) && !isset($r['report']['wages']) && !isset($r['report']['realized_profit']), 'No civilian cash ledger survives in new contract');
}

$s=$fixture(true); $s['treasury']='100';$s['debt']='100';$s['fiscal']['receipts']=['100'];
$r=Season::resolve($resources,$s,['settings'=>[]],$rules);
$check($r['report']['fiscal']['borrowing']==='0.000000','Use reserves before borrowing');
$check($r['state']['treasury']==='20.000000','Automatic repayment preserves the configured reserve');
$check($r['state']['debt']==='21.500000','Interest paid then surplus repays principal');

$s=$fixture(true);$s['treasury']='0';$s['debt']='100';$s['fiscal']=['receipts'=>[],'credit_lock'=>0,'default_episode'=>false];
$r=Season::resolve($resources,$s,['settings'=>[]],$rules);
$check($r['report']['fiscal']['new_default']===true,'First interest default begins episode');
$again=Season::resolve($resources,$r['state'],['settings'=>[]],$rules);
$check($again['report']['fiscal']['new_default']===false && $again['report']['fiscal']['relief']==='0.000000','No repeated restructuring per episode');

// Real bottleneck: equipment is absent; low ore constrains household goods, not nonexistent household cash.
$s=$fixture(true); foreach($s['territories'] as &$t) $t['capacity']['ore']='0.01';unset($t);
$r=Season::resolve($resources,$s,$plan,$rules);
$check(Q::cmp($r['resources']['household_goods']['civilian']['unmet'],'0')>0,'Input shortage visible');
$check($r['resources']['food']['civilian']['unmet']==='0.000000','Priority nutrition protected');
$check(Q::cmp($r['resources']['ore']['development']['total'],'0')>0,'Ordinary unmet input need drives capacity expansion');
$r2=Season::resolve($resources,$r['state'],$plan,$rules);
$check(Q::cmp($r2['resources']['household_goods']['civilian']['fulfilled'],$r['resources']['household_goods']['civilian']['fulfilled'])>0,'New capacity helps in following season');

// A renamed nutrition good and a new transformed good follow identical generic contracts.
$rr=$resources;$rr['staples']=$rr['food'];$rr['staples']['key']='staples';unset($rr['food']);
$rr['widgets']=$rr['household_goods'];$rr['widgets']['key']='widgets';$rr['widgets']['rules']['demand.population']['per_million']='0.01';
$s=$fixture(true);foreach($s['territories'] as &$t){$t['capacity']['staples']=$t['capacity']['food'];unset($t['capacity']['food']);$t['capacity']['widgets']='0.36';$t['geography']['resources']['staples']=$t['geography']['resources']['food'];unset($t['geography']['resources']['food']);}unset($t);
$s['stocks']['staples']='0';$s['stocks']['widgets']='0';unset($s['stocks']['food']);
$p=$plan;unset($p['settings']['production.development_funding']['food']);$p['settings']['production.development_funding']['staples']=$p['settings']['production.development_funding']['widgets']='1';
$r=Season::resolve($rr,$s,$p,$rules);
$check($r['resources']['staples']['civilian']['unmet']==='0.000000' && $r['resources']['widgets']['civilian']['unmet']==='0.000000','No resource-name special cases');

$s=$fixture(true);$p=$plan;$p['military_costs']='3';
for($i=0;$i<100;$i++){$r=Season::resolve($resources,$s,$p,$rules);$check($r['report']['military_costs_paid']==='3.000000','Modest army is funded');$s=$r['state'];}
$check($s['debt']==='0.000000','Peaceful growth supports a modest standing army');

$throws(fn()=>ProductionRecipes::order(['a'=>['inputs'=>['b'=>'1']],'b'=>['inputs'=>['a'=>'1']]]),'Cycles rejected');
$throws(fn()=>ProductionRecipes::order(['a'=>['inputs'=>['missing'=>'1']]]),'Unknown inputs rejected');
$throws(fn()=>IndicatorRules::validate(['new_magic'=>1]),'Unsupported rules rejected');
$tax=$plan;$tax['settings']['finance.income_tax']['taxable_income']='0.8';
$s=$fixture();$r=Season::resolve($resources,$s,$tax,$rules);
$check((float)$r['state']['territories'][1]['economy']['informal']>(float)$s['territories'][1]['economy']['informal'],'Tax avoidance rises in the tax-change season');
// Fractional development cannot round two ownership shares above a one-micro-unit gap.
$s=$fixture(true);$allocation=new GoodsAllocation($resources,$s['territories'],IndicatorRules::validate($rules));
$targets=array_fill_keys(array_keys($allocation->resources),'0');
$installed=array_reduce($s['territories'],fn($sum,$t)=>Q::add($sum,$t['capacity']['ore']),'0');$targets['ore']=Q::add($installed,'0.000001');
$growth=$allocation->develop($targets,$plan['settings'],'10','10');
$total=array_reduce($growth['growth'],fn($sum,$row)=>Q::add($sum,$row['ore']??'0'),'0');
$check(Q::cmp($total,'0.000001')<=0,'Development rounding cannot exceed its capacity gap');
$rr=$resources;$rr['ore']['rules']['exchange.reference_price']['price']='0.01';
$r=Season::resolve($rr,$fixture(true),['acquisitions'=>['ore'=>['quantity'=>'0.000001','spending_limit'=>'1','priority'=>0]]],$rules);
$check($r['resources']['ore']['acquired']==='0.000001' && $r['resources']['ore']['purchase_spending']==='0.000001','Tiny positive acquisitions cannot be free through rounding');
$s=$fixture();$p=$plan;$p['settings']['institutions.development_ownership']['production']='public';$p['settings']['finance.income_tax']['taxable_income']='0.9';
for($i=0;$i<100;$i++){$r=Season::resolve($resources,$s,$p,$rules);$s=$r['state'];}
$check($s['debt']==='0.000000' && (float)$s['territories'][1]['economy']['health']>.7,'High-tax public economy can fund services');
$check((float)$s['territories'][1]['economy']['dynamism']<.4 && (float)$s['territories'][1]['economy']['informal']>.3,'High taxes suppress dynamism and encourage black market');
// Additive indicator shifts compose once, independent of catalogue order.
$registry=new App\Services\Policies\PolicyEffectRegistry();$topics=[];$choices=[];
foreach (['a'=>'0.8','b'=>'0.8','c'=>'-0.8'] as $key=>$offset) {
    $effect=['effect_type'=>'indicator.target_shift','arguments'=>['indicator'=>'health','offset'=>$offset]];
    $registry->validate($effect,[],'test');
    $topics[$key]=['status'=>'active','options'=>[['key'=>'on','effects'=>[$effect]]]];
    $choices[$key]=['option'=>'on','parameters'=>[]];
}
$compiled=$registry->compile($topics,$choices);
$check($compiled['indicator.target_shift']['health']==='0.800000','Additive shifts clamp after composition');
$check($compiled===$registry->compile(array_reverse($topics,true),$choices),'Shift composition independent of record order');
$throws(fn()=>IndicatorRules::validate(['physical'=>['construction_labor_share'=>1.1]]),'Reject unbounded labor reserve');
$damaged=$fixture(); foreach($damaged['territories'] as &$t)$t['economy']['infrastructure']=0.1;unset($t);
$healthy=Season::resolve($resources,$fixture(),$plan,$rules);$r=Season::resolve($resources,$damaged,$plan,$rules);
$check((float)$r['state']['territories'][1]['economy']['economic_strength'] < (float)$healthy['state']['territories'][1]['economy']['economic_strength'],'Poor infrastructure depresses economic strength');
$check((float)$r['state']['territories'][1]['economy']['infrastructure']>0.1,'Funded damaged infrastructure recovers gradually');
$throws(fn()=>IndicatorRules::state(['capacity'=>'1']),'Retired territorial state rejected');
// Named infrastructure commitments and funding are independent catalogue inputs.
$policyDocument = json_decode(file_get_contents(__DIR__.'/../../database/policy-templates/economy.json'), true, flags: JSON_THROW_ON_ERROR);
$topics = array_column($policyDocument['policies'], null, 'key'); $choices = [];
foreach ($topics as $key => $topic) {
    foreach ($topic['options'] as $option) if ($option['is_default']) $choices[$key] = ['option'=>$option['key'], 'parameters'=>array_column($topic['parameters'], 'default_value', 'key')];
    $parameters = array_column($topic['parameters'],null,'key');
    foreach ($topic['options'] as $option) foreach ($option['effects'] as $effect) $registry->validate($effect,$parameters,'test');
}
$namedSettings = function ($option, $funding = '1') use ($registry,$topics,$choices) {
    $c=$choices; $c['infrastructure_investment']=['option'=>$option,'parameters'=>['funding_ratio'=>$funding]];
    return $registry->compile($topics,$c);
};
$infraState=$fixture(true); $infraState['treasury']='1000';
foreach ($infraState['territories'] as &$t) $t['economy']['infrastructure']='0.75'; unset($t);
foreach (['none'=>'0','minimal'=>'0.25','moderate'=>'0.5','high'=>'0.75','very_high'=>'1'] as $name=>$level) {
    $settings=$namedSettings($name); $r=Season::resolve($resources,$infraState,['settings'=>$settings],$rules);
    $check(Q::cmp($settings['budget.program_target']['infrastructure'],$level)===0, 'Named commitment compiles its own target');
    $check(Q::cmp($settings['budget.program_funding']['infrastructure'],'1')===0, 'Lower commitment retains full funding');
    $check(!array_filter($r['warnings'],fn($w)=>str_starts_with($w['type'],'infrastructure_')), 'Fully funded modest commitment does not warn');
    foreach ($r['report']['infrastructure'] as $row) {
        $check($row['target']===Q::parse($level), 'Report records selected commitment');
        $check(Q::cmp($row['maintenance'],'0')>0 && $row['maintenance']===$row['maintenance_paid'], 'None/lower ambition still maintains existing assets');
        $check($row['delivery_ratio']==='1.000000', 'Fulfilled commitment recorded as fulfilled');
        $check($name==='very_high' ? Q::cmp($row['improvement'],'0')>0 : $row['improvement']==='0.000000', 'Public construction stops at selected target');
    }
    $check($r['report']['infrastructure_required']===$r['report']['infrastructure_requested'], 'Full funding requests exactly the commitment requirement');
}
$full=Season::resolve($resources,$infraState,['settings'=>$namedSettings('high')],$rules);
$part=Season::resolve($resources,$infraState,['settings'=>$namedSettings('high','0.75')],$rules);
$check($part['report']['infrastructure'][1]['target']==='0.750000', 'Funding changes never change the target');
$check(Q::cmp($part['report']['infrastructure_requested'],$part['report']['infrastructure_required'])<0, 'Partial funding reveals requirement versus allocation');
$check(count(array_filter($part['warnings'],fn($w)=>$w['type']==='infrastructure_maintenance_shortfall' && $w['cause']==='policy_funding'))===count($infraState['territories']), 'Genuine upkeep underfunding still warns');
$check(Q::cmp($part['state']['territories'][1]['economy']['unrest'],$full['state']['territories'][1]['economy']['unrest'])>0, 'Unfulfilled funded commitment adds small unrest pressure');
$low=Season::resolve($resources,$infraState,['settings'=>$namedSettings('minimal')],$rules);
$check($low['state']['territories'][1]['economy']['unrest']===$full['state']['territories'][1]['economy']['unrest'], 'Fully delivered lower ambition is not a broken promise');
$noneFull=Season::resolve($resources,$infraState,['settings'=>$namedSettings('none')],$rules);
$nonePart=Season::resolve($resources,$infraState,['settings'=>$namedSettings('none','0.75')],$rules);
$check(Q::cmp($nonePart['state']['territories'][1]['economy']['unrest'],$noneFull['state']['territories'][1]['economy']['unrest'])>0, 'No expansion commitment does not excuse underfunding existing upkeep');
$costSettings=$namedSettings('high');$costSettings['budget.program_cost']['infrastructure_maintenance']='1.8';
$costlier=Season::resolve($resources,$infraState,['settings'=>$costSettings],$rules);
$check($costlier['report']['infrastructure'][1]['maintenance']===Q::mul($full['report']['infrastructure'][1]['maintenance'],'2'), 'Authored maintenance price changes actual requirement');
$growing=$infraState;foreach($growing['territories'] as &$t)$t['economy']['infrastructure']='0.5';unset($t);
$base=Season::resolve($resources,$growing,['settings'=>$namedSettings('high')],$rules);
$costSettings=$namedSettings('high');$costSettings['budget.program_cost']['infrastructure_development']='80';
$costlier=Season::resolve($resources,$growing,['settings'=>$costSettings],$rules);
$check($costlier['report']['infrastructure'][1]['improvement']===Q::mul($base['report']['infrastructure'][1]['improvement'],'2'), 'Authored development price changes actual requirement');
$check($costlier['state']['territories'][1]['economy']['infrastructure']===$base['state']['territories'][1]['economy']['infrastructure'], 'Fully funded price change does not magically change growth rate');
$constructionShort=Season::resolve($resources,$growing,['settings'=>$namedSettings('high','0.75')],$rules);
$check((bool)array_filter($constructionShort['warnings'],fn($w)=>$w['type']==='infrastructure_development_shortfall' && $w['cause']==='policy_funding'), 'Construction shortfall remains distinct from upkeep');
$noWorkers=$infraState;foreach($noWorkers['territories'] as &$t)$t['workforce']='0';unset($t);
$r=Season::resolve($resources,$noWorkers,['settings'=>$namedSettings('high')],$rules);
$check((bool)array_filter($r['warnings'],fn($w)=>$w['type']==='infrastructure_maintenance_shortfall' && $w['cause']==='no_workforce'), 'Full funding cannot hide a workforce blocker');
$broke=$infraState;$broke['treasury']='0';$settings=$namedSettings('high');$settings['finance.income_tax']['taxable_income']='0';
$r=Season::resolve($resources,$broke,['settings'=>$settings],$rules);
$check((bool)array_filter($r['warnings'],fn($w)=>$w['type']==='infrastructure_maintenance_shortfall' && $w['cause']==='treasury_shortfall'), 'Full policy funding still distinguishes unavailable cash or credit');
$scarce=$infraState;foreach($scarce['territories'] as &$t)$t['workforce']='100';unset($t);
$r=Season::resolve($resources,$scarce,['settings'=>$namedSettings('high')],$rules);
$check((bool)array_filter($r['warnings'],fn($w)=>$w['type']==='infrastructure_maintenance_shortfall' && $w['cause']==='construction_workforce'), 'Full policy funding still distinguishes scarce construction workers');
$bad=$namedSettings('high');$bad['budget.program_cost']['infrastructure_development']='0';
$throws(fn()=>Season::resolve($resources,$growing,['settings'=>$bad],$rules),'Positive construction target cannot cost nothing');
if (in_array('--write-results',$argv,true)) file_put_contents(__DIR__.'/../../docs/game-design/data/indicator-season-worked-results.json',json_encode(['scope'=>'Pure seasonal resolver with saved geography, fixed population, reference prices and no trade. These results do not prove live integration.','checks'=>$checks,'worked_seasons'=>$worked],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n");
echo "PASS: $checks indicator economy checks.\n";
