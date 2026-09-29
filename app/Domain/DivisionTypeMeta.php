<?php
namespace App\Domain;

readonly class DivisionTypeMeta {
    public function __construct(
        public string $description,
        public int $attackPower,
        public int $defensePower,
        public int $moves = 1,
        public bool $canTakeTerritory = true,
        public bool $canFly = false,
    )
    {
        
    }
}