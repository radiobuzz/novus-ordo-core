<?php
declare(strict_types=1);
namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use Brick\Math\{BigDecimal, RoundingMode};
use DomainException;

/** The single preview/settlement calculation. Government money reconciles; national income is a measurement. */
final class IndicatorEconomySeason
{
    private const Z = '0.000000';
    private static function sum(array $values): string { return array_reduce($values, fn ($a, $b) => Q::add($a, $b), self::Z); }
    private static function positive(string $v): string { return Q::max(self::Z, $v); }
    private static function ratio(string $paid, string $need): float { return Q::cmp($need, '0') > 0 ? min(1, (float) $paid / (float) $need) : 1; }

    public static function resolve(array $resources, array $opening, array $plan, array $rules): array
    {
        $rules = IndicatorRules::validate($rules);
        $plan += ['settings' => [], 'acquisitions' => [], 'committed_goods' => [], 'military' => [],
            'command_costs' => '0', 'military_costs' => '0', 'release_limits' => []];
        $settings = $plan['settings'];
        $state = $opening; $cash = Q::parse($opening['treasury']); $debt = Q::parse($opening['debt']);
        $commands = Q::parse($plan['command_costs']);
        if (Q::cmp($commands, $cash) > 0) throw new DomainException('Accepted actions exceed opening treasury.');
        $cash = Q::sub($cash, $commands);
        $income = TerritorialIndicators::opening($state['territories'], $settings, $rules);
        $state['territories'] = $income['territories'];
        $cash = Q::add($cash, $income['taxes']);
        $goods = new GoodsAllocation($resources, $state['territories'], $rules);
        $openingTerritories = $goods->territories;
        $assessment = TerritorialIndicators::assess($state['territories'], $settings, $rules);
        $ordinary = $goods->ordinaryDemand(); $rows = []; $warnings = [];
        foreach (['acquisitions','committed_goods','military','release_limits'] as $field) if (array_diff_key($plan[$field], $goods->resources)) throw new DomainException('Unknown resource plan target.');
        $civilianOrder = array_keys($ordinary);
        usort($civilianOrder, fn ($a, $b) => ($resources[$a]['rules']['demand.population']['priority'] ?? PHP_INT_MAX) <=> ($resources[$b]['rules']['demand.population']['priority'] ?? PHP_INT_MAX) ?: strcmp($a, $b));
        $nutrition = null; $shortage = 0;
        foreach ($civilianOrder as $key) {
            $r = $resources[$key];
            if ($r['role'] === 'nutrition') $nutrition = $key;
            $stock = Q::parse($state['stocks'][$key] ?? '0');
            $commitment = Q::parse($plan['committed_goods'][$key] ?? '0');
            if (Q::cmp($commitment, $stock) > 0) throw new DomainException('Accepted actions exceed opening owned stock.');
            $stock = Q::sub($stock, $commitment);
            $military = Q::parse($plan['military'][$key] ?? '0'); $militaryMet = Q::min($military, $stock);
            $stock = Q::sub($stock, $militaryMet);
            $made = $goods->deliver($key, $ordinary[$key]);
            $released = Q::min(Q::min($stock, Q::parse($plan['release_limits'][$key] ?? '0')), Q::sub($ordinary[$key], $made));
            $stock = Q::sub($stock, $released);
            $fulfilled = Q::add($made, $released); $unmet = Q::sub($ordinary[$key], $fulfilled);
            if ($r['role'] === 'nutrition') $shortage = 1 - self::ratio($fulfilled, $ordinary[$key]);
            $request = $plan['acquisitions'][$key] ?? ['quantity' => '0','spending_limit' => '0','priority' => 100];
            $price = Q::parse($r['rules']['exchange.reference_price']['price']);
            if (Q::cmp($price, '0') <= 0) throw new DomainException('Acquisition price must be positive.');
            if (!is_int($request['priority']) || $request['priority'] < 0) throw new DomainException('Invalid acquisition priority.');
            $quantity = Q::parse($request['quantity']); $limit = Q::parse($request['spending_limit']);
            $militaryMissing = Q::sub($military, $militaryMet);
            $reserve = $r['role'] === 'nutrition' ? Q::mul($ordinary[$key], Q::parse($settings['food.reserve_target']['nutrition'] ?? '0')) : self::Z;
            $automatic = Q::add($militaryMissing, self::positive(Q::sub($reserve, $stock)));
            if (Q::cmp($automatic, $quantity) > 0) { $quantity = $automatic; $limit = Q::mul($automatic, $price); }
            $state['stocks'][$key] = $stock;
            $rows[$key] = ['price' => $price, 'civilian_requested' => $ordinary[$key], 'reserve_target' => $reserve,
                'civilian' => ['fulfilled' => $fulfilled, 'released' => $released, 'unmet' => $unmet, 'shortage_reason' => Q::cmp($unmet,'0') > 0 ? 'supply' : null],
                'acquisition_requested' => $quantity, 'spending_limit' => $limit, 'priority' => $request['priority'],
                'acquired' => self::Z, 'acquisition_unmet' => $quantity, 'purchase_spending' => self::Z, 'affordable_demand' => self::Z,
                'military_requested' => $military, 'military_fulfilled' => $militaryMet, 'command_goods' => $commitment,
                'government_opening' => Q::parse($opening['stocks'][$key] ?? '0'), 'government_closing' => $stock];
            if (Q::cmp($unmet,'0') > 0) $warnings[] = ['type' => 'civilian_supply_shortfall', 'resource_key' => $key, 'missing' => $unmet];
        }

        $fiscal = $state['fiscal'];
        $history = array_map(fn ($v) => Q::parse($v), $fiscal['receipts'] ?? []);
        $creditLimit = $history ? Q::mul(GoodsAllocation::divide(self::sum($history), (string) count($history)), $rules['finance']['credit_multiple']) : self::Z;
        $lock = $fiscal['credit_lock'] ?? 0; $episode = $fiscal['default_episode'] ?? false;
        if (!is_int($lock) || $lock < 0 || !is_bool($episode)) throw new DomainException('Invalid fiscal state.');
        $credit = $episode || $lock ? self::Z : self::positive(Q::sub($creditLimit, $debt));
        $borrowed = $outflows = self::Z;
        // Credit is drawn only when paying actual expenditure, after spending existing cash.
        $pay = function (string $wanted) use (&$cash, &$credit, &$debt, &$borrowed, &$outflows): string {
            $paid = Q::min(Q::parse($wanted), Q::add($cash, $credit));
            $borrow = self::positive(Q::sub($paid, $cash));
            $borrowed = Q::add($borrowed, $borrow); $debt = Q::add($debt, $borrow); $credit = Q::sub($credit, $borrow);
            $cash = Q::sub(Q::add($cash, $borrow), $paid); $outflows = Q::add($outflows, $paid);
            return $paid;
        };
        // Closures must read changing cash/credit, rather than capture values at creation.
        $available = function () use (&$cash, &$credit): string { return Q::add($cash, $credit); };
        $interestDue = Q::mul(Q::parse($opening['debt']), $rules['finance']['interest_rate']);
        $interestPaid = $militaryPaid = $supportPaid = self::Z;
        $programPaid = array_fill_keys(array_keys($assessment['programs']), self::Z);
        $afterTax = Q::sub($income['income'], $income['taxes']);
        $privateProvisionPaid = Q::min($assessment['private_provision'], $afterTax);
        $privateCoverage = self::ratio($privateProvisionPaid, $assessment['private_provision']);
        $privateAllowance = Q::mul(Q::sub($afterTax, $privateProvisionPaid), Q::calculated($rules['hypothesis']['private_development_share']));
        $privateStart = $privateAllowance; $privateInfrastructure = self::Z;
        $infrastructure = $assessment['infrastructure'];
        foreach ($infrastructure as &$row) $row += ['maintenance_paid' => self::Z, 'maintenance_allocation' => self::Z, 'improvement_paid' => self::Z, 'private_paid' => self::Z, 'paid' => self::Z, 'requested' => Q::add($row['maintenance_requested'],$row['improvement_requested'])]; unset($row);
        $infraOrder = array_keys($infrastructure); $priority = $settings['allocation.infrastructure_priority']['infrastructure'] ?? 'regional';
        $weight = fn ($id) => match ($priority) {
            'population' => $goods->territories[$id]['population'],
            'concentration' => (float) $goods->territories[$id]['economy']['economic_strength'],
            'regional' => 1 - (float) $goods->territories[$id]['economy']['infrastructure'],
            default => throw new DomainException('Invalid infrastructure priority.'),
        };
        usort($infraOrder, fn ($a, $b) => $weight($b) <=> $weight($a) ?: strnatcmp((string) $a, (string) $b));
        $acquisitionOrder = array_keys($rows);
        usort($acquisitionOrder, fn ($a, $b) => $rows[$a]['priority'] <=> $rows[$b]['priority'] ?: strcmp($a, $b));
        $targets = $goods->targets($ordinary); $growth = ['growth'=>[], 'private_spent'=>self::Z,'public_spent'=>self::Z,'private_paid'=>[],'public_paid'=>[]];
        foreach ($rules['funding_priority'] as $class) {
            if ($class === 'interest') $interestPaid = $pay($interestDue);
            elseif ($class === 'military') $militaryPaid = $pay(Q::parse($plan['military_costs']));
            elseif (isset($programPaid[$class])) $programPaid[$class] = $pay($assessment['programs'][$class]);
            elseif ($class === 'income_support') $supportPaid = $pay(Q::parse($settings['budget.income_support']['households'] ?? '0'));
            elseif ($class === 'infrastructure_maintenance') {
                // Scarce upkeep is shared by need; improvements cannot consume another region's upkeep.
                $need = self::sum(array_column($infrastructure, 'maintenance_requested')); $budget = Q::min($need, $available());
                foreach ($infrastructure as $id => &$row) {
                    $part = Q::cmp($need, '0') > 0 ? Q::min($row['maintenance_requested'], (string) BigDecimal::of($budget)->multipliedBy($row['maintenance_requested'])->dividedBy($need, 6, RoundingMode::DOWN)) : self::Z;
                    $row['maintenance_allocation'] = $part;
                    $feasible = $goods->construction((string) $id, $part); $row['maintenance_paid'] = $pay($feasible);
                    $budget = Q::sub($budget, $part); $need = Q::sub($need, $row['maintenance_requested']);
                } unset($row);
            } elseif ($class === 'acquisitions') {
                $demandBudget = $available(); $finalNeeds = $ordinary;
                foreach ($acquisitionOrder as $key) {
                    $row = &$rows[$key];
                    $bid = Q::min($row['spending_limit'], $demandBudget);
                    $wanted = Q::min($row['acquisition_requested'], GoodsAllocation::divide($bid, $row['price']));
                    $row['affordable_demand'] = $wanted;
                    $demandBudget = Q::sub($demandBudget, GoodsAllocation::ceilMultiply($wanted, $row['price']));
                    $delivered = $goods->deliver($key, $wanted);
                    $row['purchase_spending'] = $pay(GoodsAllocation::ceilMultiply($delivered, $row['price']));
                    $row['acquired'] = $delivered; $row['acquisition_unmet'] = Q::sub($row['acquisition_requested'], $delivered);
                    $militaryGap = Q::sub($row['military_requested'], $row['military_fulfilled']);
                    $militaryNew = Q::min($militaryGap, $delivered); $row['military_fulfilled'] = Q::add($row['military_fulfilled'], $militaryNew);
                    $state['stocks'][$key] = Q::add($state['stocks'][$key], Q::sub($delivered, $militaryNew));
                    $row['government_closing'] = $state['stocks'][$key];
                    $finalNeeds[$key] = Q::add($finalNeeds[$key], $wanted);
                    unset($row);
                }
                $targets = $goods->targets($finalNeeds);
            } elseif ($class === 'infrastructure_development') {
                foreach ($infraOrder as $id) {
                    $row = &$infrastructure[$id];
                    $row['improvement_paid'] = $pay($goods->construction((string) $id, Q::min($row['improvement_requested'], $available())));
                    $row['private_paid'] = $goods->construction((string) $id, Q::min($row['private_requested'], $privateAllowance));
                    $privateAllowance = Q::sub($privateAllowance, $row['private_paid']); $privateInfrastructure = Q::add($privateInfrastructure, $row['private_paid']);
                    unset($row);
                }
            } elseif ($class === 'resource_development') {
                $growth = $goods->develop($targets, $settings, $privateAllowance, $available());
                $privateAllowance = Q::sub($privateAllowance, $growth['private_spent']);
                if ($pay($growth['public_spent']) !== $growth['public_spent']) throw new DomainException('Unfunded construction.');
            }
        }

        $arrears = Q::sub($interestDue, $interestPaid); $relief = self::Z; $newDefault = false;
        $debt = Q::add($debt, $arrears);
        if (Q::cmp($arrears, '0') > 0 && !$episode) {
            $newDefault = $episode = true; $lock = $rules['finance']['credit_lock_seasons'];
            $relief = Q::mul($debt, $rules['finance']['debt_relief']); $debt = Q::sub($debt, $relief);
        } elseif ($lock > 0) --$lock;
        $reserve = Q::parse($settings['finance.treasury_reserve']['treasury'] ?? $rules['finance']['treasury_reserve']);
        $repaid = Q::min($debt, self::positive(Q::sub($cash, $reserve)));
        $cash = Q::sub($cash, $repaid); $debt = Q::sub($debt, $repaid);
        if ($episode && !$lock && Q::cmp($arrears,'0') === 0 && Q::cmp($debt,$creditLimit) <= 0) $episode = false;
        $history[] = $income['taxes']; $history = array_slice($history, -$rules['finance']['receipt_window']);
        $fiscal = ['receipts'=>$history,'credit_lock'=>$lock,'default_episode'=>$episode];
        $coverage = [];
        foreach ($programPaid as $key => $paid) {
            $coverage[$key] = (float) ($settings['budget.program_funding'][$key] ?? 0) * self::ratio($paid, $assessment['programs'][$key]);
            if (Q::cmp($paid, $assessment['programs'][$key]) < 0) $warnings[] = ['type'=>'program_funding_shortfall','program'=>$key,'requested'=>$assessment['programs'][$key],'paid'=>$paid];
        }
        foreach ($infrastructure as $id => &$row) {
            $row['paid'] = Q::add($row['maintenance_paid'], $row['improvement_paid']);
            if (Q::cmp($row['maintenance_paid'], $row['maintenance']) < 0) $warnings[] = ['type'=>'infrastructure_maintenance_shortfall','territory_id'=>(int)$id,'required'=>$row['maintenance'],'paid'=>$row['maintenance_paid'],
                'cause'=>Q::cmp($goods->territories[$id]['workforce'],'0') === 0 ? 'no_workforce' : (Q::cmp($row['maintenance_requested'],$row['maintenance']) < 0 ? 'policy_funding' : (Q::cmp($row['maintenance_allocation'],$row['maintenance']) < 0 ? 'treasury_shortfall' : 'construction_workforce'))];
        } unset($row);
        foreach ($rows as $key => $row) if (Q::cmp($row['acquisition_unmet'],'0') > 0) $warnings[] = ['type'=>'acquisition_shortfall','resource_key'=>$key,'missing'=>$row['acquisition_unmet']];
        if (Q::cmp($militaryPaid, Q::parse($plan['military_costs'])) < 0) $warnings[] = ['type'=>'military_funding_shortfall'];
        if (Q::cmp($supportPaid, Q::parse($settings['budget.income_support']['households'] ?? '0')) < 0) $warnings[] = ['type'=>'income_support_shortfall'];
        if ($newDefault) $warnings[] = ['type'=>'interest_default'];
        elseif (Q::cmp($borrowed,'0') > 0) $warnings[] = ['type'=>'new_borrowing','amount'=>$borrowed];
        if (!$newDefault && Q::cmp($debt, '0') > 0 && Q::cmp(self::positive(Q::sub($creditLimit,$debt)), Q::mul($creditLimit,$rules['finance']['credit_warning_fraction'])) <= 0) $warnings[] = ['type'=>'credit_low'];
        $physical = $goods->results();
        foreach ($rows as $key => &$row) {
            $row['reserve_shortfall'] = self::positive(Q::sub($row['reserve_target'], $row['government_closing']));
            $row['production'] = ['national' => $physical['production'][$key]];
            $row['industrial_requested'] = $physical['inputs'][$key];
            $row['capacity_target'] = $targets[$key];
            $row['development'] = ['total' => self::sum(array_map(fn($byResource) => $byResource[$key] ?? self::Z, $growth['growth']))];
            $row['development_spending'] = ['private'=>$growth['private_paid'][$key] ?? self::Z,'public'=>$growth['public_paid'][$key] ?? self::Z];
            $row['constraints'] = Q::cmp($row['civilian']['unmet'],'0') > 0 || Q::cmp($row['acquisition_unmet'],'0') > 0 ? ['capacity_inputs_or_workforce'] : [];
            $row['attempts'] = [];
            foreach ($goods->territories as $id => $t) $row['attempts'][] = ['territory'=>(string)$id,'produced'=>$physical['territorial_output'][$id][$key] ?? self::Z,'constraints'=>$row['constraints']];
        } unset($row);
        $state['territories'] = TerritorialIndicators::closing($goods->territories, $settings, $rules, $coverage, $privateCoverage, $infrastructure, $shortage, $supportPaid);
        $state['treasury'] = $cash; $state['debt'] = $debt; $state['fiscal'] = $fiscal;
        $purchases = self::sum(array_column($rows,'purchase_spending'));
        $report = ['earned_income'=>$income['income'],'tax_receipts'=>$income['taxes'],
            'opening_treasury'=>Q::parse($opening['treasury']),'closing_treasury'=>$cash,
            'treasury_inflows'=>Q::add($income['taxes'],$borrowed),'treasury_outflows'=>self::sum([$commands,$outflows,$repaid]),
            'command_costs'=>$commands,'military_costs_paid'=>$militaryPaid,'government_purchases'=>$purchases,
            'programs'=>array_map(fn($key)=>['requested'=>$assessment['programs'][$key],'paid'=>$programPaid[$key],'coverage'=>$coverage[$key]],array_combine(array_keys($programPaid),array_keys($programPaid))),
            'public_development'=>Q::add($growth['public_spent'],$programPaid['public_development']),
            'private_development'=>Q::add($privateInfrastructure,$growth['private_spent']),
            'private_development_allowance'=>$privateStart,'private_development_unused'=>$privateAllowance,
            'private_provision_estimate'=>$privateProvisionPaid,'disposable_income_estimate'=>Q::sub($afterTax,$privateProvisionPaid),
            'support_requested'=>Q::parse($settings['budget.income_support']['households'] ?? '0'),'support_paid'=>$supportPaid,
            'infrastructure'=>$infrastructure,'warnings'=>$warnings,'industries'=>[],
            'fiscal'=>['opening_debt'=>Q::parse($opening['debt']),'closing_debt'=>$debt,'credit_limit'=>$creditLimit,'credit_lock'=>$lock,'default_episode'=>$episode,'new_default'=>$newDefault,
                'borrowing'=>$borrowed,'interest_due'=>$interestDue,'interest_paid'=>$interestPaid,'arrears'=>$arrears,'relief'=>$relief,'principal_repaid'=>$repaid,'receipts'=>$history]];
        $report['civilian'] = ['workforce'=>self::sum(array_column($goods->territories,'workforce')),'workers_used'=>self::sum($goods->usedWorkers),
            'consumption'=>array_map(fn($row)=>$row['civilian'] + ['requested'=>$row['civilian_requested']], array_filter($rows,fn($row)=>Q::cmp($row['civilian_requested'],'0')>0))];
        foreach ($rows as $key => $row) $report['industries'][$key] = [
            'opening_capacity'=>self::sum(array_map(fn($t)=>$t['capacity'][$key], $opening['territories'])),
            'closing_capacity'=>self::sum(array_map(fn($t)=>$t['capacity'][$key], $state['territories'])),
            'usable_capacity'=>self::sum(array_map(fn($t)=>$t['usable_capacity'][$key], $goods->territories)),
            'production'=>$physical['production'][$key], 'civilian_requested'=>$row['civilian_requested'],'civilian_delivered'=>$row['civilian']['fulfilled'],
            'inputs_consumed'=>$physical['inputs'][$key], 'government_delivered'=>$row['acquired'],'acquisition_spending'=>$row['purchase_spending'],
            'private_development'=>$row['development_spending']['private'],'public_development'=>$row['development_spending']['public']];
        if (Q::add(Q::sub($report['opening_treasury'],$report['treasury_outflows']),$report['treasury_inflows']) !== $cash) throw new DomainException('Government treasury does not reconcile.');
        if (self::sum([Q::parse($opening['debt']),$borrowed,$arrears,Q::sub('0',$relief),Q::sub('0',$repaid)]) !== $debt) throw new DomainException('Debt does not reconcile.');
        foreach ($rows as $key => $row) {
            $closing = self::sum([$row['government_opening'],$row['acquired'],Q::sub('0',$row['command_goods']),Q::sub('0',$row['military_fulfilled']),Q::sub('0',$row['civilian']['released'])]);
            if ($closing !== $state['stocks'][$key]) throw new DomainException('Government goods do not reconcile.');
        }
        return ['state'=>$state,'report'=>$report,'resources'=>$rows,'used_workers'=>$goods->usedWorkers,'opening_territories'=>$openingTerritories,'warnings'=>$warnings];
    }
}
