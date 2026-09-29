<?php

namespace App\Models;

use App\ReadModels\LaborPoolInfo;
use App\Utils\GuardsForAssertions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

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

    public static function exportAllForOwner(NationDetail $detail, array $free = []): array {
        return self::where('nation_id', $detail->nation_id)->where('turn_id', $detail->turn_id)->orderBy('territory_id')->get()
            ->map(fn ($row) => new LaborPoolInfo($row->id, $row->nation_id, $row->territory_id, $row->size, $free[$row->territory_id] ?? $row->size))->all();
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

        return $pool;
    }
}
