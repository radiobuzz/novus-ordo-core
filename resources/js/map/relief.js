import { axialKey, neighborCoordinates } from './hex.js';
import { isWater } from './water.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const mixColor = (a, b, t) => {
    const rgb = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    const left = rgb(a),
        right = rgb(b);
    return (
        '#' +
        left
            .map((value, i) =>
                Math.round(value + (right[i] - value) * t)
                    .toString(16)
                    .padStart(2, '0'),
            )
            .join('')
    );
};

// A visual treatment only: does not alter elevations, drainage, or movement.
export function prepareRelief(model) {
    for (const cell of model.cells) {
        cell.reliefShade = 1;
        if (isWater(cell)) {
            const depth = cell.terrain === 'ocean' ? Math.max(0, -cell.elevation) : cell.waterDepth;
            const t = Math.round(clamp(depth / (cell.terrain === 'ocean' ? 550 : 140), 0, 1) * 20) / 20;
            cell.reliefColor = cell.frozen ? cell.terrainColor : mixColor('#428b98', '#193d56', t);
            continue;
        }
        let gx = 0,
            gy = 0,
            count = 0;
        for (const { q, r } of neighborCoordinates(cell.q, cell.r)) {
            const next = model.cellById.get(axialKey(q, r));
            if (!next) continue;
            const dx = next.x - cell.x,
                dy = next.y - cell.y;
            const height =
                next.terrain === 'lake' ? next.waterLevel : next.terrain === 'ocean' ? 0 : next.elevation;
            const gradient = (height - cell.elevation) / (dx * dx + dy * dy);
            gx += gradient * dx;
            gy += gradient * dy;
            count++;
        }
        gx *= (2 / (count || 1)) * 0.045;
        gy *= (2 / (count || 1)) * 0.045;
        const lighting = (0.7 + gx * 0.45 + gy * 0.55) / Math.hypot(gx, gy, 1);
        cell.reliefShade = Math.round(clamp(0.58 + lighting * 0.6, 0.55, 1.2) * 16) / 16;
        cell.reliefColor =
            cell.reliefShade < 1
                ? mixColor(cell.terrainColor, '#101c24', 1 - cell.reliefShade)
                : mixColor(cell.terrainColor, '#f4ead1', (cell.reliefShade - 1) * 1.5);
    }
}
