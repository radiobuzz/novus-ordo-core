<?php
// Pure, fixed-plan trials. No Laravel bootstrap, database connection or game commands.
require __DIR__ . '/../../vendor/autoload.php';
$variant = $argv[1] ?? 'baseline';
$cases = explode(',', $argv[2] ?? 'founding_army');
$seasons = (int) ($argv[3] ?? 100);
$populationMode = $argv[4] ?? 'growing';
$allowed = ['founding','founding_army','founding_reasonable_army','current','current_army','current_reasonable_army'];
if (!in_array($variant, ['baseline','candidate'], true) || array_diff($cases,$allowed) || $seasons < 1 || $seasons > 1000 || !in_array($populationMode,['fixed','growing'],true)) {
    fwrite(STDERR, "Usage: php8.3 scripts/research/economy-repair.php baseline|candidate CASE[,CASE] SEASONS fixed|growing\n");
    exit(2);
}
if ($variant === 'candidate') {
    $trialRoot = sys_get_temp_dir() . '/no7-economy-repair-' . bin2hex(random_bytes(6));
    mkdir($trialRoot, 0700);
    register_shutdown_function(static function () use ($trialRoot) {
        foreach (['ProductionAccounts.php','ProductionEconomySeason.php'] as $name) if (is_file($trialRoot . '/' . $name)) unlink($trialRoot . '/' . $name);
        rmdir($trialRoot);
    });
    foreach (['ProductionAccounts.php','ProductionEconomySeason.php'] as $name) copy(__DIR__ . '/../../app/Domain/Economy/' . $name, $trialRoot . '/' . $name);
    $process = proc_open(['patch','--batch','--fuzz=0','--no-backup-if-mismatch','--reject-file=/dev/null','-p1','-d',$trialRoot,'-i',__DIR__.'/economy-repair-candidate.patch'], [1=>['pipe','w'],2=>['pipe','w']], $pipes);
    $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    if (proc_close($process) !== 0) throw new RuntimeException('Experimental patch no longer matches the game; review it before retrying. ' . $output);
    require $trialRoot . '/ProductionEconomySeason.php';
}

use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Quantity as Q,Agriculture};
use App\Services\Policies\{PolicyRules,PolicyEffectRegistry};
use App\Services\Resources\ResourceCatalogue;
$live=json_decode(file_get_contents(__DIR__.'/../../tests/client/fixtures/production-accounting/economy-repair-current.json'),true,flags:JSON_THROW_ON_ERROR);
$found=json_decode(file_get_contents(__DIR__.'/../../tests/client/fixtures/production-accounting/civilian-homeland.json'),true,flags:JSON_THROW_ON_ERROR)['founding'];
$policies=array_column(json_decode(file_get_contents(__DIR__.'/../../database/policy-templates/economy.json'),true,flags:JSON_THROW_ON_ERROR)['policies'],null,'key');
$defaultResources=array_column(json_decode(file_get_contents(__DIR__.'/../../database/resource-templates/civilian.json'),true,flags:JSON_THROW_ON_ERROR)['resources'],null,'key');
$found['resources']=$defaultResources;$found['settings']=(new PolicyEffectRegistry)->compile($policies,(new PolicyRules)->defaults($policies),new ResourceCatalogue([],$defaultResources,[]));
$found['rules']=[];
$fixture=json_decode(file_get_contents(__DIR__.'/../../tests/client/fixtures/production-accounting/civilian-deficit.json'),true,flags:JSON_THROW_ON_ERROR);
$found['population_caps']=$fixture['population_caps'];
foreach($cases as $case) {
 $f=str_starts_with($case,'founding')?$found:$live;$resources=$f['resources'];$state=$f['state'];$settings=$f['settings'];$rules=$f['rules'];$army=str_contains($case,'army')?3:0;
 if(str_contains($case,'reasonable')) { $settings['finance.income_tax']['taxable_income']='0.25';$settings['budget.program_funding']['infrastructure']='1';$settings['budget.income_support']['households']='0';foreach(['food','household_goods','ore','material','equipment'] as $key)$settings['production.development_funding'][$key]='0.5'; }
 if ($variant === 'candidate') $rules['profit_distribution'] = '1';
 $sumCash=fn($s)=>array_reduce($s['accounts'],fn($q,$a)=>Q::add($q,Q::parse($a['cash'])),'0.000000');$initial=$sumCash($state);
 $minCash=null;$foodShort=0;$totalShort=0;$unaffordable=0;$upkeep=0;$infra=0;$arrears=0;$fullArmy=0;$services=0;$meanBalance=0;
 for($season=1;$season<=$seasons;$season++) {
 $ownership=$settings['institutions.development_ownership']['production']??'mixed';
 $r=Season::resolve($resources,$state,['settings'=>$settings,'acquisitions'=>$f['acquisitions'],'public_payroll'=>(string)$army,'committed_payroll'=>$season===1?(string)(3*$army):'0','investors'=>match($ownership){'private'=>['producer'],'public'=>['government'],default=>['government','producer']},'release_limits'=>['food'=>Q::mul($state['inventories']['government']['food']['quantity']??'0',$settings['food.emergency_release']['nutrition']??'0')]],$rules);
 if($sumCash($r['state'])!==$initial)throw new RuntimeException('Cash not conserved');
 if (Q::cmp($r['report']['civilian']['workers_used'],$r['report']['civilian']['workforce'])>0) throw new RuntimeException('Workforce exceeded');
 if (Q::add(Q::sub($r['report']['opening_treasury'],$r['report']['treasury_outflows']),$r['report']['treasury_inflows'])!==$r['report']['closing_treasury']) throw new RuntimeException('Treasury does not reconcile');
 $p=$r['report'];$c=$p['civilian'];$g=$r['resources']['household_goods']['civilian'];$balance=(float)$p['closing_treasury']-(float)$p['opening_treasury'];
 $minCash=$minCash===null?$p['closing_treasury']:Q::min($minCash,$p['closing_treasury']);$foodShort+=Q::cmp($r['resources']['food']['civilian']['unmet'],'0')>0;$totalShort+=(float)$g['unmet']>0;$unaffordable+=(float)$g['unaffordable']>0;$upkeep+=$c['maintenance_delivered']!==$c['maintenance_required'];$infra+=(bool)array_filter($p['infrastructure'],fn($i)=>(float)$i['maintenance_paid']+0.00001<(float)$i['maintenance']);$arrears+=(float)$p['fiscal']['arrears']>0;$fullArmy+=Q::cmp($p['public_payroll_paid'],(string)$army)===0;$services+=(float)$p['services_delivered'];if($season>max(0,$seasons-20))$meanBalance+=$balance/min(20,$seasons);
 if((in_array($season,[1,20,50,100,200,300]) || $season === $seasons))echo json_encode(['variant'=>$variant,'case'=>$case,'season'=>$season,'population'=>array_sum(array_column($state['territories'],'population')),'income'=>$p['earned_income'],'cash'=>$p['closing_treasury'],'balance'=>round($balance,3),'debt'=>$p['fiscal']['closing_debt'],'goods_need'=>$g['requested'],'goods_met'=>$g['fulfilled'],'services'=>$p['services_delivered'],'private_goods'=>$p['industries']['household_goods']['owners']['producer']['closing_capacity'],'public_goods'=>$p['industries']['household_goods']['owners']['government']['closing_capacity'],'warnings'=>$r['warnings'],'household_cash'=>$r['state']['accounts']['household']['cash'],'producer_cash'=>$r['state']['accounts']['producer']['cash'],'constraints'=>$c['constraints']]),"\n";
 $state=$r['state'];$growth=$populationMode === 'fixed' ? 0 : .01*Agriculture::growthMultiplier($r['resources']['food'],[]);
 foreach($state['territories'] as $id=>&$t){$t['population']=min($f['population_caps'][$id]??PHP_INT_MAX,(int)floor($t['population']*(1+$growth)));$t['workforce']=(string)floor($t['population']*($f['workforce_ratios'][$id]??1));}unset($t);
 }
 echo json_encode(['variant'=>$variant,'summary'=>$case,'seasons'=>$seasons,'population_mode'=>$populationMode,'cash_min'=>$minCash,'cash_end'=>$p['closing_treasury'],'debt_end'=>$p['fiscal']['closing_debt'],'food_shortage_seasons'=>$foodShort,'goods_shortage_seasons'=>$totalShort,'unaffordable_seasons'=>$unaffordable,'upkeep_shortfall_seasons'=>$upkeep,'infrastructure_shortfall_seasons'=>$infra,'arrears_seasons'=>$arrears,'army_funded_seasons'=>$fullArmy,'mean_services'=>$services/$seasons,'last20_mean_cash_change'=>round($meanBalance,4),'closing_balances'=>array_column($state['accounts'],'cash','kind'),'closing_constraints'=>$c['constraints'],'closing_workers_used'=>$c['workers_used'],'closing_workforce'=>$c['workforce']]),"\n";
}
