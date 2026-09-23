import { MapRenderer } from '../../../map/renderer.js';
import { restoreMap } from '../../../map/snapshot.js';
import { axialKey, neighborCoordinates, pixelToAxial, traceHex, hexCorners } from '../../../map/hex.js';
import { isWater } from '../../../map/water.js';
import { mapDefinition } from '../../api/generated.js';
import { mapNationColors } from '../../services/nationColors.js';

export function mapDefinitionFor(snapshot, territories) {
    if (!snapshot) return mapDefinition;
    const model = restoreMap(snapshot, territories);
    return { width: model.width, height: model.height, model };
}

export class HexMapPicker {
    constructor(territories, definition) {
        this.model = definition.model;
        this.update(territories);
    }
    update(territories) {
        this.territories = new Map(territories.map((t) => [t.territory_id, t]));
        for (const region of this.model.regions) {
            const territory = this.territories.get(region.territoryId);
            region.name = territory?.name ?? region.name;
            region.ownerId = territory?.owner_nation_id ?? null;
            for (const id of region.cellIds) {
                const cell = this.model.cellById.get(id);
                cell.politicalOwnerId = region.ownerId;
                cell.controllerId = region.ownerId;
            }
        }
    }
    atWorld(x, y) {
        const model = this.model;
        const p = pixelToAxial(x - model.offsetX, y - model.offsetY, model.cellSize);
        const cell = model.cellById.get(axialKey(p.q, p.r));
        if (!cell) return null;
        return this.territories.get(model.regionById.get(cell.regionId).territoryId) ?? null;
    }
    atScreen(camera, x, y) {
        const p = camera.screenToWorld(x, y);
        return this.atWorld(p.x, p.y);
    }
    center(territory) {
        return this.model.regions.find((r) => r.territoryId === territory.territory_id);
    }
}

/** Shared terrain renderer; selection semantics and overlays belong to callers. */
export class HexMapRenderer extends MapRenderer {
    paths = new Map();
    constructor(canvas, camera, context, scope, onChange) {
        context.nations = mapNationColors(context);
        super(
            canvas,
            camera,
            () => {
                const visible = (id) => context.layers.some((l) => l.id === id && l.visible);
                return {
                    model: context.definition.model,
                    nations: context.nations,
                    view: 'terrain',
                    layers: {
                        terrain: visible('terrain'),
                        tiles: visible('detail'),
                        transitions: true,
                        relief: visible('detail'),
                        rivers: visible('rivers'),
                        political: visible('ownership'),
                        borders: visible('borders'),
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
    async loadImages() {
        return true;
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
    drawUnderlay(ctx) {
        if (!this.context) return;
        const selection = this.context.homeland?.();
        if (selection) {
            for (const id of selection.available) this.highlight(ctx, id, '#8edbc0', 0.18);
            for (const id of selection.selected) this.highlight(ctx, id, '#f4d18a', 0.55, true);
        }
        if (this.context.selectedId) this.highlight(ctx, this.context.selectedId, '#ffe4b0', 0.28, true);
        for (const overlay of this.context.underlays ?? []) overlay(ctx, this);
    }
    drawWorldOverlays(ctx) {
        for (const overlay of this.context?.overlays ?? []) overlay(ctx, this);
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
        ctx.stroke(this.nationalPaths.territories);
        for (const [id, paths] of this.nationalPaths.nations) {
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
