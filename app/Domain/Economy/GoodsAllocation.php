<?php
declare(strict_types=1);
namespace App\Domain\Economy;

use App\Domain\Resources\{GeographicProduction, ProductionRecipes, Quantity as Q};
use Brick\Math\{BigDecimal, RoundingMode};
use DomainException;

/** Physical flows only. No enterprise wallet, inventory valuation or ownership-dependent production path. */
final class GoodsAllocation
{
    public array $territories;
    public array $resources = [];
    public array $usedWorkers = [];
    public array $definitions = [];
    private array $usedCapacity = [];
    private array $flow = [];
    private array $production = [];
    private array $consumedInputs = [];
    private array $deliveries = [];
    private array $productionWorkers = [];

    public function __construct(array $resources, array $territories, private readonly array $rules)
    {
        ksort($resources, SORT_STRING); ksort($territories, SORT_NATURAL);
        foreach ($resources as $key => $resource) {
            if ($resource['kind'] !== 'stock') continue;
            $r = $resource['rules'];
            foreach (['production.territorial_labor','exchange.reference_price','development.capacity','production.founding'] as $required)
                if (!isset($r[$required])) throw new DomainException('Produced stock requires complete resource contracts.');
            $this->definitions[$key] = ['inputs' => $r['production.inputs']['resources'] ?? []];
            foreach ($this->definitions[$key]['inputs'] as &$ratio) $ratio = Q::parse($ratio); unset($ratio);
            $this->resources[$key] = $resource;
        }
        ProductionRecipes::order($this->definitions);
        foreach ($territories as $id => &$t) {
            if (!is_int($t['population']) || $t['population'] < 0) throw new DomainException('Invalid population.');
            $workers = Q::parse($t['workforce']);
            if (Q::cmp($workers, (string) $t['population']) > 0 || floor((float) $workers) != (float) $workers) throw new DomainException('Workforce must be whole people within population.');
            $t['workforce'] = $workers;
            if (array_diff_key($t['capacity'], $this->resources)) throw new DomainException('Unknown installed resource capacity.');
            $this->usedWorkers[$id] = '0.000000';
            $this->productionWorkers[$id] = (string) BigDecimal::of($workers)->multipliedBy(Q::calculated(1 - $rules['physical']['construction_labor_share']))->toScale(0, RoundingMode::DOWN)->toScale(6);
            $t['potential'] = $t['usable_capacity'] = $t['workers_per_unit'] = [];
            foreach ($this->resources as $key => $resource) {
                $r = $resource['rules'];
                $potential = GeographicProduction::potential($r, $key, $t['geography'], $t['population']);
                $t['potential'][$key] = $potential;
                $t['capacity'][$key] = Q::parse($t['capacity'][$key] ?? throw new DomainException('Missing territorial capacity.'));
                $facility = GeographicProduction::facility($r['production.territorial_labor'], $key, $t['geography'], $t['terrain'], (int) $workers);
                if (Q::cmp($facility['productivity'], '0') <= 0) { $t['usable_capacity'][$key] = '0.000000'; continue; }
                $t['workers_per_unit'][$key] = (string) BigDecimal::of('1000000')->dividedBy($facility['productivity'], 6, RoundingMode::CEILING);
                $factor = Q::calculated(TerritorialIndicators::bound($rules['physical']['operating_floor'] + $rules['physical']['operating_economic'] * (float) $t['economy']['economic_strength']));
                $t['usable_capacity'][$key] = self::floorMultiply(Q::min($potential, $t['capacity'][$key]), $factor);
                $this->usedCapacity[$id][$key] = '0.000000';
            }
        }
        unset($t);
        $this->territories = $territories;
        foreach ($this->resources as $key => $_) $this->flow[$key] = $this->production[$key] = $this->consumedInputs[$key] = $this->deliveries[$key] = '0.000000';
    }

    public static function divide(string $a, string $b): string
    {
        if (Q::cmp($b, '0') <= 0) throw new DomainException('Positive divisor required.');
        return (string) BigDecimal::of($a)->dividedBy($b, 6, RoundingMode::DOWN);
    }
    public static function floorMultiply(string $a, string $b): string { return (string) BigDecimal::of($a)->multipliedBy($b)->toScale(6, RoundingMode::DOWN); }
    public static function ceilMultiply(string $a, string $rate): string { return (string) BigDecimal::of($a)->multipliedBy($rate)->toScale(6, RoundingMode::CEILING); }

    /** Failed input chains consume nothing. Search integer micro-units, avoiding fractional-worker overrun. */
    public function deliver(string $key, string $wanted): string
    {
        if (!isset($this->resources[$key])) throw new DomainException('Unknown produced resource.');
        $wanted = Q::parse($wanted);
        $trial = clone $this;
        if ($trial->attempt($key, $wanted)) {
            $trial->deliveries[$key] = Q::add($trial->deliveries[$key], $wanted);
            $this->adopt($trial);
            return $wanted;
        }
        $low = BigDecimal::of('0'); $high = BigDecimal::of($wanted)->multipliedBy('1000000')->toScale(0);
        while ($low->isLessThan($high)) {
            $mid = $low->plus($high)->plus('1')->dividedBy('2', 0, RoundingMode::DOWN);
            $q = (string) $mid->dividedBy('1000000', 6);
            $trial = clone $this;
            if ($trial->attempt($key, $q)) $low = $mid; else $high = $mid->minus('1');
        }
        $quantity = (string) $low->dividedBy('1000000', 6);
        if (Q::cmp($quantity, '0') > 0) {
            $trial = clone $this;
            if (!$trial->attempt($key, $quantity)) throw new DomainException('Feasibility search failed.');
            $trial->deliveries[$key] = Q::add($trial->deliveries[$key], $quantity);
            $this->adopt($trial);
        }
        return $quantity;
    }

    private function adopt(self $other): void
    {
        foreach (['usedWorkers','usedCapacity','flow','production','consumedInputs','deliveries'] as $key) $this->$key = $other->$key;
    }

    private function attempt(string $key, string $quantity): bool
    {
        $missing = Q::max('0', Q::sub($quantity, $this->flow[$key]));
        if (Q::cmp($missing, '0') > 0) {
            // Verify output capacity before acquiring its inputs; use the same deterministic territory order.
            $allocations = []; $remaining = $missing;
            $order = array_keys($this->territories);
            usort($order, fn ($a, $b) => Q::cmp($this->territories[$a]['workers_per_unit'][$key] ?? '99999999999999', $this->territories[$b]['workers_per_unit'][$key] ?? '99999999999999') ?: strnatcmp((string) $a, (string) $b));
            foreach ($order as $id) {
                $t = $this->territories[$id];
                if (!isset($t['workers_per_unit'][$key])) continue;
                $freeWorkers = Q::max('0', Q::sub($this->productionWorkers[$id], $this->usedWorkers[$id]));
                $freeCapacity = Q::max('0', Q::sub($t['usable_capacity'][$key], $this->usedCapacity[$id][$key]));
                $q = Q::min($remaining, Q::min($freeCapacity, self::divide($freeWorkers, $t['workers_per_unit'][$key])));
                if (Q::cmp($q, '0') <= 0) continue;
                $workers = (string) BigDecimal::of($q)->multipliedBy($t['workers_per_unit'][$key])->toScale(0, RoundingMode::CEILING)->toScale(6);
                $this->usedWorkers[$id] = Q::add($this->usedWorkers[$id], $workers);
                $allocations[$id] = $q; $remaining = Q::sub($remaining, $q);
                if (Q::cmp($remaining, '0') === 0) break;
            }
            if (Q::cmp($remaining, '0') > 0) return false;
            foreach ($this->definitions[$key]['inputs'] as $input => $rate) {
                $required = self::ceilMultiply($missing, $rate);
                if (!$this->attempt($input, $required)) return false;
                $this->consumedInputs[$input] = Q::add($this->consumedInputs[$input], $required);
            }
            foreach ($allocations as $id => $q) $this->usedCapacity[$id][$key] = Q::add($this->usedCapacity[$id][$key], $q);
            $this->production[$key] = Q::add($this->production[$key], $missing);
            $this->flow[$key] = Q::add($this->flow[$key], $missing);
        }
        $this->flow[$key] = Q::sub($this->flow[$key], $quantity);
        return true;
    }

    public function ordinaryDemand(): array
    {
        $out = [];
        foreach ($this->resources as $key => $r) {
            $demand = $r['rules']['demand.population'] ?? null; $out[$key] = '0.000000';
            if (!$demand) continue;
            foreach ($this->territories as $t) {
                $factor = Q::calculated(1 + (float) ($demand['prosperity_response'] ?? 0) * (float) $t['economy']['economic_strength']);
                $out[$key] = Q::add($out[$key], Q::mul(Q::output($t['population'], $demand['per_million']), $factor));
            }
        }
        return $out;
    }

    /** Development targets propagate *ordinary* recipes even if today's input supply is poor. */
    public function targets(array $finalNeeds): array
    {
        $targets = array_fill_keys(array_keys($this->resources), '0.000000');
        foreach ($finalNeeds as $key => $need) $targets[$key] = Q::parse($need);
        foreach (array_reverse(ProductionRecipes::order($this->definitions)) as $key) foreach ($this->definitions[$key]['inputs'] as $input => $rate)
            $targets[$input] = Q::add($targets[$input], self::ceilMultiply($targets[$key], $rate));
        foreach ($targets as &$value) $value = Q::mul($value, Q::calculated(1 + $this->rules['physical']['capacity_buffer'])); unset($value);
        return $targets;
    }

    /** Lasting capacity may grow only within need, potential, local labor and a single shared allowance. */
    public function develop(array $targets, array $settings, string $privateBudget, string $publicBudget): array
    {
        $privateStart = $privateBudget; $publicStart = $publicBudget;
        $publicShare = TerritorialIndicators::share($settings); $efficiency = Q::calculated($this->rules['hypothesis']['public_investment_efficiency']);
        $growth = []; $privatePaid = []; $publicPaid = [];
        foreach (ProductionRecipes::order($this->definitions) as $key) {
            $installed = array_reduce($this->territories, fn ($sum, $t) => Q::add($sum, $t['capacity'][$key]), '0.000000');
            $gap = Q::max('0', Q::sub($targets[$key], $installed));
            $rule = $this->resources[$key]['rules']['development.capacity'];
            $funding = (float) ($settings['production.development_funding'][$key] ?? '0');
            $order = array_keys($this->territories);
            $priority = $settings['allocation.production_priority'][$key] ?? 'potential';
            $score = function ($id) use ($priority, $key): float {
                $t = $this->territories[$id];
                return match ($priority) {
                    'population' => $t['population'],
                    'regional' => (float) $t['potential'][$key] > 0 ? 1 - (float) $t['capacity'][$key] / (float) $t['potential'][$key] : 0,
                    'potential' => max(0, (float) $t['potential'][$key] - (float) $t['capacity'][$key]),
                    default => throw new DomainException('Invalid production allocation priority.'),
                };
            };
            usort($order, fn ($a, $b) => $score($b) <=> $score($a) ?: strnatcmp((string) $a, (string) $b));
            foreach ($order as $id) {
                $t = &$this->territories[$id];
                if (!isset($t['workers_per_unit'][$key]) || Q::cmp($gap, '0') <= 0) { unset($t); continue; }
                $ceiling = Q::min($gap, Q::min(Q::max('0', Q::sub($t['potential'][$key], $t['capacity'][$key])), self::floorMultiply($t['potential'][$key], $rule['max_growth_fraction'])));
                $localWorkers = Q::max('0', Q::sub($t['workforce'], $this->usedWorkers[$id]));
                $ceiling = Q::min($ceiling, self::divide($localWorkers, $rule['construction_workers']));
                $privateWanted = self::floorMultiply($ceiling, Q::calculated((1 - $publicShare) * (float) $t['economy']['dynamism']));
                $publicWanted = self::floorMultiply($ceiling, Q::calculated($publicShare * $funding));
                $privateUnits = Q::min($privateWanted, self::divide($privateBudget, $rule['capital_cost']));
                $publicUnits = Q::min($publicWanted, self::divide(self::floorMultiply($publicBudget, $efficiency), $rule['capital_cost']));
                $privateCost = self::ceilMultiply($privateUnits, $rule['capital_cost']);
                $publicCost = Q::cmp($efficiency, '0') > 0 ? (string) BigDecimal::of($publicUnits)->multipliedBy($rule['capital_cost'])->dividedBy($efficiency, 6, RoundingMode::CEILING) : '0.000000';
                $total = Q::add($privateUnits, $publicUnits);
                $workers = (string) BigDecimal::of($total)->multipliedBy($rule['construction_workers'])->toScale(0, RoundingMode::CEILING)->toScale(6);
                if (Q::cmp($workers, $localWorkers) > 0) throw new DomainException('Construction exceeded local labor.');
                $t['capacity'][$key] = Q::add($t['capacity'][$key], $total); $gap = Q::sub($gap, $total);
                $this->usedWorkers[$id] = Q::add($this->usedWorkers[$id], $workers);
                $privateBudget = Q::sub($privateBudget, $privateCost); $publicBudget = Q::sub($publicBudget, $publicCost);
                $growth[$id][$key] = $total;
                $privatePaid[$key] = Q::add($privatePaid[$key] ?? '0', $privateCost);
                $publicPaid[$key] = Q::add($publicPaid[$key] ?? '0', $publicCost);
                unset($t);
            }
        }
        return ['growth' => $growth, 'private_spent' => Q::sub($privateStart, $privateBudget), 'public_spent' => Q::sub($publicStart, $publicBudget), 'private_paid' => $privatePaid, 'public_paid' => $publicPaid];
    }

    public function construction(string $id, string $wanted): string
    {
        $rate = Q::calculated($this->rules['physical']['infrastructure_workers_per_credit']);
        if (Q::cmp($rate, '0') <= 0) return Q::parse($wanted);
        $available = Q::max('0', Q::sub($this->territories[$id]['workforce'], $this->usedWorkers[$id]));
        $paid = Q::min(Q::parse($wanted), self::divide($available, $rate));
        $used = (string) BigDecimal::of($paid)->multipliedBy($rate)->toScale(0, RoundingMode::CEILING)->toScale(6);
        $this->usedWorkers[$id] = Q::add($this->usedWorkers[$id], $used);
        return $paid;
    }

    public function results(): array
    {
        foreach ($this->resources as $key => $_) {
            if (Q::add($this->consumedInputs[$key], $this->deliveries[$key]) !== $this->production[$key]) throw new DomainException('Physical output does not reconcile.');
        }
        foreach ($this->territories as $id => $t) if (Q::cmp($this->usedWorkers[$id], $t['workforce']) > 0) throw new DomainException('Shared workforce exceeded.');
        return ['production' => $this->production, 'inputs' => $this->consumedInputs, 'territorial_output' => $this->usedCapacity];
    }
}
