<?php
namespace App\Models;

use App\Domain\GeneratedMapData;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/** Immutable sampled geography shared by library references and games, never turn copies. */
class MapDefinition extends Model
{
    public static function store(GeneratedMapData $data): self {
        $snapshot = $data->snapshot;
        $canonical = function ($value) use (&$canonical) {
            if (!is_array($value)) return $value;
            if (!array_is_list($value)) ksort($value);
            return array_map($canonical, $value);
        };
        $fingerprint = hash('sha256', json_encode($canonical($snapshot), JSON_THROW_ON_ERROR));
        return DB::transaction(function () use ($snapshot, $fingerprint) {
            $existing = self::where('fingerprint', $fingerprint)->first();
            if ($existing) return $existing;
            $definition = new self();
            $definition->fingerprint = $fingerprint;
            $definition->region_columns = $snapshot['regionColumns'];
            $definition->region_rows = $snapshot['regionRows'];
            $definition->cells_per_region = $snapshot['cellCount'];
            $features = $snapshot['features']; $profiles = $snapshot['resourceProfiles'];
            unset($snapshot['features'], $snapshot['resourceProfiles']);
            $definition->geography = json_encode($snapshot, JSON_THROW_ON_ERROR);
            $definition->save();
            foreach (array_chunk($features, 200) as $chunk) DB::table('map_features')->insert(array_map(function ($f) use ($definition) {
                $row = ['map_definition_id' => $definition->id, 'feature_key' => $f['id'], 'type' => $f['type'], 'name' => $f['name']];
                unset($f['id'], $f['type'], $f['name']);
                return [...$row, 'geometry' => json_encode($f, JSON_THROW_ON_ERROR)];
            }, $chunk));
            foreach ($profiles as $profile) {
                $key = $profile['key']; unset($profile['key']);
                DB::table('map_resource_profiles')->insert(['map_definition_id' => $definition->id, 'resource_key' => $key, 'profile' => json_encode($profile, JSON_THROW_ON_ERROR)]);
            }
            return $definition;
        });
    }
    public function getSnapshot(): array {
        $snapshot = json_decode($this->geography, true, flags: JSON_THROW_ON_ERROR);
        $snapshot['features'] = DB::table('map_features')->where('map_definition_id', $this->id)->orderBy('id')->get()->map(fn ($f) => [
            'id' => $f->feature_key, 'type' => $f->type, 'name' => $f->name, ...json_decode($f->geometry, true, flags: JSON_THROW_ON_ERROR),
        ])->all();
        $snapshot['resourceProfiles'] = DB::table('map_resource_profiles')->where('map_definition_id', $this->id)->orderBy('id')->get()->map(fn ($p) => [
            'key' => $p->resource_key, ...json_decode($p->profile, true, flags: JSON_THROW_ON_ERROR),
        ])->all();
        return $snapshot;
    }
}
