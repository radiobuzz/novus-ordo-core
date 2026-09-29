<?php

namespace App\Models;

use App\Domain\GeneratedMapData;
use Illuminate\Database\Eloquent\Model;

/** Named immutable maps, independent of games. Saving again creates a new version. */
class MapDraft extends Model
{
    public function getSnapshot(): array {
        return MapDefinition::findOrFail($this->map_definition_id)->getSnapshot();
    }

    public function exportSummary(): array {
        return ['id' => $this->getKey(), 'name' => $this->name, 'seed' => $this->seed,
            'fingerprint' => $this->fingerprint, 'created_at' => $this->created_at->toIso8601String()];
    }

    public static function store(string $name, GeneratedMapData $data): MapDraft {
        $draft = new MapDraft();
        $draft->name = $name;
        $draft->seed = $data->snapshot['settings']['seed'];
        $definition = MapDefinition::store($data);
        $draft->map_definition_id = $definition->id;
        $draft->fingerprint = $definition->fingerprint;
        $draft->save();
        return $draft;
    }
}
