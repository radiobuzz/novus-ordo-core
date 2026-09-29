import { riverCourses } from './water.js';
import { generateResources } from './resources.js';
import { createCartography } from './cartography.js';
import { worldRegions } from './model.js';
import { RESOLUTIONS, worldOptions } from './world.js';
import { axialKey, axialToPixel, regionCenter } from './hex.js';

// Sampled, immutable geography. No old-format decoder or seasonal data.
export const MAP_FORMAT = 'microcell-world-2';
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
    'baseElevation',
    'rainfall',
    'latitude',
    'polarIce',
    'slope',
    'biome',
    'desertStrength',
    'drainageElevation',
    'outletId',
    'drainageVertexId',
    'flow',
    'waterLevel',
    'waterDepth',
    'lakeId',
    'agriculturalSuitability',
];
export const VERTEX_FIELDS = [
    'id',
    'x',
    'y',
    'elevation',
    'drainageElevation',
    'runoff',
    'flow',
    'terminal',
    'outletId',
    'sequence',
    'carvedDepth',
];
const copy = (value) => JSON.parse(JSON.stringify(value));

export function exportMap(model) {
    if (model.scale !== 'world') throw new Error('Only complete world maps can be saved.');
    if (!model.resources) generateResources(model);
    model.atlas ??= createCartography(model);
    model.naming ??= { pack: 'fictional-english', version: 1, culture: 'fictional', language: 'en' };
    const world = worldOptions(model, { maxCells: Number.MAX_SAFE_INTEGER });
    const indexes = new Map(model.regions.map((r, index) => [r.id, index]));
    return {
        format: MAP_FORMAT,
        generator: model.generation?.version ?? 'landscape-v5',
        ...world,
        regionArea: 1,
        settings: { ...model.geography.settings },
        width: model.width,
        height: model.height,
        offsetX: model.offsetX,
        offsetY: model.offsetY,
        cells: model.cells.map((cell) =>
            CELL_FIELDS.map((key) =>
                key === 'region'
                    ? indexes.get(cell.regionId)
                    : ['snowCover', 'frozen', 'polarIce'].includes(key)
                      ? Boolean(cell[key])
                      : (cell[key] ?? null),
            ),
        ),
        edges: [...model.edges.values()].map((e) => [
            e.id,
            e.cellIds,
            e.a.id,
            e.b.id,
            e.flow ?? 0,
            e.fromId ?? null,
            e.toId ?? null,
        ]),
        vertices: [...model.drainage.vertices.values()].map((v) => [
            ...VERTEX_FIELDS.map((key) => v[key] ?? null),
            v.downstream?.vertex.id ?? null,
            v.downstream?.edge.id ?? null,
        ]),
        drainage: {
            breaches: model.drainage.breaches,
            totalRunoff: model.drainage.totalRunoff,
            outletFlow: model.drainage.outletFlow,
        },
        lakes: copy(model.lakes),
        features: copy(model.atlas?.features ?? []),
        coasts: copy(model.atlas?.coasts?.shores ?? []),
        naming: copy(model.naming ?? null),
        resourceProfiles: copy(model.resourceProfiles ?? []),
        resources: copy(model.resources ?? []),
    };
}

export function restoreMap(snapshot, territories = []) {
    if (snapshot.format !== MAP_FORMAT) throw new Error('Unsupported generated map. Create a new map.');
    const world = worldOptions(snapshot, { maxCells: Number.MAX_SAFE_INTEGER });
    if (snapshot.cells.length !== world.regionColumns * world.regionRows * world.cellCount)
        throw new Error('Incomplete generated map.');
    const microRadius = RESOLUTIONS.get(world.cellCount),
        cellSize = 174 / (Math.sqrt(3) * (2 * microRadius + 1));
    const byCoordinates = new Map(territories.map((t) => [`${t.x},${t.y}`, t]));
    const regions = worldRegions(world.regionColumns, world.regionRows).map((region) => {
        const center = regionCenter(region.q, region.r, microRadius),
            point = axialToPixel(center.q, center.r, cellSize);
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
        if (!region) throw new Error('Invalid cell membership.');
        const point = axialToPixel(cell.q, cell.r, cellSize);
        Object.assign(cell, {
            id: axialKey(cell.q, cell.r),
            regionId: region.id,
            localQ: cell.q - region.centerQ,
            localR: cell.r - region.centerR,
            x: point.x + snapshot.offsetX,
            y: point.y + snapshot.offsetY,
            politicalOwnerId: region.ownerId,
            controllerId: region.ownerId,
            damage: 0,
            riverEdgeIds: [],
        });
        region.cellIds.push(cell.id);
        return cell;
    });
    const cellById = new Map(cells.map((c) => [c.id, c]));
    for (const resource of snapshot.resources)
        for (const [id, density, quantity, capacity] of resource.cells) {
            const cell = cellById.get(id);
            if (!cell) throw new Error('Invalid resource cell.');
            cell.resourcePotential ??= {};
            cell.resourcePotential[resource.key] = { density, quantity, capacity };
        }
    const vertices = new Map(
        snapshot.vertices.map((v) => {
            const vertex = Object.fromEntries(VERTEX_FIELDS.map((key, i) => [key, v[i]]));
            return [vertex.id, { ...vertex, links: [], downstream: null }];
        }),
    );
    const edges = new Map(
        snapshot.edges.map(([id, cellIds, a, b, flow, fromId, toId]) => {
            const va = vertices.get(a),
                vb = vertices.get(b);
            if (!va || !vb) throw new Error('Invalid water edge.');
            const edge = {
                id,
                cellIds,
                a: { id: a, x: va.x, y: va.y },
                b: { id: b, x: vb.x, y: vb.y },
                flow,
                fromId,
                toId,
                fromElevation: vertices.get(fromId)?.drainageElevation,
                toElevation: vertices.get(toId)?.drainageElevation,
            };
            va.links.push({ vertex: vb, edge });
            vb.links.push({ vertex: va, edge });
            return [id, edge];
        }),
    );
    for (const values of snapshot.vertices) {
        const to = values[VERTEX_FIELDS.length],
            edge = values[VERTEX_FIELDS.length + 1];
        if (to !== null)
            vertices.get(values[0]).downstream = { vertex: vertices.get(to), edge: edges.get(edge) };
    }
    const riverEdges = new Map([...edges].filter(([, e]) => e.fromId !== null));
    for (const e of riverEdges.values()) for (const id of e.cellIds) cellById.get(id).riverEdgeIds.push(e.id);
    const water = (c) => ['ocean', 'lake'].includes(c.terrain);
    const lakeShores = [...edges.values()].filter(
        (e) =>
            e.cellIds.length === 2 &&
            e.cellIds.some((id) => cellById.get(id).terrain === 'lake') &&
            e.cellIds.some((id) => !water(cellById.get(id))),
    );
    for (const region of regions) region.isLand = region.cellIds.some((id) => !water(cellById.get(id)));
    const features = copy(snapshot.features),
        shores = copy(snapshot.coasts);
    const featuresByCell = new Map();
    for (const f of features)
        for (const id of f.cellIds) {
            if (!featuresByCell.has(id)) featuresByCell.set(id, []);
            featuresByCell.get(id).push(f.id);
        }
    const shoresByCell = new Map();
    for (const shore of shores) {
        if (!shoresByCell.has(shore.landId)) shoresByCell.set(shore.landId, []);
        shoresByCell.get(shore.landId).push(shore);
    }
    return {
        scale: 'world',
        ...world,
        microRadius,
        cellSize,
        width: snapshot.width,
        height: snapshot.height,
        offsetX: snapshot.offsetX,
        offsetY: snapshot.offsetY,
        regions,
        cells,
        cellById,
        regionById: new Map(regions.map((r) => [r.id, r])),
        edges,
        riverEdges,
        rivers: riverCourses(riverEdges, vertices),
        lakeShores,
        drainage: { ...snapshot.drainage, vertices },
        lakes: copy(snapshot.lakes),
        geography: { settings: { ...snapshot.settings } },
        generation: { version: snapshot.generator },
        atlas: {
            features,
            featureById: new Map(features.map((f) => [f.id, f])),
            featuresByCell,
            coasts: { shores, shoreById: new Map(shores.map((s) => [s.id, s])), shoresByCell },
        },
        naming: copy(snapshot.naming),
        resourceProfiles: copy(snapshot.resourceProfiles),
        resources: copy(snapshot.resources),
    };
}
