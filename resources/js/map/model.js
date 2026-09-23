import { axialKey, axialToPixel, hexDisk, hexDistance, neighborCoordinates, regionCenter } from './hex.js';
import { addWater, isWater } from './water.js';
import { createGeography } from './geography.js';
import { geographyStats } from './geography-stats.js';
import { prepareRelief } from './relief.js';

export const RESOLUTIONS = new Map([
    [7, 1],
    [19, 2],
    [37, 3],
]);

/** Geographic identity is independent of database IDs and demo factions. */
export function worldRegions() {
    return Array.from({ length: 600 }, (_, index) => {
        const column = index % 30,
            row = Math.floor(index / 30);
        return {
            id: 'region-' + (index + 1),
            name: 'Region ' + (index + 1),
            column,
            row,
            q: column - Math.floor(row / 2),
            r: row,
        };
    });
}

export function createMapModel(cellCount = 19, scale = 'world', options = {}, definitions = worldRegions()) {
    const startedAt = performance.now();
    const geography = createGeography(options);
    const microRadius = RESOLUTIONS.get(Number(cellCount));
    if (!microRadius) throw new Error(`Unsupported cells-per-region value: ${cellCount}`);
    if (!['scenario', 'world'].includes(scale)) throw new Error(`Unsupported map scale: ${scale}`);
    const cellSize = 174 / (Math.sqrt(3) * (2 * microRadius + 1));
    const localCells = hexDisk(microRadius);
    const regions = definitions.map((definition) => ({
        ...definition,
        isLand: definition.isLand ?? true,
        cellIds: [],
    }));
    const cells = [];

    for (const region of regions) {
        const center = regionCenter(region.q, region.r, microRadius);
        Object.assign(region, { centerQ: center.q, centerR: center.r });
        for (const local of localCells) {
            const q = center.q + local.q;
            const r = center.r + local.r;
            const id = axialKey(q, r);
            const cell = {
                id,
                q,
                r,
                localQ: local.q,
                localR: local.r,
                regionId: region.id,
                terrain: 'plains',
                terrainColor: '#64765b',
                movementCost: 1,
            };
            cells.push(cell);
            region.cellIds.push(id);
        }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
        const point = axialToPixel(cell.q, cell.r, cellSize);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    minX -= cellSize * 1.7;
    maxX += cellSize * 1.7;
    minY -= cellSize * 1.7;
    maxY += cellSize * 1.7;
    const offsetX = 70 - minX;
    const offsetY = 70 - minY;
    const cellById = new Map(cells.map((cell) => [cell.id, cell]));
    for (const cell of cells) {
        const point = axialToPixel(cell.q, cell.r, cellSize);
        cell.x = point.x + offsetX;
        cell.y = point.y + offsetY;
    }
    for (const region of regions) {
        const point = axialToPixel(region.centerQ, region.centerR, cellSize);
        region.x = point.x + offsetX;
        region.y = point.y + offsetY;
    }

    const model = {
        scale,
        geography,
        cellCount: Number(cellCount),
        microRadius,
        cellSize,
        width: maxX - minX + 140,
        height: maxY - minY + 140,
        offsetX,
        offsetY,
        regions,
        cells,
        cellById,
        regionById: new Map(regions.map((region) => [region.id, region])),
    };
    addWater(model);
    for (const cell of cells) {
        delete cell.population;
        delete cell.controllerId;
        delete cell.damage;
    }
    for (const region of regions) region.isLand = region.cellIds.some((id) => !isWater(cellById.get(id)));
    prepareRelief(model);
    const land = cells.filter((cell) => !isWater(cell));
    model.generation = {
        version: 'landscape-v4',
        ...geographyStats(model),
        milliseconds: performance.now() - startedAt,
        landCells: land.length,
        landPercent: (land.length / cells.length) * 100,
        maxElevation: Math.max(0, ...land.map((cell) => cell.elevation)),
        settings: geography.settings,
    };
    return model;
}
