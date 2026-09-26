<?php
namespace App\Domain;

use App\Models\Territory;
use Illuminate\Support\Collection;

/** Existing movement rules shared by individual checks and prepared order batches. */
final class MovementRules
{
    public static function canReach(Territory $origin, Territory $destination, array $path,
        DivisionTypeMeta $meta, Collection $connections, callable $canPass, bool $peace): bool {
        if ($peace || $destination->getTerrainType() === TerrainType::Water || count($path) > $meta->moves - 1) return false;
        if (!$path && $origin->hasSeaAccess() && $destination->hasSeaAccess()) return true;
        $current = $origin;
        foreach ($path as $next) {
            if (!$connections->get($current->getId(), collect())->contains(fn (TerritoryConnection $edge) =>
                $edge->connectedTerritoryId === $next->getId() && ($meta->canFly || $edge->isConnectedByLand))) return false;
            if (!(($meta->canFly && $next->getTerrainType() === TerrainType::Water) || $canPass($next))) return false;
            $current = $next;
        }
        // Preserve the engine's existing final-step and coastal rules.
        return $connections->get($current->getId(), collect())->contains(fn (TerritoryConnection $edge) =>
            $edge->connectedTerritoryId === $destination->getId());
    }
}
