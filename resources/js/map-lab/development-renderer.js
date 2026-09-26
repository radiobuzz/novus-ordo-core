import { builtPlots, plotActivity } from './development.js';
import { architecture } from './development-complexes.js';
import { DevelopmentArt } from './development-art.js';
import { drawQuarry } from './development-quarry.js';
import { drawDevelopmentCells } from './development-cell-renderer.js';

const polygon = (ctx, points, fill, stroke) => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.stroke();
    }
};
function roof(ctx, x, y, w, h, color) {
    ctx.fillStyle = '#14231e45';
    ctx.fillRect(x + w * 0.16, y + h * 0.28, w, h);
    ctx.fillStyle = '#c7b996';
    ctx.fillRect(x, y + h * 0.2, w, h);
    polygon(
        ctx,
        [
            { x, y },
            { x: x + w * 0.5, y: y - h * 0.25 },
            { x: x + w, y },
            { x: x + w, y: y + h * 0.62 },
            { x, y: y + h * 0.62 },
        ],
        color,
        '#433e3270',
    );
    polygon(
        ctx,
        [
            { x: x + w * 0.5, y: y - h * 0.25 },
            { x: x + w, y },
            { x: x + w, y: y + h * 0.62 },
            { x: x + w * 0.5, y: y + h * 0.37 },
        ],
        '#1c293035',
    );
}
function structures(ctx, p, activity, zoom) {
    const s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.lineWidth = s * 0.025;
    if (p.use === 'homes' && p.living) {
        const w = s * 1.7,
            h = s * 1.15,
            x = -w / 2,
            y = -h / 2;
        ctx.fillStyle = '#152b2355';
        polygon(
            ctx,
            [
                { x: x + s * 0.25, y: y + s * 0.3 },
                { x: x + w + s * 0.5, y: y + s * 0.55 },
                { x: x + w + s * 0.5, y: y + h + s * 0.4 },
                { x: x + s * 0.25, y: y + h + s * 0.3 },
            ],
            '#1d30243d',
        );
        const color = ['#92755b', '#a17e5d', '#778078', '#ae9370', '#807369'][Math.floor(p.variant * 5)];
        roof(ctx, x, y, w, h, color);
        // Roof courses, lit ridge, stone walls and a small chimney use the canopy's light direction.
        ctx.strokeStyle = '#e3cf9b50';
        ctx.lineWidth = s * 0.028;
        for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + h * i * 0.12);
            ctx.lineTo(x + w * 0.48, y + h * i * 0.12 - h * 0.25);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + w * 0.52, y + h * i * 0.12 - h * 0.25);
            ctx.lineTo(x + w, y + h * i * 0.12);
            ctx.stroke();
        }
        ctx.strokeStyle = '#e5d6b580';
        ctx.lineWidth = s * 0.045;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, y - h * 0.25);
        ctx.lineTo(x + w * 0.5, y + h * 0.37);
        ctx.stroke();
        ctx.fillStyle = '#5a5144';
        ctx.fillRect(x + w * 0.72, y + h * 0.05, s * 0.13, s * 0.26);
        ctx.fillStyle = '#c6b89c';
        ctx.fillRect(x + w * 0.7, y + h * 0.01, s * 0.16, s * 0.08);
        ctx.fillStyle = activity > 0.5 ? '#d6bd82' : '#575d51';
        ctx.fillRect(x + w * 0.17, y + h * 0.85, s * 0.12, s * 0.13);
        ctx.fillRect(x + w * 0.72, y + h * 0.85, s * 0.12, s * 0.13);
        ctx.fillStyle = '#545044';
        ctx.fillRect(x + w * 0.44, y + h * 0.82, s * 0.18, s * 0.23);
    } else if (p.use === 'homes') {
        const n = p.dense ? 3 : 2,
            step = (s * 1.2) / n,
            width = step * 0.62;
        for (let row = 0; row < n; row++)
            for (let col = 0; col < n; col++) {
                const x = -s * 0.65 + col * step,
                    y = -s * 0.55 + row * step;
                roof(
                    ctx,
                    x,
                    y,
                    width,
                    width * 0.7,
                    ['#b57959', '#958578', '#c59b75'][Math.floor((p.variant * 7 + row + col) % 3)],
                );
                if (activity > 0.5 && s * zoom > 16) {
                    ctx.fillStyle = '#d9c89b';
                    ctx.fillRect(x + width * 0.2, y + width * 0.62, width * 0.17, width * 0.12);
                }
            }
    } else if (p.use === 'fields') {
        ctx.strokeStyle = activity > 0.25 ? '#c6c18485' : '#b0a08070';
        ctx.lineWidth = s * 0.06;
        for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-s * 0.7, i * s * 0.19);
            ctx.lineTo(s * 0.7, i * s * 0.19);
            ctx.stroke();
        }
        if (p.variant > 0.75) roof(ctx, -s * 0.72, -s * 0.63, s * 0.32, s * 0.26, '#ab805b');
    } else if (p.use === 'industry') {
        roof(ctx, -s * 0.65, -s * 0.6, s * 1.15, s * 0.62, activity > 0.25 ? '#96a5a1' : '#858b88');
        roof(ctx, -s * 0.65, s * 0.14, s * 0.7, s * 0.37, '#8a9593');
        ctx.fillStyle = '#655b4d';
        ctx.fillRect(s * 0.32, -s * 0.8, s * 0.12, s * 0.53);
        ctx.fillStyle = '#d1c7ae';
        ctx.fillRect(s * 0.29, -s * 0.84, s * 0.18, s * 0.09);
        if (activity > 0.1) {
            ctx.fillStyle = '#b69764';
            for (let i = 0; i < Math.ceil(activity * 3); i++)
                ctx.fillRect(s * 0.2 + i * s * 0.16, s * 0.3, s * 0.11, s * 0.21);
        }
    } else if (p.use === 'mine') {
        for (let i = 3; i >= 1; i--) {
            ctx.beginPath();
            ctx.ellipse(0, 0, s * i * 0.23, s * i * 0.16, -0.25, 0, Math.PI * 2);
            ctx.fillStyle = ['#635b4b', '#928371', '#b4a081'][i - 1];
            ctx.fill();
            ctx.strokeStyle = '#d0baa080';
            ctx.stroke();
        }
        if (activity > 0.1) {
            ctx.fillStyle = '#c3a05a';
            ctx.fillRect(s * 0.2, s * 0.12, s * 0.27, s * 0.12);
        }
    } else if (p.use === 'oil') {
        ctx.strokeStyle = '#303a37';
        ctx.lineWidth = s * 0.08;
        ctx.beginPath();
        ctx.moveTo(-s * 0.25, s * 0.45);
        ctx.lineTo(0, -s * 0.45);
        ctx.lineTo(s * 0.2, s * 0.45);
        ctx.moveTo(-s * 0.45, -s * 0.45);
        ctx.lineTo(s * 0.52, activity > 0.2 ? -s * 0.65 : -s * 0.45);
        ctx.moveTo(s * 0.52, -s * 0.55);
        ctx.lineTo(s * 0.52, s * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-s * 0.48, s * 0.32, s * 0.23, s * 0.17, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#b5b6a4';
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

export class DevelopmentOverlay {
    visible = false;
    labels = [];
    drawnPlots = 0;
    detail = false;
    drawnArchitecture = {};
    constructor(invalidate) {
        this.art = new DevelopmentArt(invalidate);
    }
    destroy() {
        this.art.destroy();
    }
    draw(ctx, state, camera) {
        this.visible = state.view === 'terrain' && state.layers.development;
        this.drawnPlots = 0;
        this.detail = false;
        this.drawnArchitecture = {};
        if (!this.visible || !state.development) return;
        const { development } = state,
            bounds = camera.worldBounds();
        this.detail = development.unit * camera.zoom >= 125;
        if (this.detail) this.art.load();
        drawDevelopmentCells(ctx, state, camera);
        ctx.save();
        const ground = {
            homes: '#b4aa8b',
            fields: '#849058',
            industry: '#a49c86',
            mine: '#a79578',
            oil: '#b5a180',
        };
        for (const site of development.sites)
            for (const p of builtPlots(site)) {
                if (
                    p.x + p.size * 2 < bounds.left ||
                    p.x - p.size * 2 > bounds.right ||
                    p.y + p.size * 7 < bounds.top ||
                    p.y - p.size * 7 > bounds.bottom
                )
                    continue;
                this.drawnPlots++;
                const activity = plotActivity(site, p, state.substrate);
                const fill =
                    p.use === 'fields'
                        ? activity < 0.25
                            ? '#988b68'
                            : ['#899752', '#aaa66b', '#798959'][Math.floor(p.variant * 3)]
                        : p.use === 'homes'
                          ? ['#aaa286', '#a29e83', '#b0a88e'][Math.floor(p.variant * 3)]
                          : ground[p.use];
                ctx.lineWidth = p.size * 0.065;
                if (!state.activeTerrainV2)
                    polygon(ctx, p.points, fill, p.use === 'fields' ? '#697452' : '#b7ad91');
                if (this.detail) {
                    const kind = architecture(site, p, development.unit);
                    if (kind) this.drawnArchitecture[kind] = (this.drawnArchitecture[kind] ?? 0) + 1;
                    if (kind === 'pit') {
                        if (!this.art.drawPit(ctx, p)) drawQuarry(ctx, p);
                    } else if (kind) {
                        if (!this.art.draw(ctx, kind, p)) structures(ctx, p, activity, camera.zoom);
                        if (activity > 0 && ['factory', 'warehouse', 'crusher', 'tanks'].includes(kind)) {
                            // A few static material stacks on the apron, no invented smoke/pollution.
                            for (let i = 0; i < Math.ceil(activity * 3); i++) {
                                ctx.fillStyle = ['#967659', '#a49163', '#6d7e78'][i];
                                ctx.fillRect(
                                    p.x - p.size * 0.65 + i * p.size * 0.23,
                                    p.y + p.size * 0.67,
                                    p.size * 0.16,
                                    p.size * 0.08,
                                );
                            }
                        }
                    }
                }
                if (!activity && this.detail) {
                    // Small static activity cue, not demolition, smoke or invented pollution.
                    ctx.fillStyle = '#283135';
                    ctx.fillRect(p.x - p.size * 0.75, p.y + p.size * 0.55, p.size * 0.09, p.size * 0.25);
                    ctx.fillRect(p.x - p.size * 0.59, p.y + p.size * 0.55, p.size * 0.09, p.size * 0.25);
                }
            }
        ctx.restore();
    }
    drawLabels(ctx, state, camera) {
        this.labels = [];
        if (this.visible && this.detail && ['loading', 'error'].includes(this.art.status)) {
            ctx.save();
            ctx.font = '12px sans-serif';
            const text =
                this.art.status === 'loading'
                    ? 'Loading structure artwork…'
                    : 'Structure artwork unavailable · simplified fallback';
            ctx.fillStyle = '#132229ed';
            ctx.fillRect(16, camera.height - 79, ctx.measureText(text).width + 20, 28);
            ctx.fillStyle = '#eee0bd';
            ctx.fillText(text, 26, camera.height - 61);
            ctx.restore();
        }
        if (!this.visible || !state.development || !state.layers.developmentNames) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const boxes = [];
        for (const site of [...state.development.sites].sort(
            (a, b) =>
                Number(b.id === state.selectedDevelopmentId) - Number(a.id === state.selectedDevelopmentId),
        )) {
            if (!builtPlots(site).length) continue;
            const p = camera.worldToScreen(site.x, site.y);
            if (this.detail)
                p.y +=
                    (((state.development.unit * camera.zoom * 1.16 * (site.footprintScale ?? 100)) / 100) *
                        (site.spacing ?? 100)) /
                    100;
            const label = `${site.name}${site.activity === 0 ? ' · idle' : ''}`;
            ctx.font = '600 13px Georgia, serif';
            const width = ctx.measureText(label).width + 12;
            if (p.x < width / 2 || p.x + width / 2 > camera.width || p.y < 90 || p.y > camera.height - 55)
                continue;
            if (boxes.some((b) => Math.abs(b.x - p.x) < (b.width + width) / 2 && Math.abs(b.y - p.y) < 30))
                continue;
            ctx.strokeStyle = '#142321e0';
            ctx.lineWidth = 4;
            ctx.strokeText(label, p.x, p.y);
            ctx.fillStyle = site.id === state.selectedDevelopmentId ? '#fff0bf' : '#e4dbc5';
            ctx.fillText(label, p.x, p.y);
            boxes.push({ ...p, width });
            this.labels.push({ id: site.id, text: label, ...p });
        }
        ctx.restore();
    }
}
