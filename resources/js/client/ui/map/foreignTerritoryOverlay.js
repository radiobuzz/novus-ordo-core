const mutedForeignColor = '#687479';

/** Neutralise foreign ownership fills while leaving borders and inspected territory readable. */
export function foreignTerritoryOverlay() {
    return (ctx, renderer) => {
        const { territories, ownNationId, hoveredId, selectedId, definition } = renderer.context;
        for (const territory of territories) {
            if (
                !territory.owner_nation_id ||
                territory.owner_nation_id === ownNationId ||
                territory.territory_id === hoveredId ||
                territory.territory_id === selectedId
            )
                continue;
            if (renderer.highlight) {
                renderer.highlight(ctx, territory.territory_id, mutedForeignColor, 0.62);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = 0.62;
            ctx.fillStyle = mutedForeignColor;
            ctx.fillRect(
                territory.x * definition.tileWidth,
                territory.y * definition.tileHeight,
                definition.tileWidth,
                definition.tileHeight,
            );
            ctx.restore();
        }
    };
}
