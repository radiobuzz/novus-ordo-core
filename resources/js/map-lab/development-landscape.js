import { builtPlots } from './development.js';
import { segmentDistance } from './living-settlement.js';
import { featureHash } from '../map/cartography.js';
import { architecture } from './development-complexes.js';

export const developmentSurfaceKey = (development, enabled) =>
    enabled && development
        ? development.sites
              .map((s) => `${s.id}:${s.built}:${s.urbanIntensity ?? 0}:${s.layoutKey ?? 'checkpoint'}`)
              .join('|')
        : 'natural';

function inside(x, y, points) {
    let result = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i],
            b = points[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
}
function boundaryDistance(x, y, points) {
    if (inside(x, y, points)) return 0;
    return Math.min(...points.map((p, i) => segmentDistance(x, y, p, points[(i + 1) % points.length])));
}
function trace(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
}

// One read-only surface used by ground painting and canopy exclusion.
// Activity is intentionally absent: idling cannot regrow trees or erase streets.
export class DevelopmentLandscape {
    constructor(development, enabled) {
        this.unit = development?.unit ?? 1;
        this.plots = [];
        this.streets = [];
        this.buckets = new Map();
        this.key = developmentSurfaceKey(development, enabled);
        if (!enabled || !development) return;
        for (const s of development.sites) {
            this.plots.push(
                ...builtPlots(s).map((p) => {
                    const urban = ['rowhouse', 'midrise', 'tower', 'landmark'].includes(
                        architecture(s, p, this.unit),
                    );
                    return urban ? { ...p, urban: true } : p;
                }),
            );
            this.streets.push(...(s.streets ?? []).filter((p) => p.rank < s.built / 100));
        }
        for (const p of this.plots) {
            const r = p.size * 2.7;
            this.insert(
                { plot: p },
                Math.min(p.x - r, ...p.points.map((q) => q.x)),
                Math.min(p.y - r, ...p.points.map((q) => q.y)),
                Math.max(p.x + r, ...p.points.map((q) => q.x)),
                Math.max(p.y + r, ...p.points.map((q) => q.y)),
            );
        }
        for (const s of this.streets) {
            const r = this.unit * 0.13;
            this.insert(
                { street: s },
                Math.min(s.a.x, s.b.x) - r,
                Math.min(s.a.y, s.b.y) - r,
                Math.max(s.a.x, s.b.x) + r,
                Math.max(s.a.y, s.b.y) + r,
            );
        }
    }
    insert(item, left, top, right, bottom) {
        const step = this.unit * 0.4;
        for (let y = Math.floor(top / step); y <= Math.floor(bottom / step); y++)
            for (let x = Math.floor(left / step); x <= Math.floor(right / step); x++) {
                const key = `${x}:${y}`;
                if (!this.buckets.has(key)) this.buckets.set(key, []);
                this.buckets.get(key).push(item);
            }
    }
    clearing(x, y, canopy = 0) {
        const items =
            this.buckets.get(`${Math.floor(x / (this.unit * 0.4))}:${Math.floor(y / (this.unit * 0.4))}`) ??
            [];
        let strength = 0;
        for (const { plot: p, street: s } of items) {
            let distance, inner, feather;
            if (s) {
                distance = segmentDistance(x, y, s.a, s.b);
                inner = s.width * 0.65 + canopy;
                feather = this.unit * 0.016 * (s.visualScale ?? 1);
            } else if (p.use === 'homes' || (p.use === 'oil' && !p.art)) {
                distance = Math.hypot(x - p.x, y - p.y);
                inner = p.size * (p.urban ? 1.6 : p.living ? 1.05 : 1.3) + canopy;
                feather = p.size * (p.urban ? 0.4 : 0.85);
            } else {
                distance = boundaryDistance(x, y, p.points);
                inner = canopy;
                feather = this.unit * 0.025 * (p.visualScale ?? 1);
            }
            strength = Math.max(strength, Math.max(0, Math.min(1, 1 - (distance - inner) / feather)));
        }
        return strength;
    }
    drawGround(ctx, field, bounds) {
        const unit = this.unit;
        ctx.save();
        for (const p of this.plots) {
            if (
                p.x + p.size * 3 < bounds.left ||
                p.x - p.size * 3 > bounds.right ||
                p.y + p.size * 3 < bounds.top ||
                p.y - p.size * 3 > bounds.bottom
            )
                continue;
            const sample = field.sample(p.x, p.y),
                shade = Math.max(0.75, Math.min(1.12, sample[7] || 1));
            if (p.art) {
                // Feathered cleared earth under a single coherent facility.
                const r = p.size * 1.35,
                    halo = ctx.createRadialGradient(p.x, p.y, p.size * 0.6, p.x, p.y, r);
                halo.addColorStop(0, '#b9ab8878');
                halo.addColorStop(0.72, '#ab9c7930');
                halo.addColorStop(1, '#9b947000');
                ctx.fillStyle = halo;
                ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
                if (p.art === 'pit') {
                    trace(ctx, p.points);
                    ctx.fillStyle = '#9e967da0';
                    ctx.fill();
                } else {
                    trace(ctx, p.points);
                    ctx.fillStyle = p.use === 'oil' ? '#b7ac9030' : '#a69f8d45';
                    ctx.fill();
                    ctx.strokeStyle = '#d5c9a916';
                    ctx.lineWidth = unit * 0.007;
                    ctx.stroke();
                    for (let i = 0; i < 30; i++) {
                        const x = p.x + (featureHash(`${p.id}:gravelx:${i}`) - 0.5) * p.size * 1.2;
                        const y = p.y + (featureHash(`${p.id}:gravely:${i}`) - 0.5) * p.size;
                        ctx.fillStyle = i % 2 ? '#dccba62b' : '#3e443726';
                        ctx.fillRect(x, y, unit * 0.007, unit * 0.004);
                    }
                }
            } else if (p.use === 'homes' || p.use === 'oil') {
                const r = p.size * (p.living ? 2.15 : 1.9),
                    g = ctx.createRadialGradient(p.x, p.y, p.size * 0.35, p.x, p.y, r);
                g.addColorStop(0, p.urban ? '#a4a294ed' : `rgba(156,143,108,${0.72 * shade})`);
                g.addColorStop(0.55, p.urban ? '#aba797c4' : 'rgba(157,149,112,.36)');
                g.addColorStop(1, 'rgba(147,143,101,0)');
                ctx.fillStyle = g;
                ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
            } else {
                ctx.save();
                trace(ctx, p.points);
                ctx.strokeStyle = p.use === 'fields' ? '#566b3d55' : '#84755135';
                ctx.lineWidth = unit * 0.024;
                ctx.stroke();
                ctx.clip();
                const light = Math.round((40 + p.variant * 10) * shade);
                ctx.fillStyle =
                    p.use === 'fields'
                        ? `hsla(${65 + p.variant * 19} 28% ${light}% / .76)`
                        : `hsla(38 20% ${light}% / .65)`;
                ctx.fillRect(p.x - p.size * 2, p.y - p.size * 2, p.size * 4, p.size * 4);
                // Stable speckled soil/crop texture, anchored to the parcel rather than the raster tile.
                for (let i = 0; i < 180; i++) {
                    const a = featureHash(`${p.id}:grain:${i}`),
                        b = featureHash(`${p.id}:grainY:${i}`);
                    ctx.fillStyle = i % 2 ? '#e4d5a225' : '#33412822';
                    ctx.fillRect(
                        p.x + (a - 0.5) * p.size * 4,
                        p.y + (b - 0.5) * p.size * 4,
                        unit * 0.005,
                        unit * 0.003,
                    );
                }
                if (p.use === 'fields') {
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.angle);
                    ctx.lineWidth = unit * 0.004;
                    ctx.strokeStyle = '#d5cd9a55';
                    for (let y = -p.size * 2; y < p.size * 2; y += unit * 0.02) {
                        ctx.beginPath();
                        ctx.moveTo(-p.size * 2, y);
                        ctx.lineTo(p.size * 2, y);
                        ctx.stroke();
                    }
                }
                ctx.restore();
            }
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const s of this.streets) {
            if (
                Math.max(s.a.x, s.b.x) < bounds.left ||
                Math.min(s.a.x, s.b.x) > bounds.right ||
                Math.max(s.a.y, s.b.y) < bounds.top ||
                Math.min(s.a.y, s.b.y) > bounds.bottom
            )
                continue;
            ctx.beginPath();
            ctx.moveTo(s.a.x, s.a.y);
            ctx.lineTo(s.b.x, s.b.y);
            ctx.strokeStyle = '#b6a47732';
            ctx.lineWidth = s.width * 2.7;
            ctx.stroke();
            ctx.strokeStyle = '#7e77534a';
            ctx.lineWidth = s.width * 1.4;
            ctx.stroke();
            ctx.strokeStyle = '#c2b58cbe';
            ctx.lineWidth = s.width;
            ctx.stroke();
            ctx.strokeStyle = '#d4c5a25c';
            ctx.lineWidth = s.width * 0.25;
            ctx.stroke();
        }
        ctx.restore();
    }
}
