<?php

namespace App\ReadModels;

use App\Utils\MapsObjectToInstance;

readonly class TerritoryTurnPublicInfo {
    use MapsObjectToInstance;

    public function __construct(
        public int $territory_id,
        public int $turn_number,
        public ?int $owner_nation_id,
        public array $stats,
        public ?array $owner_production,
        public array $loyalties,
        public array $base_productivity = [],
        public int $production_population_unit = 1_000_000,
    ) {}
}