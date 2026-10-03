<?php
declare(strict_types=1);
namespace App\Domain\Economy;

use DomainException;

/** Seasonal row adapter. Authorization, queries and writes remain in the game service. */
final class ProductionEconomyInput
{
    public static function fromSnapshots(array $resources, array $snapshot, array $territories, int $nationId, array $national): array
    {
        $ids = array_column($resources, 'key', 'id');
        $state = ['stocks'=>[], 'territories'=>[], 'debt'=>$national['debt'], 'fiscal'=>$national['fiscal']];
        foreach ($snapshot['nation_resource_stockpiles'] as $row) {
            if ((int)$row['nation_id'] !== $nationId) continue;
            $key = $ids[$row['resource_id']] ?? throw new DomainException('Foreign stock resource.');
            $r = $resources[$key];
            if ($r['role'] === 'treasury') $state['treasury'] = $row['available_quantity'];
            elseif ($r['kind'] === 'stock') $state['stocks'][$key] = $row['available_quantity'];
            else throw new DomainException('Only treasury and goods can be stored.');
        }
        if (!isset($state['treasury'])) throw new DomainException('Missing national treasury.');
        foreach ($territories as $t) {
            if ((int)$t['owner_nation_id'] !== $nationId) continue;
            $state['territories'][(string)$t['territory_id']] = ['population'=>$t['population_size'], 'workforce'=>(string)$t['workers'],
                'economy'=>IndicatorRules::state($t['economy_state']), 'terrain'=>$t['terrain'], 'geography'=>$t['geography'], 'capacity'=>[]];
        }
        foreach ($snapshot['territory_production_states'] as $row) {
            if (!isset($state['territories'][$row['territory_id']])) continue;
            $key = $ids[$row['resource_id']] ?? throw new DomainException('Foreign installed capacity.');
            $state['territories'][$row['territory_id']]['capacity'][$key] = $row['installed_capacity'];
        }
        $plans = [];
        foreach ($snapshot['nation_resource_acquisitions'] as $row) {
            if ((int)$row['nation_id'] !== $nationId) continue;
            $key = $ids[$row['resource_id']] ?? throw new DomainException('Foreign acquisition resource.');
            $plans[$key] = ['quantity'=>$row['requested_quantity'], 'spending_limit'=>$row['spending_limit'], 'priority'=>(int)$row['priority']];
        }
        return ['state'=>$state,'acquisitions'=>$plans];
    }
}
