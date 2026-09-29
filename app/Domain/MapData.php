<?php

namespace App\Domain;

use LogicException;

readonly class TerritoryConnectionData {
    public function __construct(
        public int $x,
        public int $y,
        public bool $isConnectedByLand,
    )
    {
        
    }
}

readonly class TerritoryData {
    public function __construct(
        public int $x,
        public int $y,
        public TerrainType $terrainType,
        public float $usableLandRatio,
        public bool $hasSeaAccess,
        public array $connections,
        public array $geographicPotential,
    )
    {
        if ($x < 0) {
            throw new LogicException("x coordinate is invalid: $x");
        }
        if ($y < 0) {
            throw new LogicException("y coordinate is invalid: $y");
        }
        if ($usableLandRatio < 0 || $usableLandRatio > 1) {
            throw new LogicException("Usable land ration not between 0.00 - 1.00: $usableLandRatio");
        }
    }
}

readonly class MapData {
    public function __construct(
        public array $territories,
        public int $regionColumns,
        public int $regionRows,
        public int $cellsPerRegion,
    )
    {
        
    }
}
