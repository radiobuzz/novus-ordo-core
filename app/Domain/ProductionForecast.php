<?php

namespace App\Domain;

/** Read-only facade around the same allocation step used by NationDetail. */
final class ProductionForecast
{
    public static function calculate(array $planning, array $pools, array $commands, array $production = []): array {
        $byResource = array_column($commands, null, 'resource_type');
        $simulate = function (bool $preserve) use ($planning, $pools, $commands, $byResource, $production) {
            $demand = []; $reserved = 0;
            foreach ($planning['resources'] as $resource => $meta) {
                $demand[$resource] = !$meta['produced_by_labor'] ? 0
                    : ($preserve && ($byResource[$resource]['max_quantity'] ?? 0) > 0
                        ? $meta['upkeep'] : max(0, $meta['upkeep'] + $meta['expenses'] - $meta['stock']));
                if ($meta['reserve_labor']) $reserved += $demand[$resource];
            }
            $queue = $planning['bid_order'];
            $add = function ($resource, $upkeep, $priority) use (&$queue) {
                foreach ($queue as $bid) if ($bid['resource_type'] === $resource && $bid['upkeep'] === $upkeep) return;
                $queue[] = ['resource_type' => $resource, 'upkeep' => $upkeep, 'priority' => $priority];
            };
            foreach ($commands as $bid) $add($bid['resource_type'], false, $planning['command_priority']);
            foreach ($demand as $resource => $quantity) if ($quantity > 0) $add($resource, true, $planning['resources'][$resource]['upkeep_priority']);
            $add('Capital', false, $planning['capital_priority']);
            $bids = array_map(fn ($bid) => [
                'resource' => $bid['resource_type'], 'priority' => $bid['priority'], 'upkeep' => $bid['upkeep'],
                'quantity' => $bid['upkeep'] ? $demand[$bid['resource_type']]
                    : ($bid['resource_type'] === 'Capital' ? ProductionBidConstants::MAX_QUANTITY_LIMIT : ($byResource[$bid['resource_type']]['max_quantity'] ?? 0)),
                'max_labor' => $bid['upkeep'] || $bid['resource_type'] === 'Capital'
                    ? ProductionBidConstants::MAX_LABOR_PER_UNIT_LIMIT : ($byResource[$bid['resource_type']]['max_labor_allocation_per_unit'] ?? 0),
            ], $queue);
            $facilities = [];
            foreach ($planning['facilities'] as $id => $f) $facilities[] = [
                'id' => $id, 'pool' => $f['territory_id'], 'resource' => $f['resource_type'],
                'capacity' => $f['capacity'], 'productivity' => $f['productivity'],
            ];
            $allocations = ProductionAllocation::allocate($pools, $facilities, $bids, $reserved);
            $output = array_fill_keys(array_keys($planning['resources']), 0);
            foreach ($facilities as $f) $output[$f['resource']] += $allocations[$f['id']] * $f['productivity'];
            $rows = [];
            foreach ($planning['resources'] as $resource => $meta) {
                $amount = $meta['produced_by_labor'] ? floor($output[$resource]) : ($production[$resource] ?? 0);
                $balance = $amount - $meta['upkeep'] - $meta['expenses'];
                $rows[$resource] = ['production' => $amount, 'balance' => $balance, 'closing' => $meta['stock'] + $balance];
            }
            return $rows;
        };
        $rows = $simulate(true);
        return $rows['Capital']['closing'] < 0 ? $simulate(false) : $rows;
    }
}
