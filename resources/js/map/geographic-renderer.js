import { MapRenderer } from './renderer.js';
import { terrainDetailPlan } from './terrain-detail-plan.js';
import { TerrainV2 } from './terrain-v2.js';
import { traceHex } from './hex.js';

/** Production terrain and geographic labels, with no laboratory gameplay imports. */
export class GeographicRenderer extends MapRenderer {
    terrainV2 = new TerrainV2(() => this.invalidate());
    constructor(canvas, camera, getState, onDraw) {
        super(
            canvas,
            camera,
            () => {
                const state = getState();
                const plan = terrainDetailPlan(state.model, camera);
                const reason =
                    !state.layers.terrain || !state.layers.tiles
                        ? 'disabled'
                        : state.view && state.view !== 'terrain'
                          ? 'analysis'
                          : plan.screenSpan < (state.detailThreshold ?? 96)
                            ? 'zoom'
                            : !plan.fits
                              ? 'budget'
                              : 'active';
                const activeTerrainV2 = reason === 'active';
                return {
                    ...state,
                    cartography: state.model.atlas ?? { coasts: { shores: [] } },
                    activeTerrainV2,
                    detailStatus: { reason, screenSpan: plan.screenSpan, chunks: plan.chunks },
                    layers: { ...state.layers, tiles: false },
                };
            },
            onDraw,
        );
    }
    drawUnderlay(ctx, state) {
        this.terrainV2.draw(ctx, state, this.camera);
        if (!state.activeTerrainV2 || !state.layers.political) return;
        ctx.save();
        ctx.globalAlpha = 0.23;
        for (const cell of this.visibleCells(state.model)) {
            if (!cell.politicalOwnerId || ['ocean', 'lake'].includes(cell.terrain)) continue;
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, state.model.cellSize);
            ctx.fillStyle = this.nationColor(cell.politicalOwnerId);
            ctx.fill();
        }
        ctx.restore();
    }
    drawWater(ctx, state, blended) {
        if (!state.activeTerrainV2) return super.drawWater(ctx, state, blended);
        if (state.layers.rivers) this.terrainV2.drawRivers(ctx, state.model, this.camera);
    }
    drawScreenOverlays(ctx, state, camera) {
        const features = state.model.atlas?.features ?? [];
        const labels = state.labelStyle ?? {};
        const fontSize = labels.size ?? 12;
        const occupied = [];
        ctx.save();
        ctx.globalAlpha *= labels.opacity ?? 1;
        ctx.font = `${fontSize}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const feature of [...features].sort((a, b) => (b.area ?? 0) - (a.area ?? 0))) {
            if (labels.types?.[feature.type] === false) continue;
            const selected = feature.id === state.selectedFeatureId;
            if (
                !selected &&
                (!state.layers.names || (camera.zoom < 0.2 && !['ocean', 'continent'].includes(feature.type)))
            )
                continue;
            const p = camera.worldToScreen(feature.anchor.x, feature.anchor.y),
                width = ctx.measureText(feature.name).width;
            if (p.x < 0 || p.y < 0 || p.x > camera.width || p.y > camera.height) continue;
            if (
                !selected &&
                occupied.some(
                    (box) =>
                        Math.abs(box.x - p.x) < (box.width + width) / 2 + (labels.spacing ?? 8) &&
                        Math.abs(box.y - p.y) < fontSize + (labels.spacing ?? 8),
                )
            )
                continue;
            occupied.push({ ...p, width });
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#12232b';
            ctx.strokeText(feature.name, p.x, p.y);
            ctx.fillStyle = selected ? '#ffe3a3' : '#e5dfc9';
            ctx.fillText(feature.name, p.x, p.y);
        }
        ctx.restore();
    }
    drawWorldOverlays(ctx, state) {
        if (state.view === 'coast') {
            ctx.save();
            ctx.lineWidth = 3 / this.camera.zoom;
            for (const shore of state.model.atlas?.coasts.shores ?? []) {
                ctx.strokeStyle = ['#65d6bc', '#b7d77a', '#edb65d', '#e77c77'][shore.accessGrade] ?? '#999';
                ctx.beginPath();
                ctx.moveTo(shore.edge[0].x, shore.edge[0].y);
                ctx.lineTo(shore.edge[1].x, shore.edge[1].y);
                ctx.stroke();
            }
            ctx.restore();
        }

        const feature = state.model.atlas?.featureById.get(state.selectedFeatureId);
        if (!feature) return;
        ctx.save();
        ctx.fillStyle = 'rgba(224,191,117,.25)';
        for (const id of feature.cellIds) {
            const cell = state.model.cellById.get(id);
            if (!cell) continue;
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, state.model.cellSize);
            ctx.fill();
        }
        ctx.restore();
    }
    destroy() {
        this.terrainV2.destroy();
        super.destroy();
    }
}
