<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use Brick\Math\{BigDecimal, RoundingMode};
use DomainException;

/** Isolated one-region civilian milestone. Uses the live ledger; has no DB or game callers. */
final class CivilianEconomySeason
{
    private const Z = '0.000000';

    private static function sum(array $values): string
    {
        return array_reduce($values, fn ($sum, $v) => Q::add($sum, $v), self::Z);
    }

    private static function gap(string $need, string $have): string
    {
        return Q::max(self::Z, Q::sub($need, $have));
    }

    private static function div(string $a, string $b): string
    {
        return (string) BigDecimal::of($a)->dividedBy($b, 6, RoundingMode::DOWN);
    }

    private static function ratio(mixed $v): string
    {
        $v = self::amount($v);
        if (Q::cmp($v, '1') > 0) throw new DomainException('Fraction exceeds one.');
        return $v;
    }

    private static function amount(mixed $v): string
    {
        if ((!is_string($v) && !is_int($v)) || !preg_match('/^\d+(?:\.\d{1,6})?$/D', (string) $v)
            || BigDecimal::of($v)->isGreaterThan('99999999999999.999999')) throw new DomainException('Expected a bounded nonnegative decimal.');
        return Q::parse($v);
    }

    public static function resolve(array $resources, array $opening, array $policy, array $rules): array
    {
        if (count($opening['territories'] ?? []) !== 1) throw new DomainException('This milestone resolves one region.');
        if (array_diff(array_keys($policy), ['tax_rate', 'support_per_person', 'public_service_budget'])) throw new DomainException('Unknown civilian policy.');
        $policy += ['tax_rate' => '0', 'support_per_person' => '0', 'public_service_budget' => '0'];
        $policy['tax_rate'] = self::ratio($policy['tax_rate']);
        foreach (['support_per_person', 'public_service_budget'] as $key) $policy[$key] = self::amount($policy[$key]);
        $required = ['nutrition', 'maintenance_resource', 'maintenance_workers', 'maintenance_wage', 'public_service_per_person', 'public_service_wage', 'condition_decay', 'condition_recovery', 'distribution_ratio', 'reserve_seasons'];
        if (array_diff($required, array_keys($rules)) || array_diff(array_keys($rules), $required)) throw new DomainException('Supply the civilian behavior contract.');
        foreach (array_diff($required, ['nutrition', 'maintenance_resource']) as $key) $rules[$key] = self::amount($rules[$key]);
        foreach (['condition_decay', 'condition_recovery', 'distribution_ratio'] as $key) self::ratio($rules[$key]);
        foreach (['maintenance_workers', 'public_service_wage'] as $key) if (Q::cmp($rules[$key], '0') <= 0) throw new DomainException('Work requires a positive rate.');
        $food = $rules['nutrition']; $equipment = $rules['maintenance_resource'];
        if (!isset($resources[$food], $resources[$equipment]) || $food === $equipment) throw new DomainException('Distinct food and maintenance resources are required.');
        ksort($resources, SORT_STRING);
        $state = $opening;
        if (!is_int($state['season'] ?? null) || $state['season'] < 0) throw new DomainException('Invalid season.');
        ksort($state['accounts'], SORT_STRING); ksort($state['sites'], SORT_STRING);
        $territory = (string) array_key_first($state['territories']);
        $t = &$state['territories'][$territory];
        $government = $t['government']; $household = $t['household'];
        if (($state['accounts'][$government]['kind'] ?? null) !== 'government' || ($state['accounts'][$household]['kind'] ?? null) !== 'household') throw new DomainException('Missing civilian counterparties.');
        if (!is_int($t['population']) || $t['population'] < 0 || Q::cmp(self::amount($t['workforce']), (string) $t['population']) > 0) throw new DomainException('Invalid population or workforce.');
        if (!empty($state['debts'])) throw new DomainException('Credit is outside the civilian milestone.');
        foreach ($state['accounts'] as $id => $account) {
            if ($id !== $government && (($account['treasury'] ?? null) !== $government || !in_array($account['kind'], ['producer', 'household'], true))) throw new DomainException('Only domestic civilian accounts are supported.');
        }
        if (array_diff(array_keys($t['subsistence'] ?? []), [$food])) throw new DomainException('Only nutrition subsistence is supported here.');
        $state['accounts'][$government]['tax_rate'] = $policy['tax_rate'];
        $t['capacity'] = [];
        $t['background_capacity'] = [$government => self::amount($t['public_service_capacity'])];
        // This model measures worker-season time; live integer-population adaptation comes later.
        $t['integer_workers'] = false;
        $t['construction_reserve'] = '0';
        $byResource = $maintenance = $effective = [];
        foreach ($state['sites'] as $id => &$site) {
            $r = $site['resource']; $owner = $site['owner'];
            if (!isset($resources[$r]) || isset($byResource[$r])) throw new DomainException('One existing sector site per resource is supported.');
            if (!in_array($state['accounts'][$owner]['kind'] ?? null, ['producer', 'government'], true)) throw new DomainException('Invalid site owner.');
            $byResource[$r] = $id;
            $site['capacity'] = self::amount($site['capacity']); $site['condition'] = self::ratio($site['condition']);
            if (Q::cmp($site['capacity'], self::amount($t['potential'][$r] ?? '0')) > 0) throw new DomainException('Installed assets exceed declared local potential.');
            $site['availability'] = self::ratio($site['availability'] ?? '1');
            $site['maintenance_per_capacity'] = self::amount($site['maintenance_per_capacity']);
            $effective[$id] = Q::mul(Q::mul($site['capacity'], $site['condition']), $site['availability']);
            $t['capacity'][$owner][$r] = $effective[$id];
            $maintenance[$id] = Q::mul($site['capacity'], $site['maintenance_per_capacity']);
        }
        unset($site);
        if (array_diff(array_keys($resources), array_keys($byResource))) throw new DomainException('Every resource needs a declared domestic site.');
        foreach ($resources as &$resource) {
            $resource['need_per_person'] = self::amount($resource['need_per_person'] ?? '0');
            if (!is_int($resource['priority'] ?? null) || $resource['priority'] < 0) throw new DomainException('Needs require an explicit priority.');
        }
        unset($resource);
        unset($t);
        $ledger = new ProductionAccounts($resources, $state);
        $state = $ledger->position()['state'];
        $t = $state['territories'][$territory];
        $order = CivilianProduction::order($resources);
        $stock = fn ($owner, $r) => $ledger->inventory($owner, $r)['quantity'];
        $needs = [];
        foreach ($resources as $r => $definition) $needs[$r] = Q::mul((string) $t['population'], $definition['need_per_person']);
        $subsistence = self::Z;
        if (isset($t['subsistence'][$food])) $subsistence = Q::min(self::gap($needs[$food], $stock($household, $food)), Q::min($t['subsistence'][$food]['capacity'], self::div($t['workforce'], $t['subsistence'][$food]['workers'])));

        // Backward requirements: civilian uses -> equipment/finished goods -> raw inputs.
        // One season of intermediate use must remain in the pipeline because business trade
        // happens before production. Counting today's stock without this buffer starves tomorrow.
        $requirements = $business = $upkeep = $intermediateUse = [];
        foreach ($resources as $r => $_) $requirements[$r] = self::gap($needs[$r], Q::add($stock($household, $r), $r === $food ? $subsistence : self::Z));
        foreach ($state['sites'] as $id => $site) {
            $requirements[$equipment] = Q::add($requirements[$equipment], $maintenance[$id]);
            $intermediateUse[$equipment] = Q::add($intermediateUse[$equipment] ?? self::Z, $maintenance[$id]);
            $upkeep[$site['owner']][$equipment] = Q::add($upkeep[$site['owner']][$equipment] ?? self::Z, $maintenance[$id]);
        }
        $targets = $desired = [];
        foreach (array_reverse($order) as $r) {
            $id = $byResource[$r]; $site = $state['sites'][$id];
            $held = self::Z;
            foreach ($state['accounts'] as $owner => $account) if (in_array($account['kind'], ['producer', 'government'], true)) $held = Q::add($held, $stock($owner, $r));
            $desired[$id] = self::gap(Q::add($requirements[$r], $intermediateUse[$r] ?? self::Z), $held);
            $targets[$id] = Q::min($effective[$id], $desired[$id]);
            foreach ($resources[$r]['inputs'] ?? [] as $input => $rate) {
                $use = Q::mul(Q::min($effective[$id], $requirements[$r]), $rate);
                $requirements[$input] = Q::add($requirements[$input], $use);
                $intermediateUse[$input] = Q::add($intermediateUse[$input] ?? self::Z, $use);
            }
        }
        $business = $upkeep;
        foreach ($state['sites'] as $id => $site) foreach ($resources[$site['resource']]['inputs'] ?? [] as $input => $rate) $business[$site['owner']][$input] = Q::add($business[$site['owner']][$input] ?? self::Z, Q::mul($targets[$id], $rate));
        ksort($targets, SORT_STRING); ksort($business, SORT_STRING); ksort($upkeep, SORT_STRING);
        $supportRequested = Q::mul((string) $t['population'], $policy['support_per_person']);
        $supportPaid = Q::min($supportRequested, $ledger->availableCash($government));
        $ledger->support($government, $household, $supportPaid);
        $serviceNeed = Q::mul((string) $t['population'], $rules['public_service_per_person']);
        $serviceBudget = Q::min($ledger->availableCash($government), Q::min($policy['public_service_budget'], Q::mul($serviceNeed, $rules['public_service_wage'])));
        $ledger->reserve('civilian:services', $government, $serviceBudget);

        // Protect owned inputs before opening output is offered for sale, including self-maintenance.
        $holds = [];
        $protect = function (string $owner, string $r) use ($ledger, &$holds, $business): void {
            $id = 'civilian:input:' . $owner . ':' . $r;
            if (isset($holds[$id])) $ledger->releaseStock($id);
            $ledger->reserveStock($id, $owner, $r, Q::min($ledger->inventory($owner, $r)['quantity'], $business[$owner][$r]));
            $holds[$id] = true;
        };
        foreach ($business as $owner => $inputs) { ksort($inputs, SORT_STRING); foreach ($inputs as $r => $_) $protect($owner, $r); }
        $wageReserve = [];
        foreach ($state['sites'] as $id => $site) $wageReserve[$site['owner']] = Q::add($wageReserve[$site['owner']] ?? self::Z,
            Q::add(Q::mul($targets[$id], $resources[$site['resource']]['wage']), Q::mul($maintenance[$id], $rules['maintenance_wage'])));
        $orders = [];
        // Maintenance precedes recipes; both passes target cumulative holdings, never buy twice.
        foreach ([$upkeep, $business] as $pass) foreach ($pass as $owner => $inputs) {
            ksort($inputs, SORT_STRING);
            foreach ($inputs as $r => $required) {
                $seller = $state['sites'][$byResource[$r]]['owner'];
                if ($seller === $owner) continue;
                $wanted = self::gap($required, $stock($owner, $r));
                if (Q::cmp($wanted, '0') === 0) continue;
                $budget = self::gap($ledger->availableCash($owner), $wageReserve[$owner] ?? self::Z);
                $funded = Q::min($wanted, self::div($budget, $resources[$r]['price']));
                $delivered = $ledger->purchaseInputs($owner, $seller, $r, $funded);
                $orders[] = ['buyer' => $owner, 'resource' => $r, 'requested' => $wanted, 'funded' => $funded, 'delivered' => $delivered];
                $protect($owner, $r);
            }
        }
        foreach ($holds as $id => $_) $ledger->releaseStock($id);
        $ledger->release('civilian:services');
        $subsistence = isset($t['subsistence'][$food]) ? $ledger->subsist($territory, $household, $food, $subsistence) : self::Z;
        $siteReports = [];
        foreach ($state['sites'] as $id => $site) {
            $maintained = $ledger->maintain($territory, $site['owner'], $equipment, $maintenance[$id], $rules['maintenance_workers'], $rules['maintenance_wage'], $household);
            $condition = CivilianProduction::condition($site['condition'], $maintenance[$id], $maintained, $rules['condition_decay'], $rules['condition_recovery']);
            $siteReports[$id] = ['resource' => $site['resource'], 'owner' => $site['owner'], 'installed_capacity' => $site['capacity'], 'effective_capacity' => $effective[$id],
                'desired_output' => $desired[$id], 'planned' => $targets[$id], 'maintenance_required' => $maintenance[$id], 'maintenance_delivered' => $maintained, 'opening_condition' => $site['condition'], 'closing_condition' => $condition];
        }
        $serviceWork = $ledger->prepareService($territory, $government, Q::min($serviceNeed, self::div($serviceBudget, $rules['public_service_wage'])), $rules['public_service_wage'], $household);
        $productionOrder = array_keys($resources);
        usort($productionOrder, fn ($a, $b) => [$a === $food ? 0 : 1, $resources[$a]['priority'], $a] <=> [$b === $food ? 0 : 1, $resources[$b]['priority'], $b]);
        foreach ($productionOrder as $r) {
            $id = $byResource[$r]; $site = $state['sites'][$id];
            $limits = $ledger->productionLimits($territory, $site['owner'], $r);
            $siteReports[$id]['constraints'] = array_keys(array_filter($limits, fn ($v) => Q::cmp($v, $targets[$id]) < 0));
            if (Q::cmp($desired[$id], $effective[$id]) > 0) {
                if (Q::cmp($site['availability'], '1') < 0) $siteReports[$id]['constraints'][] = 'availability';
                if (Q::cmp($site['condition'], '1') < 0) $siteReports[$id]['constraints'][] = 'asset_condition';
                if (Q::cmp($desired[$id], $site['capacity']) > 0) $siteReports[$id]['constraints'][] = 'installed_capacity';
            }
            $siteReports[$id]['produced'] = $ledger->produce($territory, $site['owner'], $r, $targets[$id], $household);
        }
        $consumption = [];
        foreach ($productionOrder as $r) {
            if (Q::cmp($needs[$r], '0') <= 0) continue;
            $owner = $state['sites'][$byResource[$r]]['owner'];
            $held = $ledger->availableStock($household, $r);
            $wanted = self::gap($needs[$r], $held);
            $funded = Q::min($wanted, self::div($ledger->availableCash($household), $resources[$r]['price']));
            $available = $ledger->availableStock($owner, $r);
            $result = $ledger->consumeDemand($household, $r, $needs[$r], [$owner], $government);
            $consumption[$r] = $result + ['opening_owned_for_consumption' => $held, 'market_requested' => $wanted, 'funded' => $funded,
                'unaffordable' => self::gap($wanted, $funded), 'funded_unavailable' => self::gap($funded, $available)];
        }
        $services = $ledger->deliverPublicService($territory, $government, $serviceWork);
        $dividends = [];
        $owners = array_values(array_unique(array_column($state['sites'], 'owner'))); sort($owners, SORT_STRING);
        foreach ($owners as $owner) {
            if ($state['accounts'][$owner]['kind'] !== 'producer') continue;
            $operating = $wageReserve[$owner] ?? self::Z;
            foreach ($business[$owner] ?? [] as $r => $q) if ($state['sites'][$byResource[$r]]['owner'] !== $owner) $operating = Q::add($operating, Q::mul($q, $resources[$r]['price']));
            $position = $ledger->position();
            $requested = Q::min(Q::mul($position['profits'][$owner], $rules['distribution_ratio']), self::gap($ledger->availableCash($owner), Q::mul($operating, $rules['reserve_seasons'])));
            $dividends[$owner] = $ledger->distributeProfit($owner, $household, $requested);
        }
        $result = $ledger->close();
        $result['state']['season'] = $state['season'] + 1;
        foreach ($siteReports as $id => $row) $result['state']['sites'][$id]['condition'] = $row['closing_condition'];
        $cashFlows = $wages = $taxes = self::Z;
        foreach ($result['events'] as $event) {
            if ($event['type'] === 'wages') $wages = Q::add($wages, $event['gross']);
            if ($event['type'] === 'cash') {
                if (in_array($event['reason'], ['wage_tax', 'profit_tax'], true)) $taxes = Q::add($taxes, $event['amount']);
                if ($event['to'] === $government) $cashFlows = Q::add($cashFlows, $event['amount']);
                if ($event['from'] === $government) $cashFlows = Q::sub($cashFlows, $event['amount']);
            }
        }
        $issues = [];
        foreach ($consumption as $r => $row) if (Q::cmp($row['unmet'], '0') > 0) $issues[] = ['type' => 'civilian_shortage', 'resource' => $r, 'quantity' => $row['unmet'], 'unaffordable' => $row['unaffordable'], 'funded_unavailable' => $row['funded_unavailable']];
        foreach ($siteReports as $id => $row) if (Q::cmp($row['maintenance_delivered'], $row['maintenance_required']) < 0) $issues[] = ['type' => 'maintenance_shortfall', 'site' => $id, 'quantity' => Q::sub($row['maintenance_required'], $row['maintenance_delivered'])];
        if (Q::cmp($services, $serviceNeed) < 0) $issues[] = ['type' => 'public_service_shortfall', 'quantity' => Q::sub($serviceNeed, $services)];
        if (Q::cmp($supportPaid, $supportRequested) < 0) $issues[] = ['type' => 'support_shortfall', 'quantity' => Q::sub($supportRequested, $supportPaid)];
        $openingCash = self::sum(array_column($state['accounts'], 'cash'));
        $closingCash = self::sum(array_column($result['state']['accounts'], 'cash'));
        if ($openingCash !== $closingCash || Q::cmp($result['used_workers'][$territory] ?? self::Z, $t['workforce']) > 0) throw new DomainException('Civilian cash/labor invariant failed.');
        $result['report'] = ['season' => $result['state']['season'], 'policy' => $policy, 'population' => $t['population'], 'subsistence' => $subsistence, 'consumption' => $consumption,
            'sites' => $siteReports, 'input_orders' => $orders, 'wages' => $wages, 'taxes' => $taxes, 'dividends' => $dividends,
            'support_requested' => $supportRequested, 'support_paid' => $supportPaid, 'public_service_budget' => $serviceBudget, 'public_services_required' => $serviceNeed, 'public_services_delivered' => $services,
            'treasury_change' => $cashFlows, 'accounts' => array_map(fn ($a) => $a['cash'], $result['state']['accounts']),
            'workers_used' => $result['used_workers'][$territory] ?? self::Z, 'workforce' => $t['workforce'], 'total_cash' => $closingCash, 'issues' => $issues];
        return $result;
    }
}
