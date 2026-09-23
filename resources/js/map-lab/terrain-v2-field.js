import { geographyPoint } from './geography.js';
import { pixelToAxial, axialKey, axialToPixel } from './hex.js';

export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export function terrainNoise(seed) {
    let salt = 2166136261;
    for (const c of seed) salt = Math.imul(salt ^ c.charCodeAt(0), 16777619);
    const hash = (x, y, lane = 0) => {
        let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt ^ Math.imul(lane, 1274126177);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (x, y, lane = 0) => {
        const ix = Math.floor(x),
            iy = Math.floor(y);
        const a = x - ix,
            b = y - iy,
            u = a * a * (3 - 2 * a),
            v = b * b * (3 - 2 * b);
        return (
            (hash(ix, iy, lane) * (1 - u) + hash(ix + 1, iy, lane) * u) * (1 - v) +
            (hash(ix, iy + 1, lane) * (1 - u) + hash(ix + 1, iy + 1, lane) * u) * v
        );
    };
    return { hash, noise };
}

// Read-only, continuous visual fields over the existing triangular dual grid.
// Exact cell centres retain their original land/water identity. No game data is written.
export class TerrainField {
    constructor(model) {
        this.model = model;
        Object.assign(this, terrainNoise(model.geography.settings.seed));
        this.unit = model.cellSize * Math.sqrt(model.cellCount);
        this.minQ = Math.min(...model.cells.map((c) => c.q)) - 2;
        this.minR = Math.min(...model.cells.map((c) => c.r)) - 2;
        this.width = Math.max(...model.cells.map((c) => c.q)) - this.minQ + 3;
        this.height = Math.max(...model.cells.map((c) => c.r)) - this.minR + 3;
        this.data = new Float32Array(this.width * this.height * 9);
        for (const cell of model.cells) {
            const offset = this.index(cell.q, cell.r);
            this.data.set(
                [
                    1,
                    ['lake', 'ocean'].includes(cell.terrain) ? 0 : 1,
                    cell.elevation,
                    cell.vegetation === 'forest' ? 1 : 0,
                    cell.moisture ?? 0.5,
                    cell.snowCover ? 1 : 0,
                    cell.frozen ? 1 : 0,
                    cell.reliefShade ?? 1,
                    cell.temperature ?? 0.5,
                ],
                offset,
            );
        }
    }
    index(q, r) {
        const col = q - this.minQ,
            row = r - this.minR;
        return col < 0 || row < 0 || col >= this.width || row >= this.height
            ? -9
            : (row * this.width + col) * 9;
    }
    geographic(x, y) {
        const { model } = this;
        const q = ((Math.sqrt(3) / 3) * (x - model.offsetX) - (y - model.offsetY) / 3) / model.cellSize;
        const r = ((2 / 3) * (y - model.offsetY)) / model.cellSize;
        return geographyPoint(q, r, model.microRadius, model.scale === 'scenario');
    }
    world(gx, gy) {
        const { model } = this,
            shift = model.scale === 'scenario' ? 10 : 0;
        const u = gx - gy / Math.sqrt(3) - shift,
            v = (gy * 2) / Math.sqrt(3) - shift,
            radius = model.microRadius;
        const p = axialToPixel(
            (radius + 1) * u - radius * v,
            radius * u + (2 * radius + 1) * v,
            model.cellSize,
        );
        return { x: p.x + model.offsetX, y: p.y + model.offsetY };
    }
    sample(x, y, out = new Float64Array(9), blend = true) {
        const { model, data } = this;
        const q = ((Math.sqrt(3) / 3) * (x - model.offsetX) - (y - model.offsetY) / 3) / model.cellSize;
        const r = ((2 / 3) * (y - model.offsetY)) / model.cellSize;
        const p = pixelToAxial(x - model.offsetX, y - model.offsetY, model.cellSize);
        const nearest = this.index(p.q, p.r);
        if (!data[nearest]) {
            out.fill(0);
            return out;
        }
        if (!blend) {
            for (let k = 0; k < 9; k++) out[k] = data[nearest + k];
            return out;
        }
        const iq = Math.floor(q),
            ir = Math.floor(r),
            u = q - iq,
            v = r - ir;
        let a, b, c, wa, wb, wc;
        if (u + v <= 1) {
            a = this.index(iq, ir);
            b = this.index(iq + 1, ir);
            c = this.index(iq, ir + 1);
            wa = 1 - u - v;
            wb = u;
            wc = v;
        } else {
            a = this.index(iq + 1, ir + 1);
            b = this.index(iq, ir + 1);
            c = this.index(iq + 1, ir);
            wa = u + v - 1;
            wb = 1 - u;
            wc = 1 - v;
        }
        if (!data[a]) a = nearest;
        if (!data[b]) b = nearest;
        if (!data[c]) c = nearest;
        wa = wa * wa * (3 - 2 * wa);
        wb = wb * wb * (3 - 2 * wb);
        wc = wc * wc * (3 - 2 * wc);
        const sum = wa + wb + wc;
        wa /= sum;
        wb /= sum;
        wc /= sum;
        for (let k = 0; k < 9; k++) out[k] = data[a + k] * wa + data[b + k] * wb + data[c + k] * wc;
        return out;
    }
    cellAt(x, y) {
        const p = pixelToAxial(x - this.model.offsetX, y - this.model.offsetY, this.model.cellSize);
        return this.model.cellById.get(axialKey(p.q, p.r));
    }
}

export function terrainColor(field, sample, gx, gy, relief = true) {
    if (!sample[0]) return [0, 0, 0, 0];
    const noise = field.noise;
    const broad = noise(gx * 2.4, gy * 2.4, 5),
        fine = noise(gx * 55, gy * 55, 9) - 0.5;
    const land = sample[1] + (noise(gx * 13, gy * 13, 3) - 0.5) * 0.12 * (1 - Math.abs(sample[1] * 2 - 1));
    const height = sample[2],
        forest = sample[3],
        moisture = sample[4],
        snow = sample[5],
        ice = sample[6];
    let r, g, b;
    if (land < 0.5) {
        const shallow = clamp(land * 1.65 + 0.22 * (1 - clamp(-height / 450)));
        r = 24 + shallow * 37;
        g = 55 + shallow * 64;
        b = 70 + shallow * 57;
        const wave = Math.sin(gy * 190 + noise(gx * 28, gy * 28, 8) * 8) * 0.8 + fine * 2;
        r += wave;
        g += wave;
        b += wave;
        if (land > 0.46) {
            const foam = ((land - 0.46) / 0.04) * 0.3;
            r += (171 - r) * foam;
            g += (190 - g) * foam;
            b += (171 - b) * foam;
        }
        if (ice > 0.3) {
            const t = clamp((ice - 0.3) / 0.7);
            r += (164 + fine * 15 - r) * t;
            g += (197 + fine * 10 - g) * t;
            b += (203 + fine * 10 - b) * t;
        }
    } else {
        const rock = clamp((height - 430) / 850),
            dry = 1 - clamp(moisture);
        r = 95 + dry * 37 + broad * 17 - forest * 25;
        g = 114 + broad * 24 - dry * 8 - forest * 21;
        b = 62 + broad * 13 - forest * 9;
        const crag = 1 - Math.abs(noise(gx * 8 + broad, gy * 8, 18) * 2 - 1);
        const creases = noise(gx * 24 + crag, gy * 15, 19);
        const stone = 86 + broad * 24 + crag * 35 + fine * 18;
        r += (stone - r) * rock;
        g += (stone * 0.99 - g) * rock;
        b += (stone * 0.94 - b) * rock;
        if (sample[8] < 0.32) {
            r += 20;
            g += 9;
            b += 19;
        }
        const coast = clamp((0.64 - land) / 0.14) * (1 - rock * 0.7);
        r += (169 + broad * 18 - r) * coast;
        g += (157 + broad * 15 - g) * coast;
        b += (111 + broad * 12 - b) * coast;
        const snowMix = clamp((snow - 0.24 + (broad - 0.5) * 0.3) / 0.65);
        r += (221 + fine * 6 - r) * snowMix;
        g += (230 + fine * 6 - g) * snowMix;
        b += (223 + fine * 6 - b) * snowMix;
        const shade = relief ? clamp(sample[7], 0.62, 1.18) : 1;
        const facetLight = relief
            ? (noise(gx * 8 + broad + 0.035, gy * 8 + 0.04, 18) -
                  noise(gx * 8 + broad - 0.035, gy * 8 - 0.04, 18)) *
              210
            : 0;
        const grain = fine * (3 + rock * 9) + (creases - 0.5) * rock * 22 + facetLight * rock;
        r = r * shade + grain;
        g = g * shade + grain;
        b = b * shade + grain;
    }
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), 255];
}
