<?php

namespace App\ReadModels;

readonly class NationTurnSummary {
    public function __construct(
        public ?int $previous_turn_number,
        public int $population,
        public ?int $population_change,
        public int $territories,
        public ?int $territory_change,
        public array $completed_units,
    ) {}
}
