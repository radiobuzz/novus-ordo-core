<?php

namespace App\Services\Policies;

use App\Models\{Game, Nation, Turn};
use App\Services\GameMutation;
use App\Services\Resources\ResourceCatalogue;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class PolicyService {
    public function __construct(private PolicyCatalogue $catalogues, private PolicyRules $rules, private PolicyEffectRegistry $effects) {}

    public function initializeNation(Nation $nation, Turn $turn, ?array $catalogue = null): void {
        $this->scope($nation, $turn);
        $catalogue ??= $this->catalogues->forGame($nation->getGame());
        if (!$catalogue) return;
        $policies = $this->policies($catalogue);
        $current = $this->choices($nation, $turn, $catalogue);
        $defaults = $this->rules->defaults($policies);
        foreach ($defaults as $key => $default) {
            $choice = $current[$key] ?? $default;
            // Materialize only missing inputs; editing defaults never rewrites stored values.
            $choice['parameters'] += $default['parameters'];
            if (!isset($current[$key]) || $choice !== $current[$key]) $this->saveChoice('nation_policy_choices', $nation, $turn, $catalogue, $key, $choice);
        }
    }

    public function initializeGame(Game $game, Turn $turn, ?array $catalogue = null): void {
        $catalogue ??= $this->catalogues->forGame($game);
        if (!$catalogue) return;
        foreach ($game->nations()->get() as $nation) $this->initializeNation($nation, $turn, $catalogue);
    }

    /** No writes and no fabricated forecasts. Invalid admin edits remain inspectable. */
    public function state(Nation $nation, Turn $turn): array {
        $this->scope($nation, $turn);
        $catalogue = $this->catalogues->forGame($nation->getGame());
        if (!$catalogue) return ['enabled' => false];
        $current = $this->choices($nation, $turn, $catalogue);
        $pending = $this->choices($nation, $turn, $catalogue, true);
        try {
            $normalized = $this->rules->validate($this->policies($catalogue), $current);
            $settings = $this->effects->compile($this->policies($catalogue), $normalized, ResourceCatalogue::forGame($nation->getGame()));
            $errors = [];
        } catch (ValidationException $error) { $settings = null; $errors = $error->errors(); }
        return ['enabled' => true, 'game_id' => $nation->game_id, 'nation_id' => $nation->id, 'turn_id' => $turn->id,
            'edit_counter' => $catalogue['set']['edit_counter'], 'catalogue' => $catalogue['document'],
            'current' => $current, 'pending' => $pending, 'settings' => $settings, 'diagnostics' => $errors,
            'report' => $nation->getDetail($turn)?->policy_report, 'economic_consumers_available' => $nation->getGame()->economy_rules !== null];
    }

    public function effectiveSettings(Nation $nation, Turn $turn): array {
        $state = $this->state($nation, $turn);
        if (!$state['enabled']) return [];
        $policies = array_column($state['catalogue']['policies'], null, 'key');
        return $this->effects->compile($policies, $this->rules->validate($policies, array_replace($state['current'], $state['pending'])), ResourceCatalogue::forGame($nation->getGame()));
    }

    public function preview(Nation $nation, Turn $turn, int $counter, array $changes, ?array $acquisitions = null): array {
        return app(GameMutation::class)->run($nation->getGame(), function () use ($nation, $turn, $counter, $changes, $acquisitions) {
            $catalogue = $this->commandCatalogue($nation, $turn, $counter);
            $result = $this->rules->preview($this->policies($catalogue), $this->choices($nation, $turn, $catalogue), $changes);
            if ($result['valid']) $result['settings'] = $this->effects->compile($this->policies($catalogue), $result['proposal'], ResourceCatalogue::forGame($nation->getGame()));
            if ($result['valid'] && $nation->getGame()->economy_rules !== null) {
                $result['economic_consumers_available'] = true;
                $resolved = app(\App\Services\EconomyService::class)->resolve($nation->getDetail($turn), $result['settings'], $acquisitions);
                $result['indicator_forecast'] = app(\App\Services\EconomyService::class)->forecastResult($resolved);
                $result['production_planning'] = app(\App\Services\Resources\ResourceLedger::class)->preview($nation->getDetail($turn), result: $resolved);
            }
            return $result;
        });
    }

    /** Changes replace the entire pending package; [] cancels it without repealing current laws. */
    public function submit(Nation $nation, Turn $turn, int $counter, array $changes, ?array $acquisitions = null): array {
        return app(GameMutation::class)->run($nation->getGame(), function () use ($nation, $turn, $counter, $changes, $acquisitions) {
            $catalogue = $this->commandCatalogue($nation, $turn, $counter);
            $current = $this->choices($nation, $turn, $catalogue);
            $proposal = $this->rules->validate($this->policies($catalogue), array_replace($current, $changes));
            $ledger = app(\App\Services\Resources\ResourceLedger::class);
            $settings = $this->effects->compile($this->policies($catalogue), $proposal, ResourceCatalogue::forGame($nation->getGame()));
            $ledger->assertOpeningActions($nation->getDetail($turn));
            if ($acquisitions !== null) $ledger->savePlan($nation->getDetail($turn), $acquisitions);
            $this->rows('nation_policy_pending_changes', $nation, $turn)->delete();
            foreach ($proposal as $key => $choice) if (!$this->same($current[$key] ?? null, $choice)) $this->saveChoice('nation_policy_pending_changes', $nation, $turn, $catalogue, $key, $choice);
            return $this->state($nation, $turn);
        });
    }

    /** Called within GameMutation before any nation, territory or military upkeep. */
    public function prepareTurn(Game $game, Turn $current, Turn $next): array {
        if (!GameMutation::holds($game)) throw new \LogicException('Policy resolution requires the game mutation lock.');
        if ($current->getGameId() !== $game->id || $next->getGameId() !== $game->id || $next->getNumber() !== $current->getNumber() + 1) throw new \LogicException('Invalid policy turn boundary.');
        $catalogue = $this->catalogues->forGame($game);
        if (!$catalogue) return [];
        $policies = $this->policies($catalogue); $contexts = [];
        foreach ($game->nations()->get() as $nation) {
            $this->initializeNation($nation, $current, $catalogue);
            $before = $this->choices($nation, $current, $catalogue);
            $pending = $this->choices($nation, $current, $catalogue, true);
            try { $after = $this->rules->validate($policies, array_replace($before, $pending)); }
            catch (ValidationException $error) { PolicyValues::fail("nation.{$nation->id}", 'Policy package requires adjustment: ' . implode(' ', $error->validator->errors()->all())); }
            foreach ($after as $key => $choice) $this->saveChoice('nation_policy_choices', $nation, $next, $catalogue, $key, $choice);
            $changed = [];
            foreach ($after as $key => $choice) if (!$this->same($before[$key] ?? null, $choice)) $changed[$key] = ['from' => $before[$key] ?? null, 'to' => $choice];
            $contexts[$nation->id] = ['edit_counter' => $catalogue['set']['edit_counter'], 'changed' => $changed,
                'settings' => $this->effects->compile($policies, $after, ResourceCatalogue::forGame($nation->getGame())), 'outcomes' => [], 'economic_consumers_available' => $game->economy_rules !== null];
        }
        return $contexts;
    }

    /** Recompile current settings only. No money movement, growth, or season replay. */
    public function rebuild(Game $game, array $catalogue): array {
        $turn = $game->getCurrentTurn(); $diagnostics = [];
        foreach ($game->nations()->get() as $nation) {
            $this->initializeNation($nation, $turn, $catalogue);
            try {
                $choices = $this->rules->validate($this->policies($catalogue), $this->choices($nation, $turn, $catalogue));
                $report = ['edit_counter' => $catalogue['set']['edit_counter'], 'reason' => 'definition_rebuild', 'changed' => [],
                    'settings' => $this->effects->compile($this->policies($catalogue), $choices, ResourceCatalogue::forGame($nation->getGame())), 'outcomes' => [], 'economic_consumers_available' => $game->economy_rules !== null];
                try { $this->rules->validate($this->policies($catalogue), array_replace($choices, $this->choices($nation, $turn, $catalogue, true))); }
                catch (ValidationException $error) { $diagnostics[$nation->id]['pending'] = $error->errors(); }
            } catch (ValidationException $error) {
                $diagnostics[$nation->id]['current'] = $error->errors();
                $report = ['edit_counter' => $catalogue['set']['edit_counter'], 'reason' => 'definition_rebuild', 'settings' => null, 'diagnostics' => $error->errors(), 'economic_consumers_available' => false];
            }
            DB::table('nation_details')->where('nation_id', $nation->id)->where('turn_id', $turn->id)->update(['policy_report' => json_encode($report, JSON_THROW_ON_ERROR)]);
        }
        return $diagnostics;
    }

    /** Explicit test repair after an incompatible definition edit; never invoked for player submission. */
    public function resetTestChoices(Nation $nation, Turn $turn, int $counter, array $changes): array {
        return app(GameMutation::class)->run($nation->getGame(), function () use ($nation, $turn, $counter, $changes) {
            if (!$nation->getGame()->fresh()->policy_testing_enabled) abort(403, 'Only test games allow immediate reselection.');
            $catalogue = $this->commandCatalogue($nation, $turn, $counter);
            $after = $this->rules->validate($this->policies($catalogue), array_replace($this->choices($nation, $turn, $catalogue), $changes));
            foreach ($after as $key => $choice) $this->saveChoice('nation_policy_choices', $nation, $turn, $catalogue, $key, $choice);
            $this->rows('nation_policy_pending_changes', $nation, $turn)->delete();
            $this->rebuild($nation->getGame(), $catalogue);
            return $this->state($nation, $turn);
        });
    }

    private function commandCatalogue(Nation $nation, Turn $turn, int $counter): array {
        $this->scope($nation, $turn);
        $game = $nation->getGame()->fresh();
        if (!$game->isActive() || $game->getCurrentTurn()->id !== $turn->id || $turn->fresh()->hasEnded()) abort(409, 'The season is no longer open. Refresh first.');
        $catalogue = $this->catalogues->forGame($game);
        if (!$catalogue) abort(409, 'This game has no policy set.');
        if ((int) $catalogue['set']['edit_counter'] !== $counter) abort(409, 'Policy definitions changed. Reload before continuing.');
        return $catalogue;
    }

    private function scope(Nation $nation, Turn $turn): void {
        if ($nation->game_id !== $turn->getGameId()) abort(409, 'Nation and turn must belong to the same game.');
    }

    private function policies(array $catalogue): array { return array_column($catalogue['document']['policies'], null, 'key'); }

    private function choices(Nation $nation, Turn $turn, array $catalogue, bool $pending = false): array {
        $policyKeys = array_flip($catalogue['ids']['policies']);
        $policies = $this->policies($catalogue); $result = [];
        foreach ($this->rows($pending ? 'nation_policy_pending_changes' : 'nation_policy_choices', $nation, $turn)->get() as $row) {
            $key = $policyKeys[$row->policy_id] ?? null;
            if (!$key) PolicyValues::fail('choices', 'Stored choice references another policy set.');
            if ($policies[$key]['status'] !== 'active') continue;
            $option = array_flip($catalogue['ids']['options'][$key])[$row->policy_option_id] ?? null;
            if (!$option) PolicyValues::fail("choices.$key", 'Stored option belongs to another policy.');
            $result[$key] = ['option' => $option, 'parameters' => json_decode($row->parameter_values, true, flags: JSON_THROW_ON_ERROR)];
        }
        return $result;
    }

    private function rows(string $table, Nation $nation, Turn $turn): \Illuminate\Database\Query\Builder {
        return DB::table($table)->where('game_id', $nation->game_id)->where('nation_id', $nation->id)->where('turn_id', $turn->id);
    }

    private function saveChoice(string $table, Nation $nation, Turn $turn, array $catalogue, string $key, array $choice): void {
        $identity = ['game_id' => $nation->game_id, 'nation_id' => $nation->id, 'turn_id' => $turn->id, 'policy_id' => $catalogue['ids']['policies'][$key]];
        $values = ['policy_option_id' => $catalogue['ids']['options'][$key][$choice['option']], 'parameter_values' => json_encode($choice['parameters'], JSON_THROW_ON_ERROR), 'updated_at' => now()];
        if (DB::table($table)->where($identity)->exists()) DB::table($table)->where($identity)->update($values);
        else DB::table($table)->insert($identity + $values + ['created_at' => now()]);
    }

    private function same(?array $a, array $b): bool {
        if ($a === null || $a['option'] !== $b['option']) return false;
        ksort($a['parameters']); ksort($b['parameters']);
        return $a['parameters'] === $b['parameters'];
    }
}
