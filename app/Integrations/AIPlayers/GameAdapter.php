<?php

namespace App\Integrations\AIPlayers;

use App\Domain\{DeploymentCommand, DivisionType, ProductionForecast};
use App\Facades\Metacache;
use App\Models\{Division, Game, Nation, NationTerritoryLoyalty, Territory, Turn};
use App\Services\{GameParticipants, NationCommands};
use Illuminate\Support\Facades\{Cache, DB, Schema, Validator};
use Illuminate\Support\Str;
use ExperimentalAI\{Memory, Plan, ScriptCatalog};

/** The removable experiment's only connection to authoritative game models and commands. */
class GameAdapter extends GameParticipants
{
    public function installed(): bool { return Schema::hasTable('ai_player_games'); }
    public function available(): bool { return config('ai-player.enabled', true) && $this->installed(); }
    public function isAI(int $nationId): bool { return $this->installed() && DB::table('ai_players')->where('nation_id', $nationId)->exists(); }
    public function canCommand(Nation $nation): bool { return !$this->isAI($nation->getId()); }
    public function canAdvance(Game $game, Turn $turn): bool {
        if (!$this->installed()) return true;
        if (!DB::table('ai_players')->where('game_id', $game->getId())->exists()) return true;
        $settings = DB::table('ai_player_games')->where('game_id', $game->getId())->first();
        if ($settings && ($settings->paused || !$this->available())) return false;
        return !DB::table('ai_players')->join('nations', 'nations.id', '=', 'ai_players.nation_id')
            ->where('ai_players.game_id', $game->getId())->where('nations.is_ready_for_next_turn', false)->exists();
    }
    public function canEngage(Nation $attacker, Territory $target, ?Turn $turn = null): bool {
        if (!$this->isAI($attacker->getId())) return true;
        $protected = DB::table('ai_player_games')->where('game_id', $attacker->getGame()->getId())->value('protect_humans');
        $owner = $target->getDetail($turn)->getOwnerOrNull();
        return !$protected || !$owner || $this->isAI($owner->getId());
    }
    public function locked(Game $game, callable $work): mixed {
        return Cache::lock($game->getCacheLockKeyForChangeTurn(), 300)->block(3, $work);
    }
    public function reset(Game $game, Turn $turn): void {
        if (!$this->installed() || !DB::table('ai_player_games')->where('game_id', $game->getId())->exists()) return;
        DB::table('ai_player_games')->where('game_id', $game->getId())->update(['generation' => (string) Str::uuid(), 'paused' => false]);
        foreach (DB::table('ai_players')->where('game_id', $game->getId())->get() as $player) {
            // Restored turn's completed commands still exist. Preserve them until next resolution.
            $record = DB::table('ai_player_turns')->where('nation_id', $player->nation_id)->where('turn_id', $turn->getId())->where('status', 'complete')->latest('id')->first();
            $previous = $record ?? DB::table('ai_player_turns')->where('nation_id', $player->nation_id)->where('turn_id', '<', $turn->getId())->where('status', 'complete')->latest('id')->first();
            $result = $previous ? json_decode($previous->result, true) : [];
            $stored = $result['memory_store'] ?? Memory::save([], $result['script'] ?? ScriptCatalog::DEFAULT, $result['memory'] ?? []);
            DB::table('ai_players')->where('nation_id', $player->nation_id)->update(['memory' => json_encode($stored)]);
            DB::table('nations')->where('id', $player->nation_id)->update(['is_ready_for_next_turn' => (bool) $record]);
        }
    }
    public function status(Game $game): ?array {
        if (!$this->installed()) return null;
        $settings = DB::table('ai_player_games')->where('game_id', $game->getId())->first();
        if (!$settings) return null;
        $turn = Turn::getCurrentForGame($game);
        $players = DB::table('ai_players')->join('nations', 'nations.id', '=', 'ai_players.nation_id')
            ->where('ai_players.game_id', $game->getId())->orderBy('nation_id')
            ->get(['ai_players.*', 'nations.name', 'nations.is_ready_for_next_turn']);
        $next = $players->first(fn ($p) => !$p->is_ready_for_next_turn);
        return [
            'game_id' => $game->getId(), 'turn_id' => $turn->getId(), 'turn_number' => $turn->getNumber(),
            'generation' => $settings->generation, 'enabled' => $players->isEmpty() || $this->available(), 'paused' => !$players->isEmpty() && (bool) $settings->paused,
            'protect_humans' => (bool) $settings->protect_humans,
            'next_nation_id' => $next?->nation_id, 'next_enabled' => $next ? (bool) $next->enabled : true,
            'finished' => $game->getVictoryStatus()->name === 'HasBeenWon',
            // Public activity only. Private target/economic reasoning belongs in the admin report.
            'players' => $players->map(fn ($p) => ['nation_id' => $p->nation_id, 'name' => $p->name,
                'ready' => (bool) $p->is_ready_for_next_turn, 'enabled' => (bool) $p->enabled, 'aggression' => $p->aggression,
                'script' => $p->script ?? ScriptCatalog::DEFAULT])->all(),
        ];
    }
    public function assertContext(Game $game, array $context): array {
        $status = $this->status($game);
        if (!$status || !$status['enabled']) abort(409, 'Experimental AI is unavailable.');
        if (!$game->fresh()->isActive()
            || (int) ($context['game_id'] ?? 0) !== $game->getId()
            || (int) ($context['turn_id'] ?? 0) !== $status['turn_id']
            || ($context['generation'] ?? '') !== $status['generation']) abort(409, 'The AI turn context changed. Refresh before continuing.');
        if (Turn::getCurrentForGame($game)->hasEnded() || $status['finished']) abort(409, 'This turn is no longer open.');
        return $status;
    }
    public function observe(Game $game, int $nationId): array {
        $nation = $game->nations()->findOrFail($nationId); $detail = $nation->getDetail(); $turn = $detail->getTurn();
        $budget = json_decode(json_encode($detail->exportBudget()), true);
        $connections = DB::table('territory_connections')->where('game_id', $game->getId())->get()->groupBy('territory_id');
        $owners = DB::table('territory_details')->where('turn_id', $turn->getId())->get()->keyBy('territory_id');
        $loyalties = DB::table('nation_territory_loyalties')->where('turn_id', $turn->getId())->get()->groupBy('territory_id');
        $territories = $game->territories()->get()->map(function (Territory $t) use ($owners, $loyalties, $connections, $nationId) {
            $row = $owners[$t->getId()]; $owner = $row->owner_nation_id;
            $loyalty = ($loyalties->get($t->getId())?->firstWhere('nation_id', $owner)?->loyalty ?? 0) / 100;
            $links = $connections->get($t->getId(), collect());
            return ['id' => $t->getId(), 'name' => $t->getName(), 'owner' => $owner === null ? null : (int) $owner,
                'water' => $t->getTerrainType()->name === 'Water', 'terrain' => $t->getTerrainType()->name, 'sea' => (bool) $t->hasSeaAccess(),
                'population' => $owner === null ? null : (int) $row->population_size, 'loyalty' => $loyalty,
                'can_deploy' => $owner == $nationId && \App\Models\Deployment::isLoyaltyHighEnoughToDeployOnTerritory($loyalty),
                'connections' => $links->pluck('connected_territory_id')->map(fn ($id) => (int) $id)->all(),
                'land_connections' => $links->where('is_connected_by_land', true)->pluck('connected_territory_id')->map(fn ($id) => (int) $id)->all()];
        })->all();
        $divisions = DB::table('division_details')->join('divisions', 'divisions.id', '=', 'division_details.division_id')
            ->where('division_details.turn_id', $turn->getId())->where('division_details.nation_id', $nationId)->where('is_active', true)
            ->orderBy('divisions.id')->get(['divisions.id', 'division_type', 'territory_id'])
            ->map(fn ($d) => ['id' => $d->id, 'type' => DivisionType::from($d->division_type)->name, 'territory_id' => (int) $d->territory_id])->all();
        $opponents = [];
        foreach ($game->nations()->where('id', '!=', $nationId)->get() as $other) {
            $otherDetail = $other->getDetail($turn);
            $opponents[$other->getId()] = ['army' => Division::approximateNumberOfDivisions($otherDetail->getNumberOfDivisions()), 'territories' => $otherDetail->territories()->count()];
        }
        $definitions = array_column(json_decode(json_encode(DivisionType::exportMetas()), true), null, 'division_type');
        $conflicts = DB::table('battles')->join('turns', 'turns.id', '=', 'battles.turn_id')
            ->where('battles.game_id', $game->getId())->whereNotNull('defender_nation_id')
            ->where('turns.number', '>=', max(1, $turn->getNumber() - 12))
            ->where(fn ($query) => $query->where('attacker_nation_id', $nationId)->orWhere('defender_nation_id', $nationId))
            ->orderBy('battles.id')->get(['battles.id', 'battles.territory_id', 'battles.attacker_nation_id',
                'battles.defender_nation_id', 'battles.winner_nation_id', 'turns.number as turn_number'])
            ->map(fn ($battle) => ['id' => (int) $battle->id, 'turn_number' => (int) $battle->turn_number,
                'territory_id' => (int) $battle->territory_id,
                'opponent_id' => (int) ($battle->attacker_nation_id == $nationId ? $battle->defender_nation_id : $battle->attacker_nation_id),
                'defending' => (int) $battle->defender_nation_id === $nationId,
                'won' => (int) $battle->winner_nation_id === $nationId,
                'lost' => $battle->winner_nation_id !== null && (int) $battle->winner_nation_id !== $nationId])->all();
        $workspace = app(\App\Services\PlayerWorkspace::class)->export($nation);
        $logs = \App\Models\Battle::where('game_id', $game->getId())
            ->whereIn('turn_id', Turn::where('game_id', $game->getId())->whereBetween('number', [max(1, $turn->getNumber() - 20), $turn->getNumber()])->select('id'))
            ->where(fn ($q) => $q->where('attacker_nation_id', $nationId)->orWhere('defender_nation_id', $nationId))
            ->orderBy('id')->get()->map(fn ($battle) => $battle->exportForParticipant())->all();
        return json_decode(json_encode(['api_version' => 1, 'game_id' => $game->getId(),
            'workspace' => $workspace,
            'public_nations' => $game->nations()->get()->map(fn ($n) => $n->getDetail($turn)->export())->all(),
            'public_territories' => \App\Models\TerritoryDetail::exportAllTurnPublicInfo($turn),
            'own_territories' => \App\Models\TerritoryDetail::exportAllTurnOwnerInfo($nation, $turn),
            'news' => \App\Models\News::getAllForTurn($turn)->map(fn ($news) => $news->export())->all(),
            'battle_logs' => $logs, 'history_from_turn' => max(1, $turn->getNumber() - 20),
            'nation_id' => $nationId, 'turn_number' => $turn->getNumber(), 'territories' => $territories,
            'divisions' => $divisions, 'deployments' => $detail->deployments()->get()->map(fn ($d) => ['type' => $d->getDivisionType()->name, 'territory_id' => $d->getTerritory()->getId()])->all(),
            'budget' => $budget, 'planning' => $detail->exportProductionPlanning(),
            'pools' => array_column($budget['labor_pools'], 'size', 'territory_id'),
            'production_raw' => array_map(fn ($p) => (int) round($p * 1000000), $budget['production']),
            'definitions' => $definitions, 'opponents' => $opponents, 'conflict_events' => $conflicts,
            'recent_attacks' => DB::table('battles')->join('turns', 'turns.id', '=', 'battles.turn_id')
                ->where('battles.game_id', $game->getId())->where('defender_nation_id', $nationId)
                ->where('turns.number', '>=', max(1, $turn->getNumber() - 2))->orderByDesc('battles.id')
                ->pluck('territory_id')->map(fn ($id) => (int) $id)->all(),
            'human_ids' => $game->nations()->whereNotIn('id', DB::table('ai_players')->where('game_id', $game->getId())->pluck('nation_id'))->pluck('id')->map(fn ($id) => (int) $id)->all()], JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
    }
    public function forecast(array $planning, array $pools, array $bids, array $production): array {
        return ProductionForecast::calculate($planning, $pools, $bids, $production);
    }
    public function apply(Game $game, int $nationId, array $plan): void {
        $plan = Plan::normalize($plan);
        $nation = $game->nations()->findOrFail($nationId);
        Validator::make($plan, [
            'bids' => 'present|array|max:4', 'deployments' => 'present|array|max:2000', 'orders' => 'present|array|max:2000', 'disband' => 'present|array|max:2000',
            'deployments.*.territory_id' => 'required|integer|min:1', 'deployments.*.division_type' => ['required', DivisionType::createValidationByName()],
            'orders.*.division_id' => 'required|integer|min:1', 'orders.*.destination_territory_id' => 'required|integer|min:1',
            'orders.*.path_territory_ids' => 'present|array|max:8', 'orders.*.path_territory_ids.*' => 'integer|min:1',
            'disband.*' => 'integer|min:1|distinct', 'memory' => 'present|array', 'explanation' => 'required|string|max:3000',
        ])->validate();
        $commands = app(NationCommands::class);
        $commands->cancelOrders($nation, $plan['cancel_orders']);
        if ($plan['cancel_deployments']) $commands->cancelDeployments($nation, $plan['cancel_deployments']);
        if ($plan['bids']) {
            Validator::make(['bids' => $plan['bids']], (new \App\Http\Requests\ProductionPlanRequest)->rules())->validate();
            $nation->getDetail()->placeProductionPlan($plan['bids']);
        }
        if ($plan['deployments']) app(NationCommands::class)->deploy($nation, array_map(fn ($d) => new DeploymentCommand($d['territory_id'], DivisionType::fromName($d['division_type'])), $plan['deployments']));
        if ($plan['orders']) app(NationCommands::class)->move($nation, $plan['orders']);
        $commands->disband($nation, $plan['disband']);
        $nation->readyForNextTurn(Turn::getCurrentForGame($game));
    }
    public function report(Game $game): array {
        $status = $this->status($game);
        if (!$status) return ['status' => null, 'reports' => [], 'manual_nations' => []];
        $reports = [];
        foreach ($status['players'] as $player) {
            $row = DB::table('ai_player_turns')->where('nation_id', $player['nation_id'])->latest('id')->first();
            $reports[] = [...$player, 'result' => $row ? json_decode($row->result, true) : null, 'status' => $row?->status];
        }
        $aiIds = array_column($status['players'], 'nation_id');
        $manualNations = $game->nations()->whereNotIn('id', $aiIds)->orderBy('id')->get()
            ->map(fn (Nation $nation) => [
                'nation_id' => $nation->getId(),
                'name' => $nation->getInternalName(),
                'ready' => (bool) $nation->isReadyForNextTurn(),
            ])->all();
        return ['status' => $status, 'reports' => $reports, 'manual_nations' => $manualNations,
            'scripts' => app(ScriptCatalog::class)->all()];
    }
    public function control(Game $game, array $context, string $action, ?int $nationId = null, ?int $aggression = null, string $script = ScriptCatalog::DEFAULT): void {
        $this->locked($game, function () use ($game, $context, $action, $nationId, $aggression, $script) {
            $this->assertContext($game, $context);
            if (in_array($action, ['assign', 'script'], true)) app(ScriptCatalog::class)->path($script);
            DB::transaction(function () use ($game, $action, $nationId, $aggression, $script) {
                if ($action === 'script') {
                    $player = DB::table('ai_players')->where('game_id', $game->getId())->where('nation_id', $nationId)->first();
                    if (!$player) abort(404);
                    DB::table('ai_players')->where('nation_id', $nationId)->update([
                        'script' => $script, 'memory' => json_encode(['_scripts' => Memory::notebooks(json_decode($player->memory ?? '[]', true))]),
                    ]);
                }
                if ($action === 'takeover') {
                    if (!DB::table('ai_players')->where('game_id', $game->getId())->where('nation_id', $nationId)->exists()) abort(404);
                    DB::table('ai_players')->where('nation_id', $nationId)->delete();
                    DB::table('nations')->where('id', $nationId)->update(['is_ready_for_next_turn' => false]);
                }
                if ($action === 'assign') {
                    if (!$this->available()) abort(409, 'Experimental AI is unavailable.');
                    if ($aggression === null || $aggression < 0 || $aggression > 100) abort(422, 'AI aggression must be between 0 and 100.');
                    if (!$game->nations()->whereKey($nationId)->lockForUpdate()->first()) abort(404, 'Nation does not belong to this game.');
                    if (DB::table('ai_players')->where('nation_id', $nationId)->exists()) abort(409, 'Nation is already AI-controlled.');
                    if (DB::table('ai_players')->where('game_id', $game->getId())->count() >= 10) abort(422, 'A game supports at most 10 AI players.');
                    $settings = DB::table('ai_player_games')->where('game_id', $game->getId())->lockForUpdate()->first();
                    DB::table('ai_players')->insert([
                        'nation_id' => $nationId,
                        'game_id' => $game->getId(),
                        'enabled' => true,
                        'aggression' => $aggression,
                        'seed' => substr($settings->seed . ':nation:' . $nationId, 0, 64),
                        'memory' => '[]',
                        'script' => $script,
                    ]);
                }
                DB::table('ai_player_games')->where('game_id', $game->getId())->update([
                    'paused' => $action === 'pause' || ($action !== 'resume' && (bool) DB::table('ai_player_games')->where('game_id', $game->getId())->value('paused')),
                    'generation' => (string) Str::uuid(),
                ]);
            });
        });
    }
}
