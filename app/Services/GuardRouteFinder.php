<?php

namespace App\Services;

use App\Domain\TerrainType;
use Illuminate\Support\Collection;

/** Shared, read-only Guard reach rule for allocation and planning projections. */
final class GuardRouteFinder
{
    /** All owned territories this unit can reach, keyed by territory ID with shortest distance. */
    public function reachable(
        int $originId,
        int $nationId,
        int $range,
        bool $canFly,
        Collection $territories,
        Collection $connections,
        Collection $owners,
    ): array {
        $reachable = [];
        if ((int) ($owners->get($originId) ?? 0) === $nationId) $reachable[$originId] = 0;
        $frontier = [$originId];
        $seen = [$originId => true];
        for ($distance = 1; $distance <= $range; $distance++) {
            $next = [];
            foreach ($frontier as $territoryId) foreach ($connections->get($territoryId, collect()) as $edge) {
                if (!$canFly && !$edge->isConnectedByLand) continue;
                $neighborId = $edge->connectedTerritoryId;
                if (isset($seen[$neighborId])) continue;
                $neighbor = $territories->get($neighborId);
                if (!$neighbor) continue;
                $ownerId = $owners->get($neighborId);
                $passable = $ownerId === $nationId || ($canFly && $neighbor->getTerrainType() === TerrainType::Water);
                if (!$passable) continue;
                $seen[$neighborId] = true;
                $next[] = $neighborId;
                if ($ownerId === $nationId) $reachable[$neighborId] = $distance;
            }
            $frontier = $next;
            if (!$frontier) break;
        }
        return $reachable;
    }

    public function distance(
        int $originId,
        int $destinationId,
        int $nationId,
        int $range,
        bool $canFly,
        Collection $territories,
        Collection $connections,
        Collection $owners,
    ): ?int {
        if ($originId === $destinationId) return 0;
        $frontier = [$originId];
        $seen = [$originId => true];
        for ($distance = 1; $distance <= $range; $distance++) {
            $next = [];
            foreach ($frontier as $territoryId) foreach ($connections->get($territoryId, collect()) as $edge) {
                if (!$canFly && !$edge->isConnectedByLand) continue;
                $neighborId = $edge->connectedTerritoryId;
                if (isset($seen[$neighborId])) continue;
                $neighbor = $territories->get($neighborId);
                if (!$neighbor) continue;
                $ownerId = $owners->get($neighborId);
                $passable = $ownerId === $nationId || ($canFly && $neighbor->getTerrainType() === TerrainType::Water);
                if (!$passable) continue;
                if ($neighborId === $destinationId && $ownerId === $nationId) return $distance;
                $seen[$neighborId] = true;
                $next[] = $neighborId;
            }
            $frontier = $next;
            if (!$frontier) break;
        }
        return null;
    }
}
