/** Own-army markers only. No demo data or opponent-private units. */
export function militaryOverlay(divisions, deployments, selected, draftOrders, presentation = {}) {
    return (ctx, renderer) => {
        const { camera, context } = renderer;
        const territories = new Map(context.territories.map((t) => [t.territory_id, t]));
        const center = (id) => {
            const territory = territories.get(id);
            return territory
                ? (context.picker.center?.(territory) ?? {
                      x: (territory.x + 0.5) * context.definition.tileWidth,
                      y: (territory.y + 0.5) * context.definition.tileHeight,
                  })
                : null;
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
                const active = units.filter((u) => u.state === 'active').length;
                const pending = units.filter((u) => u.state === 'pending').length;
                const draft = units.filter((u) => u.state === 'draft').length;
                const text = `${active}${pending ? ` +${pending}` : ''}${draft ? ` ◇${draft}` : ''}`;
                const width = Math.max(32, ctx.measureText(text).width + 12);
                ctx.fillStyle = colors.surface;
                ctx.fillRect(x - width / 2, y - 13, width, 26);
                ctx.strokeRect(x - width / 2, y - 13, width, 26);
                ctx.fillStyle = colors.text;
                ctx.fillText(text, x, y);
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
                ctx.globalAlpha = ghost ? 0.45 : token.state === 'pending' ? 0.7 : 1;
                if (image) ctx.drawImage(image, x - size / 2, y - size / 2 - (aircraft ? 4 : 0), size, size);
                else {
                    ctx.fillRect(x - 19, y - 16, 38, 32);
                    ctx.fillStyle = presentation.palette?.().paint ?? colors.own;
                    ctx.fillRect(x - 17, y - 14, 34, 4);
                    ctx.fillStyle = colors.text;
                    ctx.fillText(
                        { Infantry: 'INF', Armored: 'ARM', Artillery: 'ART', Fighter: 'FTR', Bomber: 'BMB' }[
                            token.division_type
                        ] ?? '?',
                        x,
                        y,
                    );
                }
                ctx.globalAlpha = 1;
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
