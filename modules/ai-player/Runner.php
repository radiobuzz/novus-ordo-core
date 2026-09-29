<?php

namespace ExperimentalAI;

use App\Integrations\AIPlayers\GameAdapter;
use App\Models\Game;
use Illuminate\Support\Facades\{Cache, DB};

/** Sequentially marks one passive automated nation Ready, without issuing game commands. */
final class Runner
{
    public function __construct(private GameAdapter $game) {}

    public function step(Game $game, array $context): array
    {
        $lease = Cache::lock('passive-player:' . $game->getId() . ':' . ($context['nation_id'] ?? 0), 30);
        try { return $lease->block(3, fn () => $this->run($game, $context)); }
        catch (\Illuminate\Contracts\Cache\LockTimeoutException) {
            abort(409, 'A passive player is already becoming ready. Refresh before continuing.');
        }
    }

    private function run(Game $game, array $context): array
    {
        $status = $this->game->assertContext($game, $context);
        if ($status['paused']) abort(409, 'Passive players are paused. Resume them from administration.');
        $nationId = $status['next_nation_id'];
        if ((int) ($context['nation_id'] ?? 0) !== (int) $nationId) return ['status' => 'already_processed'];
        if (!$nationId) return ['status' => 'complete'];
        $started = microtime(true);
        return $this->game->locked($game, function () use ($game, $context, $nationId, $started) {
            $fresh = $this->game->assertContext($game, $context);
            if ($fresh['paused']) abort(409, 'Passive players are paused.');
            if ((int) $fresh['next_nation_id'] !== (int) $nationId) return ['status' => 'already_processed'];
            return DB::transaction(function () use ($game, $context, $nationId, $started) {
                $key = ['nation_id' => $nationId, 'turn_id' => $context['turn_id'], 'generation' => $context['generation']];
                if (DB::table('ai_player_turns')->where($key)->where('status', 'complete')->exists()) return ['status' => 'already_processed'];
                $this->game->pass($game->fresh(), $nationId);
                DB::table('ai_player_turns')->updateOrInsert($key, [
                    'game_id' => $game->getId(), 'status' => 'complete',
                    'result' => json_encode(['mode' => 'passive',
                        'explanation' => 'Submitted Ready without production, policy, military or diplomacy choices.',
                        'seconds' => round(microtime(true) - $started, 3)], JSON_THROW_ON_ERROR),
                ]);
                return ['status' => 'ready', 'nation_id' => $nationId, 'mode' => 'passive'];
            });
        });
    }
}
