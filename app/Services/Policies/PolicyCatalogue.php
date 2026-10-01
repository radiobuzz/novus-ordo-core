<?php

namespace App\Services\Policies;

use App\Models\Game;
use App\Services\GameMutation;
use App\Services\Resources\ResourceCatalogue;
use Illuminate\Support\Facades\DB;

/** Relational storage; JSON documents are an interchange format, never runtime inheritance. */
final class PolicyCatalogue {
    public function forGame(Game $game): ?array {
        $id = DB::table('policy_sets')->where('game_id', $game->id)->value('id');
        return $id ? $this->load($id) : null;
    }

    public function load(int $id): array {
        $set = DB::table('policy_sets')->find($id);
        abort_unless($set, 404, 'Policy set not found.');
        $rows = DB::table('policies')->where('policy_set_id', $id)->orderBy('sort_order')->orderBy('key')->get();
        $options = DB::table('policy_options')->whereIn('policy_id', $rows->pluck('id'))->orderBy('sort_order')->orderBy('key')->get();
        $parameters = DB::table('policy_parameters')->whereIn('policy_id', $rows->pluck('id'))->orderBy('sort_order')->orderBy('key')->get()->groupBy('policy_id');
        $effects = DB::table('policy_effects')->whereIn('policy_option_id', $options->pluck('id'))->orderBy('sort_order')->orderBy('key')->get()->groupBy('policy_option_id');
        $conditions = DB::table('policy_conditions')->whereIn('policy_id', $rows->pluck('id'))->orderBy('key')->get()->groupBy('policy_id');
        $policyKeys = $rows->pluck('key', 'id'); $optionKeys = $options->pluck('key', 'id');
        $ids = ['policies' => [], 'options' => []]; $policies = [];
        foreach ($rows as $row) {
            $policy = ['key' => $row->key, 'category_key' => $row->category_key, 'labels' => $this->decode($row->labels), 'descriptions' => $this->decode($row->descriptions), 'sort_order' => $row->sort_order, 'status' => $row->status, 'options' => [], 'parameters' => [], 'conditions' => []];
            $ids['policies'][$row->key] = $row->id;
            foreach ($parameters[$row->id] ?? [] as $param) {
                $policy['parameters'][] = ['key' => $param->key, 'labels' => $this->decode($param->labels), 'value_type' => $param->value_type, 'unit_key' => $param->unit_key, 'default_value' => $this->decode($param->default_value), 'min_value' => $param->min_value, 'max_value' => $param->max_value, 'step' => $param->step, 'sort_order' => $param->sort_order];
            }
            foreach ($options->where('policy_id', $row->id) as $option) {
                $ids['options'][$row->key][$option->key] = $option->id;
                $policy['options'][] = ['key' => $option->key, 'labels' => $this->decode($option->labels), 'descriptions' => $this->decode($option->descriptions), 'is_default' => (bool) $option->is_default, 'retired' => $option->retired_at !== null, 'sort_order' => $option->sort_order,
                    'effects' => collect($effects[$option->id] ?? [])->map(fn ($e) => ['key' => $e->key, 'effect_type' => $e->effect_type, 'arguments' => $this->decode($e->arguments), 'sort_order' => $e->sort_order])->all()];
            }
            foreach ($conditions[$row->id] ?? [] as $condition) {
                $policy['conditions'][] = ['key' => $condition->key, 'option' => $condition->policy_option_id ? $optionKeys[$condition->policy_option_id] : null, 'condition_type' => $condition->condition_type, 'referenced_policy' => $policyKeys[$condition->referenced_policy_id], 'option_keys' => $this->decode($condition->arguments)['option_keys'], 'message' => $this->decode($condition->message)];
            }
            $policies[] = $policy;
        }
        return ['set' => (array) $set, 'document' => ['name' => $set->name, 'description' => $set->description, 'policies' => $policies], 'ids' => $ids];
    }

    public function createTemplate(array $document): array {
        $document = app(PolicyDefinitionValidator::class)->validate($document);
        return DB::transaction(function () use ($document) {
            $id = DB::table('policy_sets')->insertGetId(['kind' => 'template', 'name' => $document['name'], 'description' => $document['description'], 'created_at' => now(), 'updated_at' => now()]);
            $this->write($id, $document);
            return $this->load($id);
        });
    }

    /** The caller owns the creation transaction when cloning directly into a new game. */
    public function cloneSet(int $sourceId, ?Game $game = null, ?string $name = null): array {
        $work = function () use ($sourceId, $game, $name) {
            abort_unless(DB::table('policy_sets')->where('id', $sourceId)->lockForUpdate()->first(), 404);
            $source = $this->load($sourceId);
            if ($game && $source['set']['kind'] !== 'template') PolicyValues::fail('template', 'Games must be created from a template; clone game rules to a template first.');
            if ($game && DB::table('policy_sets')->where('game_id', $game->id)->exists()) abort(409, 'This game already owns its policies.');
            $document = $source['document'];
            // A playable snapshot includes active definitions only.
            if ($game) {
                $document['policies'] = array_values(array_filter($document['policies'], fn ($p) => $p['status'] === 'active'));
                foreach ($document['policies'] as &$policy) {
                    $policy['options'] = array_values(array_filter($policy['options'], fn ($o) => !$o['retired']));
                    $keys = array_column($policy['options'], 'key');
                    $policy['conditions'] = array_values(array_filter($policy['conditions'], fn ($c) => $c['option'] === null || in_array($c['option'], $keys, true)));
                }
                unset($policy);
            }
            $document['name'] = $name ?? $document['name'];
            if ($game && in_array('production_investors', array_column($document['policies'], 'key'), true))
                $document = PublicInvestmentPolicies::appendMissing($document, ResourceCatalogue::forGame($game)->resources);
            $document = app(PolicyDefinitionValidator::class)->validate($document);
            if ($game) app(PolicyEffectRegistry::class)->validateCatalogueTargets($document, ResourceCatalogue::forGame($game));
            $id = DB::table('policy_sets')->insertGetId(['kind' => $game ? 'game' : 'template', 'game_id' => $game?->id, 'source_policy_set_id' => $sourceId, 'name' => $document['name'], 'description' => $document['description'], 'created_at' => now(), 'updated_at' => now()]);
            $this->write($id, $document);
            $catalogue = $this->load($id);
            if ($game) app(PolicyService::class)->initializeGame($game, $game->getCurrentTurn(), $catalogue);
            return $catalogue;
        };
        return $game ? app(GameMutation::class)->run($game, $work) : DB::transaction($work);
    }

    /** Test edits are intentionally direct. Diagnostics don't roll back structurally valid edits. */
    public function edit(int $id, int $expectedCounter, array $document): array {
        $document = app(PolicyDefinitionValidator::class)->validate($document);
        $initial = $this->load($id);
        $game = $initial['set']['game_id'] ? Game::findOrFail($initial['set']['game_id']) : null;
        $work = function () use ($id, $expectedCounter, $document, $game) {
            $set = DB::table('policy_sets')->where('id', $id)->lockForUpdate()->first();
            abort_unless($set, 404);
            if ($game && !$game->fresh()->policy_testing_enabled) abort(403, 'Definition editing is enabled only for test games.');
            if ((int) $set->edit_counter !== $expectedCounter) abort(409, 'Policy definitions changed. Reload before saving.');
            if ($game) app(PolicyEffectRegistry::class)->validateCatalogueTargets($document, ResourceCatalogue::forGame($game));
            $this->write($id, $document);
            DB::table('policy_sets')->where('id', $id)->update(['name' => $document['name'], 'description' => $document['description'], 'edit_counter' => $expectedCounter + 1, 'updated_at' => now()]);
            $catalogue = $this->load($id);
            $diagnostics = $game ? app(PolicyService::class)->rebuild($game, $catalogue) : [];
            return ['catalogue' => $catalogue, 'diagnostics' => $diagnostics];
        };
        return $game ? app(GameMutation::class)->run($game, $work) : DB::transaction($work);
    }

    /** Narrow additive feature upgrade; unlike arbitrary definition editing this
     * cannot change existing policies, defaults, chosen values or testing permissions.
     */
    public function installPublicInvestment(Game $game, int $expectedCounter): array {
        return app(GameMutation::class)->run($game, function () use ($game, $expectedCounter) {
            $current = $this->forGame($game);
            if (!$current) abort(409, 'The game has no policy catalogue.');
            if ((int) $current['set']['edit_counter'] !== $expectedCounter) abort(409, 'Policy definitions changed. Reload before installing.');
            $document = PublicInvestmentPolicies::appendMissing($current['document'], ResourceCatalogue::forGame($game)->resources);
            $added = array_values(array_diff(array_column($document['policies'], 'key'), array_column($current['document']['policies'], 'key')));
            if (!$added) return ['game_id' => $game->id, 'added' => [], 'edit_counter' => $expectedCounter, 'diagnostics' => []];
            $document = app(PolicyDefinitionValidator::class)->validate($document);
            app(PolicyEffectRegistry::class)->validateCatalogueTargets($document, ResourceCatalogue::forGame($game));
            $this->write($current['set']['id'], $document);
            DB::table('policy_sets')->where('id', $current['set']['id'])->update(['edit_counter' => $expectedCounter + 1, 'updated_at' => now()]);
            $diagnostics = app(PolicyService::class)->rebuild($game, $this->load($current['set']['id']));
            if ($diagnostics) PolicyValues::fail('catalogue', 'Existing policy choices must be valid before adding investment controls.');
            return ['game_id' => $game->id, 'added' => $added, 'edit_counter' => $expectedCounter + 1, 'diagnostics' => []];
        });
    }

    private function write(int $id, array $document): void {
        $existing = DB::table('policies')->where('policy_set_id', $id)->get()->keyBy('key');
        // All conditions are recreated together, so in-set references can be remapped safely.
        DB::table('policy_conditions')->whereIn('policy_id', $existing->pluck('id'))->delete();
        $policyIds = []; $optionIds = [];
        foreach ($document['policies'] as $policy) {
            $policyId = $this->upsert('policies', ['policy_set_id' => $id, 'key' => $policy['key']], array_intersect_key($policy, array_flip(['category_key', 'labels', 'descriptions', 'sort_order', 'status'])));
            $policyIds[$policy['key']] = $policyId;
            $options = DB::table('policy_options')->where('policy_id', $policyId)->get();
            foreach ($policy['options'] as $option) {
                $optionId = $this->upsert('policy_options', ['policy_id' => $policyId, 'key' => $option['key']], [
                    'labels' => $option['labels'], 'descriptions' => $option['descriptions'], 'is_default' => $option['is_default'], 'sort_order' => $option['sort_order'], 'retired_at' => $option['retired'] ? now() : null]);
                $optionIds[$policy['key']][$option['key']] = $optionId;
                DB::table('policy_effects')->where('policy_option_id', $optionId)->delete();
                foreach ($option['effects'] as $effect) $this->upsert('policy_effects', ['policy_option_id' => $optionId, 'key' => $effect['key']], array_intersect_key($effect, array_flip(['effect_type', 'arguments', 'sort_order'])));
            }
            foreach ($options as $option) if (!isset($optionIds[$policy['key']][$option->key])) {
                if ($policy['status'] !== 'draft' || $this->referenced('policy_option_id', $option->id)) DB::table('policy_options')->where('id', $option->id)->update(['retired_at' => now(), 'is_default' => false, 'updated_at' => now()]);
                else DB::table('policy_options')->where('id', $option->id)->delete();
            }
            DB::table('policy_parameters')->where('policy_id', $policyId)->delete();
            foreach ($policy['parameters'] as $param) $this->upsert('policy_parameters', ['policy_id' => $policyId, 'key' => $param['key']], array_diff_key($param, ['key' => true]));
        }
        foreach ($existing as $key => $policy) if (!isset($policyIds[$key])) {
            if ($policy->status !== 'draft' || $this->referenced('policy_id', $policy->id)) DB::table('policies')->where('id', $policy->id)->update(['status' => 'retired', 'updated_at' => now()]);
            else DB::table('policies')->where('id', $policy->id)->delete();
        }
        foreach ($document['policies'] as $policy) foreach ($policy['conditions'] as $condition) {
            $this->upsert('policy_conditions', ['policy_id' => $policyIds[$policy['key']], 'key' => $condition['key']], [
                'policy_option_id' => $condition['option'] === null ? null : $optionIds[$policy['key']][$condition['option']],
                'condition_type' => $condition['condition_type'], 'referenced_policy_id' => $policyIds[$condition['referenced_policy']],
                'arguments' => ['option_keys' => $condition['option_keys']], 'message' => $condition['message']]);
        }
    }

    private function upsert(string $table, array $identity, array $values): int {
        foreach ($values as $key => &$value) if (in_array($key, ['labels', 'descriptions', 'arguments', 'message', 'default_value'], true)) $value = json_encode($value, JSON_THROW_ON_ERROR);
        unset($value);
        $rowId = DB::table($table)->where($identity)->value('id');
        if ($rowId) { DB::table($table)->where('id', $rowId)->update($values + ['updated_at' => now()]); return $rowId; }
        return DB::table($table)->insertGetId($identity + $values + ['created_at' => now(), 'updated_at' => now()]);
    }

    private function referenced(string $column, int $id): bool {
        return DB::table('nation_policy_choices')->where($column, $id)->exists() || DB::table('nation_policy_pending_changes')->where($column, $id)->exists();
    }

    public function deleteGameDefinitions(Game $game): void {
        $set = DB::table('policy_sets')->where('game_id', $game->id)->first();
        if (!$set) return;
        foreach (['nation_policy_pending_changes', 'nation_policy_choices'] as $table) DB::table($table)->where('game_id', $game->id)->delete();
        DB::table('policy_conditions')->whereIn('policy_id', DB::table('policies')->where('policy_set_id', $set->id)->select('id'))->delete();
        DB::table('policy_sets')->where('id', $set->id)->delete();
    }

    private function decode(string $value): mixed { return json_decode($value, true, flags: JSON_THROW_ON_ERROR); }
}
