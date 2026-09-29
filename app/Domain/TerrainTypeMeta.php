<?php
namespace App\Domain;
readonly class TerrainTypeMeta {
    public function __construct(public string $description, public float $maxPopulationDensity) {}
}
