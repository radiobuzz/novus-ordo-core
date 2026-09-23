<?php

namespace App\Domain;

/** Pure allocation step shared by actual production and read-only forecasting. Raw units. */
final class ProductionAllocation
{
    public static function allocate(array $pools, array $facilities, array $bids, int $reserved): array {
        $remaining = array_column($facilities, 'capacity', 'id');
        $allocations = array_fill_keys(array_keys($remaining), 0);
        $usable = max(0, array_sum($pools) - $reserved);
        // PHP's stable sort retains existing bid/facility order for ties.
        usort($bids, fn ($a, $b) => $a['priority'] <=> $b['priority']);
        usort($facilities, fn ($a, $b) => $b['productivity'] <=> $a['productivity']);
        foreach ($bids as $bid) {
            if (!$bid['upkeep'] && $usable < 1) continue;
            $pending = $bid['quantity'];
            foreach ($facilities as $facility) {
                if ($facility['resource'] !== $bid['resource']) continue;
                if ($pending < 0) break;
                $productivity = $facility['productivity'];
                if ($productivity <= 0 || $bid['max_labor'] < LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION / $productivity) break;
                $pool = $facility['pool']; $id = $facility['id'];
                $usage = min(ceil($pending / $productivity), $pools[$pool], $remaining[$id]);
                if (!$bid['upkeep']) $usage = min($usage, $usable);
                $usable -= $usage;
                if ($usage <= 0) continue;
                $pools[$pool] -= $usage;
                $remaining[$id] -= $usage;
                $pending -= min($pending, floor($usage * $productivity));
                $allocations[$id] += (int) $usage;
            }
        }
        return $allocations;
    }
}
