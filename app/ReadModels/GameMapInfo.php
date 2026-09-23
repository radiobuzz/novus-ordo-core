<?php

namespace App\ReadModels;

readonly class GameMapInfo {
    public function __construct(
        public int $game_id,
        public ?string $fingerprint,
        public ?array $map,
    ) {}
}
