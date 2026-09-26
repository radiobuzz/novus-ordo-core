<?php

namespace App\ReadModels;

readonly class DefenseCoverageTerritoryInfo
{
    public function __construct(
        public int $territory_id,
        public int $guard_defense,
        public int $guard_divisions,
    ) {}
}
