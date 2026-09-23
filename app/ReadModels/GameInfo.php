<?php

namespace App\ReadModels;

readonly class GameInfo {
    public function __construct(
        public int $game_id,
        public int $turn_number,
        public array $nation_colors = [],
    ) {}
}
