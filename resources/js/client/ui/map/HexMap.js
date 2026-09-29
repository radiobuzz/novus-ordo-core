import { drawAnalysis, drawShores } from './analysis/render.js';
import { GeographicRenderer as MapRenderer } from '../../../map/geographic-renderer.js';
import { axialKey, neighborCoordinates, traceHex, hexCorners } from '../../../map/hex.js';
import { isWater } from '../../../map/water.js';
import { mapNationColors } from '../../services/nationColors.js';
export { mapDefinitionFor, HexMapPicker } from './GeneratedMap.js';

/** Shared terrain renderer; selection semantics and overlays belong to callers. */
export class HexMapRenderer extends MapRenderer {
    paths = new Map();
    constructor(canvas, camera, context, scope, onChange) {
        context.nations = mapNationColors(context);
        super(
            canvas,
            camera,
            () => {
                const menu = context.mapLayers;
                const visible = (id) =>
                    menu
                        ? Boolean(menu.appearance[id])
                        : context.layers.some((l) => l.id === id && l.visible);
                return {
                    model: context.definition.model,
                    nations: context.nations,
                    view: 'terrain',
                    detailThreshold: menu?.appearance.detailThreshold,
                    labelStyle: menu
                        ? {
                              opacity: menu.appearance.namesOpacity,
                              size: menu.appearance.nameSize,
                              spacing: menu.appearance.nameSpacing,
                              types: {
                                  ...menu.nameTypes,
                                  ...(!menu.appearance.ocean ? { ocean: false, sea: false } : {}),
                              },
                          }
                        : undefined,
                    layers: {
                        terrain: visible('terrain'),
                        tiles: visible('detail'),
                        transitions: true,
                        relief: visible('detail'),
                        rivers: visible('rivers'),
                        political: !menu && visible('ownership'),
                        microGrid: visible('microGrid'),
                        borders: visible('borders') || (menu?.appearance.nationalBorders ?? false),
                        names: visible('names'),
                    },
                };
            },
            onChange,
        );
        this.context = context;
        scope.own(() => this.destroy());
    }
    updateData() {
        this.context.nations = mapNationColors(this.context);
        this.nationalPaths = null;
        this.updateOwnership(this.context.definition.model);
    }
    territoryPaths(id) {
        if (this.paths.has(id)) return this.paths.get(id);
        const model = this.context.definition.model;
        const region = model.regions.find((r) => r.territoryId === id);
        if (!region) return null;
        const fill = new Path2D(),
            border = new Path2D();
        const cornersForEdge = [
            [0, 1],
            [5, 0],
            [4, 5],
            [3, 4],
            [2, 3],
            [1, 2],
        ];
        for (const cellId of region.cellIds) {
            const cell = model.cellById.get(cellId);
            if (isWater(cell)) continue;
            traceHex(fill, cell.x, cell.y, model.cellSize);
            const corners = hexCorners(cell.x, cell.y, model.cellSize);
            neighborCoordinates(cell.q, cell.r).forEach((p, index) => {
                const next = model.cellById.get(axialKey(p.q, p.r));
                if (next?.regionId === cell.regionId && !isWater(next)) return;
                const [a, b] = cornersForEdge[index].map((i) => corners[i]);
                border.moveTo(a.x, a.y);
                border.lineTo(b.x, b.y);
            });
        }
        const paths = { fill, border };
        this.paths.set(id, paths);
        return paths;
    }
    highlight(ctx, id, color, alpha, outline = false) {
        const paths = this.territoryPaths(id);
        if (!paths) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fill(paths.fill);
        if (outline) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5 / this.camera.zoom;
            ctx.stroke(paths.border);
        }
        ctx.restore();
    }
    drawUnderlay(ctx, state) {
        super.drawUnderlay(ctx, state);
        if (!this.context) return;
        if (this.context.mapLayers) drawAnalysis(ctx, this, state, this.context.mapLayers);
        for (const overlay of this.context.underlays ?? []) overlay(ctx, this);
        const selection = this.context.homeland?.();
        if (selection) {
            for (const id of selection.available) this.highlight(ctx, id, '#8edbc0', 0.18);
            for (const id of selection.selected) this.highlight(ctx, id, '#f4d18a', 0.55, true);
        }
        if (this.context.selectedId) this.highlight(ctx, this.context.selectedId, '#ffe4b0', 0.28, true);
    }
    drawWorldOverlays(ctx, state) {
        if (this.context?.mapLayers) drawShores(ctx, this, state, this.context.mapLayers);
        for (const overlay of this.context?.overlays ?? []) overlay(ctx, this);
    }
    drawWater(ctx, state, blended) {
        if (!this.context?.mapLayers) return super.drawWater(ctx, state, blended);
        ctx.save();
        ctx.globalAlpha = this.context.mapLayers.appearance.riversOpacity;
        super.drawWater(ctx, { ...state, layers: { ...state.layers, terrain: false } }, blended);
        ctx.restore();
    }
    drawMicroGrid(ctx, state, cells) {
        ctx.save();
        ctx.globalAlpha = this.context.mapLayers?.appearance.microGridOpacity ?? 1;
        super.drawMicroGrid(
            ctx,
            state,
            cells.filter((c) => this.context.mapLayers?.appearance.ocean !== false || c.terrain !== 'ocean'),
            false,
        );
        ctx.restore();
    }
    drawRegionNames(ctx, state) {
        const menu = this.context?.mapLayers;
        if (menu && !menu.appearance.territoryNames) return;
        ctx.save();
        ctx.globalAlpha = menu?.appearance.namesOpacity ?? 1;
        const regions = state.model.regions.filter(
            (r) =>
                menu?.appearance.ocean !== false ||
                r.cellIds.some((id) => state.model.cellById.get(id).terrain !== 'ocean'),
        );
        super.drawRegionNames(ctx, { ...state, model: { ...state.model, regions } });
        ctx.restore();
    }
    drawFeatures(ctx, state, cells) {
        super.drawFeatures(ctx, state, cells);
        if (!state.layers.names && this.context?.mapLayers?.appearance.territoryNames)
            this.drawRegionNames(ctx, state);
    }
    drawRegionBorders(ctx, { model }) {
        if (!this.nationalPaths) {
            const nations = new Map(),
                territories = new Path2D();
            const edges = [
                [0, 1],
                [5, 0],
                [4, 5],
                [3, 4],
                [2, 3],
                [1, 2],
            ];
            for (const cell of model.cells) {
                if (isWater(cell)) continue;
                const owner = cell.politicalOwnerId;
                if (owner && !nations.has(owner))
                    nations.set(owner, { fill: new Path2D(), border: new Path2D() });
                const paths = nations.get(owner);
                if (paths) traceHex(paths.fill, cell.x, cell.y, model.cellSize);
                const corners = hexCorners(cell.x, cell.y, model.cellSize);
                neighborCoordinates(cell.q, cell.r).forEach((p, index) => {
                    const next = model.cellById.get(axialKey(p.q, p.r));
                    const [a, b] = edges[index].map((i) => corners[i]);
                    if (next?.regionId !== cell.regionId) {
                        territories.moveTo(a.x, a.y);
                        territories.lineTo(b.x, b.y);
                    }
                    if (paths && (!next || isWater(next) || next.politicalOwnerId !== owner)) {
                        paths.border.moveTo(a.x, a.y);
                        paths.border.lineTo(b.x, b.y);
                    }
                });
            }
            this.nationalPaths = { nations, territories };
        }
        ctx.save();
        ctx.strokeStyle = 'rgba(236,235,227,.25)';
        ctx.lineWidth = 0.8 / this.camera.zoom;
        ctx.globalAlpha = this.context.mapLayers?.appearance.bordersOpacity ?? 1;
        if (!this.context.mapLayers || this.context.mapLayers.appearance.borders)
            ctx.stroke(this.nationalPaths.territories);
        ctx.globalAlpha = this.context.mapLayers?.appearance.nationalBordersOpacity ?? 1;
        for (const [id, paths] of this.nationalPaths.nations) {
            if (this.context.mapLayers && !this.context.mapLayers.appearance.nationalBorders) continue;
            ctx.save();
            ctx.clip(paths.fill);
            ctx.lineCap = ctx.lineJoin = 'round';
            // Clip each band inside its nation: neighbours retain their own colour.
            ctx.strokeStyle = '#132128';
            ctx.lineWidth = 8 / this.camera.zoom;
            ctx.stroke(paths.border);
            ctx.strokeStyle = this.context.nations[id]?.color ?? '#67c1a5';
            ctx.lineWidth = 4.5 / this.camera.zoom;
            ctx.stroke(paths.border);
            ctx.restore();
        }
        ctx.restore();
        // The shared renderer draws rivers after this method and all filled underlays.
    }
}
