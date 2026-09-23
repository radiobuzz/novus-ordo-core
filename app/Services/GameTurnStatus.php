<?php

namespace App\Services;

use App\Models\Turn;
use Closure;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Public notification hints only. Call writers while holding the game's turn lock. */
class GameTurnStatus
{
    public function path(int $gameId): string {
        return public_path("var/turn-status/game-$gameId.json");
    }

    public function read(int $gameId): ?array {
        try {
            $path = $this->path($gameId);
            if (!is_file($path)) return null;
            $value = json_decode(file_get_contents($path), true);
            return is_array($value) ? $value : null;
        }
        catch (Throwable $error) {
            Log::warning('Unable to read turn status.', ['game_id' => $gameId, 'exception' => $error]);
            return null;
        }
    }

    public function publish(int $gameId, int $turnNumber, string $state, ?string $revision = null): void {
        $temporary = null;
        try {
            $path = $this->path($gameId);
            $directory = dirname($path);
            if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory))
                throw new \RuntimeException('Cannot create turn-status directory.');
            $json = json_encode([
                'version' => 1, 'game_id' => $gameId, 'turn_number' => $turnNumber,
                'state' => $state, 'revision' => $revision ?? bin2hex(random_bytes(16)),
                'updated_at' => (int) floor(microtime(true) * 1000),
            ], JSON_THROW_ON_ERROR);
            // Same-directory rename: readers see a whole old or whole new document.
            $temporary = tempnam($directory, '.turn-');
            if ($temporary === false || file_put_contents($temporary, $json) !== strlen($json)
                || !chmod($temporary, 0644) || !rename($temporary, $path))
                throw new \RuntimeException('Cannot replace turn-status file.');
            $temporary = null;
        }
        catch (Throwable $error) {
            // Notifications must not stop the engine or hide its original exception.
            Log::warning('Unable to publish turn status.', ['game_id' => $gameId, 'exception' => $error]);
        }
        finally {
            if ($temporary && is_file($temporary)) unlink($temporary);
        }
    }

    public function during(int $gameId, int $turnNumber, Closure $operation): Turn {
        $revision = bin2hex(random_bytes(16));
        $this->publish($gameId, $turnNumber, 'processing', $revision);
        try {
            $turn = $operation();
            $this->publish($gameId, $turn->getNumber(), 'ready', $revision);
            return $turn;
        }
        catch (Throwable $error) {
            $this->publish($gameId, $turnNumber, 'failed', $revision);
            throw $error;
        }
    }

    /** Repair missing/interrupted hints only after the caller has acquired the turn lock. */
    public function ensure(Turn $turn): void {
        $gameId = $turn->game_id;
        $previous = $this->read($gameId);
        $state = $turn->hasEnded() ? 'failed' : 'ready';
        if (($previous['version'] ?? null) !== 1 || ($previous['game_id'] ?? null) !== $gameId
            || ($previous['turn_number'] ?? null) !== $turn->getNumber()
            || !is_string($previous['revision'] ?? null)
            || !preg_match('/^[a-f0-9]{32}$/', $previous['revision'])
            || !is_int($previous['updated_at'] ?? null)
            || $previous['updated_at'] < 0
            || ($previous['state'] ?? null) !== $state) {
            $this->publish($gameId, $turn->getNumber(), $state);
        }
    }
}
