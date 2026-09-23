<?php

namespace App\ReadModels;

readonly class RankingHistorySeriesInfo
{
    public function __construct(
        public int $nation_id,
        public array $points,
    ) {}
}
