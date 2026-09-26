<?php
namespace App\Services;

use App\Facades\RuntimeInfo;
use App\Models\Game;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\{Cache, DB};

/** One game lock shared by HTTP commands, AI and turns. Nested calls reuse only this process's ownership. */
final class GameMutation {
    private static array $held = [];

    public static function holds(Game $game): bool { return isset(self::$held[$game->getId()]); }

    public function run(Game $game, callable $work): mixed {
        if (self::holds($game)) return DB::transaction($work);
        $lock = Cache::lock($game->getCacheLockKeyForChangeTurn(), max(300, RuntimeInfo::maxExectutionTimeSeconds()));
        try {
            return $lock->block(3, function () use ($game, $work) {
                self::$held[$game->getId()] = true;
                try {
                    return DB::transaction(function () use ($game, $work) {
                        // The row lock remains authoritative even if a long turn outlives the cache lease.
                        if (!DB::table('games')->where('id', $game->id)->lockForUpdate()->first()) abort(404);
                        return $work();
                    });
                }
                catch (\Throwable $error) {
                    // An outer command may fail after a nested turn scheduled its ready hint.
                    // The database rollback discards that callback; repair the processing hint here.
                    try {
                        $status = app(GameTurnStatus::class);
                        if (($status->read($game->id)['state'] ?? null) === 'processing') {
                            $turn = \App\Models\Turn::getCurrentForGame($game);
                            $status->publish($game->id, $turn->getNumber(), 'failed');
                        }
                    } catch (\Throwable) { /* Preserve the original command failure if storage is unavailable. */ }
                    throw $error;
                }
                finally { unset(self::$held[$game->getId()]); }
            });
        } catch (LockTimeoutException) {
            abort(409, 'Another game action is running. Refresh before trying again.');
        }
    }
}
