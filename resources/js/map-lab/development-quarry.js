import { featureHash } from './cartography.js';

const ring = (ctx, p, scale, offset = 0) => {
    ctx.beginPath();
    p.points.forEach((q, i) => {
        const x = p.x + (q.x - p.x) * scale,
            y = p.y + (q.y - p.y) * scale + offset;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
    });
    ctx.closePath();
};

// Terraces follow one terrain-validated excavation boundary. Never a repeated
// pit icon per microcell; the same footprint also excludes canopy.
export function drawQuarry(ctx, p) {
    ctx.save();
    ring(ctx, p, 1);
    ctx.clip();
    const colors = [
        '#aea18a',
        '#7e7667',
        '#b2a58c',
        '#746d60',
        '#a09279',
        '#6e695b',
        '#928771',
        '#626657',
        '#777d67',
    ];
    for (let i = 0; i < colors.length; i++) {
        ring(ctx, p, 1 - i * 0.091, -p.size * i * 0.012);
        const shade = ctx.createLinearGradient(p.x - p.size, p.y - p.size, p.x + p.size, p.y + p.size);
        shade.addColorStop(0, colors[i]);
        shade.addColorStop(1, i % 2 ? '#55564d' : '#c3b59b');
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.strokeStyle = i % 2 ? '#494c4140' : '#e0cfaa90';
        ctx.lineWidth = p.size * 0.014;
        ctx.stroke();
    }
    for (let i = 0; i < 420; i++) {
        const a = featureHash(`${p.id}:rockx:${i}`),
            b = featureHash(`${p.id}:rocky:${i}`);
        ctx.fillStyle = i % 3 ? '#f0dfba20' : '#242c2738';
        ctx.fillRect(
            p.x + (a - 0.5) * p.size * 2,
            p.y + (b - 0.5) * p.size * 1.5,
            p.size * 0.015,
            p.size * 0.007,
        );
    }
    // A descending haul ramp, not a gameplay road or a claim of extraction yield.
    ctx.beginPath();
    ctx.moveTo(p.x + p.size, p.y + p.size * 0.12);
    ctx.bezierCurveTo(
        p.x + p.size * 0.2,
        p.y + p.size * 0.62,
        p.x - p.size * 0.72,
        p.y + p.size * 0.12,
        p.x - p.size * 0.25,
        p.y - p.size * 0.14,
    );
    ctx.strokeStyle = '#57594b90';
    ctx.lineWidth = p.size * 0.075;
    ctx.stroke();
    ctx.strokeStyle = '#c4b89a';
    ctx.lineWidth = p.size * 0.05;
    ctx.stroke();
    ctx.restore();
}
