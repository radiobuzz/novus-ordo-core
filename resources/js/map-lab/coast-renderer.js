import { COAST_COLORS } from '../map/coasts.js';
import { shoreEdge } from '../map/coasts.js';
import { neighborCoordinates, axialKey } from './hex.js';

export class CoastOverlay {
    cache = null;
    visible = false;
    draw(ctx, state, camera) {
        this.visible = state.view === 'terrain' && state.layers.coasts && state.labFocus !== 'administration';
        const coast = state.cartography.coasts;
        if (!this.cache || this.cache.coast !== coast || this.cache.lens !== state.coastLens) {
            const paths = Array.from({ length: 5 }, () => new Path2D());
            for (const s of coast.shores) {
                const path = paths[(state.coastLens === 'access' ? s.accessGrade : s.exposureGrade) ?? 4];
                path.moveTo(s.edge[0].x, s.edge[0].y);
                path.lineTo(s.edge[1].x, s.edge[1].y);
            }
            this.cache = { coast, lens: state.coastLens, paths };
        }
        ctx.save();
        ctx.lineCap = 'round';
        if (this.visible) {
            ctx.lineWidth = 3 / camera.zoom;
            this.cache.paths.forEach((path, i) => {
                ctx.strokeStyle = COAST_COLORS[i] ?? '#a5b0b3';
                ctx.stroke(path);
            });
            const shore = coast.shoreById.get(state.selectedShoreId);
            if (shore && state.labFocus === 'coasts') {
                ctx.beginPath();
                ctx.moveTo(shore.edge[0].x, shore.edge[0].y);
                ctx.lineTo(shore.edge[1].x, shore.edge[1].y);
                ctx.strokeStyle = '#fff8d9';
                ctx.lineWidth = 6 / camera.zoom;
                ctx.stroke();
            }
        }
        const bay = state.cartography.featureById.get(state.selectedFeature);
        if (state.view === 'terrain' && state.layers.bayNames && bay?.type === 'bay') {
            if (this.bayCache?.bay !== bay) {
                const border = new Path2D(),
                    mouth = new Path2D(),
                    members = new Set(bay.cellIds);
                for (const id of bay.cellIds) {
                    const c = state.model.cellById.get(id);
                    neighborCoordinates(c.q, c.r).forEach((p, i) => {
                        if (members.has(axialKey(p.q, p.r))) return;
                        const [a, b] = shoreEdge(state.model, c, i);
                        border.moveTo(a.x, a.y);
                        border.lineTo(b.x, b.y);
                    });
                }
                for (const [a, b] of bay.mouth) {
                    mouth.moveTo(a.x, a.y);
                    mouth.lineTo(b.x, b.y);
                }
                this.bayCache = { bay, border, mouth };
            }
            ctx.strokeStyle = '#9ee9df';
            ctx.lineWidth = 2 / camera.zoom;
            ctx.stroke(this.bayCache.border);
            ctx.strokeStyle = '#fff8d9';
            ctx.lineWidth = 3 / camera.zoom;
            ctx.setLineDash([7 / camera.zoom, 5 / camera.zoom]);
            ctx.stroke(this.bayCache.mouth);
        }
        ctx.restore();
    }
}
