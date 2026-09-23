/** Mirrors DivisionDetail::canMoveTo, using stored topology rather than map coordinates. */
export function movementPath(territories, originId, destinationId, meta, nationId) {
    const byId = new Map(territories.map((t) => [t.territory_id, t]));
    const origin = byId.get(originId),
        destination = byId.get(destinationId);
    if (
        !origin ||
        !destination ||
        originId === destinationId ||
        destination.terrain_type === 'Water' ||
        !meta?.moves
    )
        return null;
    if (origin.has_sea_access && destination.has_sea_access) return [];
    const queue = [{ territory: origin, path: [] }],
        seen = new Set([originId]);
    for (let index = 0; index < queue.length; index++) {
        const { territory, path } = queue[index];
        // The current engine allows any stored connection on the final step.
        if (territory.connected_territory_ids.includes(destinationId)) return path;
        if (path.length >= meta.moves - 1) continue;
        const links = meta.can_fly
            ? territory.connected_territory_ids
            : territory.connected_land_territory_ids;
        for (const id of links) {
            const next = byId.get(id);
            if (
                !next ||
                seen.has(id) ||
                !(next.owner_nation_id === nationId || (meta.can_fly && next.terrain_type === 'Water'))
            )
                continue;
            seen.add(id);
            queue.push({ territory: next, path: [...path, id] });
        }
    }
    return null;
}

export function productionBid(resource, quantity, productivity, definitions) {
    const maxQuantity = Math.round(Number(quantity) * definitions.labor_per_unit);
    const efficiency = Number(productivity);
    if (
        !definitions.bid_resources.includes(resource) ||
        !Number.isSafeInteger(maxQuantity) ||
        maxQuantity < 0 ||
        !Number.isFinite(efficiency) ||
        efficiency < 0
    )
        throw new Error('Enter a non-negative quantity and productivity within the supported range.');
    return {
        resource_type: resource,
        max_quantity: maxQuantity,
        max_labor_allocation_per_unit:
            efficiency > 0
                ? Math.min(definitions.max_bid_labor, Math.ceil(definitions.labor_per_unit / efficiency))
                : definitions.max_bid_labor,
    };
}
