<?php

namespace App\ReadModels;

readonly class DefenseCoverageInfo
{
    public function __construct(
        public int $game_id,
        public int $turn_number,
        public array $territories,
    ) {}
}
