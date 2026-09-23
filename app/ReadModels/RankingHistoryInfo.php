<?php

namespace App\ReadModels;

readonly class RankingHistoryInfo
{
    public function __construct(
        public int $game_id,
        public int $through_turn,
        public array $rankings,
    ) {}
}
