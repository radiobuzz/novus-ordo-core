<?php
namespace App\Services;

use App\Models\Game;
use Illuminate\Support\Facades\{Artisan, Cache, DB, Log, Schema};

/** Shared CLI/admin reset. Accounts, site data and source assets are outside this domain. */
final class WorldResetService
{
    public function preview(): array {
        $roots = ['games', 'map_drafts', 'map_definitions', 'policy_sets', 'resource_sets'];
        $tables = collect(Schema::getTables(DB::connection()->getDatabaseName()))->pluck('name')->all();
        $scope = array_values(array_intersect($roots, $tables));
        do {
            $previous = count($scope);
            foreach ($tables as $table) {
                if (in_array($table, $scope, true)) continue;
                foreach (Schema::getForeignKeys($table) as $fk) {
                    if (in_array($fk['foreign_table'], $scope, true)) { $scope[] = $table; break; }
                }
            }
        } while (count($scope) > $previous);
        foreach (['users', 'sessions', 'entry_slideshows'] as $protected) {
            if (in_array($protected, $scope, true)) throw new \LogicException('Reset domain includes protected site data.');
        }
        sort($scope);
        $counts = [];
        foreach ($scope as $table) $counts[$table] = DB::table($table)->count();
        $games = Game::orderBy('id')->get(['id', 'turn_context_revision'])->toArray();
        // Includes root identities, not merely totals: replacing a map/template invalidates confirmation.
        $identities = [];
        foreach (array_intersect($roots, $tables) as $table) $identities[$table] = DB::table($table)->orderBy('id')->pluck('id')->all();
        return ['counts' => $counts, 'token' => hash('sha256', json_encode([$counts, $games, $identities], JSON_THROW_ON_ERROR)),
            'orphan_status_files' => count($this->orphanStatusFiles())];
    }

    private function orphanStatusFiles(): array {
        $files = [];
        foreach (glob(public_path('var/turn-status/game-*.json')) ?: [] as $path) {
            if (!is_file($path) && !is_link($path)) continue;
            if (!preg_match('/^game-([1-9][0-9]*)\.json$/D', basename($path), $match)) continue;
            if (!Game::whereKey($match[1])->exists()) $files[] = $path;
        }
        return $files;
    }

    /** Never remove a live game's hint or accept a client-supplied filesystem path. */
    public function cleanStatusFiles(): array {
        $removed = 0; $failed = [];
        foreach ($this->orphanStatusFiles() as $path) {
            if (@unlink($path) || (!is_file($path) && !is_link($path))) $removed++;
            else { $failed[] = basename($path); Log::warning('Orphan turn-status cleanup failed.', ['path' => $path]); }
        }
        return ['removed' => $removed, 'failed' => $failed];
    }

    /** HTTP owns temporary maintenance; CLI callers retain their existing maintenance mode. */
    public function reset(?string $expectedToken = null, bool $temporaryMaintenance = false): array {
        return Cache::lock(Game::CacheLockKeyCritalSectionCreateGame, 3600)->block(3, function () use ($expectedToken, $temporaryMaintenance) {
            $preview = $this->preview();
            abort_if($expectedToken !== null && !hash_equals($preview['token'], $expectedToken), 409,
                'World data changed. Review the reset again before confirming.');
            $restoreAccess = $temporaryMaintenance && !app()->isDownForMaintenance();
            $cleanupFailed = [];
            try {
                if ($restoreAccess && Artisan::call('down', ['--retry' => 5]) !== 0) throw new \RuntimeException('Could not enter maintenance mode.');
                foreach (Game::orderBy('id')->get() as $game) {
                    $result = app(AdminGameService::class)->lifecycle($game, 'delete', $game->turn_context_revision);
                    if (!($result['cleanup_complete'] ?? true)) $cleanupFailed[] = $game->id;
                }
                DB::transaction(function () {
                    if (Schema::hasTable('policy_conditions')) DB::table('policy_conditions')->delete();
                    foreach (['policy_sets', 'resource_sets', 'map_drafts', 'map_definitions'] as $table) {
                        if (Schema::hasTable($table)) DB::table($table)->delete();
                    }
                });
                foreach (array_keys($preview['counts']) as $table) {
                    if (DB::table($table)->exists()) throw new \RuntimeException("Reset incomplete: rows remain in {$table}. Review status before continuing.");
                }
                $cleanup = $this->cleanStatusFiles();
                return ['reset_complete' => true, 'cleanup_failed_game_ids' => $cleanupFailed, 'status_cleanup' => $cleanup];
            } finally {
                if ($restoreAccess && Artisan::call('up') !== 0) throw new \RuntimeException('Reset ended but maintenance mode could not be cleared. Run php8.3 artisan up on the server.');
            }
        });
    }
}
