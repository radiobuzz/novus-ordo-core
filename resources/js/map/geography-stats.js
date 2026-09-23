import { axialKey, neighborCoordinates } from './hex.js';
import { isWater } from './water.js';

// Inspect the generated cells, not the requested continent count. Useful both
// in the lab and seed sweeps: narrow straits can disappear on a coarse grid.
export function geographyStats(model) {
    const seen = new Set(),
        landmassCells = [];
    for (const cell of model.cells) {
        if (isWater(cell) || seen.has(cell.id)) continue;
        const pending = [cell];
        seen.add(cell.id);
        for (let head = 0; head < pending.length; head++) {
            for (const { q, r } of neighborCoordinates(pending[head].q, pending[head].r)) {
                const next = model.cellById.get(axialKey(q, r));
                if (!next || isWater(next) || seen.has(next.id)) continue;
                seen.add(next.id);
                pending.push(next);
            }
        }
        landmassCells.push(pending.length);
    }
    landmassCells.sort((a, b) => b - a);
    let coastEdges = 0;
    for (const cell of model.cells)
        if (!isWater(cell)) {
            for (const { q, r } of neighborCoordinates(cell.q, cell.r))
                if (model.cellById.get(axialKey(q, r))?.terrain === 'ocean') coastEdges++;
        }
    return {
        majorContinents: landmassCells.filter((size) => size >= model.cellCount * 12).length,
        landmassCells,
        islands: landmassCells.filter((size) => size < model.cellCount * 12).length,
        coastEdges,
        largestLakeCells: Math.max(0, ...model.lakes.map((lake) => lake.cellIds.length)),
        lakeCells: model.lakes.reduce((sum, lake) => sum + lake.cellIds.length, 0),
        frozenWaterCells: model.cells.filter((cell) => cell.frozen).length,
        snowCells: model.cells.filter((cell) => cell.terrain === 'snow').length,
        tundraCells: model.cells.filter((cell) => cell.terrain === 'tundra').length,
    };
}
