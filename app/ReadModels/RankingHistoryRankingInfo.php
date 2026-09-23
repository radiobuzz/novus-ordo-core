<?php

namespace App\ReadModels;

readonly class RankingHistoryRankingInfo
{
    public function __construct(
        public string $key,
        public string $title,
        public string $data_unit,
        public array $series,
    ) {}
}
