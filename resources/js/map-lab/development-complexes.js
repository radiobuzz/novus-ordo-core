import { featureHash } from './cartography.js';
import { segmentDistance } from './living-settlement.js';

// Decorative site planning only. Every footprint and access segment is sampled
// against the existing terrain; a compound never fills a river or moves a deposit.
export function planComplex(model, field, site, unit, substrate) {
    const source = [...site.plots].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    const rivers = [...model.riverEdges.values()]
        .map((e) => [model.drainage.vertices.get(e.fromId), model.drainage.vertices.get(e.toId)])
        .filter(([a, b]) => segmentDistance(site.x, site.y, a, b) < unit * 2.5);
    const safe = (p, clearance = 0.035) => {
        const c = field.cellAt(p.x, p.y),
            s = field.sample(p.x, p.y);
        return (
            c &&
            !['ocean', 'lake'].includes(c.terrain) &&
            !c.snowCover &&
            s[1] >= 0.97 &&
            s[5] < 0.15 &&
            (!site.resource || substrate.cells.get(c.id)?.[site.resource].density > 0.02) &&
            !rivers.some(([a, b]) => segmentDistance(p.x, p.y, a, b) < unit * clearance)
        );
    };
    const plots = [],
        streets = [];
    const polygon = (p, size, pit) =>
        Array.from({ length: pit ? 32 : 8 }, (_, i) => {
            const a = (i * Math.PI * 2) / (pit ? 32 : 8);
            const r = pit ? 1 + Math.sin(a * 3 + p.variant * 5) * 0.09 + Math.cos(a * 5) * 0.035 : 1;
            return { x: p.x + Math.cos(a) * size * r, y: p.y + Math.sin(a) * size * r * (pit ? 0.72 : 0.8) };
        });
    const validFootprint = (p, points) => {
        if (!safe(p)) return false;
        // Sample the interior as well as the boundary: checking corners alone
        // would miss a narrow watercourse running through a large excavation.
        return points.every(
            (q, i) =>
                [0.25, 0.5, 0.75, 1].every((t) =>
                    safe({
                        x: p.x + (q.x - p.x) * t,
                        y: p.y + (q.y - p.y) * t,
                    }),
                ) &&
                safe({
                    x: (q.x + points[(i + 1) % points.length].x) / 2,
                    y: (q.y + points[(i + 1) % points.length].y) / 2,
                }),
        );
    };
    const fits = (p, size, margin = 0.055) =>
        plots.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > q.size + size + unit * margin);
    if (site.kind === 'mine') {
        // Prefer one substantial excavation, with a second only where terrain permits.
        for (const scale of [0.55, 0.44, 0.34, 0.26]) {
            for (const p of source) {
                if (plots.length >= 2) break;
                const size = unit * scale;
                if (!fits(p, size, 0.14)) continue;
                const points = polygon(p, size, true);
                if (!validFootprint(p, points)) continue;
                plots.push({ ...p, points, size, art: 'pit', rank: plots.length ? 0.48 : 0.06 });
            }
            if (plots.length) break;
        }
        if (!plots.length) return null;
        const pit = plots[0];
        source.sort((a, b) => Math.hypot(a.x - pit.x, a.y - pit.y) - Math.hypot(b.x - pit.x, b.y - pit.y));
    }
    let index = 0;
    for (const p of source) {
        const size =
            unit * (site.kind === 'oil' ? 0.105 + p.variant * 0.025 : site.kind === 'mine' ? 0.1 : 0.145);
        if (!fits(p, size, site.kind === 'oil' ? 0.14 : 0.06)) continue;
        const points = polygon(p, size, false);
        if (!validFootprint(p, points)) continue;
        const art =
            site.kind === 'mine'
                ? ['crusher', 'excavator', 'warehouse', 'excavator'][index % 4]
                : site.kind === 'oil'
                  ? index === 0 || index === 5
                      ? 'tanks'
                      : index === 2
                        ? 'warehouse'
                        : 'pump'
                  : index % 5 === 0
                    ? 'warehouse'
                    : index % 7 === 0
                      ? 'tanks'
                      : 'factory';
        plots.push({ ...p, points, size, art });
        index++;
        if (site.kind === 'mine' && index >= 10) break;
        if (site.kind === 'oil' && index >= 20) break;
    }
    if (plots.length < 4) return null;
    // Service tracks join nearby pads, never crossing a river, excavation or another pad.
    const pads = [...plots.filter((p) => p.art === 'pit'), ...plots.filter((p) => p.art !== 'pit')];
    for (let i = 1; i < pads.length; i++) {
        const p = pads[i];
        const near = pads
            .slice(0, i)
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
        for (const q of near.slice(0, 4)) {
            const length = Math.hypot(q.x - p.x, q.y - p.y);
            if (length > unit * 0.8) continue;
            const a = { x: p.x + ((q.x - p.x) * p.size) / length, y: p.y + ((q.y - p.y) * p.size) / length };
            const b = { x: q.x - ((q.x - p.x) * q.size) / length, y: q.y - ((q.y - p.y) * q.size) / length };
            if (
                plots.some(
                    (r) => r !== p && r !== q && segmentDistance(r.x, r.y, a, b) < r.size + unit * 0.03,
                )
            )
                continue;
            if (
                !Array.from({ length: 21 }, (_, n) => n / 20).every((t) =>
                    safe({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 0.055),
                )
            )
                continue;
            streets.push({ a, b, width: unit * 0.025, rank: Math.max(p.rank, q.rank), service: true });
            break;
        }
    }
    return { plots, streets, complex: true };
}

export const supportsUrbanIntensity = (site) => ['inland', 'coast'].includes(site?.kind);

export const architectureLabels = {
    houseClay: 'Detached houses',
    houseSlate: 'Detached houses',
    rowhouse: 'Row houses',
    midrise: 'Mid-rise blocks',
    tower: 'High-rises',
    landmark: 'Landmark towers',
    factory: 'Factory halls',
    warehouse: 'Warehouses',
    pump: 'Pumpjacks',
    tanks: 'Storage tanks',
    crusher: 'Ore processing',
    excavator: 'Excavators',
    pit: 'Terraced quarry',
};

// Density changes architecture on existing anchors and the visual paving/canopy
// treatment, never underlying geography or population. Heights taper outwards.
export function architecture(site, p, unit) {
    if (p.art) return p.art;
    if (p.use === 'fields') return null;
    if (p.use === 'industry') return p.variant > 0.7 ? 'warehouse' : 'factory';
    if (p.use === 'mine') return 'crusher';
    if (p.use === 'oil') return 'pump';
    const distance = Math.hypot((p.sourceX ?? p.x) - site.x, (p.sourceY ?? p.y) - site.y) / unit;
    const intensity = supportsUrbanIntensity(site) ? (site.urbanIntensity ?? 35) / 100 : 0;
    const density = intensity * (p.cellIntensity ?? 1) * Math.exp((-distance * distance) / 0.45);
    if (density > 0.76 && p.variant > 0.45) return 'landmark';
    if (density > 0.56 && p.variant > 0.22) return 'tower';
    if (density > 0.34) return 'midrise';
    if (density > 0.14) return 'rowhouse';
    // A small, coherent workshop fringe in the living town, not factories
    // sprinkled through its residential core or over its farmland.
    if (
        site.living &&
        (p.sourceX ?? p.x) > site.x + unit * 0.4 &&
        (p.sourceY ?? p.y) > site.y &&
        intensity > 0.4
    )
        return featureHash(p.id) > 0.65 ? 'warehouse' : 'factory';
    return p.variant > 0.5 ? 'houseSlate' : 'houseClay';
}
