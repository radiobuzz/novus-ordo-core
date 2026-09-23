<?php

namespace App\Services;

use App\Models\Game;
use App\Models\Nation;
use App\Models\Territory;
use App\Models\Turn;
use Illuminate\Support\Facades\DB;

/** Explicit game scope; selecting an archived game never changes the active game. */
class AdminGameService
{
    public function summary(Game $game): array {
        $turn = Turn::getCurrentForGame($game);
        return [
            'game_id' => $game->getId(), 'active' => $game->isActive(),
            'turn_id' => $turn->getId(), 'turn_number' => $turn->getNumber(),
            'map_type' => $game->map()->exists() ? 'hex-beta-1' : 'classic',
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
        $map = $game->map()->first();
        $owners = DB::table('territory_details')->where('turn_id', $turn->getId())
            ->pluck('owner_nation_id', 'territory_id');
        return ['game_id' => $game->getId(), 'turn_id' => $turn->getId(),
            'map' => $map?->getSnapshot(), 'fingerprint' => $map?->getFingerprint(),
            'territories' => $game->territories()->get()->map(fn (Territory $territory) => [
                'territory_id' => $territory->getId(), 'x' => $territory->getX(), 'y' => $territory->getY(),
                'name' => $territory->getName(), 'terrain_type' => $territory->getTerrainType()->name,
                'owner_nation_id' => $owners[$territory->getId()] ?? null,
            ])->all(),
        ];
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
