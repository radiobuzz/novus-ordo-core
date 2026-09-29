const mutedForeignColor = '#687479';

/** Neutralise foreign ownership fills while leaving borders and inspected territory readable. */
export function foreignTerritoryOverlay() {
    return (ctx, renderer) => {
        const { territories, ownNationId, hoveredId, selectedId } = renderer.context;
        for (const territory of territories) {
            if (
                !territory.owner_nation_id ||
                territory.owner_nation_id === ownNationId ||
                territory.territory_id === hoveredId ||
                territory.territory_id === selectedId
            )
                continue;
            renderer.highlight(ctx, territory.territory_id, mutedForeignColor, 0.62);
        }
    };
}
