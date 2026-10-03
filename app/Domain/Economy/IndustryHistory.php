<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;

/** Recorded observations only; never changes prices, spending or production. */
final class IndustryHistory
{
    public static function summarize(array $opening, array $result, array $rows, array $subsistence): array
    {
        $out = [];
        foreach ($rows as $key => $row) {
            $owners = [];
            foreach (['government', 'producer'] as $owner) {
                $owners[$owner] = array_fill_keys(['opening_capacity', 'closing_capacity', 'usable_capacity', 'sales', 'sold_cost', 'maintenance_cost', 'investment'], '0.000000');
                foreach ($opening['territories'] as $t) {
                    $cap = Q::parse($t['capacity'][$owner][$key] ?? '0');
                    $owners[$owner]['opening_capacity'] = Q::add($owners[$owner]['opening_capacity'], $cap);
                    $owners[$owner]['usable_capacity'] = Q::add($owners[$owner]['usable_capacity'], Q::mul($cap, $t['productive_condition'][$owner][$key] ?? '1'));
                }
                foreach ($result['state']['territories'] as $t) $owners[$owner]['closing_capacity'] = Q::add($owners[$owner]['closing_capacity'], $t['capacity'][$owner][$key] ?? '0');
            }
            foreach ($result['events'] as $e) {
                if (($e['resource'] ?? null) !== $key) continue;
                $owner = $e['seller'] ?? $e['owner'] ?? null;
                if (!isset($owners[$owner])) continue;
                if ($e['type'] === 'sale') {
                    $owners[$owner]['sales'] = Q::add($owners[$owner]['sales'], $e['revenue']);
                    $owners[$owner]['sold_cost'] = Q::add($owners[$owner]['sold_cost'], $e['cost']);
                }
                if ($e['type'] === 'maintenance') $owners[$owner]['maintenance_cost'] = Q::add($owners[$owner]['maintenance_cost'], $e['cost']);
                if (in_array($e['type'], ['investment', 'rebuilding'], true)) $owners[$owner]['investment'] = Q::add($owners[$owner]['investment'], $e['cost']);
            }
            foreach ($owners as &$o) {
                $o['recognized_cost'] = Q::add($o['sold_cost'], $o['maintenance_cost']);
                $o['operating_result'] = Q::sub($o['sales'], $o['recognized_cost']);
            } unset($o);
            $out[$key] = ['owners' => $owners, 'subsistence' => $subsistence[$key] ?? '0.000000'];
        }
        return $out;
    }
}
