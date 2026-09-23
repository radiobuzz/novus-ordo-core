import { worldRegions } from './model.js';
import { axialKey, axialToPixel, regionCenter } from './hex.js';

// Experimental interchange format. Store sampled geography, not a promise that
// future generator versions will reproduce the same seed byte for byte.
export const MAP_FORMAT = 'hex-beta-1';
export const CELL_FIELDS = [
    'q',
    'r',
    'region',
    'terrain',
    'landform',
    'vegetation',
    'snowCover',
    'frozen',
    'temperature',
    'moisture',
    'elevation',
    'terrainColor',
    'reliefColor',
    'reliefShade',
];

export function exportMap(model) {
    if (model.scale !== 'world' || model.cellCount !== 19)
        throw new Error('Game maps currently use 19 cells per region.');
    const indexes = new Map(model.regions.map((r, index) => [r.id, index]));
    const segment = (edge) => [edge.a.x, edge.a.y, edge.b.x, edge.b.y, edge.flow ?? 0];
    return {
        format: MAP_FORMAT,
        generator: model.generation.version,
        settings: { ...model.geography.settings },
        width: model.width,
        height: model.height,
        offsetX: model.offsetX,
        offsetY: model.offsetY,
        cells: model.cells.map((cell) =>
            CELL_FIELDS.map((key) =>
                key === 'region'
                    ? indexes.get(cell.regionId)
                    : ['snowCover', 'frozen'].includes(key)
                      ? Boolean(cell[key])
                      : (cell[key] ?? null),
            ),
        ),
        rivers: [...model.riverEdges.values()].map(segment),
        shores: model.lakeShores.map(segment),
    };
}

export function restoreMap(snapshot, territories = []) {
    if (snapshot.format !== MAP_FORMAT || snapshot.cells.length !== 11400)
        throw new Error('Unsupported experimental map.');
    const microRadius = 2,
        cellSize = 174 / (Math.sqrt(3) * 5);
    const byCoordinates = new Map(territories.map((t) => [`${t.x},${t.y}`, t]));
    const regions = worldRegions().map((region) => {
        const center = regionCenter(region.q, region.r, microRadius);
        const point = axialToPixel(center.q, center.r, cellSize);
        const territory = byCoordinates.get(`${region.column},${region.row}`);
        if (territories.length && !territory) throw new Error('The geography does not match this game.');
        return {
            ...region,
            centerQ: center.q,
            centerR: center.r,
            x: point.x + snapshot.offsetX,
            y: point.y + snapshot.offsetY,
            cellIds: [],
            territoryId: territory?.territory_id,
            name: territory?.name ?? region.name,
            ownerId: territory?.owner_nation_id ?? null,
        };
    });
    const cells = snapshot.cells.map((values) => {
        const cell = Object.fromEntries(CELL_FIELDS.map((key, index) => [key, values[index]]));
        const region = regions[cell.region];
        const point = axialToPixel(cell.q, cell.r, cellSize);
        Object.assign(cell, {
            id: axialKey(cell.q, cell.r),
            regionId: region.id,
            x: point.x + snapshot.offsetX,
            y: point.y + snapshot.offsetY,
            politicalOwnerId: region.ownerId,
            controllerId: region.ownerId,
            damage: 0,
        });
        region.cellIds.push(cell.id);
        return cell;
    });
    const segment = (values, index) => ({
        id: String(index),
        a: { x: values[0], y: values[1] },
        b: { x: values[2], y: values[3] },
        flow: values[4],
    });
    return {
        scale: 'world',
        cellCount: 19,
        microRadius,
        cellSize,
        width: snapshot.width,
        height: snapshot.height,
        offsetX: snapshot.offsetX,
        offsetY: snapshot.offsetY,
        regions,
        cells,
        cellById: new Map(cells.map((c) => [c.id, c])),
        regionById: new Map(regions.map((r) => [r.id, r])),
        riverEdges: new Map(snapshot.rivers.map((v, i) => [String(i), segment(v, i)])),
        lakeShores: snapshot.shores.map(segment),
        geography: { settings: snapshot.settings },
    };
}
