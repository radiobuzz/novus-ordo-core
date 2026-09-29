import { traceHex } from '../../../../map/hex.js';
const wet = (c) => ['ocean', 'lake'].includes(c.terrain);
export function drawAnalysis(ctx, renderer, state, menu) {
    const a = menu.appearance,
        size = state.model.cellSize;
    ctx.save();
    for (const cell of renderer.visibleCells(state.model)) {
        if (cell.terrain === 'ocean' && !a.ocean) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#101f2a';
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, size * 1.02);
            ctx.fill();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = size * 0.08;
            ctx.stroke();
            continue;
        }
        // Detailed water preserves the same depth colours as the overview.
        if (wet(cell)) {
            ctx.globalAlpha = a.terrain ? 0.5 : 1;
            ctx.fillStyle = cell.terrainColor;
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, size);
            ctx.fill();
        }
        if (a.ownership && cell.politicalOwnerId && !wet(cell)) {
            ctx.globalAlpha = a.ownershipOpacity;
            ctx.fillStyle = renderer.nationColor(cell.politicalOwnerId);
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, size);
            ctx.fill();
        }
    }
    ctx.restore();
    renderer.context.foreignUnderlay?.(ctx, renderer);
    if (menu.type === 'terrain' || menu.active.scale === 'shore') return;
    ctx.save();
    ctx.globalAlpha = a.opacity;
    const regional = menu.active.source === 'territory';
    for (const cell of renderer.visibleCells(state.model)) {
        if ((cell.terrain === 'ocean' && !a.ocean) || (regional && wet(cell))) continue;
        const id = regional ? state.model.regionById.get(cell.regionId)?.territoryId : cell.id;
        const value = menu.result.values.get(id),
            colour = menu.style.colour(value);
        if (!colour && !regional) continue;
        ctx.beginPath();
        traceHex(ctx, cell.x, cell.y, size);
        ctx.fillStyle = colour ?? '#424b50';
        ctx.fill();
        if (!colour) {
            ctx.save();
            ctx.clip();
            ctx.strokeStyle = '#9ba3a6';
            ctx.lineWidth = 1 / renderer.camera.zoom;
            ctx.beginPath();
            ctx.moveTo(cell.x - size, cell.y + size);
            ctx.lineTo(cell.x + size, cell.y - size);
            ctx.stroke();
            ctx.restore();
        }
    }
    ctx.restore();
}
export function drawShores(ctx, renderer, state, menu) {
    const shores = state.model.atlas?.coasts?.shores ?? [],
        active = ['coast', 'exposure'].includes(menu.type);
    if (!active && !menu.appearance.coastlines) return;
    ctx.save();
    ctx.globalAlpha = active ? menu.appearance.opacity : menu.appearance.coastlinesOpacity;
    ctx.lineWidth = (active ? 3 : 1.3) / renderer.camera.zoom;
    for (const s of shores) {
        ctx.strokeStyle =
            menu.type === 'coast'
                ? (['#65d6bc', '#b7d77a', '#edb65d', '#e77c77'][s.accessGrade] ?? '#999')
                : menu.type === 'exposure'
                  ? menu.style.colour(s.exposure)
                  : '#c1d7d5';
        ctx.beginPath();
        ctx.moveTo(s.edge[0].x, s.edge[0].y);
        ctx.lineTo(s.edge[1].x, s.edge[1].y);
        ctx.stroke();
    }
    ctx.restore();
}
