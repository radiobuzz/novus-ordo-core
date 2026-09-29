<?php

namespace App\Integrations\AIPlayers;

use App\Models\{Game, Nation, Turn};
use App\Services\GameParticipants;
use Illuminate\Support\Facades\{DB, Schema};
use Illuminate\Support\Str;

/** Bridges passive automated participants to the authoritative turn lifecycle. */
class GameAdapter extends GameParticipants
{
    public function installed(): bool { return Schema::hasTable('ai_player_games'); }
    public function available(): bool { return $this->installed() && (bool) config('ai-player.enabled', true); }
    public function isAI(int $nationId): bool { return $this->installed() && DB::table('ai_players')->where('nation_id', $nationId)->exists(); }
    public function canCommand(Nation $nation): bool { return !$this->isAI($nation->getId()); }

    public function canAdvance(Game $game, Turn $turn): bool
    {
        if (!$this->installed() || !DB::table('ai_players')->where('game_id', $game->getId())->exists()) return true;
        $settings = DB::table('ai_player_games')->where('game_id', $game->getId())->first();
        if (!$settings || $settings->paused || !$this->available()) return false;
        return !DB::table('ai_players')->join('nations', 'nations.id', '=', 'ai_players.nation_id')
            ->where('ai_players.game_id', $game->getId())->where('nations.is_ready_for_next_turn', false)->exists();
    }

    public function locked(Game $game, callable $work): mixed
    {
        return app(\App\Services\GameMutation::class)->run($game, $work);
    }

    public function invalidateContext(Game $game): void
    {
        if ($this->installed()) DB::table('ai_player_games')->where('game_id', $game->getId())
            ->update(['generation' => (string) Str::uuid()]);
    }

    public function reset(Game $game, Turn $turn): void
    {
        if (!$this->installed() || !DB::table('ai_player_games')->where('game_id', $game->getId())->exists()) return;
        DB::table('ai_player_games')->where('game_id', $game->getId())->update([
            'generation' => (string) Str::uuid(), 'paused' => false,
        ]);
        foreach (DB::table('ai_players')->where('game_id', $game->getId())->pluck('nation_id') as $nationId) {
            $completed = DB::table('ai_player_turns')->where('nation_id', $nationId)
                ->where('turn_id', $turn->getId())->where('status', 'complete')->exists();
            DB::table('nations')->where('id', $nationId)->update(['is_ready_for_next_turn' => $completed]);
        }
    }

    public function status(Game $game): ?array
    {
        if (!$this->installed()) return null;
        $settings = DB::table('ai_player_games')->where('game_id', $game->getId())->first();
        if (!$settings) return null;
        $turn = Turn::getCurrentForGame($game);
        $players = DB::table('ai_players')->join('nations', 'nations.id', '=', 'ai_players.nation_id')
            ->where('ai_players.game_id', $game->getId())->orderBy('ai_players.nation_id')
            ->get(['ai_players.nation_id', 'nations.name', 'nations.is_ready_for_next_turn']);
        $next = $players->first(fn ($player) => !$player->is_ready_for_next_turn);
        return [
            'game_id' => $game->getId(), 'turn_id' => $turn->getId(), 'turn_number' => $turn->getNumber(),
            'generation' => $settings->generation, 'enabled' => $players->isEmpty() || $this->available(),
            'paused' => !$players->isEmpty() && (bool) $settings->paused, 'next_nation_id' => $next?->nation_id,
            'finished' => $game->getVictoryStatus()->name === 'HasBeenWon', 'mode' => 'passive',
            'players' => $players->map(fn ($player) => ['nation_id' => (int) $player->nation_id,
                'name' => $player->name, 'ready' => (bool) $player->is_ready_for_next_turn])->all(),
        ];
    }

    public function assertContext(Game $game, array $context): array
    {
        $status = $this->status($game);
        if (!$status || !$status['enabled']) abort(409, 'Passive players are unavailable.');
        if (!$game->fresh()->isActive() || (int) ($context['game_id'] ?? 0) !== $game->getId()
            || (int) ($context['turn_id'] ?? 0) !== $status['turn_id']
            || ($context['generation'] ?? '') !== $status['generation']) {
            abort(409, 'The passive-player turn context changed. Refresh before continuing.');
        }
        if (Turn::getCurrentForGame($game)->hasEnded() || $status['finished']) abort(409, 'This turn is no longer open.');
        return $status;
    }

    public function pass(Game $game, int $nationId): void
    {
        $game->nations()->findOrFail($nationId)->readyForNextTurn(Turn::getCurrentForGame($game));
    }

    public function report(Game $game): array
    {
        $status = $this->status($game);
        if (!$status) return ['status' => null, 'reports' => [], 'manual_nations' => []];
        $reports = [];
        foreach ($status['players'] as $player) {
            $row = DB::table('ai_player_turns')->where('game_id', $game->getId())
                ->where('nation_id', $player['nation_id'])->latest('id')->first();
            $reports[] = [...$player, 'result' => $row ? json_decode($row->result, true) : null, 'status' => $row?->status];
        }
        $aiIds = array_column($status['players'], 'nation_id');
        $manualNations = $game->nations()->whereNotIn('id', $aiIds)->orderBy('id')->get()
            ->map(fn (Nation $nation) => ['nation_id' => $nation->getId(), 'name' => $nation->getInternalName(),
                'ready' => (bool) $nation->isReadyForNextTurn()])->all();
        return ['status' => $status, 'reports' => $reports, 'manual_nations' => $manualNations];
    }

    public function control(Game $game, array $context, string $action, ?int $nationId = null): void
    {
        $this->locked($game, function () use ($game, $context, $action, $nationId) {
            $this->assertContext($game, $context);
            DB::transaction(function () use ($game, $action, $nationId) {
                if ($action === 'takeover') {
                    if (!DB::table('ai_players')->where('game_id', $game->getId())->where('nation_id', $nationId)->exists()) abort(404);
                    DB::table('ai_players')->where('nation_id', $nationId)->delete();
                    DB::table('nations')->where('id', $nationId)->update(['is_ready_for_next_turn' => false]);
                }
                if ($action === 'assign') {
                    if (!$this->available()) abort(409, 'Passive players are unavailable.');
                    if (!$game->nations()->whereKey($nationId)->lockForUpdate()->first()) abort(404, 'Nation does not belong to this game.');
                    if (DB::table('ai_players')->where('nation_id', $nationId)->exists()) abort(409, 'Nation is already automated.');
                    if (DB::table('ai_players')->where('game_id', $game->getId())->count() >= 10) abort(422, 'A game supports at most 10 passive players.');
                    DB::table('ai_players')->insert(['nation_id' => $nationId, 'game_id' => $game->getId()]);
                }
                $paused = (bool) DB::table('ai_player_games')->where('game_id', $game->getId())->value('paused');
                DB::table('ai_player_games')->where('game_id', $game->getId())->update([
                    'paused' => $action === 'pause' || ($action !== 'resume' && $paused),
                    'generation' => (string) Str::uuid(),
                ]);
            });
        });
    }
}
