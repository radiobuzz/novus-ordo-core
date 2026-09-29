<?php

namespace App\Services\Resources;

use App\Models\Game;
use App\Services\GameMutation;
use App\Domain\{DivisionType, TerrainType};
use App\Domain\Resources\Quantity as Q;
use Illuminate\Support\Facades\DB;
/** Loaded on the game model, never a process-global current-game catalogue. */
final class ResourceCatalogue
{
    public function __construct(public readonly array $set, public readonly array $resources, public readonly array $units)
    {
    }
    public static function forGame(Game $game): self
    {
        if ($game->relationLoaded('resourceCatalogue')) {
            return $game->getRelation('resourceCatalogue');
        }
        $set = DB::table('resource_sets')->where('game_id', $game->id)->first();
        if (!$set) {
            throw new \LogicException('This build requires a fresh game with resource definitions.');
        }
        $catalogue = self::load($set->id);
        $game->setRelation('resourceCatalogue', $catalogue);
        return $catalogue;
    }
    public static function load(int $id): self
    {
        $set = DB::table('resource_sets')->find($id);
        abort_unless($set, 404, 'Resource set not found.');
        $rows = DB::table('resource_definitions')->where('resource_set_id', $id)->orderBy('sort_order')->orderBy('key')->get();
        $rules = DB::table('resource_rules')->whereIn('resource_id', $rows->pluck('id'))->get()->groupBy('resource_id');
        $resources = [];
        foreach ($rows as $row) {
            $r = (array) $row;
            foreach (['labels', 'descriptions', 'unit_labels'] as $f) {
                $r[$f] = json_decode($r[$f], true);
            }
            $r['grantable'] = (bool) $r['grantable'];
            $r['rules'] = [];
            foreach ($rules[$row->id] ?? [] as $rule) {
                $r['rules'][$rule->handler] = json_decode($rule->parameters, true);
            }
            $resources[$row->key] = $r;
        }
        $byId = $rows->pluck('key', 'id');
        $units = [];
        foreach (DivisionType::cases() as $type) {
            $units[$type->name] = array_fill_keys(['deployment', 'season', 'operation', 'active_capacity'], []);
        }
        foreach (DB::table('unit_resource_costs')->whereIn('resource_id', $rows->pluck('id'))->get() as $cost) {
            $units[$cost->division_type][$cost->phase][$byId[$cost->resource_id]] = $cost->quantity;
        }
        return new self((array) $set, $resources, $units);
    }
    public function get(string $key): array
    {
        return $this->resources[$key] ?? throw \Illuminate\Validation\ValidationException::withMessages(['resource_key' => 'Unknown resource in this game.']);
    }
    public function role(string $role): string
    {
        foreach ($this->resources as $key => $r) {
            if ($r['role'] === $role) {
                return $key;
            }
        }
        throw new \LogicException('Missing role ' . $role);
    }
    public function key(int $id): string
    {
        foreach ($this->resources as $key => $r) {
            if ($r['id'] === $id) {
                return $key;
            }
        }
        throw new \LogicException('Foreign resource reference.');
    }
    public function zero(): array
    {
        return array_fill_keys(array_keys($this->resources), '0.000000');
    }
    public function producers(): array
    {
        return array_filter($this->resources, fn($r) => isset($r['rules']['production.territorial_labor']));
    }
    public function costs(string $phase, DivisionType ...$types): array
    {
        $costs = $this->zero();
        foreach ($types as $type) {
            foreach ($this->units[$type->name][$phase] as $key => $q) {
                $costs[$key] = Q::add($costs[$key], $q);
            }
        }
        return $costs;
    }
    public function deploymentCosts(DivisionType ...$types): array
    {
        $costs = $this->costs('deployment', ...$types);
        foreach ($this->costs('active_capacity', ...$types) as $k => $v) {
            $costs[$k] = Q::add($costs[$k], $v);
        }
        return $costs;
    }
    public function territorialPotential(array $geography, TerrainType $terrain, int $workers = 1000000, bool $output = false): array
    {
        $out = $this->zero();
        foreach ($this->producers() as $key => $r) {
            $f = \App\Domain\Resources\GeographicProduction::facility($r['rules']['production.territorial_labor'], $key, $geography, $terrain->name, $workers);
            $out[$key] = $output ? \App\Domain\Resources\Quantity::output($f['capacity'], $f['productivity']) : $f['productivity'];
        }
        return $out;
    }
    /** Public identity and units for map filtering; no stockpiles, costs or private plans. */
    public function mapDefinitions(): array
    {
        return array_values(array_map(fn ($r) => [
            'resource_key' => $r['key'], 'kind' => $r['kind'], 'labels' => $r['labels'],
            'unit_labels' => $r['unit_labels'],
            'can_produce' => isset($r['rules']['production.territorial_labor']),
        ], $this->resources));
    }

    public function export(): array
    {
        return ['id' => $this->set['id'], 'edit_counter' => $this->set['edit_counter'], 'roles' => array_combine(['treasury', 'nutrition', 'recruitment'], array_map($this->role(...), ['treasury', 'nutrition', 'recruitment'])), 'resources' => array_values(array_map(fn($r) => ['resource_key' => $r['key'], 'kind' => $r['kind'], 'role' => $r['role'], 'labels' => $r['labels'], 'description' => $r['labels']['en'], 'unit_labels' => $r['unit_labels'], 'icon_key' => $r['icon_key'], 'display_decimals' => $r['display_decimals'], 'can_be_stocked' => $r['kind'] !== 'capacity', 'grantable' => $r['grantable'], 'can_produce' => isset($r['rules']['production.territorial_labor']), 'base_production_by_terrain_type' => $r['rules']['production.territorial_labor']['yields'] ?? []], $this->resources))];
    }
    public function document(): array
    {
        return ['name' => $this->set['name'], 'description' => $this->set['description'], 'resources' => array_values(array_map(function ($r) {
            return array_intersect_key($r, array_flip(['key', 'kind', 'role', 'labels', 'descriptions', 'unit_labels', 'icon_key', 'sort_order', 'display_decimals', 'starting_quantity', 'grantable', 'rules']));
        }, $this->resources)), 'units' => $this->units];
    }
    public static function createTemplate(array $document): self
    {
        return self::write($document);
    }
    private static function write(array $document, ?Game $game = null, ?int $source = null): self
    {
        $document = app(ResourceRuleRegistry::class)->validate($document);
        return DB::transaction(function () use ($document, $game, $source) {
            $id = DB::table('resource_sets')->insertGetId(['kind' => $game ? 'game' : 'template', 'game_id' => $game?->id, 'source_resource_set_id' => $source, 'name' => $document['name'], 'description' => $document['description'] ?? '', 'created_at' => now(), 'updated_at' => now()]);
            self::writeRows($id, $document);
            return self::load($id);
        });
    }
    private static function writeRows(int $id, array $document): void
    {
        $ids = [];
        foreach ($document['resources'] as $r) {
            $fields = array_intersect_key($r, array_flip(['key', 'kind', 'role', 'labels', 'descriptions', 'unit_labels', 'icon_key', 'sort_order', 'display_decimals', 'starting_quantity', 'grantable']));
            foreach (['labels', 'descriptions', 'unit_labels'] as $f) {
                $fields[$f] = json_encode($fields[$f], JSON_THROW_ON_ERROR);
            }
            DB::table('resource_definitions')->updateOrInsert(['resource_set_id' => $id, 'key' => $r['key']], [...$fields, 'updated_at' => now()]);
            $rid = DB::table('resource_definitions')->where('resource_set_id', $id)->where('key', $r['key'])->value('id');
            $ids[$r['key']] = $rid;
            foreach ($r['rules'] as $handler => $params) {
                DB::table('resource_rules')->updateOrInsert(['resource_id' => $rid, 'handler' => $handler], ['parameters' => json_encode($params, JSON_THROW_ON_ERROR), 'updated_at' => now()]);
            }
        }
        DB::table('unit_resource_costs')->whereIn('resource_id', $ids)->delete();
        foreach ($document['units'] as $type => $phases) {
            foreach ($phases as $phase => $costs) {
                foreach ($costs as $key => $q) {
                    DB::table('unit_resource_costs')->insert(['resource_id' => $ids[$key], 'division_type' => $type, 'phase' => $phase, 'quantity' => $q, 'created_at' => now(), 'updated_at' => now()]);
                }
            }
        }
    }
    public static function initialize(Game $game, ?int $templateId = null): self
    {
        if ($templateId === null) {
            $doc = json_decode(file_get_contents(database_path('resource-templates/foundation.json')), true, flags: JSON_THROW_ON_ERROR);
            $templateId = DB::table('resource_sets')->where('kind', 'template')->where('name', $doc['name'])->value('id') ?? self::createTemplate($doc)->set['id'];
        }
        $template = self::load($templateId);
        abort_unless($template->set['kind'] === 'template', 422, 'Choose a resource template.');
        $result = self::write($template->document(), $game, $templateId);
        $game->setRelation('resourceCatalogue', $result);
        return $result;
    }
    public static function deleteGameDefinitions(Game $game): void
    {
        if (!GameMutation::holds($game)) {
            throw new \LogicException('Resource deletion requires the game lock.');
        }
        foreach (['territory_production_states', 'nation_resource_acquisitions', 'nation_economic_accounts', 'nation_resource_stockpiles'] as $table) {
            DB::table($table)->where('game_id', $game->id)->delete();
        }
        // Offers belong to this game through their relation; delete before restrictive resource FKs.
        DB::table('nation_offers')->whereIn('relation_id', DB::table('nation_relations')->where('game_id', $game->id)->select('id'))->delete();
        DB::table('resource_sets')->where('game_id', $game->id)->delete();
    }
    public static function edit(int $id, int $counter, array $document): self
    {
        $next = app(ResourceRuleRegistry::class)->validate($document);
        $old = self::load($id);
        $work = function () use ($id, $counter, $next, $old) {
            $set = DB::table('resource_sets')->where('id', $id)->lockForUpdate()->first();
            abort_unless($set->edit_counter === $counter, 409, 'Resource definitions changed.');
            // Structural edits use a new template/game; no state conversion or dangling rule references.
            $shape = function ($doc) {
                $rows = [];
                foreach ($doc['resources'] as $r) {
                    $rules = array_keys($r['rules']);
                    sort($rules);
                    $rows[$r['key']] = [$r['kind'], $r['role'], $rules];
                }
                ksort($rows);
                return $rows;
            };
            if ($set->game_id && $shape($old->document()) !== $shape($next)) {
                ResourceRuleRegistry::fail('Create a new template for structural changes. Existing definitions support numeric and label edits.');
            }
            if (!$set->game_id) {
                DB::table('resource_definitions')->where('resource_set_id', $id)->delete();
            }
            self::writeRows($id, $next);
            DB::table('resource_sets')->where('id', $id)->update(['name' => $next['name'], 'description' => $next['description'] ?? '', 'edit_counter' => $counter + 1, 'updated_at' => now()]);
            return self::load($id);
        };
        if (!$old->set['game_id']) {
            return DB::transaction($work);
        }
        $game = Game::findOrFail($old->set['game_id']);
        abort_unless($game->policy_testing_enabled, 403, 'Enable test definition editing first.');
        return app(GameMutation::class)->run($game, $work);
    }
}
