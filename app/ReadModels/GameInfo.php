<?php

namespace App\ReadModels;

readonly class GameInfo {
    public function __construct(
        public int $game_id,
        public int $turn_number,
        public array $nation_colors = [],
        public ?string $turn_context_revision = null,
        public bool $diplomacy_enabled = false,
        public bool $guard_enabled = false,
        public array $resource_definitions = [],
    ) {}
}
