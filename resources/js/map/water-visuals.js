// Read-only lab presentation. The first depth stops match the overview's
// shallow/deep colours and scale (550 m ocean, 140 m lake); deeper water keeps
// differentiating rather than becoming one flat colour.
const depthStops = [
    [0, [66, 139, 152]],
    [1, [25, 61, 86]],
    [3, [17, 42, 61]],
    [8, [11, 29, 43]],
];
export function waterDepthTone(depth) {
    const value = Math.max(0, Number.isFinite(depth) ? depth : 0);
    for (let i = 1; i < depthStops.length; i++) {
        const [end, right] = depthStops[i],
            [start, left] = depthStops[i - 1];
        if (value <= end) {
            const t = (value - start) / (end - start);
            return left.map((v, k) => v + (right[k] - v) * t);
        }
    }
    return depthStops.at(-1)[1];
}

// Same nominal channel-width scale as the overview, without integer buckets.
// Screen-space readability is applied only at draw time, not stored in paths.
export function riverWidth(cellSize, flow) {
    return cellSize * (0.06 + Math.min(5, Math.log2(1 + Math.max(0, flow) * 3)) * 0.045);
}

const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function corner(points, i) {
    const p = points[i];
    if (!i || i === points.length - 1) return { start: p, middle: p, end: p, point: p };
    const start = mix(p, points[i - 1], 0.18),
        end = mix(p, points[i + 1], 0.18);
    return { start, end, point: p, middle: mix(mix(start, p, 0.5), mix(p, end, 0.5), 0.5) };
}

// Each edge owns two half-corners. Adjacent pieces meet on the same curve;
// only true endpoints/confluences remain exact vertices. No routing changes.
export function riverStrokes(model) {
    const result = [];
    for (const river of model.rivers) {
        const corners = river.points.map((_, i) => corner(river.points, i));
        river.edgeIds.forEach((id, i) => {
            const edge = model.riverEdges.get(id),
                a = corners[i],
                b = corners[i + 1];
            if (!edge || !a || !b) return;
            result.push({
                id,
                width: riverWidth(model.cellSize, edge.flow),
                start: a.middle,
                startControl: mix(a.point, a.end, 0.5),
                startEnd: a.end,
                endStart: b.start,
                endControl: mix(b.start, b.point, 0.5),
                end: b.middle,
            });
        });
    }
    return result;
}
