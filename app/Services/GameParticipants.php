<?php

namespace App\Services;

use App\Models\{Game, Nation, Territory, Turn};

/** Optional automated participants. The default keeps human-only games independent. */
class GameParticipants
{
    public function canAdvance(Game $game, Turn $turn): bool { return true; }
    public function canCommand(Nation $nation): bool { return true; }
    public function canEngage(Nation $attacker, Territory $target, ?Turn $turn = null): bool { return true; }
    public function reset(Game $game, Turn $turn): void {}
}
