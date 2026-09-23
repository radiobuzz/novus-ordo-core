<?php

namespace App\Models;

use App\Domain\ResourceType;
use App\Domain\TerrainType;
use App\ReadModels\LaborPoolInfo;
use App\Utils\GuardsForAssertions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class LaborPool extends Model
{
    use GuardsForAssertions;

    public function getId(): int {
        return $this->getKey();
    }

    public static function getLaborPools(NationDetail $detail): Collection {
        return LaborPool::where('nation_id', $detail->getNationId())
            ->where('turn_id', $detail->getTurnId())
            ->get();
    }

    public static function exportAllForOwner(NationDetail $detail): array {
        $turn = $detail->getTurn();
        return DB::table('labor_pools')
            ->where('labor_pools.nation_id', $detail->getNationId())
            ->where('labor_pools.turn_id', $turn->getId())
            // ->leftJoin('labor_pool_allocations', 'labor_pool_allocations.labor_pool_id', '=', 'labor_pools.id')
            // ->selectRaw('labor_pools.id, labor_pools.nation_id, labor_pools.turn_id, labor_pools.territory_id, labor_pools.size, labor_pools.size - sum(labor_pool_allocations.allocation) as free_labor')
            ->select([
                'labor_pools.id',
                'labor_pools.nation_id',
                'labor_pools.turn_id',
                'labor_pools.territory_id',
                'labor_pools.size',
                DB::raw('labor_pools.size - COALESCE((SELECT SUM(labor_pool_allocations.allocation) FROM labor_pool_allocations WHERE labor_pool_allocations.labor_pool_id = labor_pools.id AND labor_pool_allocations.resource_type != ' . ResourceType::Capital->value . '), 0) as free_labor')
            ])
            ->groupBy(
                'labor_pools.id',
                'labor_pools.nation_id',
                'labor_pools.turn_id',
                'labor_pools.territory_id',
                'labor_pools.size',
            )
            ->get()
            ->map(fn (object $row) => LaborPoolInfo::fromObject($row, [
                'labor_pool_id' => $row->id,
                'free_labor' => $row->free_labor ?? 0,
            ]))
            ->all();
    }

    public static function getLaborPool(NationDetail $nationDetail, TerritoryDetail $territoryDetail): ?LaborPool {
        return LaborPool::where('nation_id', $nationDetail->getNationId())
            ->where('turn_id', $nationDetail->getTurnId())
            ->where('territory_id', $territoryDetail->getTerritoryId())
            ->first();
    }

    public function getTerritoryId(): int {
        return $this->territory_id;
    }

    public function getGameId(): int {
        return $this->game_id;
    }

    public function getNationId(): int {
        return $this->nation_id;
    }
    
    public function getTurnId(): int {
        return $this->turn_id;
    }

    public function getSize(): int {
        return $this->size;
    }

    public static function create(TerritoryDetail $detail, int $size): LaborPool {
        $pool = new LaborPool();
        $pool->game_id = $detail->getGameId();
        $pool->nation_id = $detail->getOwnerNationId();
        $pool->territory_id = $detail->getTerritoryId();
        $pool->turn_id = $detail->getTurnId();
        $pool->size = $size;

        $pool->save();

        $productionsByResource = TerrainType::getResourceProductionByResource($detail->getTerritory()->getTerrainType());

        foreach (ResourceType::cases() as $resourceType) {
            LaborPoolFacility::create($pool, $resourceType, $size, round($productionsByResource[$resourceType->value] * 100));
        }

        return $pool;
    }
}
