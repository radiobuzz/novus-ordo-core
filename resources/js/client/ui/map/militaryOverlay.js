import { stackBadgeMetrics } from './unitLayout.js';

const abbreviations = { Infantry: 'INF', Armored: 'ARM', Artillery: 'ART', Fighter: 'FTR', Bomber: 'BMB' };

export function summarizeStack(units) {
    const active = units.filter((unit) => unit.state === 'active');
    const guard = active.filter((unit) => unit.order?.order_type === 'Guard').length;
    const composition = Object.entries(
        active.reduce((counts, unit) => {
            counts[unit.division_type] = (counts[unit.division_type] ?? 0) + 1;
            return counts;
        }, {}),
    ).map(([type, count]) => ({ type, count }));
    return {
        guard,
        active: active.length - guard,
        pending: units.filter((unit) => unit.state === 'pending').length,
        draft: units.filter((unit) => unit.state === 'draft').length,
        composition,
    };
}

function shield(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.55);
    ctx.lineTo(x + size * 0.48, y - size * 0.34);
    ctx.lineTo(x + size * 0.36, y + size * 0.25);
    ctx.quadraticCurveTo(x, y + size * 0.65, x, y + size * 0.65);
    ctx.quadraticCurveTo(x, y + size * 0.65, x - size * 0.36, y + size * 0.25);
    ctx.lineTo(x - size * 0.48, y - size * 0.34);
    ctx.closePath();
    ctx.fill();
}

/** Own-army markers only. No demo data or opponent-private units. */
export function militaryOverlay(divisions, deployments, selected, draftOrders, presentation = {}) {
    return (ctx, renderer) => {
        const opacity = ctx.globalAlpha;
        const { camera, context } = renderer;
        const territories = new Map(context.territories.map((t) => [t.territory_id, t]));
        const center = (id) => {
            const territory = territories.get(id);
            return territory ? context.picker.center(territory) : null;
        };
        const line = (ids, color, dashed) => {
            const points = ids.map(center);
            if (points.some((p) => !p)) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / camera.zoom;
            ctx.setLineDash(dashed ? [5 / camera.zoom, 4 / camera.zoom] : []);
            ctx.beginPath();
            points.forEach((p, index) => (index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
            const a = points.at(-2),
                b = points.at(-1);
            if (!a || !b) return;
            const angle = Math.atan2(b.y - a.y, b.x - a.x),
                size = 9 / camera.zoom;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(b.x - Math.cos(angle - 0.5) * size, b.y - Math.sin(angle - 0.5) * size);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(b.x - Math.cos(angle + 0.5) * size, b.y - Math.sin(angle + 0.5) * size);
            ctx.stroke();
        };
        ctx.save();
        for (const division of divisions) {
            const target = division.order?.destination_territory_id ?? division.order?.target_territory_id;
            if (target) line([division.territory_id, target], '#82cbb5', false);
        }
        for (const order of draftOrders()) {
            const division = divisions.find((d) => d.division_id === order.division_id);
            if (division && order.path_territory_ids !== null)
                line(
                    [division.territory_id, ...order.path_territory_ids, order.destination_territory_id],
                    '#f4d18a',
                    true,
                );
        }
        ctx.setLineDash([]);
        const css = getComputedStyle(renderer.canvas);
        const color = (key) => css.getPropertyValue(key).trim();
        const colors = {
            text: color('--text-primary'),
            surface: color('--surface-panel'),
            selected: color('--accent-command'),
            own: color('--status-ready'),
        };
        // Draw/pick in identical CSS-pixel coordinates, independent of device pixel ratio.
        ctx.setTransform(
            renderer.canvas.width / camera.width,
            0,
            0,
            renderer.canvas.height / camera.height,
            0,
            0,
        );
        for (const token of presentation.layout?.() ?? []) {
            const { x, y, size } = token;
            if (x < -size || y < -size || x > camera.width + size || y > camera.height + size) continue;
            const units = token.state === 'stack' ? token.units : [token];
            const chosen = units.some((unit) => unit.state === 'active' && selected.has(unit.division_id));
            const ghost = token.state === 'draft';
            ctx.save();
            ctx.strokeStyle = chosen || ghost ? colors.selected : colors.own;
            ctx.lineWidth = chosen ? 2.5 : 1;
            ctx.setLineDash(token.state === 'pending' || ghost ? [3, 3] : []);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px system-ui';
            if (token.state === 'stack') {
                const summary = summarizeStack(units);
                const metrics = stackBadgeMetrics(units);
                const guardChosen = metrics.guardUnits.some((unit) => selected.has(unit.division_id));
                const regularChosen = metrics.regularUnits.some((unit) => selected.has(unit.division_id));
                let left = x - metrics.totalWidth / 2;
                if (metrics.guardWidth) {
                    ctx.fillStyle = colors.surface;
                    ctx.fillRect(left, y - 13, metrics.guardWidth, 26);
                    ctx.strokeStyle = colors.selected;
                    ctx.lineWidth = guardChosen ? 2.5 : 1;
                    ctx.strokeRect(left, y - 13, metrics.guardWidth, 26);
                    ctx.fillStyle = colors.selected;
                    shield(ctx, left + 11, y, 11);
                    ctx.fillStyle = colors.text;
                    ctx.fillText(String(summary.guard), left + metrics.guardWidth - 10, y);
                    left += metrics.guardWidth + metrics.gap;
                }
                if (metrics.regularWidth) {
                    ctx.fillStyle = colors.surface;
                    ctx.strokeStyle = regularChosen ? colors.selected : colors.own;
                    ctx.lineWidth = regularChosen ? 2.5 : 1;
                    ctx.fillRect(left, y - 13, metrics.regularWidth, 26);
                    ctx.strokeRect(left, y - 13, metrics.regularWidth, 26);
                    ctx.fillStyle = colors.text;
                    ctx.fillText(metrics.regularText, left + metrics.regularWidth / 2, y);
                }
                const defense = presentation.defense?.(token.territory_id);
                let detailY = y + 16;
                if (Number.isFinite(defense)) {
                    const text = `DEF ${defense}`;
                    ctx.font = 'bold 9px system-ui';
                    const width = ctx.measureText(text).width + 10;
                    ctx.fillStyle = colors.surface;
                    ctx.globalAlpha = opacity * 0.9;
                    ctx.fillRect(x - width / 2, detailY, width, 15);
                    ctx.globalAlpha = opacity;
                    ctx.fillStyle = colors.text;
                    ctx.fillText(text, x, detailY + 7.5);
                    detailY += 17;
                    ctx.font = 'bold 11px system-ui';
                }
                if (presentation.details?.() && summary.composition.length) {
                    const entries = summary.composition.slice(0, 5);
                    const widths = entries.map(({ type, count }) =>
                        Math.max(31, ctx.measureText(`${abbreviations[type] ?? '?'} ${count}`).width + 9),
                    );
                    const rowWidth = widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 2;
                    let detailLeft = x - rowWidth / 2;
                    ctx.font = 'bold 8px system-ui';
                    for (let index = 0; index < entries.length; index++) {
                        const { type, count } = entries[index],
                            width = widths[index];
                        ctx.fillStyle = colors.surface;
                        ctx.globalAlpha = opacity * 0.9;
                        ctx.fillRect(detailLeft, detailY, width, 15);
                        ctx.globalAlpha = opacity;
                        ctx.fillStyle = colors.text;
                        ctx.fillText(
                            `${abbreviations[type] ?? '?'} ${count}`,
                            detailLeft + width / 2,
                            detailY + 7.5,
                        );
                        detailLeft += width + 2;
                    }
                    ctx.font = 'bold 11px system-ui';
                }
            } else {
                const aircraft = ['Fighter', 'Bomber'].includes(token.division_type);
                const image =
                    presentation.style?.() !== 'flat'
                        ? presentation.sprites?.get(token.division_type, presentation.palette?.())
                        : null;
                if (image) {
                    ctx.fillStyle = 'rgba(0,0,0,.35)';
                    ctx.beginPath();
                    ctx.ellipse(x + (aircraft ? 7 : 0), y + 15, aircraft ? 20 : 16, 6, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = colors.surface;
                ctx.globalAlpha = opacity * (ghost ? 0.45 : token.state === 'pending' ? 0.7 : 1);
                if (image) ctx.drawImage(image, x - size / 2, y - size / 2 - (aircraft ? 4 : 0), size, size);
                else {
                    ctx.fillRect(x - 19, y - 16, 38, 32);
                    ctx.fillStyle = presentation.palette?.().paint ?? colors.own;
                    ctx.fillRect(x - 17, y - 14, 34, 4);
                    ctx.fillStyle = colors.text;
                    ctx.fillText(abbreviations[token.division_type] ?? '?', x, y);
                }
                ctx.globalAlpha = opacity;
                ctx.strokeRect(x - size / 2, y - size / 2, size, size);
                const label = ghost ? '◇' : token.state === 'pending' ? '+' : `#${token.division_id}`;
                ctx.fillStyle = colors.surface;
                ctx.fillRect(x - 17, y + size / 2 - 3, 34, 13);
                ctx.fillStyle = colors.text;
                ctx.fillText(label, x, y + size / 2 + 3);
            }
            ctx.restore();
        }
        ctx.restore();
    };
}
