import { featureHash } from '../map/cartography.js';
import { hexCorners } from './hex.js';
import { segmentDistance } from './living-settlement.js';

const contexts = new WeakMap();
const memberships = new WeakMap();
export const SCALE_DEFAULTS = { footprintScale: 100, structureScale: 100, spacing: 100, useCellData: false };
export const polygonArea = (points) =>
    Math.abs(
        points.reduce((sum, a, i) => {
            const b = points[(i + 1) % points.length];
            return sum + a.x * b.y - a.y * b.x;
        }, 0),
    ) / 2;

// Clip a parcel to a convex hex. A parcel may cross several cells without
// restarting the artwork at their edges; each cell pays its actual area share.
export function clipPolygon(subject, clip) {
    let result = subject;
    const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    for (let i = 0; i < clip.length && result.length; i++) {
        const a = clip[i],
            b = clip[(i + 1) % clip.length],
            input = result;
        result = [];
        let previous = input.at(-1),
            before = cross(a, b, previous);
        for (const p of input) {
            const after = cross(a, b, p);
            if (after >= 0 !== before >= 0) {
                const t = before / (before - after);
                result.push({
                    x: previous.x + (p.x - previous.x) * t,
                    y: previous.y + (p.y - previous.y) * t,
                });
            }
            if (after >= 0) result.push(p);
            previous = p;
            before = after;
        }
    }
    return result;
}

function inside(point, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i],
            b = polygon[j];
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
            result = !result;
    }
    return result;
}
function crosses(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

export function initializeScaleStudy(development, model, field, substrate) {
    const rivers = [...model.riverEdges.values()].map((e) => [
        model.drainage.vertices.get(e.fromId),
        model.drainage.vertices.get(e.toId),
    ]);
    const nearby = new Map();
    for (const s of development.sites) {
        Object.assign(s, SCALE_DEFAULTS);
        s.checkpoint = { plots: s.plots, streets: s.streets ?? [], cellIds: s.cellIds };
        s.indicators = new Map();
        s.indicatorRevision = 0;
        s.layoutKey = 'checkpoint';
        s.excluded = { terrain: 0, overlap: 0, allowance: 0 };
        nearby.set(
            s.id,
            model.cells
                .filter((c) => Math.hypot(c.x - s.x, c.y - s.y) < development.unit * 4)
                .map((cell) => ({ cell, polygon: hexCorners(cell.x, cell.y, model.cellSize) })),
        );
    }
    contexts.set(development, {
        model,
        field,
        substrate,
        rivers,
        nearby,
        cellArea: Math.sqrt(3) * 1.5 * model.cellSize ** 2,
    });
    return development;
}

function partsFor(development, site, plot) {
    if (memberships.has(plot)) return memberships.get(plot);
    const context = contexts.get(development),
        points = plot.points;
    const left = Math.min(...points.map((p) => p.x)),
        right = Math.max(...points.map((p) => p.x));
    const top = Math.min(...points.map((p) => p.y)),
        bottom = Math.max(...points.map((p) => p.y));
    const parts = [];
    for (const { cell, polygon } of context.nearby.get(site.id)) {
        const r = context.model.cellSize;
        if (cell.x + r < left || cell.x - r > right || cell.y + r < top || cell.y - r > bottom) continue;
        const area = polygonArea(clipPolygon(points, polygon));
        if (area > context.cellArea * 1e-7) parts.push({ cellId: cell.id, area });
    }
    memberships.set(plot, parts);
    return parts;
}

function indicatorFor(development, site, cellId) {
    if (!site.indicators.has(cellId)) {
        const { model } = contexts.get(development);
        const random = featureHash(
            `${model.geography.settings.seed}:development-indicator:${site.id}:${cellId}`,
        );
        const cell = model.cellById.get(cellId);
        const unavailable = !cell || ['ocean', 'lake'].includes(cell.terrain) || cell.snowCover;
        site.indicators.set(cellId, {
            cellId,
            coverage: unavailable
                ? 0
                : site.resource
                  ? 100
                  : site.kind === 'rural'
                    ? 85
                    : Math.round(45 + random * 25),
            intensity: Math.round(80 + random * 20),
        });
    }
    return site.indicators.get(cellId);
}

export function studyCells(development, site) {
    if (!site) return [];
    const { cellArea } = contexts.get(development),
        rows = new Map();
    // Retain rejected candidate cells so a zero allowance can be selected and raised again.
    for (const id of site.studyCellIds ?? site.cellIds)
        rows.set(id, { ...indicatorFor(development, site, id), area: 0, patches: 0 });
    for (const p of site.plots.filter((p) => p.rank < site.built / 100)) {
        for (const part of partsFor(development, site, p)) {
            if (!rows.has(part.cellId))
                rows.set(part.cellId, {
                    ...indicatorFor(development, site, part.cellId),
                    area: 0,
                    patches: 0,
                });
            const row = rows.get(part.cellId);
            row.area += part.area;
            row.patches++;
        }
    }
    return [...rows.values()]
        .map((r) => ({ ...r, usedPercent: (r.area / cellArea) * 100 }))
        .sort((a, b) => a.cellId.localeCompare(b.cellId));
}

export function setScaleValue(development, siteId, key, value) {
    const site = development.siteById.get(siteId);
    if (!site || !Object.hasOwn(SCALE_DEFAULTS, key)) return false;
    let next;
    if (key === 'useCellData') {
        if (typeof value !== 'boolean') return false;
        next = value;
    } else {
        if (!Number.isFinite(Number(value))) return false;
        const [min, max] =
            key === 'footprintScale' ? [25, 100] : key === 'structureScale' ? [40, 100] : [70, 140];
        next = Math.max(min, Math.min(max, Math.round(Number(value))));
    }
    if (site[key] === next) return true;
    site[key] = next;
    projectScale(development, site);
    return true;
}

export function restoreScaleCheckpoint(development, siteId) {
    const site = development.siteById.get(siteId);
    if (!site) return;
    Object.assign(site, SCALE_DEFAULTS);
    projectScale(development, site);
}

export function setCellIndicator(development, siteId, cellId, key, value) {
    const site = development.siteById.get(siteId);
    if (!site?.useCellData || !['coverage', 'intensity'].includes(key) || !Number.isFinite(Number(value)))
        return false;
    if (!(site.studyCellIds ?? site.cellIds).has(cellId)) return false;
    const row = indicatorFor(development, site, cellId),
        next = Math.max(0, Math.min(100, Math.round(Number(value))));
    if (row[key] !== next) {
        row[key] = next;
        site.indicatorRevision++;
        projectScale(development, site);
    }
    return true;
}

function projectScale(development, site) {
    const { model, field, substrate, rivers, cellArea } = contexts.get(development);
    const scale = site.footprintScale / 100,
        spacing = site.spacing / 100,
        structure = site.structureScale / 100;
    const unchanged = scale === 1 && spacing === 1 && structure === 1;
    site.excluded = { terrain: 0, overlap: 0, allowance: 0 };
    site.layoutKey =
        unchanged && !site.useCellData
            ? 'checkpoint'
            : `${scale}:${spacing}:${structure}:${site.useCellData ? site.indicatorRevision : 'off'}`;
    site.revision++;
    development.revision++;
    if (site.layoutKey === 'checkpoint') {
        Object.assign(site, site.checkpoint);
        site.studyCellIds = new Set(site.checkpoint.cellIds);
        return;
    }
    const transform = (p) => ({
        x: site.x + (p.x - site.x) * scale * spacing,
        y: site.y + (p.y - site.y) * scale * spacing,
    });
    const closeRivers = rivers.filter(
        ([a, b]) => segmentDistance(site.x, site.y, a, b) < development.unit * 3.5,
    );
    // The river bank does not shrink with the town. This conservatively covers
    // Terrain V2's largest world-space bank half-width (0.285 * 0.9 cell radii).
    const riverBuffer = model.cellSize * 0.26;
    const riverCuts = (points) =>
        closeRivers.some(
            ([a, b]) =>
                inside(a, points) ||
                inside(b, points) ||
                points.some((p, i) => {
                    const q = points[(i + 1) % points.length];
                    return (
                        crosses(a, b, p, q) ||
                        Math.min(
                            segmentDistance(p.x, p.y, a, b),
                            segmentDistance(q.x, q.y, a, b),
                            segmentDistance(a.x, a.y, p, q),
                            segmentDistance(b.x, b.y, p, q),
                        ) < riverBuffer
                    );
                }),
        );
    const safe = (p, clearance) => {
        const cell = field.cellAt(p.x, p.y),
            sample = field.sample(p.x, p.y);
        return (
            cell &&
            !['ocean', 'lake'].includes(cell.terrain) &&
            !cell.snowCover &&
            sample[1] >= 0.95 &&
            sample[5] < 0.2 &&
            (site.kind === 'mine' || cell.elevation < 700) &&
            (cell.slope ?? 0) < (site.kind === 'mine' ? 1200 : 700) &&
            (!site.resource || substrate.cells.get(cell.id)?.[site.resource].density > 0.02) &&
            !closeRivers.some(([a, b]) => segmentDistance(p.x, p.y, a, b) < riverBuffer + clearance)
        );
    };
    const plots = [],
        used = new Map();
    site.studyCellIds = new Set();
    const candidates = site.checkpoint.plots
        .map((p) => {
            const centre = transform(p),
                resize = scale * (p.use === 'fields' || p.art === 'pit' ? 1 : structure);
            return {
                ...p,
                ...centre,
                size: p.size * resize,
                visualScale: scale,
                sourceX: p.x,
                sourceY: p.y,
                points: p.points.map((q) => ({
                    x: centre.x + (q.x - p.x) * resize,
                    y: centre.y + (q.y - p.y) * resize,
                })),
                cellId: field.cellAt(centre.x, centre.y)?.id,
            };
        })
        .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    for (const p of candidates) {
        const parts = partsFor(development, site, p),
            area = polygonArea(p.points);
        for (const part of parts) site.studyCellIds.add(part.cellId);
        const probes = p.points.flatMap((q, i) => [
            q,
            {
                x: (q.x + p.points[(i + 1) % p.points.length].x) / 2,
                y: (q.y + p.points[(i + 1) % p.points.length].y) / 2,
            },
            ...[0.25, 0.5, 0.75].map((t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })),
        ]);
        if (
            Math.abs(parts.reduce((sum, r) => sum + r.area, 0) - area) > cellArea * 1e-5 ||
            !safe(p, development.unit * 0.014 * scale) ||
            probes.some((q) => !safe(q, development.unit * 0.009 * scale)) ||
            riverCuts(p.points)
        ) {
            site.excluded.terrain++;
            continue;
        }
        // Existing checkpoint overlaps are retained only by the exact baseline.
        // Compaction never stacks developed parcels over one another.
        if (
            plots.some(
                (q) =>
                    Math.hypot(q.x - p.x, q.y - p.y) < (q.size + p.size) * 3 &&
                    (p.art === 'pit' || q.art === 'pit'
                        ? Math.hypot(q.x - p.x, q.y - p.y) < (q.size + p.size) * 1.13
                        : polygonArea(clipPolygon(p.points, q.points)) >
                          Math.min(area, polygonArea(q.points)) * 0.01),
            )
        ) {
            site.excluded.overlap++;
            continue;
        }
        if (
            site.useCellData &&
            parts.some(
                (r) =>
                    (used.get(r.cellId) ?? 0) + r.area >
                    (cellArea * indicatorFor(development, site, r.cellId).coverage) / 100 + cellArea * 1e-7,
            )
        ) {
            site.excluded.allowance++;
            continue;
        }
        if (site.useCellData) p.cellIntensity = indicatorFor(development, site, p.cellId).intensity / 100;
        for (const part of parts) used.set(part.cellId, (used.get(part.cellId) ?? 0) + part.area);
        plots.push(p);
    }
    const streets = [];
    for (const s of plots.length ? site.checkpoint.streets : []) {
        const a = transform(s.a),
            b = transform(s.b),
            width = s.width * scale;
        if (
            !Array.from({ length: 21 }, (_, i) => ({
                x: a.x + ((b.x - a.x) * i) / 20,
                y: a.y + ((b.y - a.y) * i) / 20,
            })).every((p) => safe(p, width * 0.7 + development.unit * 0.006 * scale))
        )
            continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1,
            dx = ((b.y - a.y) * width) / length,
            dy = ((a.x - b.x) * width) / length;
        const points = [
            { x: a.x + dx, y: a.y + dy },
            { x: b.x + dx, y: b.y + dy },
            { x: b.x - dx, y: b.y - dy },
            { x: a.x - dx, y: a.y - dy },
        ];
        const parts = partsFor(development, site, { points });
        if (site.useCellData && parts.some((p) => indicatorFor(development, site, p.cellId).coverage === 0))
            continue;
        streets.push({ ...s, a, b, width, visualScale: scale });
    }
    site.plots = plots.sort((a, b) => a.y - b.y || a.x - b.x);
    site.streets = streets;
    site.cellIds = new Set(plots.flatMap((p) => partsFor(development, site, p).map((r) => r.cellId)));
}
