<?php

namespace ExperimentalAI;

use App\Integrations\AIPlayers\GameAdapter;
use App\Models\Game;
use Illuminate\Support\Facades\{Cache, DB};

/** Think outside game locks; one candidate and at most one V1 fallback per turn. */
final class Runner
{
    public function __construct(private GameAdapter $game, private ScriptCatalog $scripts) {}

    public function step(Game $game, array $context, bool $preview = false): array {
        // A separate decision lease prevents concurrent tabs paying for the same decision.
        $lease = Cache::lock('ai-decision:' . $game->getId() . ':' . ($context['nation_id'] ?? 0), 300);
        try {
            return $lease->block(3, fn () => $this->run($game, $context, $preview));
        } catch (\Illuminate\Contracts\Cache\LockTimeoutException) {
            abort(409, 'An AI decision is already running. Refresh before continuing.');
        }
    }

    private function run(Game $game, array $context, bool $preview): array {
        $status = $this->game->assertContext($game, $context);
        if ($status['paused'] || !$status['next_enabled']) abort(409, 'AI play is paused. Resume from administration.');
        $id = $status['next_nation_id'];
        if ((int) ($context['nation_id'] ?? 0) !== (int) $id) return ['status' => 'already_processed'];
        if (!$id) return ['status' => 'complete'];
        $started = microtime(true);
        $fallback = null;
        try {
            $assignment = DB::table('ai_players')->where('nation_id', $id)->first();
            $selected = $assignment->script ?? ScriptCatalog::DEFAULT;
            $stored = json_decode($assignment->memory ?? '[]', true);
            $settings = ['aggression' => $assignment->aggression, 'seed' => $assignment->seed,
                'protect_humans' => $status['protect_humans']];
            foreach (array_unique([$selected, ScriptCatalog::DEFAULT]) as $script) {
                // A control change or closed turn cancels the attempt, including fallback.
                $fresh = $this->game->assertContext($game, $context);
                if ($fresh['paused']) abort(409, 'AI play was paused.');
                if ((int) $fresh['next_nation_id'] !== (int) $id) return ['status' => 'already_processed'];
                $view = $this->game->observe($game->fresh(), $id);
                try {
                    $plan = $this->scripts->decide($script, [
                        'view' => $view, 'memory' => Memory::forScript($stored, $script), 'settings' => $settings,
                    ]);
                    if ($preview) {
                        $this->game->assertContext($game, $context);
                        return ['status' => 'preview', 'nation_id' => $id, 'script' => $script,
                            'selected_script' => $selected, 'fallback' => $fallback, 'plan' => $plan];
                    }
                    return $this->game->locked($game, function () use ($game, $context, $id, $plan, $started, $selected, $script, $stored, $fallback) {
                        $fresh = $this->game->assertContext($game, $context);
                        if ($fresh['paused']) abort(409, 'AI play was paused.');
                        if ((int) $fresh['next_nation_id'] !== (int) $id) return ['status' => 'already_processed'];
                        return DB::transaction(function () use ($game, $context, $id, $plan, $started, $selected, $script, $stored, $fallback) {
                            $key = ['nation_id' => $id, 'turn_id' => $context['turn_id'], 'generation' => $context['generation']];
                            if (DB::table('ai_player_turns')->where($key)->where('status', 'complete')->exists()) return ['status' => 'already_processed'];
                            $this->game->apply($game->fresh(), $id, $plan);
                            $memory = Memory::save($stored, $script, $plan['memory']);
                            $result = ['explanation' => $plan['explanation'], 'memory' => $plan['memory'],
                                'memory_store' => $memory, 'selected_script' => $selected, 'script' => $script, 'fallback' => $fallback,
                                'commands' => array_intersect_key($plan, array_flip(['bids', 'deployments', 'orders', 'disband', 'cancel_orders', 'cancel_deployments'])),
                                'deployments' => count($plan['deployments']), 'orders' => count($plan['orders']), 'disband' => count($plan['disband']),
                                'seconds' => round(microtime(true) - $started, 3)];
                            DB::table('ai_player_turns')->updateOrInsert($key, ['game_id' => $game->getId(), 'status' => 'complete', 'result' => json_encode($result, JSON_THROW_ON_ERROR)]);
                            DB::table('ai_players')->where('nation_id', $id)->update(['memory' => json_encode($memory, JSON_THROW_ON_ERROR)]);
                            return ['status' => 'played', 'nation_id' => $id, 'script' => $script, 'fallback' => $fallback];
                        });
                    });
                } catch (\Throwable $error) {
                    // Database/lock/context failures are not policy failures and must not replay commands.
                    if ($this->isContextError($error) || $error instanceof \Illuminate\Database\QueryException) throw $error;
                    if ($script === ScriptCatalog::DEFAULT) throw $error;
                    $fallback = ['script' => $script, 'reason' => class_basename($error)];
                    // The transaction has rolled back every candidate action and its notes.
                }
            }
            throw new \RuntimeException('No AI script could be run.');
        } catch (\Throwable $error) {
            if ($this->isContextError($error)) {
                if ($error instanceof \Illuminate\Contracts\Cache\LockTimeoutException) abort(409, 'Another game operation is running.');
                throw $error;
            }
            if ($preview) throw $error;
            // Recheck under the same game lock before pausing; never pause a replacement context.
            $this->game->locked($game, function () use ($game, $context, $id, $started, $error, $fallback) {
                $this->game->assertContext($game, $context);
                DB::transaction(function () use ($game, $context, $id, $started, $error, $fallback) {
                    DB::table('ai_player_games')->where('game_id', $game->getId())->update(['paused' => true]);
                    DB::table('ai_player_turns')->updateOrInsert(
                        ['nation_id' => $id, 'turn_id' => $context['turn_id'], 'generation' => $context['generation']],
                        ['game_id' => $game->getId(), 'status' => 'failed', 'result' => json_encode([
                            'explanation' => 'AI decision failed; actions rolled back and game paused.',
                            'fallback' => $fallback, 'error_type' => get_class($error), 'seconds' => round(microtime(true) - $started, 3),
                        ])]);
                });
            });
            report($error);
            throw $error;
        }
    }

    private function isContextError(\Throwable $error): bool {
        return $error instanceof \Illuminate\Contracts\Cache\LockTimeoutException
            || ($error instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface && $error->getStatusCode() === 409);
    }
}
