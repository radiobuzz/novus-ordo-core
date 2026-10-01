<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use Brick\Math\{BigDecimal, RoundingMode};
use DomainException;

/** Civilian input-chain planning shared by the laboratory and the live seasonal ledger. */
final class CivilianProduction
{
    private const Z = '0.000000';

    public static function order(array $definitions): array
    {
        ksort($definitions, SORT_STRING);
        $done = $active = $order = [];
        $visit = function (string $key) use (&$visit, &$done, &$active, &$order, $definitions): void {
            if (isset($done[$key])) return;
            if (isset($active[$key])) throw new DomainException('Cyclic production recipes.');
            if (!isset($definitions[$key])) throw new DomainException('Unknown recipe input.');
            $active[$key] = true;
            $inputs = $definitions[$key]['inputs'] ?? [];
            ksort($inputs, SORT_STRING);
            foreach ($inputs as $input => $_) $visit($input);
            unset($active[$key]);
            $done[$key] = true; $order[] = $key;
        };
        foreach ($definitions as $key => $_) $visit($key);
        return $order;
    }

    public static function condition(string $opening, string $required, string $delivered, string $decay, string $recovery): string
    {
        if (Q::cmp($required, '0') <= 0) return Q::parse($opening);
        $coverage = Q::min('1', self::div($delivered, $required));
        return Q::cmp($coverage, '1') >= 0 ? Q::min('1', Q::add($opening, $recovery))
            : Q::max('0', Q::sub($opening, Q::mul($decay, Q::sub('1', $coverage))));
    }

    private static function div(string $a, string $b): string
    {
        return (string) BigDecimal::of($a)->dividedBy($b, 6, RoundingMode::DOWN);
    }

    /** Supply needs are physical requirements, not promises of funded sales. */
    public static function prepare(array $resources, array $definitions, array &$state): array
    {
        $population = array_sum(array_column($state['territories'], 'population'));
        $ctx = ['enabled' => false, 'subsistence' => [], 'subsistence_total' => [], 'maintenance' => [],
            'industry' => array_fill_keys(array_keys($definitions), self::Z),
            'essential' => array_fill_keys(array_keys($definitions), self::Z),
            'own_inputs' => ['producer' => [], 'government' => []]];
        $needs = [];
        foreach ($definitions as $key => $_) {
            $needs[$key] = Q::output($population, $resources[$key]['rules']['demand.population']['per_million'] ?? '0');
        }
        foreach ($state['territories'] as $id => &$t) {
            $remainingWorkers = Q::parse($t['workforce']);
            foreach ($definitions as $key => $_) {
                $r = $resources[$key]['rules'];
                if (isset($r['production.subsistence'])) {
                    $ctx['enabled'] = true; $s = $r['production.subsistence'];
                    $ceiling = Q::min(Q::output($t['population'], $s['per_million']), Q::mul($t['potential'][$key], $s['potential_share']));
                    $workers = Q::parse($s['workers_per_unit']);
                    $t['subsistence'][$key] = ['capacity' => $ceiling, 'workers' => $workers];
                    $q = Q::min($ceiling, self::div($remainingWorkers, $workers));
                    $q = Q::min($q, Q::output($t['population'], $r['demand.population']['per_million']));
                    $ctx['subsistence'][$id][$key] = $q;
                    $ctx['subsistence_total'][$key] = Q::add($ctx['subsistence_total'][$key] ?? self::Z, $q);
                    $remainingWorkers = Q::max('0', Q::sub($remainingWorkers, Q::mul($q, $workers)));
                }
                foreach (['producer', 'government'] as $owner) {
                    $capacity = Q::parse($t['capacity'][$owner][$key] ?? '0');
                    $condition = Q::parse($t['productive_condition'][$owner][$key] ?? '1');
                    if (!isset($r['production.maintenance'])) continue;
                    $ctx['enabled'] = true; $m = $r['production.maintenance'];
                    $required = Q::mul($capacity, $m['per_capacity']);
                    $ctx['maintenance'][] = ['territory' => (string) $id, 'owner' => $owner, 'resource' => $key,
                        'input' => $m['resource'], 'required' => $required, 'delivered' => self::Z,
                        'workers' => $m['workers_per_unit'], 'wage' => $m['wage_per_unit'],
                        'decay' => $m['condition_decay'], 'recovery' => $m['condition_recovery'], 'opening_condition' => $condition];
                    $ctx['industry'][$m['resource']] = Q::add($ctx['industry'][$m['resource']] ?? self::Z, $required);
                    $ctx['essential'][$m['resource']] = Q::add($ctx['essential'][$m['resource']], $required);
                    $ctx['own_inputs'][$owner][$m['resource']] = Q::add($ctx['own_inputs'][$owner][$m['resource']] ?? self::Z, $required);
                }
            }
        }
        unset($t);
        foreach (array_reverse(self::order($definitions)) as $key) {
            // Capacity constrains execution, not the demand signal: clipping here
            // prevents upstream investors from seeing downstream unmet needs.
            $target = Q::add(Q::max('0', Q::sub($needs[$key], $ctx['subsistence_total'][$key] ?? '0')), $ctx['industry'][$key]);
            foreach ($definitions[$key]['inputs'] ?? [] as $input => $rate) {
                $ctx['enabled'] = true;
                $ctx['industry'][$input] = Q::add($ctx['industry'][$input], Q::mul($target, $rate));
                $ctx['essential'][$input] = Q::add($ctx['essential'][$input], Q::mul($ctx['essential'][$key], $rate));
            }
        }
        return $ctx;
    }

    /** Opening inputs trade before any work. Private internal deliveries are not sales. */
    public static function buyInputs(ProductionAccounts $a, array $state, array $defs, array $privateTargets, array $publicTargets, array &$ctx): void
    {
        if (!$ctx['enabled']) return;
        foreach ($defs as $key => $def) foreach (['producer' => $privateTargets, 'government' => $publicTargets] as $owner => $targets) {
            $capacity = self::Z;
            foreach ($state['territories'] as $t) $capacity = Q::add($capacity, Q::mul($t['capacity'][$owner][$key] ?? '0', $t['productive_condition'][$owner][$key] ?? '1'));
            $output = $owner === 'producer' ? Q::max('0', Q::sub($targets[$key], $a->inventory($owner, $key)['quantity'])) : $targets[$key];
            foreach ($def['inputs'] ?? [] as $input => $rate) $ctx['own_inputs'][$owner][$input] = Q::add($ctx['own_inputs'][$owner][$input] ?? self::Z, Q::mul(Q::min($capacity, $output), $rate));
        }
        foreach ($ctx['own_inputs']['producer'] as $key => $need) $a->reserveStock('civilian-input:' . $key, 'producer', $key, Q::min($need, $a->availableStock('producer', $key)));
        foreach ($ctx['own_inputs']['government'] as $key => $need) {
            // Opening government reserves remain protected except for the declared own-use inputs.
            $a->releaseStock('opening:' . $key);
            $held = $a->availableStock('government', $key);
            $a->reserveStock('opening:' . $key, 'government', $key, Q::max('0', Q::sub($held, $need)));
            $wanted = Q::max('0', Q::sub($need, $held));
            $a->purchaseInputs('government', 'producer', $key, $wanted);
        }
        foreach ($ctx['own_inputs']['producer'] as $key => $_) $a->releaseStock('civilian-input:' . $key);
    }

    public static function work(ProductionAccounts $a, array &$ctx): void
    {
        foreach ($ctx['subsistence'] as $id => $resources) foreach ($resources as $key => $q)
            $ctx['subsistence'][$id][$key] = $a->subsist((string) $id, 'household', $key, $q);
        foreach ($ctx['maintenance'] as &$m) {
            $m['delivered'] = $a->maintain($m['territory'], $m['owner'], $m['input'], $m['required'], $m['workers'], $m['wage'], 'household');
            $m['closing_condition'] = self::condition($m['opening_condition'], $m['required'], $m['delivered'], $m['decay'], $m['recovery']);
        }
        unset($m);
    }

    public static function finish(array &$result, array $ctx): array
    {
        $subsistence = [];
        foreach ($ctx['subsistence'] as $resources) foreach ($resources as $key => $q) $subsistence[$key] = Q::add($subsistence[$key] ?? self::Z, $q);
        $required = $delivered = self::Z; $upkeep = []; $minimumCondition = '1.000000';
        foreach ($ctx['maintenance'] as $m) {
            $result['state']['territories'][$m['territory']]['productive_condition'][$m['owner']][$m['resource']] = $m['closing_condition'];
            $required = Q::add($required, $m['required']); $delivered = Q::add($delivered, $m['delivered']);
            $upkeep[$m['input']] ??= ['required' => self::Z, 'delivered' => self::Z];
            foreach (['required', 'delivered'] as $field) $upkeep[$m['input']][$field] = Q::add($upkeep[$m['input']][$field], $m[$field]);
            if (Q::cmp($m['required'], '0') > 0) $minimumCondition = Q::min($minimumCondition, $m['closing_condition']);
        }
        return ['enabled' => $ctx['enabled'], 'subsistence' => $subsistence, 'maintenance' => $ctx['maintenance'], 'upkeep' => $upkeep,
            'maintenance_required' => $required, 'maintenance_delivered' => $delivered, 'minimum_condition' => $minimumCondition,
            'workers_used' => array_reduce($result['used_workers'], fn ($a, $b) => Q::add($a, $b), self::Z),
            'workforce' => array_reduce($result['state']['territories'], fn ($a, $t) => Q::add($a, $t['workforce']), self::Z),
            'household_cash' => $result['state']['accounts']['household']['cash'], 'producer_cash' => $result['state']['accounts']['producer']['cash']];
    }

    /** Rebuild the maintenance supply chain when normal upkeep cannot restore it.
     * Existing construction prices/labor apply; no inputs or installed capacity are minted.
     * The recovery rate bounds each asset's net improvement and only affects next season.
     */
    public static function rebuild(ProductionAccounts $a, array &$ctx, array $defs, string &$budget): void
    {
        foreach (self::order($defs) as $key) {
            if (Q::cmp($ctx['essential'][$key] ?? self::Z, '0') <= 0) continue;
            foreach ($ctx['maintenance'] as &$m) {
                if ($m['resource'] !== $key || $m['owner'] !== 'producer') continue;
                $target = Q::min('1', Q::add($m['opening_condition'], $m['recovery']));
                $gap = Q::max('0', Q::sub($target, $m['closing_condition']));
                if (Q::cmp($gap, '0') <= 0) continue;
                $capacity = $a->position()['state']['territories'][$m['territory']]['capacity']['producer'][$key] ?? self::Z;
                $requested = Q::min(Q::mul($capacity, $gap), self::div($budget, $defs[$key]['capital_cost']));
                $rebuilt = $a->rebuild($m['territory'], 'producer', $key, $requested, Q::mul($capacity, Q::sub('1', $m['closing_condition'])), 'household');
                $budget = Q::sub($budget, Q::mul($rebuilt, $defs[$key]['capital_cost']));
                if (Q::cmp($capacity, '0') > 0) $m['closing_condition'] = Q::min($target, Q::add($m['closing_condition'], self::div($rebuilt, $capacity)));
                $m['rebuilt_capacity'] = $rebuilt;
            }
            unset($m);
        }
    }
}
