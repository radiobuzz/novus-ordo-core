// Lab-only interpretation of existing shore measurements, not new geology or landing rules.
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
    const t = clamp(v);
    return t * t * (3 - 2 * t);
};

export function coastStyle(shore) {
    return {
        cliff: smooth((shore.shoreRise - 250) / 1550),
        rough: Math.max(
            smooth(((shore.inlandRise ?? 0) - 200) / 700),
            shore.ground == null ? 0 : 1 - shore.ground,
        ),
        exposure:
            clamp(shore.exposure ?? 0) *
            (shore.truncated ? 0.5 : 1) *
            (shore.waterType === 'lake' ? 0.35 : 1),
    };
}

/** Nearby edge lookup: independent faces, blended only at their joins. */
export class CoastalLandscape {
    constructor(model, coasts) {
        this.source = coasts;
        this.size = model.cellSize;
        this.buckets = new Map();
        this.result = {};
        this.edgeCount = 0;
        for (const shore of coasts?.shores ?? []) {
            if (!Number.isFinite(shore.shoreRise)) continue;
            const land = model.cellById.get(shore.landId),
                water = model.cellById.get(shore.waterId);
            if (!land || !water) continue;
            const [a, b] = shore.edge,
                dx = b.x - a.x,
                dy = b.y - a.y;
            const length = Math.hypot(water.x - land.x, water.y - land.y);
            const edge = {
                ...coastStyle(shore),
                a,
                dx,
                dy,
                length2: dx * dx + dy * dy,
                nx: (land.x - water.x) / length,
                ny: (land.y - water.y) / length,
            };
            this.edgeCount++;
            const margin = this.size * 1.5;
            for (
                let y = Math.floor((Math.min(a.y, b.y) - margin) / this.size);
                y <= Math.floor((Math.max(a.y, b.y) + margin) / this.size);
                y++
            ) {
                if (!this.buckets.has(y)) this.buckets.set(y, new Map());
                const row = this.buckets.get(y);
                for (
                    let x = Math.floor((Math.min(a.x, b.x) - margin) / this.size);
                    x <= Math.floor((Math.max(a.x, b.x) + margin) / this.size);
                    x++
                ) {
                    if (!row.has(x)) row.set(x, []);
                    row.get(x).push(edge);
                }
            }
        }
    }
    sample(x, y, blend = true) {
        const edges = this.buckets.get(Math.floor(y / this.size))?.get(Math.floor(x / this.size));
        if (!edges) return null;
        let first = null,
            second = null,
            d1 = Infinity,
            d2 = Infinity;
        for (const edge of edges) {
            const px = x - edge.a.x,
                py = y - edge.a.y;
            const t = clamp((px * edge.dx + py * edge.dy) / edge.length2);
            const d = Math.hypot(px - t * edge.dx, py - t * edge.dy) / this.size;
            if (d < d1) {
                second = first;
                d2 = d1;
                first = edge;
                d1 = d;
            } else if (d < d2) {
                second = edge;
                d2 = d;
            }
        }
        if (!first || d1 > 1.5) return null;
        const mix = second ? smooth(1 - (d2 - d1) / 0.3) * 0.5 : 0;
        const out = this.result;
        for (const key of ['cliff', 'rough', 'exposure'])
            out[key] = first[key] * (1 - mix) + (second?.[key] ?? 0) * mix;
        out.distance = d1;
        out.inland = ((x - first.a.x) * first.nx + (y - first.a.y) * first.ny) / this.size;
        out.blend = blend;
        return out;
    }
}

function shorePosition(profile, land) {
    // With blending, use the SAME perturbed land field that draws the coast.
    return profile.blend ? land : 0.5 + profile.inland * 0.75;
}

export function coastalClearing(profile, land) {
    if (!profile) return 0;
    const position = shorePosition(profile, land);
    return clamp((0.94 - position) / 0.2) * (0.55 + profile.cliff * 0.45);
}

export function coastalColor(rgb, profile, land, snow, ice, noise, gx, gy) {
    if (!profile) return rgb;
    const position = shorePosition(profile, land);
    const cold = 1 - smooth(Math.max(snow, ice) / 0.65);
    const grain = noise(gx * 115, gy * 115, 92);
    const patch = noise(gx * 32, gy * 32, 93);
    const blend = (color, amount, visibility = cold) => {
        const t = clamp(amount) * visibility;
        for (let k = 0; k < 3; k++) rgb[k] += (color[k] - rgb[k]) * t;
    };
    if (land >= 0.5) {
        const beach = clamp((0.79 - position) / 0.29) * (1 - profile.cliff);
        blend([173 + grain * 18, 160 + grain * 16, 113 + grain * 16], beach * 0.9);
        const face = smooth((0.89 - position) / 0.22) * profile.cliff;
        const strata = Math.sin(position * 95 + patch * 5) * 9;
        const fissure = smooth((0.4 - noise(gx * 78, gy * 78, 94)) / 0.2) * 24;
        const stone = 74 + grain * 27 + strata - fissure + smooth((position - 0.55) / 0.27) * 60;
        // Rock remains visible beside ice; snow on the land gradually covers it.
        const bareRock = 1 - smooth(snow / 0.75);
        blend([stone * 1.03, stone * 1.04, stone], face, bareRock);
        const crest = Math.exp(-(((position - 0.84) / 0.03) ** 2)) * profile.cliff * 0.6;
        blend([190, 189, 171], crest, bareRock);
        const rough = profile.rough * smooth((position - 0.76) / 0.2) * (1 - smooth(profile.distance / 1.5));
        blend([99 + grain * 29, 100 + grain * 23, 77 + grain * 23], rough * (0.12 + patch * 0.22));
    } else {
        const shadow = clamp((position - 0.36) / 0.14) * profile.cliff * 0.22;
        blend([20, 39, 44], shadow);
        const width = 0.025 + profile.exposure * 0.075;
        const rim = Math.exp(-(((position - 0.475) / width) ** 2));
        const outer = Math.exp(-(((position - 0.33 - patch * 0.025) / 0.022) ** 2)) * profile.exposure * 0.24;
        const broken = smooth((patch - 0.28) / 0.45);
        blend([177, 203, 194], (rim * (0.14 + profile.exposure * 0.48) + outer) * broken);
    }
    return rgb;
}
