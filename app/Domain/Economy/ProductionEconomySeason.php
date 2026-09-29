<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\{GeographicProduction, Quantity as Q};
use Brick\Math\{BigDecimal, RoundingMode};
use DomainException;

/** One deterministic, write-free production/exchange/development calculation for a domestic economy. */
final class ProductionEconomySeason
{
    private const Z = '0.000000';

    public static function defaults(): array
    {
        return ['stock_buffer' => '0', 'capacity_buffer' => '0.2', 'profit_distribution' => '0.8',
            'private_investment' => '0.2', 'operating_reserve' => '1', 'construction_labor_share' => '0.1', 'minimum_margin' => '0.05',
            'service_wage' => '0.00001', 'service_price' => '0.00002', 'service_demand_per_person' => '0.25',
            'evasion_rise' => '0.75', 'compliance_recovery' => '0.1', 'interest_rate' => '0.015',
            'credit_multiple' => '3', 'treasury_reserve' => '20', 'debt_relief' => '0.5', 'credit_lock_seasons' => 4,
            'infrastructure_upkeep' => '4', 'infrastructure_point_cost' => '100', 'infrastructure_growth' => '0.02',
            'infrastructure_decay' => '0.015', 'infrastructure_workers_per_currency' => '10000'];
    }

    private static function div(string $a, string $b, RoundingMode $round = RoundingMode::DOWN): string
    {
        return (string) BigDecimal::of($a)->dividedBy($b, 6, $round);
    }
    private static function positive(string $a): string { return Q::max(self::Z, $a); }
    private static function sum(array $values): string { return array_reduce($values, fn ($a, $b) => Q::add($a, $b), self::Z); }
    private static function ratio(mixed $v): string {
        $v = Q::parse($v); if (Q::cmp($v, '1') > 0) throw new DomainException('Ratio exceeds one.'); return $v;
    }
    private static function whole(string $v): string { return (string) BigDecimal::of($v)->toScale(0, RoundingMode::DOWN)->toScale(6); }

    /** Preview and settlement call this exact function with identical opening snapshots and plans. */
    public static function resolve(array $resources, array $opening, array $plan = [], array $rules = []): array
    {
        if (array_diff_key($rules, self::defaults())) throw new DomainException('Unknown production behavior rule.');
        $rules += self::defaults();
        foreach ($rules as $key => &$value) {
            if ($key === 'credit_lock_seasons') { if (!is_int($value) || $value < 0) throw new DomainException('Invalid credit lock.'); continue; }
            $value = Q::parse($value);
            if (in_array($key, ['stock_buffer','capacity_buffer','profit_distribution','private_investment','construction_labor_share','minimum_margin','evasion_rise','compliance_recovery','interest_rate','debt_relief','infrastructure_growth','infrastructure_decay'], true)) self::ratio($value);
        } unset($value);
        if (Q::cmp($rules['service_price'], '0') <= 0) throw new DomainException('Service price must be positive.');
        $plan += ['settings' => [], 'acquisitions' => [], 'committed_goods' => [], 'military' => [], 'public_payroll' => '0',
            'committed_payroll' => '0', 'income_support' => '0', 'release_limits' => [], 'investors' => ['government', 'producer']];
        if (array_diff($plan['investors'], ['government', 'producer'])) throw new DomainException('Invalid institutional investor.');
        foreach (['infrastructure_point_cost', 'infrastructure_workers_per_currency'] as $field) if (Q::cmp($rules[$field], '0') <= 0) throw new DomainException('Invalid infrastructure cost.');
        $infraFunding = self::ratio($plan['settings']['budget.program_funding']['infrastructure'] ?? '0');
        $infrastructure = [];
        $tax = self::ratio($plan['settings']['finance.income_tax']['taxable_income'] ?? '0');
        $state = $opening; $state += ['inventories' => [], 'debts' => [], 'fiscal' => []];
        foreach (['government', 'producer', 'household'] as $kind) if (($state['accounts'][$kind]['kind'] ?? null) !== $kind) throw new DomainException('Missing domestic account.');
        $state['accounts']['government']['tax_rate'] = $tax;
        if (isset($state['fiscal']['debt']) && Q::cmp(Q::parse($state['fiscal']['debt']), '0') > 0) throw new DomainException('Supply debt in the explicit creditor ledger, not a duplicate fiscal scalar.');
        $population = 0; $formalPopulation = self::Z; $defs = []; $rows = []; $growth = [];
        ksort($resources, SORT_STRING); ksort($state['territories'], SORT_STRING);
        foreach ($resources as $key => $resource) {
            if ($resource['kind'] !== 'stock') continue;
            $r = $resource['rules'];
            if (!isset($r['production.territorial_labor'], $r['exchange.reference_price'], $r['production.operating'], $r['development.capacity'])) throw new DomainException('Stock requires supported production economics.');
            $defs[$key] = ['kind' => 'stock', 'price' => Q::parse($r['exchange.reference_price']['price']),
                'wage' => Q::parse($r['production.operating']['wage_per_unit']), 'workers' => '1',
                'capital_cost' => Q::parse($r['development.capacity']['capital_cost']), 'construction_workers' => Q::parse($r['development.capacity']['construction_workers'])];
        }
        foreach (['production.development_funding', 'allocation.production_priority'] as $type) foreach ($plan['settings'][$type] ?? [] as $key => $_) if (!isset($defs[$key])) throw new DomainException('Unknown production policy target.');
        foreach (['acquisitions', 'military', 'committed_goods', 'release_limits'] as $field) foreach ($plan[$field] as $key => $_) if (!isset($defs[$key])) throw new DomainException('Unknown or non-stock plan target.');
        foreach ($state['territories'] as $id => &$territory) {
            if ($territory['government'] !== 'government' || !is_int($territory['population']) || $territory['population'] < 0) throw new DomainException('Invalid domestic territory.');
            $population += $territory['population'];
            $workers = Q::parse($territory['workforce']);
            if ($workers !== self::whole($workers) || Q::cmp($workers, (string) $territory['population']) > 0) throw new DomainException('Workforce must be whole people within population.');
            $s = $territory['economy'];
            foreach (['informal', 'infrastructure', 'unrest'] as $field) $s[$field] = self::ratio($s[$field]);
            $target = Q::min('0.85', Q::add('0.05', Q::mul('0.9', Q::mul($tax, $tax))));
            $s['informal'] = Q::add($s['informal'], Q::mul(Q::sub($target, $s['informal']), Q::cmp($target, $s['informal']) > 0 ? $rules['evasion_rise'] : $rules['compliance_recovery']));
            $territory['economy'] = $s;
            $maintenance = Q::output($territory['population'], Q::mul($s['infrastructure'], $rules['infrastructure_upkeep']));
            $improvement = Q::output($territory['population'], Q::mul(Q::min(Q::sub('1', $s['infrastructure']), $rules['infrastructure_growth']), $rules['infrastructure_point_cost']));
            $infrastructure[$id] = ['maintenance' => $maintenance, 'improvement' => $improvement, 'requested' => Q::mul(Q::add($maintenance, $improvement), $infraFunding)];
            $territory['taxable_fraction'] = Q::sub('1', $s['informal']);
            $formalPopulation = Q::add($formalPopulation, Q::mul((string) $territory['population'], $territory['taxable_fraction']));
            $territory['potential'] = []; $territory['workers_per_unit'] = []; $territory['integer_workers'] = true;
            // Construction gets a bounded slice only if a permitted developer has an opportunity/funding program.
            $territory['construction_reserve'] = self::Z;
            foreach ($defs as $key => $definition) {
                $physical = GeographicProduction::facility($resources[$key]['rules']['production.territorial_labor'], $key, $territory['geography'], $territory['terrain'], (int) $workers);
                $rate = Q::mul($physical['productivity'], Q::mul(Q::add('0.5', Q::mul('0.5', $s['infrastructure'])), Q::sub('1', Q::mul('0.9', $s['unrest']))));
                $potential = Q::max('0', Q::calculated((float) ($territory['geography']['resources'][$key]['capacity'] ?? 0)));
                $territory['potential'][$key] = $potential;
                if (Q::cmp($rate, '0') > 0) $territory['workers_per_unit'][$key] = self::div('1000000', $rate, RoundingMode::UP);
                $installed = self::sum(array_map(fn ($c) => Q::parse($c[$key] ?? '0'), $territory['capacity']));
                $factor = Q::mul(Q::add('0.5', Q::mul('0.5', $s['infrastructure'])), Q::sub('1', $s['unrest']));
                $growth[$id][$key] = Q::min(self::positive(Q::sub($potential, $installed)), Q::mul(Q::mul($potential, self::ratio($resources[$key]['rules']['development.capacity']['max_growth_fraction'])), $factor));
            }
            // Other civilian activity is a flow with finite seats and customers, never a storable resource.
            $territory['background_capacity'] ??= ['producer' => Q::mul($workers, self::ratio($s['capacity'] ?? '1'))];
        } unset($territory);
        $formal = $population ? self::div($formalPopulation, (string) $population) : '1.000000';
        $state['accounts']['producer']['taxable_fraction'] = $state['accounts']['household']['taxable_fraction'] = $formal;
        $programs = []; $privateTargets = []; $publicTargets = [];
        foreach ($defs as $key => $definition) {
            $r = $resources[$key];
            $civilian = isset($r['rules']['demand.population']) ? Q::output($population, $r['rules']['demand.population']['per_million']) : self::Z;
            $request = $plan['acquisitions'][$key] ?? ['quantity' => '0', 'spending_limit' => '0', 'priority' => 2147483647];
            $request['quantity'] = Q::parse($request['quantity']); $request['spending_limit'] = Q::parse($request['spending_limit']);
            if (!is_int($request['priority']) || $request['priority'] < 0) throw new DomainException('Invalid acquisition priority.');
            $stock = Q::parse($state['inventories']['government'][$key]['quantity'] ?? '0');
            $military = Q::parse($plan['military'][$key] ?? '0'); $committed = Q::parse($plan['committed_goods'][$key] ?? '0');
            $reserveTarget = ($r['role'] ?? null) === 'nutrition' ? Q::mul($civilian, Q::parse($plan['settings']['food.reserve_target']['nutrition'] ?? '0')) : self::Z;
            $reserveRequest = self::positive(Q::sub($reserveTarget, self::positive(Q::sub(Q::sub($stock, $committed), $military))));
            if (Q::cmp($reserveRequest, $request['quantity']) > 0) {
                $request['quantity'] = $reserveRequest; $request['spending_limit'] = Q::mul($reserveRequest, $definition['price']);
            }
            $caps = ['government' => self::Z, 'producer' => self::Z];
            foreach ($state['territories'] as $t) foreach ($caps as $owner => $_) if (isset($t['workers_per_unit'][$key])) $caps[$owner] = Q::add($caps[$owner], Q::parse($t['capacity'][$owner][$key] ?? '0'));
            $all = self::sum($caps); $share = Q::cmp($all, '0') > 0 ? self::div($caps['government'], $all) : self::Z;
            $householdNeed = self::positive(Q::sub($civilian, Q::parse($state['inventories']['household'][$key]['quantity'] ?? '0')));
            $openingPrivate = Q::parse($state['inventories']['producer'][$key]['quantity'] ?? '0');
            $publicCivilian = Q::mul(self::positive(Q::sub($householdNeed, $openingPrivate)), $share);
            $publicRequest = Q::min($request['quantity'], self::positive(Q::sub($caps['government'], $publicCivilian)));
            if (Q::cmp($definition['wage'], '0') > 0) $publicRequest = Q::min($publicRequest, self::div($request['spending_limit'], $definition['wage']));
            $publicTargets[$key] = Q::add($publicCivilian, $publicRequest);
            $privateTargets[$key] = Q::add(Q::sub($householdNeed, $publicCivilian), Q::sub($request['quantity'], $publicRequest));
            $funding = self::ratio($plan['settings']['production.development_funding'][$key] ?? '0');
            $programs[$key] = in_array('government', $plan['investors'], true) ? Q::mul(Q::mul(self::sum(array_column($growth, $key)), $definition['capital_cost']), $funding) : self::Z;
            $rows[$key] = ['price' => $definition['price'], 'civilian_requested' => $civilian, 'reserve_target' => $reserveTarget,
                'acquisition_requested' => $request['quantity'], 'spending_limit' => $request['spending_limit'], 'priority' => min($request['priority'], $r['rules']['demand.population']['priority'] ?? 2147483647),
                'public_planned' => $publicRequest, 'production' => ['government' => self::Z, 'producer' => self::Z], 'attempts' => [], 'constraints' => [], 'development' => ['government' => self::Z, 'producer' => self::Z],
                'military_requested' => $military, 'private_opening' => Q::parse($state['inventories']['producer'][$key]['quantity'] ?? '0'), 'government_opening' => $stock];
        }
        uasort($rows, fn ($a, $b) => $a['priority'] <=> $b['priority']); // Initial lexical key order is the tie-break.
        foreach ($state['territories'] as $id => &$territory) {
            $opportunity = Q::cmp($infrastructure[$id]['requested'], '0') > 0;
            foreach ($defs as $key => $definition) if (Q::cmp($growth[$id][$key], '0') > 0 &&
                (Q::cmp($programs[$key], '0') > 0 || (in_array('producer', $plan['investors'], true) && Q::cmp(Q::add($rows[$key]['civilian_requested'], $rows[$key]['acquisition_requested']), '0') > 0 && self::profitable($definition, $rules)))) $opportunity = true;
            if ($opportunity) $territory['construction_reserve'] = self::whole(Q::mul(Q::parse($territory['workforce']), $rules['construction_labor_share']));
        } unset($territory);
        $a = new ProductionAccounts($defs, $state);
        // Accepted mobilization/operation cash pays military service wages before discretionary budgets.
        $committedPayroll = Q::parse($plan['committed_payroll']);
        if (Q::cmp($committedPayroll, $a->availableCash('government')) > 0) throw new DomainException('Accepted actions exceed opening government cash.');
        $a->publicPayroll('government', 'household', $committedPayroll);
        $publicOperations = self::sum(array_map(fn ($key) => Q::mul($publicTargets[$key], $defs[$key]['wage']), array_keys($defs)));
        $purchaseNeed = self::sum(array_map(fn ($key) => Q::min(self::positive(Q::sub($rows[$key]['spending_limit'], Q::mul($rows[$key]['public_planned'], $defs[$key]['wage']))), Q::mul(Q::sub($rows[$key]['acquisition_requested'], $rows[$key]['public_planned']), $defs[$key]['price'])), array_keys($defs)));
        $payroll = Q::parse($plan['public_payroll']); $support = Q::parse($plan['income_support']);
        $infraRequested = self::sum(array_column($infrastructure, 'requested'));
        $requestedBudget = self::sum([$publicOperations, $purchaseNeed, self::sum($programs), $payroll, $support, $infraRequested]);
        $fiscal = self::finance($a, $state, $requestedBudget, $rules);
        $paidPayroll = Q::min($payroll, $a->availableCash('government')); $a->publicPayroll('government', 'household', $paidPayroll);
        $paidSupport = Q::min($support, $a->availableCash('government')); $a->support('government', 'household', $paidSupport);
        $availableForPlans = self::positive(Q::sub($a->availableCash('government'), $publicOperations));
        foreach ($rows as $key => &$row) {
            $budget = Q::min($availableForPlans, Q::min(self::positive(Q::sub($row['spending_limit'], Q::mul($row['public_planned'], $defs[$key]['wage']))), Q::mul(Q::sub($row['acquisition_requested'], $row['public_planned']), $defs[$key]['price'])));
            $row['purchase_budget'] = $budget; $availableForPlans = Q::sub($availableForPlans, $budget);
            $a->reserve('buy:' . $key, 'government', $budget);
            // Unfunded government wishes are not purchasing power for private producers.
            $privateTargets[$key] = Q::add(self::positive(Q::sub($privateTargets[$key], Q::sub($row['acquisition_requested'], $row['public_planned']))), self::div($budget, $defs[$key]['price']));
            $a->militaryUse('government', $key, Q::parse($plan['committed_goods'][$key] ?? '0'));
            $row['military_fulfilled'] = Q::min($row['military_requested'], $a->availableStock('government', $key));
            $a->militaryUse('government', $key, $row['military_fulfilled']);
            $row['protected_opening'] = $a->availableStock('government', $key);
            $a->reserveStock('opening:' . $key, 'government', $key, $row['protected_opening']);
        } unset($row);
        $infraBudget = Q::min($availableForPlans, $infraRequested);
        $availableForPlans = Q::sub($availableForPlans, $infraBudget); $a->reserve('infrastructure', 'government', $infraBudget);
        foreach ($rows as $key => &$row) {
            $row['development_requested'] = $programs[$key];
            $row['development_budget'] = Q::min($availableForPlans, $programs[$key]);
            $availableForPlans = Q::sub($availableForPlans, $row['development_budget']);
            $a->reserve('develop:' . $key, 'government', $row['development_budget']);
        } unset($row);
        $usedCapacity = [];
        foreach ($rows as $key => &$row) {
            $privateTarget = self::positive(Q::sub(Q::add($privateTargets[$key], Q::mul($row['civilian_requested'], $rules['stock_buffer'])), $row['private_opening']));
            self::produce($a, $state, $defs[$key], $key, 'government', $publicTargets[$key], $usedCapacity, $row);
            if (self::profitable($defs[$key], $rules)) self::produce($a, $state, $defs[$key], $key, 'producer', $privateTarget, $usedCapacity, $row);
            // One bounded spillover pass lets the other sector cover civilian supply missing from the first allocation.
            $supply = self::sum([$row['private_opening'], $row['production']['producer'], $row['production']['government']]);
            $gap = self::positive(Q::sub($row['civilian_requested'], $supply));
            if (self::profitable($defs[$key], $rules)) self::produce($a, $state, $defs[$key], $key, 'producer', $gap, $usedCapacity, $row);
            $gap = self::positive(Q::sub($row['civilian_requested'], self::sum([$row['private_opening'], ...array_values($row['production'])])));
            self::produce($a, $state, $defs[$key], $key, 'government', $gap, $usedCapacity, $row);
        } unset($row);
        // Residual activity uses the same remaining workers and opening operating cash.
        $serviceNeed = Q::mul((string) $population, $rules['service_demand_per_person']); $serviceWork = [];
        foreach ($state['territories'] as $id => $territory) foreach (['producer', 'government'] as $owner) {
            if (Q::cmp($serviceNeed, '0') <= 0) break 2;
            if ($owner === 'producer' && Q::cmp($rules['service_price'], Q::mul($rules['service_wage'], Q::add('1', $rules['minimum_margin']))) <= 0) continue;
            $made = $a->prepareService((string) $id, $owner, $serviceNeed, $rules['service_wage'], 'household');
            $serviceNeed = Q::sub($serviceNeed, $made); $serviceWork[] = ['territory' => (string) $id, 'owner' => $owner, 'quantity' => $made];
        }
        foreach ($rows as $key => &$row) {
            $need = $row['civilian_requested'];
            $private = $a->purchase('household', 'producer', $key, self::positive(Q::sub($need, $a->availableStock('household', $key))));
            $public = $a->purchase('household', 'government', $key, Q::min($row['production']['government'], self::positive(Q::sub($need, $a->availableStock('household', $key)))));
            // Opening state goods are not normal sale inventory. Only explicit support can unlock them.
            $release = Q::parse($plan['release_limits'][$key] ?? '0');
            if (Q::cmp($release, '0') > 0) $a->releaseStock('opening:' . $key);
            $demand = $a->consumeDemand('household', $key, $need, [], 'government', $release);
            $row['civilian'] = $demand + ['shortage_reason' => Q::cmp($demand['unmet'], '0') > 0 ? (Q::cmp(Q::add($a->availableStock('producer', $key), $a->availableStock('government', $key)), '0') > 0 ? 'purchasing_power' : 'supply') : null, 'private_purchase' => $private, 'public_purchase' => $public];
            $row['public_delivery'] = Q::min($row['acquisition_requested'], self::positive(Q::sub(Q::sub($row['production']['government'], $public), $demand['released'])));
            $bought = $a->purchase('government', 'producer', $key, Q::sub($row['acquisition_requested'], $row['public_delivery']), 'buy:' . $key);
            $row['public_delivery_cost'] = Q::mul($row['public_delivery'], $defs[$key]['wage']);
            $row['private_delivery'] = $bought; $row['purchase_spending'] = Q::mul($bought, $defs[$key]['price']);
            $row['acquisition_unmet'] = Q::sub(Q::sub($row['acquisition_requested'], $row['public_delivery']), $bought);
        } unset($row);
        $servicesDelivered = self::Z;
        foreach ($serviceWork as $work) $servicesDelivered = Q::add($servicesDelivered, $a->purchaseService($work['territory'], 'household', $work['owner'], $work['quantity'], $rules['service_price']));
        $position = $a->position();
        $privateOperating = self::sum(array_map(fn ($e) => $e['owner'] === 'producer' && in_array($e['type'], ['production', 'service_work'], true) ? $e['cost'] : self::Z,
            array_filter($position['events'], fn ($e) => isset($e['owner']))));
        $distribution = $a->distributeProfit('producer', 'household', Q::mul($position['profits']['producer'], $rules['profit_distribution']));
        $privateBudget = Q::mul(self::positive(Q::sub($a->availableCash('producer'), Q::mul($privateOperating, $rules['operating_reserve']))), $rules['private_investment']);
        $a->release('infrastructure');
        $infraPriority = $plan['settings']['allocation.infrastructure_priority']['infrastructure'] ?? 'regional';
        if (!in_array($infraPriority, ['regional', 'population', 'concentration'], true)) throw new DomainException('Unknown infrastructure priority.');
        $infraOrder = $state['territories'];
        $weight = fn ($t) => match ($infraPriority) {
            'population' => $t['population'], 'concentration' => (float) ($t['economy']['capacity'] ?? '1'), default => 1 - (float) $t['economy']['infrastructure'],
        };
        uasort($infraOrder, fn ($x, $y) => $weight($y) <=> $weight($x));
        foreach ($infraOrder as $id => $territory) {
            $paid = $a->publicWorks((string) $id, 'government', 'household', Q::min($infraBudget, $infrastructure[$id]['requested']), $rules['infrastructure_workers_per_currency']);
            $infraBudget = Q::sub($infraBudget, $paid); $infrastructure[$id]['paid'] = $paid;
        }
        foreach ($rows as $key => &$row) {
            $a->release('develop:' . $key);
            $priority = $plan['settings']['allocation.production_priority'][$key] ?? 'potential';
            if (!in_array($priority, ['potential', 'regional', 'population'], true)) throw new DomainException('Unknown development priority.');
            $publicBudget = $row['development_budget'];
            self::develop($a, $state, $defs[$key], $key, 'government', $publicBudget, $growth, $priority, null, $row);
            if (in_array('producer', $plan['investors'], true) && self::profitable($defs[$key], $rules)) {
                $affordableUnmet = Q::min($row['civilian']['unmet'], self::div($a->availableCash('household'), $defs[$key]['price']));
                $demand = Q::add(Q::add($row['civilian']['fulfilled'], $affordableUnmet), Q::add($row['public_planned'], self::div($row['purchase_budget'], $defs[$key]['price'])));
                $installed = self::Z;
                foreach ($state['territories'] as $territory) $installed = Q::add($installed, self::sum(array_map(fn ($c) => Q::parse($c[$key] ?? '0'), $territory['capacity'])));
                $headroom = self::positive(Q::sub(Q::mul($demand, Q::add('1', $rules['capacity_buffer'])), $installed));
                if (Q::cmp($a->availableStock('producer', $key), Q::mul($demand, $rules['stock_buffer'])) > 0) $headroom = self::Z;
                self::develop($a, $state, $defs[$key], $key, 'producer', $privateBudget, $growth, 'opportunity', $headroom, $row);
            }
        } unset($row);
        $result = $a->close(isset($state['accounts']['lender']) ? ['government' => ['lender' => 'lender', 'reserve' => $rules['treasury_reserve']]] : []);
        $report = self::report($opening, $result);
        $recurringReceipts = Q::add($report['tax_receipts'], $report['public_sales']);
        $fiscal['receipts'] = array_slice([...($state['fiscal']['receipts'] ?? []), $recurringReceipts], -4);
        $debt = $result['state']['debts']['government']['lender'] ?? self::Z;
        if ($fiscal['default_episode'] && !$fiscal['new_default'] && $fiscal['credit_lock'] === 0 && Q::cmp($fiscal['arrears'], '0') === 0
            && Q::cmp($recurringReceipts, Q::add($requestedBudget, $fiscal['interest_due'])) >= 0 && Q::cmp($debt, $fiscal['credit_limit']) <= 0) $fiscal['default_episode'] = false;
        $fiscal['closing_debt'] = $debt;
        $fiscal['principal_repaid'] = self::sum(array_map(fn ($e) => $e['repaid'], array_filter($result['events'], fn ($e) => $e['type'] === 'debt')));
        $result['state']['fiscal'] = $fiscal;
        $foodShortage = self::Z;
        foreach ($rows as $key => $row) if (($resources[$key]['role'] ?? null) === 'nutrition' && Q::cmp($row['civilian_requested'], '0') > 0) $foodShortage = self::div($row['civilian']['unmet'], $row['civilian_requested']);
        foreach ($result['state']['territories'] as $id => &$territory) {
            $infra = $infrastructure[$id]; $maintenancePaid = Q::min($infra['maintenance'], $infra['paid']);
            $maintenanceRatio = Q::cmp($infra['maintenance'], '0') > 0 ? self::div($maintenancePaid, $infra['maintenance']) : '1';
            $pointCost = Q::output($territory['population'], $rules['infrastructure_point_cost']);
            $improved = Q::cmp($pointCost, '0') > 0 ? self::div(Q::sub($infra['paid'], $maintenancePaid), $pointCost) : self::Z;
            $territory['economy']['infrastructure'] = Q::min('1', self::positive(Q::add(Q::sub($territory['economy']['infrastructure'], Q::mul($rules['infrastructure_decay'], Q::sub('1', $maintenanceRatio))), $improved)));
            $unrestTarget = Q::min('1', Q::add(Q::mul(Q::mul(self::positive(Q::sub($tax, '0.25')), '0.8'), $territory['taxable_fraction']), Q::mul($foodShortage, '0.4')));
            $territory['economy']['unrest'] = Q::min('1', self::positive(Q::add(Q::add($territory['economy']['unrest'], Q::mul(Q::sub($unrestTarget, $territory['economy']['unrest']), '0.2')), $fiscal['new_default'] ? '0.1' : '0')));
        } unset($territory);
        $warnings = [];
        foreach ($rows as $key => &$row) {
            $row['government_closing'] = $result['state']['inventories']['government'][$key]['quantity'] ?? self::Z;
            $row['private_closing'] = $result['state']['inventories']['producer'][$key]['quantity'] ?? self::Z;
            $row['reserve_shortfall'] = self::positive(Q::sub($row['reserve_target'], $row['government_closing']));
            if (Q::cmp($row['civilian']['unmet'], '0') > 0) $warnings[] = ['type' => ($resources[$key]['role'] ?? null) === 'nutrition' ? 'food_shortage' : 'civilian_shortage', 'resource' => $key];
            if (Q::cmp($row['acquisition_unmet'], '0') > 0) $warnings[] = ['type' => 'acquisition_shortfall', 'resource' => $key];
            if (Q::cmp($row['military_requested'], $row['military_fulfilled']) > 0) $warnings[] = ['type' => 'military_goods_shortfall', 'resource' => $key];
        } unset($row);
        if (Q::cmp(self::sum(array_column($infrastructure, 'paid')), $infraRequested) < 0) $warnings[] = ['type' => 'infrastructure_shortfall'];
        if ($fiscal['default_episode']) $warnings[] = ['type' => 'default'];
        if (Q::cmp($paidPayroll, $payroll) < 0) $warnings[] = ['type' => 'payroll_shortfall'];
        if (Q::cmp($debt, Q::mul($fiscal['credit_limit'], '0.8')) > 0) $warnings[] = ['type' => 'credit_low'];
        return $result + ['opening_territories' => $state['territories'], 'resources' => $rows, 'report' => $report + ['population' => $population, 'services_delivered' => $servicesDelivered,
            'command_costs' => $committedPayroll, 'profit_distribution' => $distribution, 'public_payroll_requested' => $payroll, 'public_payroll_paid' => $paidPayroll,
            'support_requested' => $support, 'support_paid' => $paidSupport, 'infrastructure' => $infrastructure, 'food_shortage_ratio' => $foodShortage, 'fiscal' => $fiscal], 'warnings' => $warnings];
    }

    private static function profitable(array $definition, array $rules): bool
    {
        return Q::cmp($definition['price'], Q::mul($definition['wage'], Q::add('1', $rules['minimum_margin']))) > 0;
    }

    private static function produce(ProductionAccounts $a, array $state, array $definition, string $key, string $owner, string $request, array &$used, array &$row): void
    {
        $territories = $state['territories'];
        uasort($territories, fn ($x, $y) => Q::cmp($x['workers_per_unit'][$key] ?? '99999999999999', $y['workers_per_unit'][$key] ?? '99999999999999'));
        foreach ($territories as $id => $territory) {
            if (Q::cmp($request, '0') <= 0 || !isset($territory['workers_per_unit'][$key])) continue;
            $capacity = self::positive(Q::sub(Q::parse($territory['capacity'][$owner][$key] ?? '0'), $used[$id][$owner][$key] ?? self::Z));
            if (Q::cmp($capacity, '0') <= 0) continue;
            $wanted = Q::min($request, $capacity);
            $limits = $a->productionLimits((string) $id, $owner, $key);
            $constraints = array_keys(array_filter($limits, fn ($limit) => Q::cmp($limit, $wanted) < 0));
            $row['constraints'] = array_values(array_unique([...$row['constraints'], ...$constraints]));
            $quantity = $a->produce((string) $id, $owner, $key, $wanted, 'household');
            $used[$id][$owner][$key] = Q::add($used[$id][$owner][$key] ?? self::Z, $quantity);
            $request = Q::sub($request, $quantity); $row['production'][$owner] = Q::add($row['production'][$owner], $quantity);
            $row['attempts'][] = ['territory' => (string) $id, 'owner' => $owner, 'requested' => $wanted, 'produced' => $quantity, 'constraints' => $constraints];
        }
        if (Q::cmp($request, '0') > 0 && !$row['constraints']) $row['constraints'][] = 'installed_capacity';
    }

    private static function develop(ProductionAccounts $a, array $state, array $definition, string $key, string $owner, string &$budget, array &$growth, string $priority, ?string $need, array &$row): void
    {
        if (Q::cmp($budget, '0') <= 0 || ($need !== null && Q::cmp($need, '0') <= 0)) return;
        $territories = $state['territories'];
        $score = function ($t) use ($key, $priority): float {
            $potential = (float) ($t['potential'][$key] ?? 0); $installed = 0;
            foreach ($t['capacity'] as $c) $installed += (float) ($c[$key] ?? 0);
            return match ($priority) {
                'population' => $t['population'], 'regional' => $potential > 0 ? 1 - $installed / $potential : 0,
                'opportunity' => (1 + (float) $t['economy']['infrastructure']) * (1 - (float) $t['economy']['unrest']) / max(0.000001, (float) ($t['workers_per_unit'][$key] ?? PHP_INT_MAX)),
                default => max(0, $potential - $installed),
            };
        };
        uasort($territories, fn ($x, $y) => $score($y) <=> $score($x));
        foreach ($territories as $id => $territory) {
            if (!isset($territory['workers_per_unit'][$key]) || Q::cmp($budget, '0') <= 0) continue;
            $request = Q::min($growth[$id][$key], self::div($budget, $definition['capital_cost']));
            if ($need !== null) $request = Q::min($request, $need);
            if (Q::cmp($request, '0') <= 0) continue;
            $quantity = $a->develop((string) $id, $owner, $key, $request, 'household');
            $spent = Q::mul($quantity, $definition['capital_cost']); $budget = Q::sub($budget, $spent);
            $growth[$id][$key] = Q::sub($growth[$id][$key], $quantity);
            if ($need !== null) $need = Q::sub($need, $quantity);
            $row['development'][$owner] = Q::add($row['development'][$owner], $quantity);
        }
    }

    private static function finance(ProductionAccounts $a, array $state, string $requested, array $rules): array
    {
        $f = $state['fiscal']; $history = $f['receipts'] ?? [];
        $limit = $history ? Q::mul(self::div(self::sum(array_map(fn ($v) => Q::parse($v), $history)), (string) count($history)), $rules['credit_multiple']) : self::Z;
        $lock = $f['credit_lock'] ?? 0; $episode = $f['default_episode'] ?? false;
        if (!is_int($lock) || $lock < 0 || !is_bool($episode)) throw new DomainException('Invalid fiscal state.');
        $debt = Q::parse($state['debts']['government']['lender'] ?? '0'); $interest = Q::mul($debt, $rules['interest_rate']);
        $borrow = self::Z; $arrears = self::Z; $relief = self::Z; $newDefault = false;
        if (isset($state['accounts']['lender'])) {
            if (!isset($state['debts']['government']['lender'])) throw new DomainException('Lender requires an explicit opening debt entry, including zero.');
            $borrow = Q::min(self::positive(Q::sub(Q::add($requested, $interest), $a->availableCash('government'))), $episode || $lock ? self::Z : self::positive(Q::sub($limit, $debt)));
            $borrow = Q::min($borrow, $a->availableCash('lender')); $a->borrow('government', 'lender', $borrow);
            $service = $a->serviceDebt('government', 'lender', $interest); $arrears = $service['arrears'];
            if (Q::cmp($arrears, '0') > 0 && !$episode) {
                $newDefault = $episode = true; $lock = $rules['credit_lock_seasons'];
                $relief = Q::mul(Q::add(Q::add($debt, $borrow), $arrears), $rules['debt_relief']);
                $a->serviceDebt('government', 'lender', '0', '0', $relief);
            } elseif ($lock > 0) --$lock;
        } elseif (Q::cmp($debt, '0') > 0) throw new DomainException('Debt requires its external counterparty.');
        return ['credit_limit' => $limit, 'credit_lock' => $lock, 'default_episode' => $episode, 'new_default' => $newDefault,
            'borrowing' => $borrow, 'interest_due' => $interest, 'arrears' => $arrears, 'relief' => $relief];
    }

    private static function report(array $opening, array $result): array
    {
        $out = array_fill_keys(['wages', 'realized_profit', 'tax_receipts', 'public_sales', 'public_operations', 'public_development', 'private_development', 'government_purchases', 'treasury_inflows', 'treasury_outflows'], self::Z);
        foreach ($result['events'] as $e) {
            if ($e['type'] === 'wages') $out['wages'] = Q::add($out['wages'], $e['gross']);
            if ($e['type'] === 'earnings') $out['realized_profit'] = Q::add($out['realized_profit'], $e['realized_profit']);
            if (in_array($e['type'], ['production', 'service_work'], true) && $e['owner'] === 'government') $out['public_operations'] = Q::add($out['public_operations'], $e['cost']);
            if ($e['type'] === 'investment') { $field = $e['owner'] === 'government' ? 'public_development' : 'private_development'; $out[$field] = Q::add($out[$field], $e['cost']); }
            if ($e['type'] === 'cash') {
                if ($e['to'] === 'government') $out['treasury_inflows'] = Q::add($out['treasury_inflows'], $e['amount']);
                if ($e['from'] === 'government') $out['treasury_outflows'] = Q::add($out['treasury_outflows'], $e['amount']);
                if (in_array($e['reason'], ['wage_tax', 'profit_tax'], true)) $out['tax_receipts'] = Q::add($out['tax_receipts'], $e['amount']);
                if ($e['reason'] === 'goods_purchase' && $e['from'] === 'government') $out['government_purchases'] = Q::add($out['government_purchases'], $e['amount']);
                if (in_array($e['reason'], ['goods_purchase', 'civilian_service'], true) && $e['to'] === 'government') $out['public_sales'] = Q::add($out['public_sales'], $e['amount']);
            }
        }
        $out['earned_income'] = Q::add($out['wages'], $out['realized_profit']);
        $out['opening_treasury'] = Q::parse($opening['accounts']['government']['cash']);
        $out['closing_treasury'] = $result['state']['accounts']['government']['cash'];
        if (Q::add(Q::sub($out['opening_treasury'], $out['treasury_outflows']), $out['treasury_inflows']) !== $out['closing_treasury']) throw new DomainException('Treasury report does not reconcile.');
        return $out;
    }
}
