const SQRT3 = Math.sqrt(3);

export const axialKey = (q, r) => `${q},${r}`;

export function hexDisk(radius) {
    const cells = [];
    for (let q = -radius; q <= radius; q++) {
        const from = Math.max(-radius, -q - radius);
        const to = Math.min(radius, -q + radius);
        for (let r = from; r <= to; r++) cells.push({ q, r });
    }
    return cells;
}

export const directions = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];

export function neighborCoordinates(q, r) {
    return directions.map((direction) => ({ q: q + direction.q, r: r + direction.r }));
}

export function hexDistance(a, b) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function axialToPixel(q, r, size) {
    return {
        x: size * SQRT3 * (q + r / 2),
        y: size * 1.5 * r,
    };
}

export function pixelToAxial(x, y, size) {
    return cubeRound(((SQRT3 / 3) * x - y / 3) / size, ((2 / 3) * y) / size);
}

function cubeRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    const qDifference = Math.abs(rq - q);
    const rDifference = Math.abs(rr - r);
    const sDifference = Math.abs(rs - s);
    if (qDifference > rDifference && qDifference > sDifference) rq = -rr - rs;
    else if (rDifference > sDifference) rr = -rq - rs;
    return { q: rq, r: rr };
}

export function hexCorners(x, y, size) {
    return Array.from({ length: 6 }, (_, index) => {
        const angle = ((60 * index - 30) * Math.PI) / 180;
        return { x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) };
    });
}

export function traceHex(ctx, x, y, size) {
    const corners = hexCorners(x, y, size);
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
    ctx.closePath();
}

// This sub-lattice lets hexagonal clusters of 7, 19, 37… cells meet without gaps.
export function regionCenter(regionQ, regionR, microRadius) {
    return {
        q: (microRadius + 1) * regionQ - microRadius * regionR,
        r: microRadius * regionQ + (2 * microRadius + 1) * regionR,
    };
}
