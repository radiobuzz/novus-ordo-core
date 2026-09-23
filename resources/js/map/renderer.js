import { axialKey, neighborCoordinates, pixelToAxial, traceHex } from './hex.js';
import { isWater } from './water.js';
import { TerrainTiles } from './tiles.js';

const terrainLabel = {
    plains: 'Plains',
    forest: 'Forest',
    hills: 'Hills',
    mountain: 'Mountain',
    ocean: 'Ocean',
    lake: 'Lake',
    snow: 'Snow / ice cap',
    tundra: 'Tundra',
};

function fieldColor(cell, view) {
    if (view === 'temperature') {
        const t = Math.round(cell.temperature * 24) / 24;
        return `hsl(${220 - t * 205} ${45 + t * 25}% ${75 - t * 28}%)`;
    }
    if (isWater(cell)) return cell.terrainColor;
    if (view === 'moisture') {
        const t = Math.round(cell.moisture * 24) / 24;
        return `hsl(${35 + t * 130} 38% ${55 - t * 27}%)`;
    }
    if (view === 'drainage') {
        const t = Math.round(Math.min(1, Math.log2(1 + cell.flow) / 4) * 24) / 24;
        return `hsl(185 ${25 + t * 50}% ${14 + t * 57}%)`;
    }
    const t = Math.round(Math.max(0, Math.min(1, cell.elevation / 2000)) * 32) / 32;
    return t < 0.45
        ? `hsl(${110 - t * 160} 29% ${30 + t * 50}%)`
        : `hsl(40 ${35 * (1 - t)}% ${45 + t * 50}%)`;
}

export class MapRenderer {
    #frame = null;
    #overviewCache = new WeakMap();
    #waterCache = new WeakMap();

    constructor(canvas, camera, getState, onDraw) {
        Object.assign(this, { canvas, camera, getState, onDraw });
        this.ctx = canvas.getContext('2d');
        this.tiles = new TerrainTiles(() => this.invalidate());
        const resize = () => {
            const bounds = canvas.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 3);
            canvas.width = Math.round(bounds.width * dpr);
            canvas.height = Math.round(bounds.height * dpr);
            camera.resize(bounds.width, bounds.height);
            this.invalidate();
        };
        this.observer = new ResizeObserver(resize);
        this.observer.observe(canvas);
        resize();
    }

    nationColor(id) {
        return this.getState().nations?.[id]?.color ?? '#8eaaa2';
    }

    drawUnderlay() {}
    drawWorldOverlays() {}
    drawScreenOverlays() {}

    destroy() {
        this.tiles.destroy();
        this.observer.disconnect();
        if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    }

    invalidate() {
        if (this.#frame !== null) return;
        this.#frame = requestAnimationFrame(() => {
            this.#frame = null;
            this.draw();
        });
    }

    cellAtScreen(screenX, screenY) {
        const { model } = this.getState();
        const point = this.camera.screenToWorld(screenX, screenY);
        const axial = pixelToAxial(point.x - model.offsetX, point.y - model.offsetY, model.cellSize);
        return model.cellById.get(axialKey(axial.q, axial.r)) ?? null;
    }

    draw() {
        const startedAt = performance.now();
        const { canvas, ctx, camera } = this;
        const originalState = this.getState();
        const state =
            originalState.view && originalState.view !== 'terrain'
                ? {
                      ...originalState,
                      layers: {
                          ...originalState.layers,
                          terrain: true,
                          tiles: false,
                          political: false,
                          control: false,
                          damage: false,
                      },
                  }
                : originalState;
        const { model, layers, selectedCellId, armySelected } = state;
        const visibleCells = this.visibleCells(model);
        const cellPixels = model.cellSize * camera.zoom;
        const detailThreshold = 7;
        // Bound visible blended sprites as well as cache memory on large displays.
        const detailed = cellPixels >= detailThreshold && (!layers.transitions || visibleCells.length <= 900);
        const blending =
            detailed && layers.terrain && layers.tiles && layers.transitions && this.tiles.status === 'ready';
        this.tiles.pending = 0;
        if (blending) this.tiles.prepare(model, visibleCells);
        const overviewWasCached = detailed || this.#overviewCache.has(model);
        const fieldWasCached =
            detailed ||
            !state.view ||
            state.view === 'terrain' ||
            this.#overviewCache.get(model)?.fields.has(state.view);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#142733');
        gradient.addColorStop(1, '#09151d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const rx = canvas.width / camera.width;
        const ry = canvas.height / camera.height;
        camera.applyTransform(ctx, rx, ry);

        if (!detailed) this.drawOverviewCells(ctx, state, visibleCells);
        else for (const cell of visibleCells) this.drawCell(ctx, cell, state);
        this.drawUnderlay(ctx, state);
        if (layers.microGrid && cellPixels >= 3.2) this.drawMicroGrid(ctx, state, visibleCells, !detailed);
        if (layers.borders) this.drawRegionBorders(ctx, state, visibleCells, !detailed);
        this.drawWater(ctx, state, blending);
        if (state.view === 'drainage' && selectedCellId) this.drawDrainageTrace(ctx, state);
        this.drawFeatures(ctx, state, visibleCells);
        if (selectedCellId) this.drawSelection(ctx, state);
        this.drawWorldOverlays(ctx, state);
        if (layers.names) this.drawRegionNames(ctx, state);
        ctx.setTransform(rx, 0, 0, ry, 0, 0);
        this.drawScreenOverlays(ctx, state, camera);
        this.onDraw?.({
            frameMs: performance.now() - startedAt,
            visibleCells: visibleCells.length,
            totalCells: model.cells.length,
            tileStatus: this.tiles.status,
            transitions: blending,
            transitionTilesCached: this.tiles.blended.size,
            transitionsPending: this.tiles.pending,
            detail: detailed ? 'cell detail' : cellPixels >= 3.2 ? 'micro grid' : 'overview',
        });
        // Report steady-state interaction cost after the one-time path compilation frame.
        if (!overviewWasCached || !fieldWasCached || this.tiles.pending) this.invalidate();
    }

    visibleCells(model) {
        const bounds = this.camera.worldBounds();
        const margin = model.cellSize * 1.2;
        return model.cells.filter(
            (cell) =>
                cell.x >= bounds.left - margin &&
                cell.x <= bounds.right + margin &&
                cell.y >= bounds.top - margin &&
                cell.y <= bounds.bottom + margin,
        );
    }

    drawCell(ctx, cell, { model, layers, view }) {
        ctx.beginPath();
        traceHex(ctx, cell.x, cell.y, model.cellSize * (layers.transitions ? 1 : 0.985));
        ctx.fillStyle =
            view && view !== 'terrain'
                ? fieldColor(cell, view)
                : layers.terrain
                  ? cell.terrainColor
                  : '#4d5659';
        ctx.fill();
        if (layers.terrain && layers.tiles)
            this.tiles.draw(ctx, cell, model.cellSize, model, layers.transitions);
        if (layers.terrain && layers.relief && (!view || view === 'terrain')) {
            ctx.fillStyle = isWater(cell) ? cell.reliefColor : cell.reliefShade < 1 ? '#101c24' : '#f4ead1';
            ctx.globalAlpha = isWater(cell) ? 0.35 : Math.abs(cell.reliefShade - 1);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (layers.political && cell.politicalOwnerId && !isWater(cell)) {
            ctx.fillStyle = this.nationColor(cell.politicalOwnerId);
            ctx.globalAlpha = 0.23;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (layers.control && cell.controllerId && cell.controllerId !== cell.politicalOwnerId) {
            ctx.fillStyle = this.nationColor(cell.controllerId);
            ctx.globalAlpha = 0.72;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (layers.damage && cell.damage) {
            ctx.strokeStyle = `rgba(46, 25, 20, ${0.28 + cell.damage * 0.14})`;
            ctx.lineWidth = 1.2;
            const spread = model.cellSize * 0.42;
            for (let index = -cell.damage; index <= cell.damage; index += 2) {
                ctx.beginPath();
                ctx.moveTo(cell.x - spread, cell.y + index * 2 - spread / 2);
                ctx.lineTo(cell.x + spread, cell.y + index * 2 + spread / 2);
                ctx.stroke();
            }
        }
    }

    drawOverviewCells(ctx, { model, layers, view }, visibleCells) {
        const cache = this.overviewCache(model);
        if (view && view !== 'terrain') {
            if (!cache.fields.has(view)) {
                const paths = new Map();
                for (const cell of model.cells) {
                    const color = fieldColor(cell, view);
                    if (!paths.has(color)) paths.set(color, new Path2D());
                    traceHex(paths.get(color), cell.x, cell.y, model.cellSize * 1.012);
                }
                cache.fields.set(view, paths);
            }
            for (const [color, path] of cache.fields.get(view)) {
                ctx.fillStyle = color;
                ctx.fill(path);
            }
            return;
        }
        if (layers.terrain) {
            const key = layers.relief ? 'relief' : 'flat';
            if (!cache.landscapes.has(key)) {
                // Bounded overview raster blends sub-pixel color seams. The
                // operational grid/picking and diagnostic views remain exact.
                const scale = Math.min(1, 1536 / Math.max(model.width, model.height));
                const source = document.createElement('canvas');
                source.width = Math.ceil(model.width * scale);
                source.height = Math.ceil(model.height * scale);
                const paint = source.getContext('2d');
                paint.scale(scale, scale);
                for (const [color, path] of layers.relief ? cache.reliefPaths : cache.terrainPaths) {
                    paint.fillStyle = color;
                    paint.strokeStyle = color;
                    paint.lineWidth = model.cellSize * 0.12;
                    paint.fill(path);
                    paint.stroke(path);
                }
                const surface = document.createElement('canvas');
                surface.width = source.width;
                surface.height = source.height;
                const surfaceCtx = surface.getContext('2d');
                surfaceCtx.filter = `blur(${Math.max(0.5, model.cellSize * scale * 0.3)}px)`;
                surfaceCtx.drawImage(source, 0, 0);
                cache.landscapes.set(key, surface);
                this.invalidate();
            }
            ctx.save();
            ctx.clip(cache.allCells);
            ctx.drawImage(cache.landscapes.get(key), 0, 0, model.width, model.height);
            ctx.restore();
        } else {
            ctx.fillStyle = '#4d5659';
            ctx.fill(cache.allCells);
        }
        if (layers.political) {
            ctx.globalAlpha = 0.23;
            for (const nation of Object.values(this.getState().nations ?? {})) {
                const path = cache.politicalPaths.get(nation.id);
                if (!path) continue;
                ctx.fillStyle = nation.color;
                ctx.fill(path);
            }
            ctx.globalAlpha = 1;
        }
        if (layers.control) {
            const controlled = visibleCells.filter(
                (cell) => cell.controllerId && cell.controllerId !== cell.politicalOwnerId,
            );
            for (const nation of Object.values(this.getState().nations ?? {})) {
                const cells = controlled.filter((cell) => cell.controllerId === nation.id);
                if (!cells.length) continue;
                const path = new Path2D();
                for (const cell of cells) traceHex(path, cell.x, cell.y, model.cellSize * 0.985);
                ctx.fillStyle = nation.color;
                ctx.globalAlpha = 0.72;
                ctx.fill(path);
            }
            ctx.globalAlpha = 1;
        }
    }

    overviewCache(model) {
        const existing = this.#overviewCache.get(model);
        if (existing) return existing;
        const allCells = new Path2D();
        const terrainPaths = new Map();
        const reliefPaths = new Map();
        const politicalPaths = new Map();
        const borders = new Path2D();
        const microGrid = new Path2D();
        const pathFor = (collection, key) => {
            if (!collection.has(key)) collection.set(key, new Path2D());
            return collection.get(key);
        };
        for (const cell of model.cells) {
            traceHex(allCells, cell.x, cell.y, model.cellSize * 1.012);
            traceHex(pathFor(terrainPaths, cell.terrainColor), cell.x, cell.y, model.cellSize * 1.012);
            traceHex(pathFor(reliefPaths, cell.reliefColor), cell.x, cell.y, model.cellSize * 1.012);
            traceHex(microGrid, cell.x, cell.y, model.cellSize * 0.985);
            if (cell.politicalOwnerId && !isWater(cell))
                traceHex(
                    pathFor(politicalPaths, cell.politicalOwnerId),
                    cell.x,
                    cell.y,
                    model.cellSize * 0.985,
                );
            const corners = Array.from({ length: 6 }, (_, index) => {
                const angle = ((60 * index - 30) * Math.PI) / 180;
                return {
                    x: cell.x + model.cellSize * 0.985 * Math.cos(angle),
                    y: cell.y + model.cellSize * 0.985 * Math.sin(angle),
                };
            });
            const edgeCorners = [
                [0, 1],
                [5, 0],
                [4, 5],
                [3, 4],
                [2, 3],
                [1, 2],
            ];
            neighborCoordinates(cell.q, cell.r).forEach(({ q, r }, index) => {
                if (model.cellById.get(axialKey(q, r))?.regionId === cell.regionId) return;
                const [from, to] = edgeCorners[index];
                borders.moveTo(corners[from].x, corners[from].y);
                borders.lineTo(corners[to].x, corners[to].y);
            });
        }
        const created = {
            allCells,
            terrainPaths,
            reliefPaths,
            politicalPaths,
            borders,
            microGrid,
            fields: new Map(),
            landscapes: new Map(),
        };
        this.#overviewCache.set(model, created);
        return created;
    }

    /** Ownership changes do not invalidate static terrain, water or landscape caches. */
    updateOwnership(model) {
        const cached = this.#overviewCache.get(model);
        if (cached) {
            const paths = new Map();
            for (const cell of model.cells) {
                if (!cell.politicalOwnerId || isWater(cell)) continue;
                if (!paths.has(cell.politicalOwnerId)) paths.set(cell.politicalOwnerId, new Path2D());
                traceHex(paths.get(cell.politicalOwnerId), cell.x, cell.y, model.cellSize * 0.985);
            }
            cached.politicalPaths = paths;
        }
        this.invalidate();
    }

    drawWater(ctx, { model, layers }, blendedShore) {
        let cached = this.#waterCache.get(model);
        if (!cached) {
            const rivers = new Map();
            for (const edge of model.riverEdges.values()) {
                const weight = Math.min(5, Math.max(0, Math.floor(Math.log2(1 + edge.flow * 3))));
                if (!rivers.has(weight)) rivers.set(weight, new Path2D());
                rivers.get(weight).moveTo(edge.a.x, edge.a.y);
                rivers.get(weight).lineTo(edge.b.x, edge.b.y);
            }
            const shores = new Path2D();
            for (const edge of model.lakeShores) {
                shores.moveTo(edge.a.x, edge.a.y);
                shores.lineTo(edge.b.x, edge.b.y);
            }
            cached = { rivers, shores };
            this.#waterCache.set(model, cached);
        }
        ctx.lineJoin = ctx.lineCap = 'round';
        if (layers.terrain && !blendedShore) {
            ctx.strokeStyle = '#7ac6cb';
            ctx.lineWidth = Math.max(model.cellSize * 0.07, 0.5 / this.camera.zoom);
            ctx.stroke(cached.shores);
        }
        if (layers.rivers) {
            for (const [weight, path] of cached.rivers) {
                const width = model.cellSize * (0.06 + weight * 0.045);
                ctx.strokeStyle = '#123d4e';
                ctx.lineWidth = Math.max(width * 1.8, 1.5 / this.camera.zoom);
                ctx.stroke(path);
            }
            for (const [weight, path] of cached.rivers) {
                const width = model.cellSize * (0.06 + weight * 0.045);
                ctx.strokeStyle = '#60c6e0';
                ctx.lineWidth = Math.max(width, 0.75 / this.camera.zoom);
                ctx.stroke(path);
            }
        }
        ctx.lineCap = 'butt';
    }

    drawDrainageTrace(ctx, { model, selectedCellId }) {
        const cell = model.cellById.get(selectedCellId);
        let point = model.drainage.vertices.get(cell?.drainageVertexId);
        if (!point) return;
        const arrows = [];
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        let step = 0;
        while (point.downstream) {
            const next = point.downstream.vertex;
            ctx.lineTo(next.x, next.y);
            if (step++ % 3 === 0)
                arrows.push({
                    x: (point.x + next.x) / 2,
                    y: (point.y + next.y) / 2,
                    angle: Math.atan2(next.y - point.y, next.x - point.x),
                });
            point = next;
        }
        ctx.strokeStyle = '#ffe29a';
        ctx.lineWidth = Math.max(model.cellSize * 0.065, 1.5 / this.camera.zoom);
        ctx.stroke();
        ctx.fillStyle = '#ffe29a';
        const size = Math.max(model.cellSize * 0.14, 2.5 / this.camera.zoom);
        for (const arrow of arrows) {
            ctx.save();
            ctx.translate(arrow.x, arrow.y);
            ctx.rotate(arrow.angle);
            ctx.beginPath();
            ctx.moveTo(size, 0);
            ctx.lineTo(-size, size * 0.65);
            ctx.lineTo(-size, -size * 0.65);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    drawMicroGrid(ctx, { model }, visibleCells, useOverviewCache) {
        ctx.strokeStyle = 'rgba(238, 232, 207, 0.2)';
        ctx.lineWidth = 0.75;
        if (useOverviewCache) {
            ctx.stroke(this.overviewCache(model).microGrid);
            return;
        }
        ctx.beginPath();
        for (const cell of visibleCells) traceHex(ctx, cell.x, cell.y, model.cellSize * 0.985);
        ctx.stroke();
    }

    drawRegionBorders(ctx, { model }, visibleCells, useOverviewCache) {
        ctx.strokeStyle = 'rgba(255, 230, 177, 0.94)';
        ctx.lineWidth = Math.max(2.4, model.cellSize * 0.11);
        ctx.lineJoin = 'round';
        if (useOverviewCache) {
            ctx.stroke(this.overviewCache(model).borders);
            return;
        }
        ctx.beginPath();
        for (const cell of visibleCells) {
            const neighbors = neighborCoordinates(cell.q, cell.r);
            const corners = Array.from({ length: 6 }, (_, index) => {
                const angle = ((60 * index - 30) * Math.PI) / 180;
                return {
                    x: cell.x + model.cellSize * 0.985 * Math.cos(angle),
                    y: cell.y + model.cellSize * 0.985 * Math.sin(angle),
                };
            });
            // Axial neighbor direction to the matching pointy-hex edge endpoints.
            const edgeCorners = [
                [0, 1],
                [5, 0],
                [4, 5],
                [3, 4],
                [2, 3],
                [1, 2],
            ];
            neighbors.forEach(({ q, r }, index) => {
                const neighbor = model.cellById.get(axialKey(q, r));
                if (neighbor?.regionId === cell.regionId) return;
                const [from, to] = edgeCorners[index];
                ctx.moveTo(corners[from].x, corners[from].y);
                ctx.lineTo(corners[to].x, corners[to].y);
            });
        }
        ctx.stroke();
    }

    drawFeatures(ctx, { model }, visibleCells) {
        for (const cell of visibleCells.filter((candidate) => candidate.city)) {
            ctx.fillStyle = '#f3d59a';
            ctx.strokeStyle = '#2c2420';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cell.x, cell.y, model.cellSize * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#2c2420';
            ctx.fillRect(cell.x - 1.3, cell.y - model.cellSize * 0.18, 2.6, model.cellSize * 0.36);
            ctx.fillRect(cell.x - model.cellSize * 0.18, cell.y - 1.3, model.cellSize * 0.36, 2.6);
        }
    }

    drawSelection(ctx, { model, selectedCellId }) {
        const cell = model.cellById.get(selectedCellId);
        if (!cell) return;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        traceHex(ctx, cell.x, cell.y, model.cellSize * 0.76);
        ctx.stroke();
    }

    drawRegionNames(ctx, { model }) {
        if (model.cellSize * this.camera.zoom < 7) return;
        const bounds = this.camera.worldBounds();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const region of model.regions) {
            if (
                region.x < bounds.left ||
                region.x > bounds.right ||
                region.y < bounds.top ||
                region.y > bounds.bottom
            )
                continue;
            ctx.font = `600 ${Math.max(10, model.cellSize * 0.36)}px Georgia, serif`;
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(12, 19, 23, 0.82)';
            ctx.fillStyle = 'rgba(250, 239, 211, 0.84)';
            const y = region.y - model.cellSize * (model.microRadius + 0.62);
            ctx.save();
            ctx.translate(region.x, y);
            ctx.rotate(-this.camera.angle);
            ctx.strokeText(region.name, 0, 0);
            ctx.fillText(region.name, 0, 0);
            ctx.restore();
        }
    }
}

export { terrainLabel };
