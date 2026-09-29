<?php

namespace App\Services;

use App\Models\Game;
use App\Facades\Metacache;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use App\Models\Nation;
use App\Models\Territory;
use App\Models\Turn;
use Illuminate\Support\Facades\{DB, Schema};

/** Explicit game scope; selecting an archived game never changes the active game. */
class AdminGameService
{
    public function summary(Game $game): array {
        $turn = Turn::getCurrentForGame($game);
        return [
            'game_id' => $game->getId(), 'active' => $game->isActive(),
            'context_revision' => $game->turn_context_revision,
            'turn_id' => $turn->getId(), 'turn_number' => $turn->getNumber(),
            'map_type' => 'generated',
            'nation_count' => $game->nations()->count(),
            'ready_count' => $game->nationsReadyForNextTurn()->count(),
            'territory_count' => $game->territories()->count(),
            'victory_status' => $game->getVictoryStatus()->name,
        ];
    }

    public function overview(Game $game): array {
        $turn = Turn::getCurrentForGame($game);
        return [...$this->summary($game),
            'turn_ended' => $turn->hasEnded(),
            'turn_expiration' => $turn->getExpirationOrNull(),
            'nations' => $game->nations()->get()->map(fn (Nation $nation) => [
                'nation_id' => $nation->getId(), 'user_id' => $nation->user_id,
                'name' => $nation->getDetail($turn)->getUsualName(),
                'ready' => $nation->isReadyForNextTurn(),
                'divisions' => $nation->getDetail($turn)->getNumberOfDivisions(),
            ])->all(),
        ];
    }

    public function map(Game $game): array {
        $turn = Turn::getCurrentForGame($game);
        $map = $game->map()->firstOrFail();
        $owners = DB::table('territory_details')->where('turn_id', $turn->getId())
            ->pluck('owner_nation_id', 'territory_id');
        return ['game_id' => $game->getId(), 'turn_id' => $turn->getId(),
            'map' => $map->getSnapshot(), 'fingerprint' => $map->getFingerprint(),
            'territories' => $game->territories()->get()->map(fn (Territory $territory) => [
                'territory_id' => $territory->getId(), 'x' => $territory->getX(), 'y' => $territory->getY(),
                'name' => $territory->getName(), 'terrain_type' => $territory->getTerrainType()->name,
                'owner_nation_id' => $owners[$territory->getId()] ?? null,
            ])->all(),
        ];
    }

    /** Serialize with turns/player writes and reject stale confirmations, including off/on cycles. */
    public function lifecycle(Game $game, string $action, string $expectedRevision): array {
        if (!in_array($action, ['activate', 'deactivate', 'delete'], true)) abort(422, 'Unknown game action.');
        $files = [];
        $result = app(GameMutation::class)->run($game, function () use ($game, $action, $expectedRevision, &$files) {
            $current = $game->fresh();
            if ($current->turn_context_revision !== $expectedRevision) abort(409, 'This game changed. Refresh before confirming again.');
            $turn = Turn::getCurrentForGame($current);
            if ($action === 'delete') {
                // Only application-generated identity uploads are candidates for file removal.
                $sources = DB::table('nation_details')->where('game_id', $game->id)->pluck('flag_src')
                    ->merge(DB::table('leader_details')->where('game_id', $game->id)->pluck('picture_src'));
                $files = $sources->filter(fn ($src) => is_string($src) && preg_match('~^var/entry-[a-f0-9-]{36}\.png$~D', $src))->unique()->values()->all();
                Metacache::expireAllForGame($current);
                // Ownership uses a restrictive nation FK; remove these game-owned snapshots first.
                DB::table('territory_details')->where('game_id', $game->id)->delete();
                app(\App\Services\Policies\PolicyCatalogue::class)->deleteGameDefinitions($current);
                // The fresh-resource rollout deletes disposable pre-resource games before
                // the breaking catalogue migration creates these tables.
                if (Schema::hasTable('resource_sets')) {
                    \App\Services\Resources\ResourceCatalogue::deleteGameDefinitions($current);
                }
                $current->delete(); // Game foreign keys cascade through turns, nations, AI and diplomacy.
                return ['game_id' => $game->id, 'deleted' => true];
            }
            $active = $action === 'activate';
            if ($current->isActive() === $active) abort(409, 'The game already has this status. Refresh first.');
            $current->is_active = $active;
            $current->turn_context_revision = (string) Str::uuid();
            $current->save();
            app(GameParticipants::class)->invalidateContext($current);
            Metacache::expireAllForGame($current);
            // A changed hint prompts open clients to recheck authoritative access/state.
            DB::afterCommit(fn () => app(GameTurnStatus::class)->publish($current->id, $turn->getNumber(), $turn->hasEnded() ? 'failed' : 'ready'));
            return ['game_id' => $current->id, 'active' => $active, 'deleted' => false];
        });
        if ($action === 'delete') {
            $cleanupComplete = true;
            foreach ($files as $src) {
                // Preserve even an explicitly reused image if another game still references it.
                if (DB::table('nation_details')->where('flag_src', $src)->exists()
                    || DB::table('leader_details')->where('picture_src', $src)->exists()
                    || DB::table('game_shared_static_assets')->where('src', $src)->exists()) continue;
                $cleanupComplete = $this->removeFile(public_path($src)) && $cleanupComplete;
            }
            $cleanupComplete = $this->removeFile(app(GameTurnStatus::class)->path($game->id)) && $cleanupComplete;
            $result['cleanup_complete'] = $cleanupComplete;
        }
        return $result;
    }

    private function removeFile(string $path): bool {
        if (!is_file($path) && !is_link($path)) return true;
        if (@unlink($path)) return true;
        Log::warning('Deleted game file cleanup failed.', ['path' => $path]);
        return false;
    }

    public function changeTurn(Game $game, int $expectedTurnId, string $action): array {
        if (!$game->fresh()->isActive()) abort(409, 'Only an active game can advance or roll back.');
        if (!in_array($action, ['advance', 'rollback'], true)) abort(422, 'Unknown turn action.');
        $turn = Turn::getCurrentForGame($game);
        if ($turn->getId() !== $expectedTurnId) abort(409, 'The selected turn changed. Refresh first.');
        // Engine operations own their game's turn lock; unrelated games remain available.
        if ($action === 'rollback') {
            if ($turn->getNumber() === 1) abort(422, 'The first turn cannot be rolled back.');
            $game->rollbackLastTurn($expectedTurnId);
        } else {
            $game->tryNextTurn($turn);
        }
        return $this->summary($game->fresh());
    }
}
