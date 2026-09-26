import { studyCells } from './development-scale.js';
import { traceHex } from './hex.js';

// Optional diagnostic display for the selected example, not political ownership.
export function drawDevelopmentCells(ctx, state, camera) {
    const site = state.development?.siteById.get(state.selectedDevelopmentId);
    if (state.labFocus !== 'development' || !state.layers.developmentCells || !site?.useCellData) return;
    const bounds = camera.worldBounds(),
        r = state.model.cellSize;
    ctx.save();
    for (const row of studyCells(state.development, site)) {
        const c = state.model.cellById.get(row.cellId);
        if (
            !c ||
            c.x + r < bounds.left ||
            c.x - r > bounds.right ||
            c.y + r < bounds.top ||
            c.y - r > bounds.bottom
        )
            continue;
        ctx.beginPath();
        traceHex(ctx, c.x, c.y, r * 0.98);
        ctx.fillStyle =
            row.coverage === 0 ? '#b1665420' : `rgba(215,186,110,${0.02 + (row.usedPercent / 100) * 0.18})`;
        ctx.fill();
        ctx.strokeStyle = row.cellId === state.selectedCellId ? '#ffe4a8' : '#dbc59170';
        ctx.lineWidth = (row.cellId === state.selectedCellId ? 2 : 0.7) / camera.zoom;
        ctx.stroke();
        if (r * camera.zoom >= 25) {
            ctx.font = `${10 / camera.zoom}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#132320';
            ctx.lineWidth = 3 / camera.zoom;
            const text = `${Math.round(row.usedPercent)}/${row.coverage}%`;
            ctx.strokeText(text, c.x, c.y + r * 0.64);
            ctx.fillStyle = '#eedcb3';
            ctx.fillText(text, c.x, c.y + r * 0.64);
        }
    }
    ctx.restore();
}
