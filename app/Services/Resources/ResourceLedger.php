<?php

namespace App\Services\Resources;

use App\Domain\DivisionType;
use App\Domain\Resources\Quantity as Q;
use App\Models\{NationDetail, DivisionDetail, Order};
use Illuminate\Support\Facades\DB;
final class ResourceLedger
{
    public function costs(NationDetail $detail): array
    {
        $cat = ResourceCatalogue::forGame($detail->getGame());
        $commands = $upkeep = $occupied = $cat->zero();
        foreach (DivisionDetail::where('division_details.nation_id', $detail->nation_id)->where('division_details.turn_id', $detail->turn_id)->where('is_active', true)->join('divisions', 'divisions.id', '=', 'division_details.division_id')->pluck('division_type') as $type) {
            foreach ($cat->costs('season', DivisionType::from($type)) as $k => $v) {
                $upkeep[$k] = Q::add($upkeep[$k], $v);
            }
            foreach ($cat->costs('active_capacity', DivisionType::from($type)) as $k => $v) {
                $occupied[$k] = Q::add($occupied[$k], $v);
            }
        }
        foreach ($detail->deployments()->get() as $d) {
            foreach ($cat->deploymentCosts($d->getDivisionType()) as $k => $v) {
                $commands[$k] = Q::add($commands[$k], $v);
            }
            foreach ($cat->costs('season', $d->getDivisionType()) as $k => $v) {
                $upkeep[$k] = Q::add($upkeep[$k], $v);
            }
        }
        foreach (Order::getTotalOperationCosts($detail->getNation(), $detail->getTurn()) as $k => $v) {
            $commands[$k] = Q::add($commands[$k], $v);
        }
        return compact('commands', 'upkeep', 'occupied');
    }
    /** Immediate availability never includes production or pending purchases. */
    public function available(NationDetail $detail, ?array $costs = null): array {
        $costs ??= $this->costs($detail); $out = []; $cat = $detail->resources();
        $loyal = (int) DB::table('labor_pools')->where('nation_id', $detail->nation_id)->where('turn_id', $detail->turn_id)->sum('size');
        foreach ($cat->resources as $key => $r) {
            $opening = $r['kind'] === 'capacity' ? Q::output($loyal, $r['rules']['capacity.loyal_population']['per_million']) : $detail->getStockpiledQuantity($key);
            $out[$key] = Q::max('0', Q::sub(Q::sub($opening, $costs['commands'][$key]), $r['kind'] === 'capacity' ? $costs['occupied'][$key] : '0'));
        }
        return $out;
    }
    public function assertOpeningActions(NationDetail $detail, ?array $costs = null): void {
        $costs ??= $this->costs($detail);
        foreach ($detail->resources()->resources as $key => $r) if ($r['kind'] !== 'capacity' && Q::cmp($detail->getStockpiledQuantity($key), $costs['commands'][$key]) < 0)
            ResourceRuleRegistry::fail("Accepted actions exceed government-owned {$key}.");
    }
    public function validatePlan(NationDetail $detail, array $plans): array {
        $keys = array_keys($detail->resources()->producers()); $actual = array_keys($plans); sort($keys); sort($actual);
        if ($keys !== $actual) ResourceRuleRegistry::fail('Provide one acquisition request for each produced resource.');
        foreach ($plans as &$p) {
            if (array_diff(array_keys($p), ['resource_key', 'quantity', 'spending_limit', 'priority'])) ResourceRuleRegistry::fail('Unsupported acquisition field.');
            $p = ['quantity' => Q::parse($p['quantity'] ?? null), 'spending_limit' => Q::parse($p['spending_limit'] ?? null), 'priority' => $p['priority'] ?? null];
            if (!is_int($p['priority']) || $p['priority'] < 0 || $p['priority'] > 2147483647) ResourceRuleRegistry::fail('Invalid acquisition priority.');
        } unset($p);
        return $plans;
    }
    public function plans(NationDetail $detail): array {
        $cat = $detail->resources(); $plans = [];
        foreach ($cat->producers() as $key => $_) $plans[$key] = ['resource_key' => $key, 'quantity' => '0', 'spending_limit' => '0', 'priority' => 100];
        foreach (DB::table('nation_resource_acquisitions')->where('nation_id', $detail->nation_id)->where('turn_id', $detail->turn_id)->get() as $r)
            $plans[$cat->key($r->resource_id)] = ['resource_key' => $cat->key($r->resource_id), 'quantity' => $r->requested_quantity, 'spending_limit' => $r->spending_limit, 'priority' => $r->priority];
        return $plans;
    }
    public function savePlan(NationDetail $detail, array $plans): void {
        foreach ($this->validatePlan($detail, $plans) as $key => $p) app(ProductionStateStore::class)->setAcquisition($detail->getNation(), $detail->getTurn(), $key, $p['quantity'], $p['spending_limit'], $p['priority']);
    }
    public function preview(NationDetail $detail, ?array $plans = null, ?array $settings = null, ?array $result = null): array {
        $result ??= app(\App\Services\EconomyService::class)->resolve($detail, $settings, $plans);
        $cat = $detail->resources(); $costs = $this->costs($detail); $available = $this->available($detail, $costs); $rows = [];
        foreach ($cat->resources as $key => $r) {
            $opening = $detail->getStockpiledQuantity($key); $physical = $result['resources'][$key] ?? null;
            $closing = $physical ? $physical['government_closing'] : ($r['kind'] === 'currency' ? $result['report']['closing_treasury'] : '0');
            $production = $physical ? Q::add(...array_values($physical['production'])) : '0';
            $rows[$key] = ['kind' => $r['kind'], 'opening' => $opening, 'production' => $production,
                'commands' => $costs['commands'][$key], 'requested' => $costs['upkeep'][$key], 'available' => $available[$key],
                'closing' => $closing, 'balance' => Q::sub($closing, $opening), 'occupied' => $costs['occupied'][$key],
                'capacity' => $r['kind'] === 'capacity' ? Q::add(Q::add($available[$key], $costs['commands'][$key]), $costs['occupied'][$key]) : '0',
                'acquisition' => $physical];
        }
        $facilities = []; $pools = [];
        foreach ($result['state']['territories'] as $id => $t) $pools[$id] = max(0, (int) $t['workforce'] - (int) ($result['used_workers'][$id] ?? 0));
        // Read-only projections for territorial overlays. No independent allocation is written.
        foreach ($result['resources'] as $key => $r) foreach ($r['attempts'] as $attempt) {
            $id = $attempt['territory']; $t = $result['state']['territories'][$id];
            $facilities[] = ['territory_id' => (int) $id, 'resource_key' => $key, 'owner_kind' => $attempt['owner'],
                'production' => $attempt['produced'], 'capacity' => $t['capacity'][$attempt['owner']][$key],
                'allocation' => \Brick\Math\BigDecimal::of($attempt['produced'])->multipliedBy($t['workers_per_unit'][$key])->toScale(0, \Brick\Math\RoundingMode::CEILING)->toInt(),
                'productivity' => Q::calculated(1000000 / (float) $t['workers_per_unit'][$key])];
        }
        $territories = []; $activity = [];
        foreach ($result['resources'] as $key => $resource) foreach ($resource['attempts'] as $attempt) {
            $entry = &$activity[$attempt['territory']][$key][$attempt['owner']];
            $entry ??= ['production' => '0', 'constraints' => []];
            $entry['production'] = Q::add($entry['production'], $attempt['produced']);
            $entry['constraints'] = array_values(array_unique([...$entry['constraints'], ...$attempt['constraints']]));
            unset($entry);
        }
        foreach ($result['opening_territories'] as $id => $t) {
            $sectors = [];
            foreach ($cat->producers() as $key => $_) {
                $sector = ['potential' => $t['potential'][$key] ?? '0', 'owners' => []];
                foreach (['government', 'producer'] as $owner) {
                    $capacity = Q::parse($t['capacity'][$owner][$key] ?? '0');
                    $sector['owners'][$owner] = ['capacity' => $capacity,
                        'production' => $activity[$id][$key][$owner]['production'] ?? '0',
                        'development' => Q::sub($result['state']['territories'][$id]['capacity'][$owner][$key] ?? '0', $capacity),
                        'constraints' => $activity[$id][$key][$owner]['constraints'] ?? []];
                }
                $sectors[$key] = $sector;
            }
            $territories[$id] = ['workforce' => $t['workforce'], 'workers_used' => $result['used_workers'][$id] ?? 0, 'resources' => $sectors];
        }
        return ['rows' => $rows, 'territories' => $territories, 'last_resources' => $detail->resource_report,
            'facilities' => $facilities, 'pools' => $pools, 'idle_workers' => array_sum($pools),
            'edit_counter' => $cat->set['edit_counter'], 'forecast' => app(\App\Services\EconomyService::class)->forecastResult($result)];
    }
}
