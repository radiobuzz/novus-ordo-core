// Shared climate interpretation, layered over the existing landform. These
// normalized thresholds are visual tuning, not a physical aridity index.
import { hexDisk, axialKey } from './hex.js';

const clamp = (v) => Math.max(0, Math.min(1, v));
const naturalColors = new WeakMap();
const patchOffsets = hexDisk(2);
export function desertStrength(cell) {
    if (['ocean', 'lake'].includes(cell.terrain) || cell.snowCover || cell.temperature < 0.32) return 0;
    const threshold = 0.28 + cell.temperature * 0.16;
    const t = clamp((threshold + 0.08 - cell.moisture) / 0.16);
    return t * t * (3 - 2 * t);
}

export function desertColor(ruggedness, variation = 0) {
    const t = clamp(ruggedness);
    return [181 - t * 44 + variation, 153 - t * 40 + variation, 101 - t * 16 + variation];
}

export function applyBiomes(model) {
    for (const cell of model.cells) {
        if (!naturalColors.has(cell)) naturalColors.set(cell, cell.terrainColor);
        cell.terrainColor = naturalColors.get(cell);
        cell.desertStrength = desertStrength(cell);
        cell.biome = ['ocean', 'lake', 'snow', 'tundra'].includes(cell.terrain)
            ? cell.terrain
            : cell.desertStrength >= 0.5
              ? 'desert'
              : cell.desertStrength > 0
                ? 'drylands'
                : cell.vegetation === 'forest'
                  ? 'forest'
                  : 'grassland';
        if (!cell.desertStrength) continue;
        const ruggedness = cell.landform === 'mountain' ? 1 : cell.landform === 'hills' ? 0.6 : 0;
        const target = desertColor(ruggedness);
        cell.terrainColor =
            '#' +
            [1, 3, 5]
                .map((offset, i) => {
                    const original = parseInt(cell.terrainColor.slice(offset, offset + 2), 16);
                    return Math.round(original + (target[i] - original) * cell.desertStrength)
                        .toString(16)
                        .padStart(2, '0');
                })
                .join('');
    }
}

export const biomeLabel = {
    desert: 'Desert',
    drylands: 'Semi-arid grass / scrub',
    forest: 'Forest',
    grassland: 'Grassland',
    tundra: 'Tundra',
    snow: 'Snow / ice cap',
    ocean: 'Ocean',
    lake: 'Lake',
};

export function findDesertCell(model) {
    let best = null,
        bestScore = -Infinity;
    for (const cell of model.cells) {
        if (cell.biome !== 'desert') continue;
        // Prefer an inspectable patch, not the first equally dry edge pixel.
        // Missing/water/cold neighbours contribute zero; this is navigation only.
        const surroundings =
            patchOffsets.reduce(
                (sum, p) =>
                    sum + (model.cellById.get(axialKey(cell.q + p.q, cell.r + p.r))?.desertStrength ?? 0),
                0,
            ) / patchOffsets.length;
        const score =
            surroundings +
            cell.desertStrength * 0.25 +
            (cell.landform === 'plains' ? 0.1 : 0) +
            cell.temperature * 0.05;
        if (score > bestScore) {
            best = cell;
            bestScore = score;
        }
    }
    return best;
}
