<?php

namespace App\ReadModels;

readonly class RankingInfo {
    public function __construct(
        public string $key,
        public string $title,
        public array $ranked_nation_ids,
        public string $data_unit,
        public array $data,
    )
    {

    }
}
