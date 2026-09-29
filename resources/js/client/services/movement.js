/** Mirrors DivisionDetail::canMoveTo, using stored topology rather than map coordinates. */
export function movementPath(
    territories,
    originId,
    destinationId,
    meta,
    nationId,
    allies = [],
    byId = new Map(territories.map((t) => [t.territory_id, t])),
) {
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
                !(
                    next.owner_nation_id === nationId ||
                    allies.includes(next.owner_nation_id) ||
                    (meta.can_fly && next.terrain_type === 'Water')
                )
            )
                continue;
            seen.add(id);
            queue.push({ territory: next, path: [...path, id] });
        }
    }
    return null;
}
