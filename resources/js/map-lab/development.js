import { featureHash } from './cartography.js';
import { TerrainField } from './terrain-v2-field.js';
import { neighborCoordinates, axialKey } from './hex.js';
import { livingSettlement } from './living-settlement.js';
import { planComplex, supportsUrbanIntensity } from './development-complexes.js';
import { initializeScaleStudy } from './development-scale.js';

export const developmentActive = (state) => state.labFocus === 'development' && state.view === 'terrain';
export const DEVELOPMENT_TYPES = {
    coast: 'Coastal settlement',
    inland: 'Inland settlement',
    rural: 'Farming district',
    industry: 'Industrial district',
    mine: 'Mineral workings',
    oil: 'Oil field',
};
const land = (c) => c && !['ocean', 'lake'].includes(c.terrain);
const habitable = (c) => land(c) && !c.snowCover && !c.polarIce && c.elevation < 700 && (c.slope ?? 0) < 700;
const clamp = (n) => Math.max(0, Math.min(100, n));

function segmentDistance(x, y, a, b) {
    const dx = b.x - a.x,
        dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

// Decorative footprints derived once in world space. None is a simulated building.
export function createDevelopment(model, cartography, substrate) {
    const unit = model.cellSize * Math.sqrt(model.cellCount),
        seed = model.geography.settings.seed;
    const field = new TerrainField(model),
        sites = [],
        used = [];
    const coast = new Set(
        cartography.coasts.shores
            .filter((s) => s.waterType === 'ocean' && (s.accessGrade ?? 3) < 2)
            .map((s) => s.landId),
    );
    const neighbors = (c) => neighborCoordinates(c.q, c.r).map((p) => model.cellById.get(axialKey(p.q, p.r)));
    const candidates = model.cells.filter(habitable);
    const quality = (c) =>
        neighbors(c).filter(habitable).length * 10 + (c.moisture ?? 0.5) * 12 - c.elevation / 80;
    const definitions = [
        ['coast', (c) => (coast.has(c.id) ? quality(c) : -Infinity), 65],
        [
            'inland',
            (c) =>
                !neighbors(c).every(land)
                    ? -Infinity
                    : quality(c) + (c.riverEdgeIds?.length ? 90 : 0) + (c.vegetation === 'forest' ? 55 : 0),
            80,
        ],
        ['rural', (c) => ((c.moisture ?? 0) > 0.3 ? quality(c) + (c.moisture ?? 0) * 30 : -Infinity), 70],
        ['industry', (c) => quality(c), 65],
        [
            'mine',
            (c) =>
                Math.max(
                    substrate.cells.get(c.id)?.Copper.density ?? 0,
                    substrate.cells.get(c.id)?.Iron.density ?? 0,
                ) * 100,
            55,
        ],
        ['oil', (c) => (substrate.cells.get(c.id)?.Oil.density ?? 0) * 100, 50],
    ];
    const omissions = [];
    for (const [kind, score, built] of definitions) {
        const pool =
            kind === 'mine'
                ? model.cells.filter((c) => land(c) && !c.snowCover && (c.slope ?? 0) < 1200)
                : candidates;
        const ranked = pool
            .filter((c) => used.every((p) => Math.hypot(c.x - p.x, c.y - p.y) > unit * 3.4))
            .map((c) => ({ c, score: score(c) + featureHash(`${seed}:development:${kind}:${c.id}`) * 0.001 }))
            .filter((p) => Number.isFinite(p.score) && (!['mine', 'oil'].includes(kind) || p.score > 3))
            .sort((a, b) => b.score - a.score);
        let selected = null;
        for (const { c } of ranked.slice(0, 12)) {
            const resource =
                kind === 'oil'
                    ? 'Oil'
                    : kind === 'mine'
                      ? substrate.cells.get(c.id).Copper.density >= substrate.cells.get(c.id).Iron.density
                          ? 'Copper'
                          : 'Iron'
                      : null;
            const site = {
                id: `development-${kind}`,
                kind,
                name: `${['Alder', 'Mere', 'Ash', 'Bracken', 'Cairn', 'Selka'][sites.length]} ${kind === 'coast' ? 'Baytown' : kind === 'inland' ? 'Crossing' : kind === 'rural' ? 'Vale' : kind === 'industry' ? 'Works' : kind === 'mine' ? 'Diggings' : 'Oilfield'}`,
                x: c.x,
                y: c.y,
                cellId: c.id,
                resource,
                built,
                activity: 100,
                urbanIntensity: ['coast', 'inland'].includes(kind) ? 35 : 0,
                plots: [],
                cellIds: new Set(),
                revision: 0,
            };
            for (let row = -8; row <= 8; row++)
                for (let col = -8; col <= 8; col++) {
                    const id = `${site.id}:${col}:${row}`,
                        random = (s) => featureHash(`${seed}:${id}:${s}`);
                    // Adjacent parcels share gently warped corners. Narrow lanes/hedges
                    // separate them without turning the landscape into isolated tokens.
                    const corner = (column, line) => {
                        const jitter = (axis) =>
                            featureHash(`${seed}:${site.id}:junction:${column}:${line}:${axis}`) - 0.5;
                        return {
                            x: c.x + (column - 0.5 + jitter('x') * 0.32) * unit * 0.18,
                            y: c.y + (line - 0.5 + jitter('y') * 0.32) * unit * 0.18,
                        };
                    };
                    const corners = [
                        corner(col, row),
                        corner(col + 1, row),
                        corner(col + 1, row + 1),
                        corner(col, row + 1),
                    ];
                    const x = corners.reduce((n, p) => n + p.x, 0) / 4,
                        y = corners.reduce((n, p) => n + p.y, 0) / 4;
                    const dx = x - c.x,
                        dy = y - c.y;
                    const distance = Math.hypot(dx, dy) / unit;
                    if (distance > 1.4) continue;
                    const size = unit * (0.07 + random('size') * 0.012);
                    const cell = field.cellAt(x, y);
                    if (
                        !(kind === 'mine'
                            ? land(cell) && !cell.snowCover && (cell.slope ?? 0) < 1200
                            : habitable(cell))
                    )
                        continue;
                    if (resource && !(substrate.cells.get(cell.id)?.[resource].density > 0.02)) continue;
                    const points = corners.map((p) => ({ x: x + (p.x - x) * 0.97, y: y + (p.y - y) * 0.97 }));
                    if (
                        points.some((p) => {
                            const sample = field.sample(p.x, p.y);
                            return !land(field.cellAt(p.x, p.y)) || sample[1] < 0.95 || sample[5] > 0.2;
                        })
                    )
                        continue;
                    // River beds remain visible. Do not put roofs/pits across rendered water edges.
                    const edges = new Set(
                        [cell, ...neighbors(cell)].filter(Boolean).flatMap((n) => n.riverEdgeIds ?? []),
                    );
                    if (
                        [...edges].some((edgeId) => {
                            const edge = model.riverEdges.get(edgeId);
                            const a = model.drainage.vertices.get(edge.fromId),
                                b = model.drainage.vertices.get(edge.toId);
                            return segmentDistance(x, y, a, b) < size * 1.9;
                        })
                    )
                        continue;
                    let use =
                        kind === 'industry'
                            ? 'industry'
                            : kind === 'mine'
                              ? 'mine'
                              : kind === 'oil'
                                ? 'oil'
                                : 'homes';
                    if (['rural', 'coast', 'inland'].includes(kind)) {
                        if (kind === 'rural' ? random('use') > 0.16 : distance > 0.75 && random('use') > 0.28)
                            use = 'fields';
                        else if (kind !== 'rural' && distance > 0.45 && random('use') > 0.87)
                            use = 'industry';
                        if (use === 'fields' && ((cell.moisture ?? 0) < 0.25 || (cell.slope ?? 0) > 400))
                            continue;
                    }
                    const rank = Math.min(0.99, (distance / 1.5) * 0.8 + random('rank') * 0.19);
                    site.plots.push({
                        id,
                        x,
                        y,
                        size,
                        points,
                        cellId: cell.id,
                        use,
                        rank,
                        variant: random('variant'),
                        angle: (random('angle') - 0.5) * 0.5,
                        dense: distance < 0.55,
                    });
                    site.cellIds.add(cell.id);
                }
            if (kind === 'inland') {
                const living = livingSettlement(model, field, site, unit, seed);
                if (living) {
                    Object.assign(site, living);
                    site.cellIds = new Set(site.plots.map((p) => p.cellId));
                }
            }
            if (['industry', 'mine', 'oil'].includes(kind)) {
                const complex = planComplex(model, field, site, unit, substrate);
                if (!complex) continue;
                Object.assign(site, complex);
                site.cellIds = new Set(site.plots.map((p) => p.cellId));
            }
            if (site.plots.length < (site.complex ? 4 : 8)) continue;
            site.defaultBuilt = built;
            site.plots.sort((a, b) => a.y - b.y || a.x - b.x);
            selected = site;
            break;
        }
        if (selected) {
            sites.push(selected);
            used.push(selected);
        } else omissions.push(`${DEVELOPMENT_TYPES[kind]}: no sufficiently large suitable site on this map.`);
    }
    return initializeScaleStudy(
        { sites, siteById: new Map(sites.map((s) => [s.id, s])), unit, omissions, revision: 0 },
        model,
        field,
        substrate,
    );
}

export function builtPlots(site) {
    return site.plots.filter((p) => p.rank < site.built / 100);
}
export function setDevelopmentValue(development, siteId, key, value) {
    const site = development.siteById.get(siteId);
    if (!site || !['built', 'activity', 'urbanIntensity'].includes(key) || !Number.isFinite(Number(value)))
        return false;
    if (key === 'urbanIntensity' && !supportsUrbanIntensity(site)) return false;
    const next = Math.round(clamp(Number(value)));
    if (site[key] !== next) {
        site[key] = next;
        site.revision++;
        development.revision++;
    }
    return true;
}
export function developmentStage(site) {
    if (!site.built) return 'Undeveloped';
    if (['coast', 'inland', 'rural'].includes(site.kind))
        return site.built < 35
            ? 'Sparse settlement'
            : site.built < 75
              ? 'Growing town / countryside'
              : 'Established settlement';
    return site.built < 35
        ? 'Small developed footprint'
        : site.built < 75
          ? 'Expanding district'
          : 'Established district';
}
export function plotActivity(site, plot, substrate) {
    if (site.resource && !(substrate.cells.get(plot.cellId)?.[site.resource].density > 0)) return 0;
    return site.activity / 100;
}
