<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Economy\ProductionEconomyInput as Input;
use App\Domain\Resources\Quantity as Q;

$n = 0;
$check = function ($ok, $why) use (&$n) { ++$n; if (!$ok) throw new RuntimeException($why); };
$eq = fn ($a, $b, $why) => $check($a === $b, $why . ': ' . json_encode([$a, $b]));
$throws = function ($work, $why) use ($check) { try { $work(); } catch (DomainException|Illuminate\Validation\ValidationException $e) { $check(true, $why); return; } $check(false, $why); };
$document = json_decode(file_get_contents(__DIR__ . '/../../database/resource-templates/foundation.json'), true);
$resources = array_column($document['resources'], null, 'key');
foreach ($resources as &$r) if (isset($r['rules']['production.territorial_labor'])) {
    foreach ($r['rules']['production.territorial_labor']['yields'] as $terrain => &$value) $value = $terrain === 'Water' ? '0' : '10'; unset($value);
    $r['rules']['development.capacity']['construction_workers'] = '100000';
    if (isset($r['rules']['demand.population'])) $r['rules']['demand.population']['per_million'] = '4';
} unset($r);
$fixture = function (string $publicShare = '0') use ($resources) {
    $t = ['government' => 'government', 'population' => 1000000, 'workforce' => '1000000', 'terrain' => 'Plain',
        'economy' => ['informal' => '0.1', 'infrastructure' => '0.6', 'unrest' => '0', 'capacity' => '1'],
        'geography' => ['resources' => []], 'capacity' => ['government' => [], 'producer' => []]];
    foreach ($resources as $key => $r) if ($r['kind'] === 'stock') {
        $t['geography']['resources'][$key] = ['capacity' => 20, 'terrainWeights' => ['Plain' => 1]];
        $t['capacity']['government'][$key] = Q::mul('8', $publicShare);
        $t['capacity']['producer'][$key] = Q::sub('8', $t['capacity']['government'][$key]);
    }
    return ['accounts' => ['government' => ['kind' => 'government', 'cash' => '200', 'tax_rate' => '0'],
        'producer' => ['kind' => 'producer', 'cash' => '100', 'treasury' => 'government'],
        'household' => ['kind' => 'household', 'cash' => '100', 'treasury' => 'government']], 'territories' => ['core' => $t]];
};
$plan = ['settings' => ['finance.income_tax' => ['taxable_income' => '0.2']],
    'acquisitions' => ['ore' => ['quantity' => '2', 'spending_limit' => '4', 'priority' => 2]], 'investors' => []];
$rules = ['service_demand_per_person' => '0', 'private_investment' => '0'];
$cashTotal = fn ($state) => array_reduce($state['accounts'], fn ($q, $a) => Q::add($q, Q::parse($a['cash'])), '0.000000');

// The policy uses the existing transfer ledger: funded purchases, no invented cash/income.
$supportSeed = $fixture();
$supportSeed['accounts']['producer']['cash'] = $supportSeed['accounts']['household']['cash'] = '0';
$supportSeed['inventories']['producer']['food'] = ['quantity' => '4', 'cost' => '0'];
$supportPlan = ['investors' => [], 'settings' => ['finance.income_tax' => ['taxable_income' => '0']]];
$withoutSupport = Season::resolve($resources, $supportSeed, $supportPlan, $rules);
$supportPlan['settings']['budget.income_support']['households'] = '8';
$withSupport = Season::resolve($resources, $supportSeed, $supportPlan, $rules);
$eq($withSupport['report']['support_requested'], '8.000000', 'Policy specifies the seasonal support budget');
$eq($withSupport['report']['support_paid'], '8.000000', 'Funded support is paid before purchases');
$check(Q::cmp($withSupport['resources']['food']['civilian']['fulfilled'], $withoutSupport['resources']['food']['civilian']['fulfilled']) > 0, 'Support enables previously unaffordable purchases');
$eq($cashTotal($withSupport['state']), $cashTotal($supportSeed), 'Support conserves domestic cash');
$eq($withSupport['report']['wages'], '0.000000', 'Transfers are not counted as wages');
$eq($withSupport['report']['earned_income'], $withSupport['report']['realized_profit'], 'Only genuine sale profit becomes earned income');
$supportSeed['accounts']['government']['cash'] = '5';
$supportPlan['settings']['budget.income_support']['households'] = '50';
$partialSupport = Season::resolve($resources, $supportSeed, $supportPlan, $rules);
$eq($partialSupport['report']['support_paid'], '5.000000', 'Support is capped by funded public cash');
$check(in_array('income_support_shortfall', array_column($partialSupport['warnings'], 'type'), true), 'Underfunded support has an explicit warning');
$eq($cashTotal($partialSupport['state']), $cashTotal($supportSeed), 'Partial support does not create cash');
$supportPlan['settings']['budget.income_support']['households'] = '0';
$eq(Season::resolve($resources, $supportSeed, $supportPlan, $rules), Season::resolve($resources, $supportSeed, ['investors' => [], 'settings' => ['finance.income_tax' => ['taxable_income' => '0']]], $rules), 'Zero funding retains the unsupported outcome');

$expansionSeed = $fixture();
$expansionSeed['accounts']['household']['cash'] = '0';
$expansionSeed['accounts']['producer']['cash'] = '4';
$expansionSeed['territories']['core']['capacity']['producer']['food'] = '2';
$expansionSeed['inventories']['producer']['food'] = ['quantity' => '2', 'cost' => '0'];
$expansionPlan = ['investors' => ['producer'], 'settings' => ['finance.income_tax' => ['taxable_income' => '0']]];
$expansionRules = ['service_demand_per_person' => '0', 'profit_distribution' => '0', 'private_investment' => '0.2'];
$weakDemand = Season::resolve($resources, $expansionSeed, $expansionPlan, $expansionRules);
$expansionPlan['settings']['budget.income_support']['households'] = '8';
$fundedDemand = Season::resolve($resources, $expansionSeed, $expansionPlan, $expansionRules);
$check(Q::cmp($fundedDemand['resources']['food']['development']['producer'], $weakDemand['resources']['food']['development']['producer']) > 0, 'Funded demand can encourage private expansion when capacity is needed');
$eq($cashTotal($fundedDemand['state']), $cashTotal($expansionSeed), 'Induced investment conserves cash');

foreach (['0','1','0.5'] as $share) {
    $seed = $fixture($share); $result = Season::resolve($resources, $seed, $plan, $rules);
    $eq($result, Season::resolve($resources, $seed, $plan, $rules), 'Preview and settlement deterministic');
    $eq($cashTotal($result['state']), $cashTotal($seed), 'Domestic cash conserved');
    $eq($result['resources']['ore']['acquisition_unmet'], '0.000000', 'Government acquisition fulfilled');
    $eq($result['resources']['food']['civilian']['fulfilled'], '4.000000', 'Population demand fulfilled');
    $eq($result['resources']['material']['production']['producer'], '0.000000', 'No invented raw-material demand');
    $check(Q::cmp($result['used_workers']['core'], '1000000') <= 0, 'Shared workforce within population');
    if ($share === '0') $eq($result['report']['government_purchases'], '4.000000', 'Private goods paid at reference price');
    if ($share === '1') $eq($result['report']['government_purchases'], '0.000000', 'Public internal delivery has no invented sales');
    $again = Season::resolve($resources, $result['state'], $plan, $rules);
    $eq($cashTotal($again['state']), $cashTotal($seed), 'Next season never replenishes cash');
}
// Maintenance is shared nationally before any region receives improvements.
$maintenanceResources = $resources;
$maintenanceResources['food']['rules']['demand.population']['per_million'] = '0';
$maintenanceSeed = $fixture();
$maintenanceSeed['territories']['second'] = $maintenanceSeed['territories']['core'];
$maintenancePlan = ['investors'=>[], 'settings'=>['budget.program_funding'=>['infrastructure'=>'1']]];
$regionalUpkeep = Q::mul('0.6', Season::defaults()['infrastructure_upkeep']);
$maintenanceSeed['accounts']['government']['cash'] = Q::mul('2', $regionalUpkeep); // Exactly two regions' upkeep.
$r = Season::resolve($maintenanceResources, $maintenanceSeed, $maintenancePlan, $rules);
foreach ($r['report']['infrastructure'] as $row) {
    $eq($row['maintenance_paid'], $regionalUpkeep, 'Every region receives affordable maintenance first');
    $eq($row['improvement_paid'], '0.000000', 'No improvement spends another region maintenance');
}
$maintenanceSeed['accounts']['government']['cash'] = $regionalUpkeep;
$r = Season::resolve($maintenanceResources, $maintenanceSeed, $maintenancePlan, $rules);
foreach ($r['report']['infrastructure'] as $row) $eq($row['maintenance_paid'], Q::mul('0.5', $regionalUpkeep), 'Scarce maintenance shared proportionally');
$check(in_array('maintenance_shortfall', array_column($r['warnings'], 'type')), 'Unfunded maintenance warns');
$maintenanceSeed['accounts']['government']['cash'] = '20';
$maintenancePlan['settings']['budget.program_funding']['infrastructure'] = '0.5';
$r = Season::resolve($maintenanceResources, $maintenanceSeed, $maintenancePlan, $rules);
$check(in_array('maintenance_shortfall', array_column($r['warnings'], 'type')), 'Low chosen funding warns even when entirely paid');
$check(!in_array('infrastructure_shortfall', array_column($r['warnings'], 'type')), 'Chosen half-budget was fully paid');
$maintenancePlan['settings']['budget.program_funding']['infrastructure'] = '1';
$maintenanceSeed['territories']['second']['workforce'] = '0';
$r = Season::resolve($maintenanceResources, $maintenanceSeed, $maintenancePlan, $rules);
$check(Q::cmp($r['report']['infrastructure']['core']['improvement_paid'], '0') > 0, 'Local worker shortage does not block affordable improvements elsewhere');
$check(in_array('maintenance_shortfall', array_column($r['warnings'], 'type')), 'Local worker shortage still reports unperformed upkeep');
// Impossible orders do not finance phantom purchases.
$noSupply = $fixture();
$noSupply['accounts']['government']['cash'] = '0';
$noSupply['accounts']['lender'] = ['kind'=>'lender', 'cash'=>'100'];
$noSupply['fiscal'] = ['receipts'=>['10']];
$noSupply['debts'] = ['government'=>['lender'=>'0']];
$noSupply['territories']['core']['capacity']['producer']['ore'] = '0';
$r = Season::resolve($resources, $noSupply, $plan, $rules);
$eq($r['report']['fiscal']['borrowing'], '0.000000', 'No loan for an unavailable good');
$eq($r['resources']['ore']['acquisition_unmet'], '2.000000', 'Impossible acquisition stays visible');
$noSupply['territories']['core']['capacity']['producer']['ore'] = '8';
$noSupply['accounts']['producer']['cash'] = '0';
$noSupply['accounts']['household']['cash'] = '0';
$r = Season::resolve($resources, $noSupply, $plan, $rules);
$eq($r['report']['fiscal']['borrowing'], '4.000000', 'Potentially feasible purchase initially financed');
$eq($r['report']['fiscal']['principal_repaid'], '4.000000', 'Unspent loan returned even below treasury reserve');
$eq($r['report']['fiscal']['closing_debt'], '0.000000', 'Failed purchase leaves no unnecessary debt');
$eq($cashTotal($r['state']), $cashTotal($noSupply), 'Returning unused loan conserves cash');
$limitedPublic = $fixture('1');
$limitedPublic['accounts']['government']['cash'] = '0';
$limitedPublic['accounts']['lender'] = ['kind'=>'lender', 'cash'=>'100'];
$limitedPublic['fiscal'] = ['receipts'=>['10']];
$limitedPublic['debts'] = ['government'=>['lender'=>'0']];
$limitedPublic['territories']['core']['capacity']['government']['food'] = '1';
$r = Season::resolve($resources, $limitedPublic, ['investors'=>[]], $rules);
$eq($r['report']['fiscal']['borrowing'], Q::parse($resources['food']['rules']['production.operating']['wage_per_unit']), 'Public wage envelope bounded by installed capacity');

// Seasonal receipts settle temporary financing before the reserve protects older debt.
// The purchase is completed: this is not the unused-order refund case above.
foreach ([
    ['cash'=>'3', 'tax'=>'0.2', 'debt'=>'0', 'loan'=>'1', 'shortfall'=>false],
    ['cash'=>'0', 'tax'=>'0.2', 'debt'=>'0', 'loan'=>'4', 'shortfall'=>true],
    ['cash'=>'3', 'tax'=>'0.2', 'debt'=>'10', 'loan'=>'1.15', 'shortfall'=>false],
    ['cash'=>'15', 'tax'=>'0', 'debt'=>'10', 'loan'=>'0', 'shortfall'=>false],
] as $case) {
    $financingSeed = $fixture();
    $financingSeed['accounts']['government']['cash'] = $case['cash'];
    $financingSeed['accounts']['lender'] = ['kind'=>'lender', 'cash'=>'100'];
    $financingSeed['debts'] = ['government'=>['lender'=>$case['debt']]];
    $financingSeed['fiscal'] = ['receipts'=>['10']];
    $financingPlan = $plan;
    $financingPlan['settings']['finance.income_tax']['taxable_income'] = $case['tax'];
    $r = Season::resolve($resources, $financingSeed, $financingPlan, $rules);
    $f = $r['report']['fiscal'];
    $eq($f['borrowing'], Q::parse($case['loan']), 'Opening treasury used before temporary financing');
    $eq($r['report']['government_purchases'], '4.000000', 'Financed purchase actually delivered and paid');
    if ($case['shortfall']) {
        $eq($r['report']['closing_treasury'], '0.000000', 'Genuine new debt consumes available treasury first');
        $eq($f['closing_debt'], Q::sub('4', $r['report']['tax_receipts']), 'Only the unfunded seasonal cost remains borrowed');
        $check(Q::cmp($f['closing_debt'], '0') > 0, 'Genuine shortfall still permits debt');
    } else {
        $eq($f['closing_debt'], Q::parse($case['debt']), 'Late receipts clear new financing without sweeping older debt below reserve');
        $eq($f['principal_repaid'], Q::parse($case['loan']), 'Temporary loan repaid even below treasury buffer');
        $eq($r['report']['closing_treasury'], Q::sub(Q::add($case['cash'], $r['report']['tax_receipts']), Q::add('4', $f['interest_due'])), 'Seasonal deficit draws down treasury');
    }
    $eq($cashTotal($r['state']), $cashTotal($financingSeed), 'Temporary financing repayment conserves counterparty cash');
    $eq($r, Season::resolve($resources, $financingSeed, $financingPlan, $rules), 'Financing replay and preview are identical');
}

// Generic catalogue identities and reduced optional goods.
$renamed = $resources; $renamed['nutrition_test'] = $renamed['food']; unset($renamed['food']);
$renamed['synthetic'] = $renamed['ore']; $renamed['synthetic']['role'] = null;
$seed = $fixture();
foreach ($seed['territories'] as &$t) {
    $t['geography']['resources']['nutrition_test'] = $t['geography']['resources']['food']; unset($t['geography']['resources']['food']);
    $t['geography']['resources']['synthetic'] = $t['geography']['resources']['ore'];
    foreach ($t['capacity'] as &$c) { $c['nutrition_test'] = $c['food']; unset($c['food']); $c['synthetic'] = $c['ore']; } unset($c);
} unset($t);
$syntheticPlan = $plan; $syntheticPlan['acquisitions'] = ['synthetic' => ['quantity' => '2', 'spending_limit' => '4', 'priority' => 2]];
$result = Season::resolve($renamed, $seed, $syntheticPlan, $rules);
$eq($result['resources']['synthetic']['private_delivery'], '2.000000', 'Added resource uses same settlement');
$eq($result['resources']['nutrition_test']['civilian']['fulfilled'], '4.000000', 'Nutrition role survives rename');
$reduced = array_intersect_key($renamed, array_flip(['money','recruitment','nutrition_test']));
foreach ($seed['territories'] as &$t) { foreach ($t['capacity'] as &$c) $c = array_intersect_key($c, $reduced); unset($c); } unset($t);
$check(isset(Season::resolve($reduced, $seed, ['investors'=>[]], $rules)['resources']['nutrition_test']), 'Reduced catalogue runs');
// Shortage is visible; zero funds never turn wishes into sales or production.
$seed = $fixture(); $seed['accounts']['producer']['cash'] = '0'; $seed['accounts']['household']['cash'] = '0';
$result = Season::resolve($resources, $seed, $plan, $rules);
$eq($result['resources']['food']['civilian']['unmet'], '4.000000', 'Working-capital shortage blocks private food');
$eq($result['report']['government_purchases'], '0.000000', 'Unfilled order is not an expense');
$eq($result['state']['accounts']['government']['cash'], '200.000000', 'Unused reserved purchase money released');
$seed['inventories']['government']['food'] = ['quantity'=>'3','cost'=>'3'];
$release = $plan + ['release_limits'=>['food'=>'1.25']];
$result = Season::resolve($resources, $seed, $release, $rules);
$eq($result['resources']['food']['civilian']['released'], '1.250000', 'Public release is bounded and physical');
$eq($result['resources']['food']['government_closing'], '1.750000', 'Unreleased government reserve remains owned');
$seed = $fixture(); $seed['inventories']['producer']['food'] = ['quantity'=>'4','cost'=>'3'];
$result = Season::resolve($resources, $seed, $plan, $rules);
$eq($result['resources']['food']['production']['producer'], '0.000000', 'Existing inventory offsets production need');
$check(Q::cmp($result['report']['realized_profit'], '0') > 0, 'Older stock profit recognizes carried cost');
// Opening-owned action rule: next production cannot validate an immediate military commitment.
$throws(fn () => Season::resolve($resources, $fixture(), $plan + ['committed_goods'=>['ore'=>'1']], $rules), 'Cannot spend future output');
$throws(fn () => Season::resolve($resources, $fixture(), $plan + ['military'=>['money'=>'1']], $rules), 'Currency cannot be physically consumed');
// Public and private growth share potential, workers and one seasonal ceiling.
$seed = $fixture('0.5');
foreach ($seed['territories']['core']['capacity'] as &$c) $c['ore'] = '0.25'; unset($c);
$development = $plan; $development['investors'] = ['government','producer'];
$development['settings']['production.development_funding']['ore'] = '1';
$development['settings']['allocation.production_priority']['ore'] = 'regional';
$result = Season::resolve($resources, $seed, $development, ['service_demand_per_person'=>'0']);
$growth = Q::add($result['resources']['ore']['development']['government'], $result['resources']['ore']['development']['producer']);
$check(Q::cmp($growth, '0') > 0 && Q::cmp($growth,'1.6') <= 0, 'Funded construction stays within shared growth ceiling');
$check(Q::cmp(Q::add(...array_values($result['resources']['ore']['production'])), '0.5') <= 0, 'New capacity does not produce this season');
$eq($cashTotal($result['state']), $cashTotal($seed), 'Construction transfers money instead of destroying it');
// Compliance responds now to a tax rise and recovers gradually after a reduction.
$seed = $fixture(); $high = $plan; $high['settings']['finance.income_tax']['taxable_income'] = '1';
$highResult = Season::resolve($resources, $seed, $high, $rules);
$check(Q::cmp($highResult['state']['territories']['core']['economy']['informal'], '0.1') > 0, 'No first-season full-compliance tax windfall');
$lowResult = Season::resolve($resources, $highResult['state'], $plan, $rules);
$check(Q::cmp($lowResult['state']['territories']['core']['economy']['informal'],'0.1') > 0, 'Compliance does not recover instantly');
// Fiscal counterparties, default once per episode, then deterministic history/replay.
$seed = $fixture(); $seed['accounts']['government']['cash']='0'; $seed['accounts']['lender']=['kind'=>'lender','cash'=>'0'];
$seed['debts']=['government'=>['lender'=>'100']];
$result=Season::resolve($resources,$seed,[], $rules);
$check($result['report']['fiscal']['new_default'],'Unpaid interest opens default episode');
$second=Season::resolve($resources,$result['state'],[], $rules);
$check(!$second['report']['fiscal']['new_default'] && $second['report']['fiscal']['relief']==='0.000000','No repeated haircut in an episode');
$eq($cashTotal($result['state']),$cashTotal($seed),'Debt write-off does not create cash');
$seed=$fixture(); $seed['accounts']['lender']=['kind'=>'lender','cash'=>'100']; $seed['debts']=['government'=>['lender'=>'10']];
$result=Season::resolve($resources,$seed,[], $rules);
$eq($result['state']['debts']['government']['lender'],'0.000000','Surplus repays debt after keeping reserve');
$eq($cashTotal($result['state']),$cashTotal($seed),'Debt payments have funded counterparty');
$protectedPlan = ['settings' => ['finance.treasury_reserve' => ['treasury' => '200']]];
$protected = Season::resolve($resources, $seed, $protectedPlan, $rules);
$eq($protected['report']['fiscal']['principal_repaid'], '0.000000', 'Policy reserve protects older principal');
$zeroReserve = $protectedPlan; $zeroReserve['settings']['finance.treasury_reserve']['treasury'] = '0';
$repaid = Season::resolve($resources, $seed, $zeroReserve, $rules);
$eq($repaid['report']['fiscal']['principal_repaid'], '10.000000', 'Zero policy reserve permits surplus repayment');
$eq($cashTotal($protected['state']), $cashTotal($repaid['state']), 'Reserve changes never create money');
for($i=0;$i<4;++$i){$before=$result['state'];$result=Season::resolve($resources,$before,$plan,$rules);$eq($result,Season::resolve($resources,$before,$plan,$rules),'Four-season replay');$eq($cashTotal($result['state']),$cashTotal($seed),'Four-season cash conservation');}
// Explicit spending limits apply equally to public delivery and private purchases.
$zeroBudget=$plan;$zeroBudget['acquisitions']['ore']['spending_limit']='0';
$r=Season::resolve($resources,$fixture('1'),$zeroBudget,$rules);
$eq($r['resources']['ore']['public_delivery'],'0.000000','Zero request budget cannot fund public acquisition');
$basic=$resources;$basic['food']['rules']['demand.population']['per_million']='0';
$noTax=$plan;$noTax['settings']['finance.income_tax']['taxable_income']='0';
$r=Season::resolve($basic,$fixture(),$noTax,$rules);
$eq($r['report']['earned_income'],'4.000000','Two-unit sale splits wages and profit; revenue is not added again');
$seed=$fixture('0.5');$seed['inventories']['producer']['food']=['quantity'=>'4','cost'=>'3'];
$r=Season::resolve($resources,$seed,$plan,$rules);
$eq(Q::add(...array_values($r['resources']['food']['production'])),'0.000000','Opening private supply also offsets public civilian production');
// Public infrastructure has real labor/payment constraints and next-season geographic effects.
$infra=$plan;$infra['settings']['budget.program_funding']['infrastructure']='1';
$r=Season::resolve($resources,$fixture(),$infra,$rules);
$check(Q::cmp($r['report']['infrastructure']['core']['paid'],'0')>0,'Infrastructure pays workers');
$check(Q::cmp($r['state']['territories']['core']['economy']['infrastructure'],'0.6')>0,'Funded public works improve next infrastructure');
$seed=$fixture();$seed['accounts']['government']['cash']='0';
$r=Season::resolve($resources,$seed,$infra,$rules);
$check(Q::cmp($r['state']['territories']['core']['economy']['infrastructure'],'0.6')<0,'Unfunded maintenance causes gradual decay');
// Every activity draws on one territory worker pool, even with fractional cash and extreme taxation.
foreach(['0','0.2','1'] as $tax) foreach(['0','0.333333','1'] as $share) foreach(['0','0.000001','2.123456','100'] as $cash) {
    $seed=$fixture($share);$seed['accounts']['government']['cash']=$cash;$seed['accounts']['producer']['cash']=$cash;
    $seed['territories']['second']=$seed['territories']['core'];
    $seed['territories']['second']['population']=100000;$seed['territories']['second']['workforce']='100000';
    $p=$development;$p['settings']['finance.income_tax']['taxable_income']=$tax;
    $r=Season::resolve($resources,$seed,$p);
    $eq($cashTotal($r['state']),$cashTotal($seed),'Fractional/exhausted funds conserve all cash');
    foreach($r['used_workers'] as $id=>$used)$check(Q::cmp($used,$seed['territories'][$id]['workforce'])<=0,'Resources/services/construction never duplicate workers');
    foreach($r['resources'] as $row)$check(Q::cmp(Q::add($row['purchase_spending'],$row['public_delivery_cost']),$row['spending_limit'])<=0,'Mixed acquisition respects the total spending cap');
    $eq($r,Season::resolve($resources,$seed,$p),'Fractional boundary deterministic replay');
}
$throws(fn()=>Season::resolve($resources,$fixture(),['settings'=>['production.development_funding'=>['missing'=>'1']]],$rules),'No unknown policy targets');
$throws(fn()=>Season::resolve($resources,$fixture(),[],['service_price'=>'0']),'No zero service-price division');
echo "PASS: $n coordinated production-economy checks.\n";
