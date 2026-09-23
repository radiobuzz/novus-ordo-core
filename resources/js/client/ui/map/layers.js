// Drawing primitives shared by world browsing and homeland selection.
import { nationPalette } from '../../services/nationColors.js';
function tile(ctx, territory, d) {
    ctx.rect(territory.x * d.tileWidth, territory.y * d.tileHeight, d.tileWidth, d.tileHeight);
}

export function createLayers() {
    return [
        {
            id: 'terrain',
            label: 'Terrain',
            visible: true,
            draw({ ctx, images, definition: d, territories, palette }) {
                if (images.terrain) ctx.drawImage(images.terrain, 0, 0, d.width, d.height);
                else {
                    ctx.fillStyle = palette.land;
                    ctx.beginPath();
                    territories.filter((t) => t.terrain_type !== 'Water').forEach((t) => tile(ctx, t, d));
                    ctx.fill();
                }
            },
        },
        {
            id: 'ownership',
            label: 'Ownership',
            visible: true,
            draw({ ctx, territories, definition: d, nationColors }) {
                for (const t of territories) {
                    if (!t.owner_nation_id) continue;
                    ctx.fillStyle = nationPalette(nationColors, t.owner_nation_id).paint;
                    ctx.globalAlpha = 0.2;
                    ctx.fillRect(t.x * d.tileWidth, t.y * d.tileHeight, d.tileWidth, d.tileHeight);
                }
                ctx.globalAlpha = 1;
            },
        },
        {
            id: 'borders',
            label: 'Borders',
            visible: true,
            draw({ ctx, territories, definition: d, picker, camera, nationColors }) {
                ctx.strokeStyle = 'rgba(236,235,227,.25)';
                ctx.lineWidth = 0.8 / camera.zoom;
                ctx.beginPath();
                for (const t of territories) if (t.terrain_type !== 'Water') tile(ctx, t, d);
                ctx.stroke();
                for (const t of territories) {
                    if (!t.owner_nation_id || t.terrain_type === 'Water') continue;
                    ctx.save();
                    ctx.beginPath();
                    tile(ctx, t, d);
                    ctx.clip();
                    ctx.beginPath();
                    const x = t.x * d.tileWidth,
                        y = t.y * d.tileHeight;
                    for (const [dx, dy, ax, ay, bx, by] of [
                        [0, -1, 0, 0, 1, 0],
                        [1, 0, 1, 0, 1, 1],
                        [0, 1, 0, 1, 1, 1],
                        [-1, 0, 0, 0, 0, 1],
                    ]) {
                        const next = picker.grid.get(`${t.x + dx},${t.y + dy}`);
                        if (next?.owner_nation_id === t.owner_nation_id && next.terrain_type !== 'Water')
                            continue;
                        ctx.moveTo(x + ax * d.tileWidth, y + ay * d.tileHeight);
                        ctx.lineTo(x + bx * d.tileWidth, y + by * d.tileHeight);
                    }
                    ctx.strokeStyle = '#132128';
                    ctx.lineWidth = 8 / camera.zoom;
                    ctx.stroke();
                    ctx.strokeStyle = nationPalette(nationColors, t.owner_nation_id).paint;
                    ctx.lineWidth = 4.5 / camera.zoom;
                    ctx.stroke();
                    ctx.restore();
                }
            },
        },
        {
            id: 'detail',
            label: 'Map detail',
            visible: true,
            draw({ ctx, images, definition: d }) {
                if (images.detail) ctx.drawImage(images.detail, 0, 0, d.width, d.height);
            },
        },
        {
            id: 'rivers',
            label: 'Rivers',
            visible: true,
            // Classic rivers are baked into the existing terrain/detail artwork.
            draw() {},
        },
        {
            id: 'names',
            label: 'Territory names',
            visible: false,
            draw({ ctx, territories, definition: d, camera, palette }) {
                if (camera.zoom < 2.6) return;
                ctx.font = `${Math.min(10 / camera.zoom, 5)}px system-ui`;
                ctx.textAlign = 'center';
                ctx.fillStyle = palette.text;
                ctx.strokeStyle = palette.ocean;
                ctx.lineWidth = 2 / camera.zoom;
                for (const t of territories) {
                    if (t.terrain_type === 'Water') continue;
                    const x = (t.x + 0.5) * d.tileWidth,
                        y = (t.y + 0.5) * d.tileHeight;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(-camera.angle);
                    ctx.strokeText(t.name, 0, 0, d.tileWidth - 2);
                    ctx.fillText(t.name, 0, 0, d.tileWidth - 2);
                    ctx.restore();
                }
            },
        },
        {
            id: 'selection',
            label: 'Selection',
            visible: true,
            fixed: true,
            draw({ ctx, selectedId, territories, definition: d, camera, palette }) {
                const t = territories.find((t) => t.territory_id === selectedId);
                if (!t) return;
                ctx.fillStyle = palette.selection;
                ctx.globalAlpha = 0.25;
                ctx.beginPath();
                tile(ctx, t, d);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = palette.selection;
                ctx.lineWidth = 2.5 / camera.zoom;
                ctx.stroke();
            },
        },
    ];
}
