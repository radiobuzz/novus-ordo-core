<?php

namespace App\Domain;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/** Experimental import boundary; gameplay still uses ordinary territories. */
readonly class GeneratedMapData {
    public function __construct(
        public array $snapshot,
        public MapData $mapData,
    ) {}

    public static function fromArray(array $data): GeneratedMapData {
        $data = Validator::make($data, [
            'format' => 'required|in:hex-beta-1',
            'generator' => 'required|in:landscape-v4',
            'settings' => 'required|array:seed,continents,land,coastComplexity,islandAbundance,lakeAbundance,polarExtent,snowline,mountains,scale,wetness',
            'settings.seed' => 'required|string|max:64',
            'settings.continents' => 'required|integer|between:2,5',
            'settings.land' => 'required|numeric|between:25,80',
            'settings.coastComplexity' => 'required|numeric|between:0,100',
            'settings.islandAbundance' => 'required|numeric|between:0,100',
            'settings.lakeAbundance' => 'required|numeric|between:0,100',
            'settings.polarExtent' => 'required|numeric|between:0,25',
            'settings.snowline' => 'required|numeric|between:800,3200',
            'settings.mountains' => 'required|numeric|between:0,100',
            'settings.scale' => 'required|numeric|between:50,180',
            'settings.wetness' => 'required|numeric|between:0,100',
            'width' => 'required|numeric|between:1,20000',
            'height' => 'required|numeric|between:1,20000',
            'offsetX' => 'required|numeric|between:0,20000',
            'offsetY' => 'required|numeric|between:0,20000',
            'cells' => 'required|array|size:11400',
            'rivers' => 'present|array|max:70000',
            'shores' => 'present|array|max:70000',
        ])->validate();

        $fail = fn () => throw ValidationException::withMessages(['map' => 'The generated map is incomplete or invalid. Generate it again.']);
        $finite = fn ($value) => (is_int($value) || is_float($value)) && is_finite((float) $value);
        $water = fn (array $cell) => in_array($cell[3], ['ocean', 'lake'], true);
        $directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        $cells = [];
        $regions = array_fill(0, MapData::WIDTH * MapData::HEIGHT, []);
        foreach ($data['cells'] as $cell) {
            if (!is_array($cell) || !array_is_list($cell) || count($cell) !== 14) $fail();
            [$q, $r, $region] = $cell;
            if (!is_int($q) || !is_int($r) || !is_int($region) || $region < 0 || $region >= 600) $fail();
            $row = intdiv($region, 30);
            $regionQ = $region % 30 - intdiv($row, 2);
            $dq = $q - (3 * $regionQ - 2 * $row);
            $dr = $r - (2 * $regionQ + 5 * $row);
            if (max(abs($dq), abs($dr), abs($dq + $dr)) > 2 || isset($cells["$q,$r"])) $fail();
            if (!in_array($cell[3], ['ocean', 'lake', 'plains', 'forest', 'hills', 'mountain', 'snow', 'tundra'], true)) $fail();
            if (!in_array($cell[4], [null, 'water', 'plains', 'hills', 'mountain'], true) || !in_array($cell[5], [null, 'none', 'tundra', 'grass', 'forest'], true)) $fail();
            if (!is_bool($cell[6]) || !is_bool($cell[7])) $fail();
            foreach ([8, 9, 10, 13] as $index) if (!$finite($cell[$index]) || abs($cell[$index]) > 100000) $fail();
            foreach ([11, 12] as $index) if (!is_string($cell[$index]) || !preg_match('/^#[0-9a-f]{6}$/i', $cell[$index])) $fail();
            $cells["$q,$r"] = $cell;
            $regions[$region]["$q,$r"] = $cell;
        }
        foreach ($regions as $regionCells) if (count($regionCells) !== 19) $fail();
        foreach (['rivers', 'shores'] as $field) foreach ($data[$field] as $segment) {
            if (!is_array($segment) || !array_is_list($segment) || count($segment) !== 5) $fail();
            foreach ($segment as $value) if (!$finite($value) || abs($value) > 100000) $fail();
        }

        // One connected land component represents each regional army position.
        // Detached islands still contribute land and remain part of the region.
        $mainLand = [];
        foreach ($regions as $index => $regionCells) {
            $remaining = array_filter($regionCells, fn ($cell) => !$water($cell));
            $largest = [];
            while ($remaining) {
                $key = array_key_first($remaining);
                $component = [$key => $remaining[$key]];
                $queue = [$remaining[$key]];
                unset($remaining[$key]);
                for ($cursor = 0; $cursor < count($queue); $cursor++) {
                    foreach ($directions as [$dq, $dr]) {
                        $next = ($queue[$cursor][0] + $dq) . ',' . ($queue[$cursor][1] + $dr);
                        if (!isset($remaining[$next])) continue;
                        $component[$next] = $remaining[$next];
                        $queue[] = $remaining[$next];
                        unset($remaining[$next]);
                    }
                }
                if (count($component) > count($largest)) $largest = $component;
            }
            $mainLand[$index] = $largest;
        }

        $territories = [];
        foreach ($regions as $index => $regionCells) {
            $types = [];
            $dryCount = 0;
            $connections = [];
            $hasSeaAccess = false;
            foreach ($regionCells as $key => $cell) {
                if (!$water($cell)) {
                    $dryCount++;
                    $type = $cell[4] === 'mountain' ? TerrainType::Mountain
                        : (in_array($cell[3], ['snow', 'tundra'], true) ? TerrainType::Tundra
                        : ($cell[5] === 'forest' ? TerrainType::Forest : TerrainType::Plain));
                    $types[$type->value] = ($types[$type->value] ?? 0) + 1;
                }
                foreach ($directions as [$dq, $dr]) {
                    $nextKey = ($cell[0] + $dq) . ',' . ($cell[1] + $dr);
                    $next = $cells[$nextKey] ?? null;
                    if ($next === null) continue;
                    if (!$water($cell) && $next[3] === 'ocean') $hasSeaAccess = true;
                    if ($next[2] === $index) continue;
                    $connections[$next[2]] = ($connections[$next[2]] ?? false)
                        || (isset($mainLand[$index][$key]) && isset($mainLand[$next[2]][$nextKey]));
                }
            }
            arsort($types);
            $territories[] = new TerritoryData(
                x: $index % 30,
                y: intdiv($index, 30),
                terrainType: $dryCount ? TerrainType::from(array_key_first($types)) : TerrainType::Water,
                usableLandRatio: round($dryCount / 19, 2),
                hasSeaAccess: $hasSeaAccess,
                connections: array_map(fn ($neighbor, $land) => new TerritoryConnectionData(
                    x: $neighbor % 30, y: intdiv($neighbor, 30), isConnectedByLand: $land,
                ), array_keys($connections), array_values($connections)),
            );
        }
        if (!array_filter($territories, fn ($territory) => $territory->terrainType !== TerrainType::Water)) $fail();
        $remaining = array_fill_keys(array_keys(array_filter($territories,
            fn ($territory) => $territory->terrainType !== TerrainType::Water && $territory->usableLandRatio >= 0.05)), true);
        $hasHomeland = false;
        while ($remaining && !$hasHomeland) {
            $queue = [array_key_first($remaining)];
            unset($remaining[$queue[0]]);
            for ($cursor = 0; $cursor < count($queue); $cursor++) {
                foreach ($territories[$queue[$cursor]]->connections as $connection) {
                    $neighbor = $connection->y * MapData::WIDTH + $connection->x;
                    if (!$connection->isConnectedByLand || !isset($remaining[$neighbor])) continue;
                    $queue[] = $neighbor;
                    unset($remaining[$neighbor]);
                }
            }
            $hasHomeland = count($queue) >= \App\Models\Game::NUMBER_OF_STARTING_TERRITORIES;
        }
        if (!$hasHomeland) throw ValidationException::withMessages(['map' => 'This map needs a connected group of five land regions for a starting homeland. Try another landscape.']);
        return new GeneratedMapData(snapshot: $data, mapData: new MapData($territories));
    }
}
