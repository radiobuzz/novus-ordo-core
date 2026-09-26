import { featureHash } from './cartography.js';

export function segmentDistance(x, y, a, b) {
    const dx = b.x - a.x,
        dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

// A visual study, not a street network or a settlement simulation.
export function livingSettlement(model, field, site, unit, seed) {
    const random = (key) => featureHash(`${seed}:riverside:${site.cellId}:${key}`);
    const rivers = [...model.riverEdges.values()]
        .map((e) => ({
            a: model.drainage.vertices.get(e.fromId),
            b: model.drainage.vertices.get(e.toId),
        }))
        .filter(({ a, b }) => segmentDistance(site.x, site.y, a, b) < unit * 2.6);
    if (!rivers.length) return null;
    rivers.sort(
        (a, b) => segmentDistance(site.x, site.y, a.a, a.b) - segmentDistance(site.x, site.y, b.a, b.b),
    );
    const river = rivers[0];
    const angle = Math.atan2(river.b.y - river.a.y, river.b.x - river.a.x);
    const world = (x, y) => ({
        x: site.x + (x * Math.cos(angle) - y * Math.sin(angle)) * unit,
        y: site.y + (x * Math.sin(angle) + y * Math.cos(angle)) * unit,
    });
    const suitable = (p, clearance = 0.025) => {
        const c = field.cellAt(p.x, p.y),
            s = field.sample(p.x, p.y);
        return (
            c &&
            !['ocean', 'lake'].includes(c.terrain) &&
            !c.snowCover &&
            c.elevation < 700 &&
            (c.slope ?? 0) < 520 &&
            s[1] >= 0.97 &&
            s[5] < 0.15 &&
            !rivers.some(({ a, b }) => segmentDistance(p.x, p.y, a, b) < clearance * unit)
        );
    };
    const plots = [],
        streets = [];
    const lanes = [-0.48, -0.12, 0.27, 0.65];
    const laneY = (x, offset) => offset + Math.sin(x * 1.8 + 0.4) * 0.14 + x * x * 0.035;
    for (let lane = 0; lane < lanes.length; lane++) {
        const offset = lanes[lane];
        for (let i = -13; i < 13; i++) {
            const x = i * 0.1,
                nextX = (i + 1) * 0.1;
            const a = world(x, laneY(x, offset)),
                b = world(nextX, laneY(nextX, offset));
            if (
                suitable(a, 0.06) &&
                suitable(b, 0.06) &&
                suitable({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 0.06)
            )
                streets.push({
                    a,
                    b,
                    width: unit * 0.025,
                    rank: Math.min(0.98, Math.hypot(x, offset) * 0.57),
                });
        }
        for (let i = -9; i <= 9; i++)
            for (const side of [-1, 1]) {
                const key = `${lane}:${i}:${side}`;
                const x = i * 0.13 + (random(`${key}:x`) - 0.5) * 0.04;
                if (Math.abs(x) > 0.85 && random(`${key}:gap`) > 0.55) continue;
                const y = laneY(x, offset) + side * (0.075 + random(`${key}:y`) * 0.025);
                const p = world(x, y),
                    size = unit * (0.039 + random(`${key}:size`) * 0.014);
                // Reserve cross-lane corridors before placing roofs, not after them.
                if (
                    [-0.73, 0.16, 0.91].some((cross) => {
                        const q = world(cross + Math.sin(y * 3) * 0.055, y);
                        return Math.hypot(q.x - p.x, q.y - p.y) < size * 1.5 + unit * 0.014;
                    })
                )
                    continue;
                const points = Array.from({ length: 8 }, (_, j) => ({
                    x: p.x + Math.cos((j * Math.PI) / 4) * size * 1.6,
                    y: p.y + Math.sin((j * Math.PI) / 4) * size * 1.6,
                }));
                if (!suitable(p, 0.1) || points.some((q) => !suitable(q, 0.055))) continue;
                const pathEnd = world(x, laneY(x, offset));
                if (!suitable(pathEnd, 0.06)) continue;
                const rank = Math.min(0.98, Math.hypot(x, y) * 0.58 + random(`${key}:rank`) * 0.1);
                plots.push({
                    id: `${site.id}:home:${key}`,
                    ...p,
                    size,
                    points,
                    cellId: field.cellAt(p.x, p.y).id,
                    use: 'homes',
                    living: true,
                    rank,
                    variant: random(`${key}:variant`),
                    angle: angle + Math.atan(Math.cos(x * 1.8 + 0.4) * 0.252 + x * 0.07),
                    dense: false,
                });
                streets.push({ a: p, b: pathEnd, width: unit * 0.012, rank });
            }
    }
    // Cross lanes, sampled so no decorative street crosses water or steep terrain.
    for (const x of [-0.73, 0.16, 0.91])
        for (let i = -8; i < 11; i++) {
            const y = i * 0.1,
                a = world(x + Math.sin(y * 3) * 0.055, y),
                b = world(x + Math.sin((y + 0.1) * 3) * 0.055, y + 0.1);
            if (
                suitable(a, 0.06) &&
                suitable(b, 0.06) &&
                suitable({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 0.06)
            )
                streets.push({ a, b, width: unit * 0.021, rank: Math.min(0.98, Math.hypot(x, y) * 0.58) });
        }
    for (let row = 0; row < 3; row++)
        for (let col = -4; col <= 4; col++)
            for (const side of [-1, 1]) {
                const key = `field:${row}:${col}:${side}`,
                    x = col * 0.34 + (random(`${key}:x`) - 0.5) * 0.07;
                const y = side * (0.9 + row * 0.3) + Math.sin(x * 1.8) * 0.1;
                const p = world(x, y),
                    w = 0.145 + random(`${key}:w`) * 0.035,
                    h = 0.11 + random(`${key}:h`) * 0.025;
                const points = [
                    world(x - w, y - h),
                    world(x + w, y - h * 0.8),
                    world(x + w * 0.8, y + h),
                    world(x - w * 1.05, y + h * 0.9),
                ];
                const midpoints = points.map((a, j) => ({
                    x: (a.x + points[(j + 1) % 4].x) / 2,
                    y: (a.y + points[(j + 1) % 4].y) / 2,
                }));
                if (
                    !suitable(p, 0.09) ||
                    [...points, ...midpoints].some((q) => !suitable(q, 0.07)) ||
                    field.cellAt(p.x, p.y).moisture < 0.3 ||
                    plots.some(
                        (home) =>
                            home.use === 'homes' && Math.hypot(home.x - p.x, home.y - p.y) < unit * 0.26,
                    )
                )
                    continue;
                plots.push({
                    id: `${site.id}:${key}`,
                    ...p,
                    size: unit * 0.2,
                    points,
                    cellId: field.cellAt(p.x, p.y).id,
                    use: 'fields',
                    living: true,
                    rank: Math.min(0.98, 0.2 + Math.hypot(x, y) * 0.33 + random(`${key}:rank`) * 0.08),
                    variant: random(key),
                    angle,
                    dense: false,
                });
            }
    if (
        plots.filter((p) => p.use === 'homes').length < 12 ||
        plots.filter((p) => p.use === 'fields').length < 4
    )
        return null;
    return { plots: plots.sort((a, b) => a.y - b.y || a.x - b.x), streets, living: true };
}
