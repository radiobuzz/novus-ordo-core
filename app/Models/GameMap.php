<?php

namespace App\Models;

use App\Domain\GeneratedMapData;
use Illuminate\Database\Eloquent\Model;

class GameMap extends Model
{
    public function getSnapshot(): array {
        return json_decode($this->snapshot, true, flags: JSON_THROW_ON_ERROR);
    }

    public function getFingerprint(): string {
        return $this->fingerprint;
    }

    public static function create(Game $game, GeneratedMapData $mapData): GameMap {
        $map = new GameMap();
        $map->game_id = $game->getId();
        $map->snapshot = json_encode($mapData->snapshot, JSON_THROW_ON_ERROR);
        $map->fingerprint = hash('sha256', $map->snapshot);
        $map->save();
        return $map;
    }
}
