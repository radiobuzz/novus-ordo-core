<?php

namespace App\ReadModels;

readonly class RankingHistoryPointInfo
{
    public function __construct(
        public int $turn_number,
        public int $rank,
        public int|float $value,
    ) {}
}
