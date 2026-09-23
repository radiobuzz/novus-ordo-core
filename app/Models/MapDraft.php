<?php

namespace App\Models;

use App\Domain\GeneratedMapData;
use Illuminate\Database\Eloquent\Model;

/** Named immutable maps, independent of games. Saving again creates a new version. */
class MapDraft extends Model
{
    public function getSnapshot(): array {
        return json_decode($this->snapshot, true, flags: JSON_THROW_ON_ERROR);
    }

    public function exportSummary(): array {
        return ['id' => $this->getKey(), 'name' => $this->name, 'seed' => $this->seed,
            'fingerprint' => $this->fingerprint, 'created_at' => $this->created_at->toIso8601String()];
    }

    public static function store(string $name, GeneratedMapData $data): MapDraft {
        $draft = new MapDraft();
        $draft->name = $name;
        $draft->seed = $data->snapshot['settings']['seed'];
        $draft->snapshot = json_encode($data->snapshot, JSON_THROW_ON_ERROR);
        $draft->fingerprint = hash('sha256', $draft->snapshot);
        $draft->save();
        return $draft;
    }
}
