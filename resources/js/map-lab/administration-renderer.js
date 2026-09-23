import { traceHex, hexCorners, neighborCoordinates, axialKey } from './hex.js';
import { administrationActive } from './administration.js';

const sides = [
    [0, 1],
    [5, 0],
    [4, 5],
    [3, 4],
    [2, 3],
    [1, 2],
];
export class AdministrationOverlay {
    cache = null;
    labels = [];
    prepare(state) {
        const { administration: admin, model } = state;
        if (this.cache?.admin === admin && this.cache.revision === admin.revision) return;
        const paths = new Map();
        for (const area of [...admin.countries, ...admin.provinces, ...admin.zones]) {
            const previous = this.cache?.admin === admin ? this.cache.paths.get(area.id) : null;
            if (previous?.area === area && previous.geometryRevision === (area.geometryRevision ?? 0)) {
                paths.set(area.id, previous);
                continue;
            }
            const fill = new Path2D(),
                border = new Path2D();
            let x = 0,
                y = 0;
            for (const id of area.cellIds) {
                const cell = model.cellById.get(id);
                traceHex(fill, cell.x, cell.y, model.cellSize * 1.005);
                x += cell.x / area.cellIds.size;
                y += cell.y / area.cellIds.size;
                const corners = hexCorners(cell.x, cell.y, model.cellSize);
                neighborCoordinates(cell.q, cell.r).forEach((p, i) => {
                    if (area.cellIds.has(axialKey(p.q, p.r))) return;
                    const [a, b] = sides[i].map((index) => corners[index]);
                    border.moveTo(a.x, a.y);
                    border.lineTo(b.x, b.y);
                });
            }
            const cells = [...area.cellIds].map((id) => model.cellById.get(id));
            const anchor = cells.reduce(
                (best, c) =>
                    !best || Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best,
                null,
            );
            paths.set(area.id, { fill, border, anchor, area, geometryRevision: area.geometryRevision ?? 0 });
        }
        this.cache = { admin, revision: admin.revision, paths };
    }
    drawFill(ctx, state) {
        if (!administrationActive(state)) return;
        this.prepare(state);
        const { administration: admin, adminEditor: editor, layers } = state;
        ctx.save();
        if (layers.adminCountries)
            for (const n of admin.countries) {
                ctx.fillStyle = n.color;
                ctx.globalAlpha = n.id === editor.nationId ? 0.2 : 0.1;
                ctx.fill(this.cache.paths.get(n.id).fill);
            }
        if (layers.adminProvinces && editor.kind === 'province') {
            const path = this.cache.paths.get(editor.areaId);
            if (path) {
                ctx.fillStyle = '#f4df9f';
                ctx.globalAlpha = 0.18;
                ctx.fill(path.fill);
            }
        }
        if (layers.adminZones)
            for (const z of admin.zones) {
                ctx.fillStyle = z.color;
                ctx.globalAlpha = editor.kind === 'zone' ? (z.id === editor.areaId ? 0.32 : 0.06) : 0.16;
                ctx.fill(this.cache.paths.get(z.id).fill);
            }
        ctx.restore();
    }
    drawBorders(ctx, state, camera) {
        if (!administrationActive(state)) return;
        this.prepare(state);
        const { administration: admin, adminEditor: editor, layers } = state;
        ctx.save();
        ctx.lineJoin = 'round';
        if (layers.adminProvinces)
            for (const p of admin.provinces) {
                ctx.strokeStyle = p.id === editor.areaId ? '#fff2c5' : '#eadabd';
                ctx.lineWidth = (p.id === editor.areaId ? 2.5 : 1.1) / camera.zoom;
                ctx.stroke(this.cache.paths.get(p.id).border);
            }
        if (layers.adminCountries)
            for (const n of admin.countries) {
                const path = this.cache.paths.get(n.id).border;
                ctx.strokeStyle = '#142027';
                ctx.lineWidth = 5 / camera.zoom;
                ctx.stroke(path);
                ctx.strokeStyle = n.color;
                ctx.lineWidth = 2.8 / camera.zoom;
                ctx.stroke(path);
            }
        if (layers.adminZones)
            for (const z of admin.zones) {
                ctx.globalAlpha = editor.kind === 'zone' && z.id !== editor.areaId ? 0.25 : 1;
                ctx.setLineDash([7 / camera.zoom, 4 / camera.zoom]);
                ctx.strokeStyle = z.color;
                ctx.lineWidth = (z.id === editor.areaId ? 3 : 1.8) / camera.zoom;
                ctx.stroke(this.cache.paths.get(z.id).border);
            }
        ctx.restore();
    }
    drawLabels(ctx, state, camera) {
        this.labels = [];
        if (!administrationActive(state)) return;
        this.prepare(state);
        const { administration: admin, adminEditor: editor, layers } = state;
        const enabled = [
            ...(layers.adminCountries ? admin.countries : []),
            ...(layers.adminProvinces ? admin.provinces : []),
            ...(layers.adminZones ? admin.zones : []),
        ];
        const overview = state.model.cellSize * camera.zoom < 6;
        enabled.sort((a, b) =>
            overview
                ? Number(Boolean(a.nationId)) - Number(Boolean(b.nationId))
                : Number(b.id === editor.areaId) - Number(a.id === editor.areaId),
        );
        const boxes = [];
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const area of enabled) {
            const anchor = this.cache.paths.get(area.id).anchor;
            if (!anchor) continue;
            const selected = area.id === editor.areaId;
            if (!selected && Math.sqrt(area.cellIds.size) * state.model.cellSize * camera.zoom < 100)
                continue;
            if (area.nationId && area.nationId !== editor.nationId) continue;
            const p = camera.worldToScreen(anchor.x, anchor.y);
            const size = area.nationId ? 13 : 17;
            ctx.font = `600 ${size}px Georgia, serif`;
            const width = ctx.measureText(area.name).width + 12;
            const box = { x: p.x - width / 2, y: p.y - 12, w: width, h: 24 };
            if (box.x < 4 || box.x + width > camera.width - 4 || p.y < 85 || p.y > camera.height - 50)
                continue;
            if (
                boxes.some(
                    (b) =>
                        box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y,
                )
            )
                continue;
            boxes.push(box);
            ctx.strokeStyle = '#10212bec';
            ctx.lineWidth = 4;
            ctx.strokeText(area.name, p.x, p.y);
            ctx.fillStyle = area.color ?? '#f0e3bd';
            ctx.fillText(area.name, p.x, p.y);
            this.labels.push({ id: area.id, name: area.name, x: p.x, y: p.y });
        }
        ctx.restore();
    }
}
