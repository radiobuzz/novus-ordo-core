<?php

namespace App\ReadModels;

readonly class ParticipantBattleLog {
    public function __construct(
        public int $battle_id,
        public int $turn_number,
        public int $territory_id,
        public int $attacker_nation_id,
        public ?int $defender_nation_id,
        public ?int $winner_nation_id,
        public string $text,
        public ?int $attacker_formation_losses,
        public ?int $attacker_division_losses,
        public ?int $defender_formation_losses,
        public ?int $defender_division_losses,
    )
    {
        
    }
}
