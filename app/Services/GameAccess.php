<?php

namespace App\Services;

use App\Models\Game;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Initial open-game policy. Account authentication and nation ownership remain separate. */
class GameAccess
{
    public function availableGames(?User $user = null): Builder
    {
        return Game::where('is_active', true);
    }

    public function allows(Game $game, ?User $user = null): bool
    {
        return $game->isActive();
    }
}
