import { createMapModel } from '../map/model.js';
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

export const nations = {
    aurelia: { id: 'aurelia', name: 'Aurelian Compact', color: '#d2695e' },
    sable: { id: 'sable', name: 'Sable League', color: '#4e8fc4' },
    verdant: { id: 'verdant', name: 'Verdant Union', color: '#69a77d' },
};

const scenarioRegionDefinitions = [
    { id: 'emberfall', name: 'Emberfall', q: 0, r: 0, ownerId: 'aurelia' },
    { id: 'grey-coast', name: 'Grey Coast', q: -1, r: 0, ownerId: 'sable' },
    { id: 'northwatch', name: 'Northwatch', q: 0, r: -1, ownerId: 'sable' },
    { id: 'highmere', name: 'Highmere', q: 1, r: -1, ownerId: 'verdant' },
    { id: 'greenfold', name: 'Greenfold', q: 1, r: 0, ownerId: 'verdant' },
    { id: 'sunreach', name: 'Sunreach', q: 0, r: 1, ownerId: 'aurelia' },
    { id: 'westervale', name: 'Westervale', q: -1, r: 1, ownerId: 'sable' },
];

function hash(q, r, salt = 0) {
    let value = Math.imul(q + 101 + salt, 374761393) + Math.imul(r - 37 - salt, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function createWorldRegionDefinitions() {
    return Array.from({ length: 600 }, (_, index) => {
        const column = index % 30,
            row = Math.floor(index / 30);
        const isEmberfall = column === 15 && row === 10;
        return {
            id: isEmberfall ? 'emberfall' : 'region-' + (index + 1),
            name: isEmberfall ? 'Emberfall' : 'Region ' + (index + 1),
            q: column - Math.floor(row / 2),
            r: row,
            column,
            row,
            ownerId: column < 10 ? 'sable' : column > 20 ? 'verdant' : 'aurelia',
        };
    });
}

export function createMapLabModel(cellCount = 19, scale = 'scenario', options = {}) {
    const startedAt = performance.now();
    const definitions = scale === 'world' ? createWorldRegionDefinitions() : scenarioRegionDefinitions;
    const model = createMapModel(cellCount, scale, options, definitions);
    const { regions, cells, cellById, geography } = model;
    const emberfall = regions.find((region) => region.id === 'emberfall');
    const armyStart = cellById.get(axialKey(emberfall.centerQ - 1, emberfall.centerR));
    model.army = { id: 'first-sable-army', nationId: 'sable', cellId: armyStart.id, strength: 72 };
    for (const cell of cells)
        Object.assign(cell, {
            population: 0,
            politicalOwnerId: null,
            controllerId: null,
            city: false,
            damage: 0,
        });
    for (const region of regions) {
        region.isLand = region.cellIds.some((id) => !isWater(cellById.get(id)));
        if (!region.isLand) region.ownerId = null;
        for (const id of region.cellIds) {
            const cell = cellById.get(id);
            cell.politicalOwnerId = region.ownerId;
            if (isWater(cell)) continue;
            const invaded = region.id === 'emberfall' && cell.localQ < 0;
            cell.controllerId = invaded ? 'sable' : region.ownerId;
            cell.damage = invaded ? 1 + Math.floor(hash(cell.q, cell.r, 31) * 2) : 0;
            const base = cell.landform === 'mountain' ? 12 : cell.landform === 'hills' ? 28 : 46;
            cell.population = base + Math.round(hash(cell.q, cell.r, 23) * 55);
        }
    }
    // Relocate the demo pieces to suitable land instead of altering geography to
    // protect a hard-coded spawn. Some extreme seeds put Emberfall underwater.
    const land = cells.filter((cell) => !isWater(cell));
    const landNeighbors = (cell) =>
        neighborCoordinates(cell.q, cell.r)
            .map(({ q, r }) => cellById.get(axialKey(q, r)))
            .filter((cell) => cell && !isWater(cell));
    const playable = land.filter((cell) => landNeighbors(cell).length > 0);
    const localLand = playable.filter((cell) => cell.regionId === 'emberfall');
    const city = (localLand.length ? localLand : playable).reduce(
        (best, cell) =>
            !best ||
            hexDistance(cell, emberfallCenter(emberfall)) < hexDistance(best, emberfallCenter(emberfall))
                ? cell
                : best,
        null,
    );
    if (!city)
        throw new Error(
            'Not enough connected land for the demo. Try the full world, another seed, or more land.',
        );
    city.city = true;
    city.population = 420;
    const adjacent = landNeighbors(city);
    const start = adjacent.find((cell) => cell.controllerId === 'sable') ?? adjacent[0] ?? city;
    model.army.cellId = start.id;
    start.controllerId = 'sable';
    prepareRelief(model);
    model.generation = {
        version: 'landscape-v4',
        ...geographyStats(model),
        milliseconds: performance.now() - startedAt,
        landCells: land.length,
        landPercent: (land.length / cells.length) * 100,
        maxElevation: Math.max(...land.map((cell) => cell.elevation)),
        settings: geography.settings,
    };
    return model;
}

const emberfallCenter = (region) => ({ q: region.centerQ, r: region.centerR });

export function regionControl(model, regionId) {
    const region = model.regionById.get(regionId);
    if (!region) return null;
    const allCells = region.cellIds.map((id) => model.cellById.get(id));
    const cells = allCells.filter((cell) => !isWater(cell));
    const population = cells.reduce((sum, cell) => sum + cell.population, 0);
    const controlledPopulation = new Map();
    const controlledCells = new Map();
    for (const cell of cells) {
        controlledPopulation.set(
            cell.controllerId,
            (controlledPopulation.get(cell.controllerId) ?? 0) + cell.population,
        );
        controlledCells.set(cell.controllerId, (controlledCells.get(cell.controllerId) ?? 0) + 1);
    }
    return {
        region,
        waterCells: allCells.length - cells.length,
        population,
        controlledPopulation,
        controlledCells,
        damage: cells.reduce((sum, cell) => sum + cell.damage, 0),
    };
}

export function reachableCells(model) {
    const origin = model.cellById.get(model.army.cellId);
    if (!origin) return [];
    return neighborCoordinates(origin.q, origin.r)
        .map(({ q, r }) => model.cellById.get(axialKey(q, r)))
        .filter((cell) => cell && !isWater(cell));
}

export function moveArmy(model, targetId) {
    const origin = model.cellById.get(model.army.cellId);
    const target = model.cellById.get(targetId);
    if (!origin || !target || isWater(target) || hexDistance(origin, target) !== 1) return false;
    model.army.cellId = target.id;
    target.controllerId = model.army.nationId;
    target.damage = Math.min(3, target.damage + 1);
    return true;
}
