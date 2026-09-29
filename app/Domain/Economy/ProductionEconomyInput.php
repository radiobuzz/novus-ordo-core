<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use DomainException;

/** Pure Package B row adapter. Querying, authorization and persistence belong to the turn service. */
final class ProductionEconomyInput
{
    public static function fromSnapshots(array $resources, array $snapshot, array $territories, int $nationId, array $fiscal = []): array
    {
        $ids = [];
        foreach ($resources as $key => $resource) $ids[$resource['id']] = $key;
        $state = ['accounts' => [], 'inventories' => [], 'territories' => [], 'fiscal' => $fiscal];
        foreach ($snapshot['nation_resource_stockpiles'] as $row) {
            if ($row['nation_id'] !== $nationId) continue;
            $key = $ids[$row['resource_id']] ?? throw new DomainException('Foreign resource in production snapshot.');
            $resource = $resources[$key];
            if ($resource['kind'] === 'currency' && $resource['role'] === 'treasury' && $row['owner_kind'] === 'government') {
                $state['accounts']['government'] = ['kind' => 'government', 'cash' => $row['available_quantity'], 'tax_rate' => '0'];
            } elseif ($resource['kind'] === 'stock') {
                $state['inventories'][$row['owner_kind']][$key] = ['quantity' => $row['available_quantity'], 'cost' => $row['cost_basis']];
            } else throw new DomainException('Only government currency or owned stocks may be stored.');
        }
        foreach ($snapshot['nation_economic_accounts'] as $row) {
            if ($row['nation_id'] !== $nationId) continue;
            $kind = $row['account_kind'];
            if (!in_array($kind, ['household', 'producer'], true)) throw new DomainException('Invalid civilian account.');
            $state['accounts'][$kind] = ['kind' => $kind, 'cash' => $row['cash'], 'treasury' => 'government'];
        }
        foreach (['government', 'producer', 'household'] as $owner) if (!isset($state['accounts'][$owner])) throw new DomainException('Missing founding account: ' . $owner);
        foreach ($territories as $territory) {
            if ($territory['owner_nation_id'] !== $nationId) continue;
            $economy = $territory['economy_state'];
            unset($economy['background_capacity']);
            $state['territories'][(string) $territory['territory_id']] = [
                'government' => 'government', 'population' => $territory['population_size'], 'workforce' => Q::parse($territory['workers']),
                'geography' => $territory['geography'], 'terrain' => $territory['terrain'], 'economy' => array_map(fn ($v) => is_float($v) ? Q::calculated($v) : Q::parse($v), $economy), 'capacity' => [],
            ];
        }
        foreach ($territories as $territory) {
            if (isset($state['territories'][$territory['territory_id']], $territory['economy_state']['background_capacity']))
                $state['territories'][$territory['territory_id']]['background_capacity'] = $territory['economy_state']['background_capacity'];
        }
        foreach ($snapshot['territory_production_states'] as $row) {
            if (!isset($state['territories'][$row['territory_id']])) continue;
            $key = $ids[$row['resource_id']] ?? throw new DomainException('Foreign capacity definition.');
            $state['territories'][$row['territory_id']]['capacity'][$row['owner_kind']][$key] = $row['installed_capacity'];
        }
        $acquisitions = [];
        foreach ($snapshot['nation_resource_acquisitions'] as $row) {
            if ($row['nation_id'] !== $nationId) continue;
            $key = $ids[$row['resource_id']] ?? throw new DomainException('Foreign acquisition definition.');
            $acquisitions[$key] = ['quantity' => $row['requested_quantity'], 'spending_limit' => $row['spending_limit'], 'priority' => $row['priority']];
        }
        // A funded external lender/debt ledger is supplied explicitly by the fiscal adapter.
        return ['state' => $state, 'acquisitions' => $acquisitions];
    }
}
