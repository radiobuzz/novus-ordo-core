<?php

namespace App\Models;

use App\Domain\GeneratedMapData;
use Illuminate\Database\Eloquent\Model;

class GameMap extends Model
{
    public function getSnapshot(): array {
        return MapDefinition::findOrFail($this->map_definition_id)->getSnapshot();
    }

    public function getFingerprint(): string {
        return $this->fingerprint;
    }

    public static function create(Game $game, GeneratedMapData $mapData): GameMap {
        $map = new GameMap();
        $map->game_id = $game->getId();
        $definition = MapDefinition::store($mapData);
        $map->map_definition_id = $definition->id;
        $map->fingerprint = $definition->fingerprint;
        $map->save();
        return $map;
    }
}
