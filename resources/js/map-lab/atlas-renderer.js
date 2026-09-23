import { traceHex } from './hex.js';
import { FEATURE_LAYERS } from './geographic-features.js';

const hues = { Oil: 42, Iron: 12, Copper: 27, Coal: 275, Timber: 115 };
export class AtlasOverlay {
    cache = null;
    labels = [];
    resourceCells = 0;
    drawWorld(ctx, state) {
        if (state.view !== 'terrain') return;
        const { model, cartography, substrate, layers } = state;
        if (!cartography) return;
        if (![...Object.values(FEATURE_LAYERS), 'oceanAreas', 'resources'].some((key) => layers[key])) {
            this.resourceCells = 0;
            return;
        }
        let rebuilt = false;
        if (
            this.cache?.cartography !== cartography ||
            this.cache?.substrate !== substrate ||
            this.cache.kind !== state.naturalResource
        ) {
            const oceans = new Map(),
                resources = new Map();
            for (const ocean of cartography.oceans) {
                const path = new Path2D();
                for (const id of ocean.cellIds) {
                    const c = model.cellById.get(id);
                    traceHex(path, c.x, c.y, model.cellSize * 1.01);
                }
                oceans.set(ocean.id, path);
            }
            let count = 0;
            for (const cell of model.cells) {
                const density = substrate.cells.get(cell.id)[state.naturalResource].density;
                if (!density) continue;
                const bucket = Math.max(1, Math.min(12, Math.ceil(density * 8)));
                if (!resources.has(bucket)) resources.set(bucket, new Path2D());
                traceHex(resources.get(bucket), cell.x, cell.y, model.cellSize * 0.98);
                count++;
            }
            this.cache = { cartography, substrate, kind: state.naturalResource, oceans, resources, count };
            rebuilt = true;
        }
        if (layers.oceanAreas) {
            let i = 0;
            for (const path of this.cache.oceans.values()) {
                ctx.fillStyle = `hsla(${[190, 230, 165, 270, 205][i++ % 5]} 65% 64% / .18)`;
                ctx.fill(path);
            }
        }
        const selectedOcean = state.selectedFeature?.startsWith('ocean-')
            ? state.selectedFeature
            : cartography.oceanByCell.get(state.selectedCellId);
        if ((layers.oceanNames || layers.oceanAreas) && selectedOcean) {
            ctx.fillStyle = '#bedbe53a';
            ctx.fill(this.cache.oceans.get(selectedOcean));
        }
        this.resourceCells = layers.resources ? this.cache.count : 0;
        if (layers.resources)
            for (const [bucket, path] of this.cache.resources) {
                ctx.fillStyle = `hsla(${hues[state.naturalResource]} 70% ${26 + bucket * 3}% / .8)`;
                ctx.fill(path);
            }
        return rebuilt;
    }
    drawHighlights(ctx, state) {
        const { model, cartography, layers } = state;
        const feature = cartography.featureById.get(state.selectedFeature);
        if (
            state.view === 'terrain' &&
            feature &&
            feature.type !== 'river' &&
            layers[FEATURE_LAYERS[feature.type]]
        ) {
            if (this.selectedPath?.feature !== feature) {
                const path = new Path2D();
                for (const id of feature.cellIds) {
                    const cell = model.cellById.get(id);
                    traceHex(path, cell.x, cell.y, model.cellSize * 0.97);
                }
                this.selectedPath = { feature, path };
            }
            ctx.fillStyle = '#ffdf9125';
            ctx.fill(this.selectedPath.path);
        }
        if (state.view === 'terrain' && layers.riverNames && layers.rivers) {
            const cell = model.cellById.get(state.selectedCellId);
            const riverId = state.selectedFeature?.startsWith('course-')
                ? state.selectedFeature
                : cartography.riverByEdge.get(cell?.riverEdgeIds[0]);
            const river = cartography.riverById.get(riverId);
            if (river) {
                ctx.beginPath();
                for (const [a, b] of river.segments) {
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                }
                ctx.strokeStyle = '#ffdf91';
                ctx.lineWidth = model.cellSize * 0.1;
                ctx.stroke();
            }
        }
    }
    drawScreen(ctx, state, camera) {
        this.labels = [];
        if (state.view !== 'terrain') {
            this.resourceCells = 0;
            return;
        }
        const { cartography, model, layers } = state;
        ctx.save();
        const boxes = [];
        const label = (feature, anchor, size, color, kind) => {
            if (this.labels.some((l) => l.id === feature.id)) return;
            const p = camera.worldToScreen(anchor.x, anchor.y);
            ctx.font = `${kind === 'river' ? 'italic' : '600'} ${size}px Georgia, serif`;
            const width = ctx.measureText(feature.name).width + 10;
            if (
                p.x < width / 2 + 4 ||
                p.x > camera.width - width / 2 - 4 ||
                p.y < 80 ||
                p.y > camera.height - 45
            )
                return;
            const rect = { x: p.x - width / 2, y: p.y - size, width, height: size * 2 };
            if (
                boxes.some(
                    (b) =>
                        rect.x < b.x + b.width &&
                        rect.x + rect.width > b.x &&
                        rect.y < b.y + b.height &&
                        rect.y + rect.height > b.y,
                )
            )
                return;
            boxes.push(rect);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#102330df';
            ctx.strokeText(feature.name, p.x, p.y);
            ctx.fillStyle = color;
            ctx.fillText(feature.name, p.x, p.y);
            this.labels.push({ id: feature.id, name: feature.name, kind, x: p.x, y: p.y });
        };
        const colors = {
            continent: '#ead9b0',
            island: '#dfd7b7',
            mountain: '#e1d6cb',
            lake: '#b8e4ef',
            ocean: '#cce5eb',
            river: '#c4e7dc',
        };
        const selected = cartography.featureById.get(state.selectedFeature);
        if (selected && layers[FEATURE_LAYERS[selected.type]] && (selected.type !== 'river' || layers.rivers))
            label(selected, selected.anchor, 17, colors[selected.type], selected.type);
        if (layers.oceanNames)
            for (const ocean of [...cartography.oceans].sort((a, b) => b.area - a.area)) {
                if (ocean.area < 5 && model.cellSize * camera.zoom < 10) continue;
                label(
                    ocean,
                    model.cellById.get(ocean.anchorId),
                    Math.min(23, 14 + Math.sqrt(ocean.area) / 3),
                    '#cce5eb',
                    'ocean',
                );
            }
        if (layers.riverNames && layers.rivers)
            for (const river of cartography.rivers) {
                if (river.length * model.cellSize * Math.sqrt(model.cellCount) * camera.zoom < 110) continue;
                label(river, river.anchor, 12, '#c4e7dc', 'river');
            }
        for (const type of ['continent', 'mountain', 'island', 'lake']) {
            if (!layers[FEATURE_LAYERS[type]]) continue;
            for (const feature of cartography.features
                .filter((f) => f.type === type)
                .sort((a, b) => b.area - a.area)) {
                const span = Math.sqrt(feature.cellIds.length) * model.cellSize * camera.zoom;
                if (span < (type === 'continent' ? 60 : 85)) continue;
                label(
                    feature,
                    feature.anchor,
                    type === 'continent' ? 19 : type === 'mountain' ? 14 : 12,
                    colors[type],
                    type,
                );
            }
        }
        ctx.restore();
    }
}
