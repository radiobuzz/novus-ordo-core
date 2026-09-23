import { TerrainField, terrainColor, clamp } from './terrain-v2-field.js';

const PIXEL_BUDGET = 8 * 1024 * 1024;
const MAX_CHUNKS = 96;

/** Lab-only procedural drawing. No model writes, global animation, or bitmap dependency. */
export class TerrainV2 {
    model = null;
    cache = new Map();
    sprites = new Map();
    pending = 0;
    pixels = 0;
    active = false;
    work = null;
    constructor(invalidate) {
        this.invalidate = invalidate;
    }
    destroy() {
        this.cache.clear();
        this.sprites.clear();
        this.work = null;
        this.model = null;
        this.field = null;
        this.pixels = 0;
    }
    diagnostics() {
        return {
            active: this.active,
            pending: this.pending,
            chunks: this.cache.size,
            pixels: this.pixels,
            pixelBudget: PIXEL_BUDGET,
            maxChunks: MAX_CHUNKS,
        };
    }
    reset(model) {
        this.destroy();
        this.model = model;
        this.field = new TerrainField(model);
        this.span = this.field.unit * 1.4;
    }
    sprite(index, conifer = false, rock = false) {
        const key = `${index}:${conifer}:${rock}`;
        if (this.sprites.has(key)) return this.sprites.get(key);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d'),
            hash = this.field.hash;
        ctx.fillStyle = '#14251c45';
        ctx.beginPath();
        ctx.ellipse(38, 39, 19, 14, 0.7, 0, Math.PI * 2);
        ctx.fill();
        if (rock) {
            ctx.fillStyle = '#61655d';
            ctx.beginPath();
            ctx.moveTo(15, 42);
            ctx.lineTo(18, 21);
            ctx.lineTo(34, 13);
            ctx.lineTo(48, 29);
            ctx.lineTo(43, 43);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#a7a898';
            ctx.beginPath();
            ctx.moveTo(18, 21);
            ctx.lineTo(34, 13);
            ctx.lineTo(30, 33);
            ctx.lineTo(15, 42);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#c2bdab';
            ctx.beginPath();
            ctx.moveTo(18, 21);
            ctx.lineTo(34, 13);
            ctx.lineTo(30, 22);
            ctx.closePath();
            ctx.fill();
        } else {
            const hue = 83 + hash(index, 1) * 38,
                light = 22 + hash(index, 2) * 11;
            const gradient = ctx.createRadialGradient(25, 22, 1, 32, 32, 23);
            gradient.addColorStop(0, `hsl(${hue} 26% ${light + 15}%)`);
            gradient.addColorStop(1, `hsl(${hue} 25% ${light - 10}%)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2,
                    radius = conifer ? (i % 2 ? 10 : 23) : 18 + hash(index, i, 2) * 5;
                const x = 30 + Math.cos(a) * radius,
                    y = 29 + Math.sin(a) * radius;
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            for (let i = 0; i < 38; i++) {
                const a = hash(index, i, 4) * Math.PI * 2,
                    radius = Math.sqrt(hash(index, i, 5)) * 17;
                const x = 30 + Math.cos(a) * radius,
                    y = 29 + Math.sin(a) * radius;
                const lit = light + 5 + (30 - x + 29 - y) * 0.26 + hash(index, i, 6) * 9;
                ctx.fillStyle = `hsla(${hue + (i % 4)} 29% ${lit}% / .65)`;
                ctx.beginPath();
                ctx.ellipse(x, y, 2 + hash(index, i, 7) * 3, 2 + hash(index, i, 8) * 2, a, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        this.sprites.set(key, canvas);
        return canvas;
    }
    decorate(ctx, chunk, settings) {
        const { field, span } = this,
            x = chunk.col * span,
            y = chunk.row * span;
        const corners = [
            [x, y],
            [x + span, y],
            [x, y + span],
            [x + span, y + span],
        ].map((p) => field.geographic(...p));
        const step = 0.038;
        const left = Math.floor(Math.min(...corners.map((p) => p.x)) / step) - 3,
            right = Math.ceil(Math.max(...corners.map((p) => p.x)) / step) + 3;
        const top = Math.floor(Math.min(...corners.map((p) => p.y)) / step) - 3,
            bottom = Math.ceil(Math.max(...corners.map((p) => p.y)) / step) + 3;
        const objects = [],
            sample = new Float64Array(9);
        for (let row = top; row <= bottom; row++)
            for (let col = left; col <= right; col++) {
                const gx = (col + 0.12 + field.hash(col, row, 20) * 0.76) * step;
                const gy = (row + 0.12 + field.hash(col, row, 21) * 0.76) * step;
                const p = field.world(gx, gy),
                    radius = field.unit * (0.043 + field.hash(col, row, 22) * 0.026);
                if (
                    p.x < x - radius * 2 ||
                    p.x > x + span + radius * 2 ||
                    p.y < y - radius * 2 ||
                    p.y > y + span + radius * 2
                )
                    continue;
                field.sample(p.x, p.y, sample, settings.blend);
                if (!sample[0] || sample[1] < 0.88 || sample[5] > 0.5) continue;
                const patch = field.noise(gx * 11, gy * 11, 40);
                const density = sample[3] * clamp((patch - 0.23) * 3.2) + (sample[3] > 0.1 ? 0.025 : 0);
                const random = field.hash(col, row, 23);
                const tree = sample[2] < 950 && random < density;
                const rock =
                    !tree && sample[2] > 380 && random < 0.04 + clamp((sample[2] - 380) / 1400) * 0.14;
                if (tree || rock)
                    objects.push({
                        ...p,
                        radius: radius * (rock ? 0.45 : 1),
                        index: Math.floor(field.hash(col, row, 24) * 24),
                        conifer: sample[8] < 0.45,
                        rock,
                    });
            }
        objects.sort((a, b) => a.y - b.y || a.x - b.x);
        ctx.save();
        ctx.scale(chunk.resolution / span, chunk.resolution / span);
        ctx.translate(-x, -y);
        for (const obj of objects)
            ctx.drawImage(
                this.sprite(obj.index, obj.conifer, obj.rock),
                obj.x - obj.radius,
                obj.y - obj.radius,
                obj.radius * 2,
                obj.radius * 2,
            );
        ctx.restore();
    }
    draw(ctx, state, camera) {
        this.active = Boolean(state.activeTerrainV2);
        if (!this.active) {
            this.pending = 0;
            this.work = null;
            return;
        }
        if (this.model !== state.model) this.reset(state.model);
        const bounds = camera.worldBounds(),
            span = this.span;
        const settings = { relief: state.layers.relief, blend: state.layers.transitions };
        const desired = span * camera.zoom * Math.min(devicePixelRatio || 1, 2);
        let resolution = desired > 300 ? 512 : desired > 150 ? 256 : 128;
        const estimate =
            (Math.ceil((bounds.right - bounds.left) / span) + 2) *
            (Math.ceil((bounds.bottom - bounds.top) / span) + 2);
        while (resolution > 128 && estimate * resolution * resolution > PIXEL_BUDGET) resolution /= 2;
        const wanted = [],
            visible = new Set();
        for (
            let row = Math.max(0, Math.floor(bounds.top / span));
            row <= Math.min(Math.ceil(state.model.height / span), Math.floor(bounds.bottom / span));
            row++
        )
            for (
                let col = Math.max(0, Math.floor(bounds.left / span));
                col <= Math.min(Math.ceil(state.model.width / span), Math.floor(bounds.right / span));
                col++
            ) {
                const key = `${col}:${row}:${resolution}:${settings.relief}:${settings.blend}`;
                wanted.push({ key, col, row, resolution });
                visible.add(key);
            }
        wanted.sort(
            (a, b) =>
                Math.hypot((a.col + 0.5) * span - camera.x, (a.row + 0.5) * span - camera.y) -
                Math.hypot((b.col + 0.5) * span - camera.x, (b.row + 0.5) * span - camera.y),
        );
        if (this.work && !visible.has(this.work.key)) this.work = null;
        const deadline = performance.now() + 7;
        for (const chunk of wanted) {
            if (this.cache.has(chunk.key)) continue;
            if (performance.now() >= deadline) break;
            if (!this.work) {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = resolution;
                this.work = { ...chunk, canvas, data: new ImageData(resolution, resolution), line: 0 };
            }
            const work = this.work,
                sample = new Float64Array(9);
            while (work.line < resolution && performance.now() < deadline) {
                const py = (work.row + (work.line + 0.5) / resolution) * span;
                const a = this.field.geographic(work.col * span, py),
                    b = this.field.geographic((work.col + 1) * span, py);
                for (let i = 0; i < resolution; i++) {
                    const t = (i + 0.5) / resolution,
                        px = (work.col + t) * span;
                    this.field.sample(px, py, sample, settings.blend);
                    const rgba = terrainColor(
                        this.field,
                        sample,
                        a.x + (b.x - a.x) * t,
                        a.y + (b.y - a.y) * t,
                        settings.relief,
                    );
                    const offset = (work.line * resolution + i) * 4;
                    work.data.data.set(rgba, offset);
                }
                work.line++;
            }
            if (work.line < resolution) break;
            const target = work.canvas.getContext('2d');
            target.putImageData(work.data, 0, 0);
            this.decorate(target, work, settings);
            this.cache.set(work.key, work.canvas);
            this.pixels += resolution * resolution;
            this.work = null;
        }
        this.pending = wanted.filter((chunk) => !this.cache.has(chunk.key)).length;
        for (const chunk of wanted) {
            const image = this.cache.get(chunk.key);
            if (image) {
                ctx.drawImage(image, chunk.col * span, chunk.row * span, span, span);
                this.cache.delete(chunk.key);
                this.cache.set(chunk.key, image);
            }
        }
        for (const [key, image] of this.cache) {
            if (this.pixels <= PIXEL_BUDGET && this.cache.size <= MAX_CHUNKS) break;
            if (visible.has(key)) continue;
            this.pixels -= image.width * image.height;
            this.cache.delete(key);
        }
        if (this.pending) this.invalidate();
    }
    drawRivers(ctx, model, camera) {
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        for (const river of model.rivers) {
            const path = new Path2D(),
                pts = river.points;
            if (pts.length < 2) continue;
            path.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
                const a = pts[i - 1],
                    b = pts[i],
                    c = pts[i + 1];
                // Round only a small part of each corner, keeping confluence/endpoints exact.
                path.lineTo(b.x + (a.x - b.x) * 0.18, b.y + (a.y - b.y) * 0.18);
                path.quadraticCurveTo(b.x, b.y, b.x + (c.x - b.x) * 0.18, b.y + (c.y - b.y) * 0.18);
            }
            path.lineTo(pts.at(-1).x, pts.at(-1).y);
            const flow = Math.max(...river.edgeIds.map((id) => model.riverEdges.get(id).flow));
            const width = Math.max(
                0.6 / camera.zoom,
                model.cellSize * (0.025 + Math.min(5, Math.log2(1 + flow * 3)) * 0.018),
            );
            ctx.strokeStyle = '#6e7554';
            ctx.lineWidth = width * 2.8;
            ctx.stroke(path);
            ctx.strokeStyle = '#273f3f';
            ctx.lineWidth = width * 1.8;
            ctx.stroke(path);
            ctx.strokeStyle = '#689ea2';
            ctx.lineWidth = width;
            ctx.stroke(path);
        }
        ctx.restore();
    }
}
