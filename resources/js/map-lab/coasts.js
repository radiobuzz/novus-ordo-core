import { axialKey, neighborCoordinates, pixelToAxial, hexCorners } from './hex.js';

const water = (c) => c && ['ocean', 'lake'].includes(c.terrain);
const sides = [
    [0, 1],
    [5, 0],
    [4, 5],
    [3, 4],
    [2, 3],
    [1, 2],
];
const TAU = Math.PI * 2;
export const ACCESS_LABELS = ['Favourable', 'Limited', 'Difficult', 'Unsuitable'];
export const EXPOSURE_LABELS = ['Sheltered', 'Partly sheltered', 'Open', 'Exposed'];
export const COAST_COLORS = ['#65d6bc', '#b7d77a', '#edb65d', '#e77c77'];
export const coastActive = (state) => state.labFocus === 'coasts' && state.view === 'terrain';

function pointCell(model, x, y) {
    const p = pixelToAxial(x - (model.offsetX ?? 0), y - (model.offsetY ?? 0), model.cellSize);
    return model.cellById.get(axialKey(p.q, p.r));
}
function neighbors(model, c) {
    return neighborCoordinates(c.q, c.r).map((p) => model.cellById.get(axialKey(p.q, p.r)));
}
export function shoreEdge(model, land, direction) {
    const corners = hexCorners(land.x, land.y, model.cellSize);
    return sides[direction].map((i) => corners[i]);
}

// Distances are in region-lengths, not kilometres. No wind, surf or seabed simulation.
function rayPaths(model, unit) {
    const range = unit * 3,
        step = model.cellSize * 0.5;
    return Array.from({ length: 24 }, (_, i) => {
        const angle = (i * TAU) / 24;
        const path = [],
            seen = new Set(['0,0']);
        for (let d = step; d <= range; d += step) {
            const p = pixelToAxial(Math.cos(angle) * d, Math.sin(angle) * d, model.cellSize);
            const id = axialKey(p.q, p.r);
            if (!seen.has(id)) {
                path.push({ ...p, distance: d / range });
                seen.add(id);
            }
        }
        return path;
    });
}
function rays(model, cell, paths) {
    return paths.map((path) => {
        for (const p of path) {
            const hit = model.cellById.get(axialKey(cell.q + p.q, cell.r + p.r));
            if (!hit) return { distance: p.distance, unknown: true, open: true };
            if (!water(hit) || hit.terrain !== cell.terrain)
                return { distance: p.distance, unknown: false, open: false };
        }
        return { distance: 1, unknown: false, open: true };
    });
}
function openingRuns(samples) {
    const closed = samples.findIndex((s) => !s.open);
    if (closed < 0) return [24];
    const runs = [];
    let length = 0;
    for (let i = 1; i <= 24; i++) {
        if (samples[(closed + i) % 24].open) length++;
        else if (length) {
            runs.push(length);
            length = 0;
        }
    }
    return runs.sort((a, b) => b - a);
}

export function createCoasts(model) {
    const unit = model.cellSize * Math.sqrt(model.cellCount);
    const paths = rayPaths(model, unit);
    const rayCache = new Map();
    const survey = (c) => {
        if (!rayCache.has(c.id)) rayCache.set(c.id, rays(model, c, paths));
        return rayCache.get(c.id);
    };
    const shores = [],
        shoreById = new Map(),
        shoresByCell = new Map();
    for (const land of model.cells) {
        if (water(land)) continue;
        neighbors(model, land).forEach((sea, direction) => {
            if (!water(sea)) return;
            const edge = shoreEdge(model, land, direction);
            const facing = Math.atan2(sea.y - land.y, sea.x - land.x);
            const samples = survey(sea).filter((_, i) => Math.cos((i * TAU) / 24 - facing) >= 0.49);
            const exposure = samples.reduce((sum, s) => sum + s.distance, 0) / samples.length;
            const surface = sea.terrain === 'lake' ? sea.waterLevel : 0;
            const knownSurface = Number.isFinite(surface);
            const rise = knownSurface ? Math.max(0, land.elevation - surface) : null;
            const shoreRise = rise === null ? null : rise / ((Math.sqrt(3) * model.cellSize) / unit);
            const inland = [];
            for (let i = -2; i <= 2; i++) {
                const a = facing + Math.PI + (i * Math.PI) / 8;
                const c = pointCell(model, land.x + Math.cos(a) * unit, land.y + Math.sin(a) * unit);
                if (c && !water(c)) inland.push(c);
            }
            const inlandRise = inland.length
                ? Math.min(...inland.map((c) => Math.max(0, c.elevation - land.elevation)))
                : null;
            const ground = inland.filter((c) => Math.abs(c.elevation - land.elevation) < 350).length / 5;
            const accessGrade =
                shoreRise === null
                    ? null
                    : Math.max(
                          shoreRise < 350 ? 0 : shoreRise < 900 ? 1 : shoreRise < 1800 ? 2 : 3,
                          inlandRise === null ? 1 : inlandRise > 700 ? 2 : ground < 0.4 ? 1 : 0,
                      );
            const reasons = [
                shoreRise === null
                    ? 'Unknown water surface'
                    : shoreRise < 350
                      ? 'Gentle shore rise'
                      : shoreRise < 900
                        ? 'Moderate shore rise'
                        : shoreRise < 1800
                          ? 'Steep shore rise'
                          : 'Cliff-like shore rise',
                inlandRise === null
                    ? 'Inland access unresolved at this sampling scale'
                    : inlandRise > 700
                      ? 'Steep inland approach'
                      : ground < 0.4
                        ? 'Restricted usable ground inland'
                        : 'Broad, lower-relief ground inland',
            ];
            if (sea.polarIce) reasons.push('Frozen water: seasonal accessibility is not modeled');
            const shore = {
                id: `shore:${land.id}:${sea.id}`,
                landId: land.id,
                waterId: sea.id,
                waterType: sea.terrain,
                edge,
                midpoint: { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 },
                exposure,
                exposureGrade: Math.min(3, Math.floor(exposure * 4)),
                truncated: samples.some((s) => s.unknown),
                surface: knownSurface ? surface : null,
                shoreRise,
                inlandRise,
                ground,
                accessGrade,
                reasons,
            };
            shores.push(shore);
            shoreById.set(shore.id, shore);
            for (const c of [land, sea]) {
                if (!shoresByCell.has(c.id)) shoresByCell.set(c.id, []);
                shoresByCell.get(c.id).push(shore.id);
            }
        });
    }

    // Local enclosure candidates, independent of arbitrary named-ocean partitions.
    // Two substantial openings reject straits; cropped rays never manufacture enclosure.
    const eligible = new Set();
    for (const c of model.cells) {
        if (!water(c)) continue;
        const samples = survey(c),
            runs = openingRuns(samples);
        const blocked = samples.filter((s) => !s.open).length;
        if (
            !samples.some((s) => s.unknown) &&
            blocked >= 16 &&
            blocked <= 22 &&
            runs[0] >= 2 &&
            (runs[1] ?? 0) < 2
        )
            eligible.add(c.id);
    }
    const bays = [];
    while (eligible.size) {
        const ids = [eligible.values().next().value];
        eligible.delete(ids[0]);
        for (let i = 0; i < ids.length; i++) {
            const c = model.cellById.get(ids[i]);
            for (const n of neighbors(model, c))
                if (n?.terrain === c.terrain && eligible.delete(n.id)) ids.push(n.id);
        }
        const area = ids.length / model.cellCount;
        if (area < 0.15 || area > 18) continue;
        const members = new Set(ids),
            mouth = [],
            mouthCells = new Set();
        let landEdges = 0;
        for (const id of ids) {
            const c = model.cellById.get(id);
            neighbors(model, c).forEach((n, d) => {
                if (!n || members.has(n.id)) return;
                if (!water(n)) landEdges++;
                else {
                    mouth.push(shoreEdge(model, c, d));
                    mouthCells.add(id);
                }
            });
        }
        if (!mouth.length || landEdges < mouth.length * 0.85) continue;
        // Mouth must form a single substantial connected arc, not two channel exits.
        const key = (p) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
        const at = new Map();
        mouth.forEach((edge, i) =>
            edge.forEach((p) => {
                const k = key(p);
                if (!at.has(k)) at.set(k, []);
                at.get(k).push(i);
            }),
        );
        const unseen = new Set(mouth.map((_, i) => i)),
            arcs = [];
        while (unseen.size) {
            const queue = [unseen.values().next().value];
            unseen.delete(queue[0]);
            for (let i = 0; i < queue.length; i++)
                for (const p of mouth[queue[i]])
                    for (const next of at.get(key(p))) if (unseen.delete(next)) queue.push(next);
            arcs.push(queue.length);
        }
        arcs.sort((a, b) => b - a);
        if (arcs.length !== 1) continue;
        const depth = new Map([...mouthCells].map((id) => [id, 0])),
            queue = [...mouthCells];
        for (let i = 0; i < queue.length; i++)
            for (const n of neighbors(model, model.cellById.get(queue[i])))
                if (n && members.has(n.id) && !depth.has(n.id)) {
                    depth.set(n.id, depth.get(queue[i]) + 1);
                    queue.push(n.id);
                }
        const inward = ((Math.max(...depth.values()) + 0.5) * Math.sqrt(3) * model.cellSize) / unit;
        const mouthWidth = (mouth.length * model.cellSize) / unit;
        if (inward / mouthWidth < 0.18) continue;
        const centre = ids.reduce(
            (p, id) => {
                const c = model.cellById.get(id);
                return { x: p.x + c.x / ids.length, y: p.y + c.y / ids.length };
            },
            { x: 0, y: 0 },
        );
        const anchor = ids
            .map((id) => model.cellById.get(id))
            .reduce((best, c) =>
                Math.hypot(c.x - centre.x, c.y - centre.y) < Math.hypot(best.x - centre.x, best.y - centre.y)
                    ? c
                    : best,
            );
        ids.sort();
        bays.push({
            id: `bay-${ids[0]}`,
            type: 'bay',
            cellIds: ids,
            area,
            anchorId: anchor.id,
            anchor: { x: anchor.x, y: anchor.y },
            mouth,
            mouthWidth,
            inward,
            enclosure: landEdges / (landEdges + mouth.length),
            waterType: anchor.terrain,
            relations: [],
        });
    }
    bays.sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
    return { shores, shoreById, shoresByCell, bays, unit, rayRange: 3 };
}
