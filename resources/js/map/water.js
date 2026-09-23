import { axialKey, neighborCoordinates } from './hex.js';
import { classifyTerrain } from './geography.js';
import { conditionBasins } from './drainage.js';

export const isWater = (cell) => cell?.terrain === 'ocean' || cell?.terrain === 'lake';
export const sharedEdgeId = (a, b) => [a, b].sort().join('|');
const cornerOffsets = [
    [1, -1],
    [1, 1],
    [0, 2],
    [-1, 1],
    [-1, -1],
    [0, -2],
];
const edgeCorners = [
    [0, 1],
    [5, 0],
    [4, 5],
    [3, 4],
    [2, 3],
    [1, 2],
];

export function addWater(model) {
    model.lakes = [];
    model.rivers = [];
    model.riverEdges = new Map();
    model.lakeShores = [];
    const neighbors = (cell) =>
        neighborCoordinates(cell.q, cell.r).map(({ q, r }) => model.cellById.get(axialKey(q, r)));
    for (const cell of model.cells) {
        Object.assign(
            cell,
            model.geography.at(cell.q, cell.r, model.microRadius, model.scale === 'scenario'),
        );
        cell.baseElevation = cell.elevation;
        cell.riverEdgeIds = [];
        cell.terrain = 'plains';
    }
    // Below sea level is ocean only if connected to the edge of this map.
    const ocean = model.cells.filter(
        (cell) => cell.elevation <= 0 && neighbors(cell).some((other) => !other),
    );
    for (const cell of ocean) cell.terrain = 'ocean';
    for (let head = 0; head < ocean.length; head++)
        for (const next of neighbors(ocean[head])) {
            if (!next || next.elevation > 0 || next.terrain === 'ocean') continue;
            next.terrain = 'ocean';
            ocean.push(next);
        }

    const vertices = new Map(),
        edges = new Map(),
        cornersByCell = new Map();
    const vertex = (cell, index) => {
        const [dx, dy] = cornerOffsets[index];
        const vx = 2 * cell.q + cell.r + dx,
            vy = 3 * cell.r + dy;
        const id = axialKey(vx, vy);
        if (!vertices.has(id))
            vertices.set(id, {
                id,
                x: model.offsetX + (vx * Math.sqrt(3) * model.cellSize) / 2,
                y: model.offsetY + (vy * model.cellSize) / 2,
                ...model.geography.at(vx / 2 - vy / 6, vy / 3, model.microRadius, model.scale === 'scenario'),
                links: [],
                terminal: false,
                runoff: 0,
            });
        return vertices.get(id);
    };
    for (const cell of model.cells) {
        const corners = cornerOffsets.map((_, index) => vertex(cell, index));
        cornersByCell.set(cell.id, corners);
        for (const point of corners) {
            // Relative runoff per political-region area, not cubic metres.
            point.runoff += cell.terrain === 'ocean' ? 0 : cell.rainfall / (6 * model.cellCount);
            if (cell.terrain === 'ocean') point.terminal = true;
        }
        neighbors(cell).forEach((neighbor, index) => {
            const [a, b] = edgeCorners[index].map((corner) => corners[corner]);
            if (!neighbor) a.terminal = b.terminal = true;
            const id = neighbor ? sharedEdgeId(cell.id, neighbor.id) : cell.id + '|boundary-' + index;
            if (edges.has(id)) return;
            const edge = {
                id,
                cellIds: neighbor ? [cell.id, neighbor.id] : [cell.id],
                a: { id: a.id, x: a.x, y: a.y },
                b: { id: b.id, x: b.x, y: b.y },
            };
            edges.set(id, edge);
            a.links.push({ vertex: b, edge });
            b.links.push({ vertex: a, edge });
        });
    }
    const { order, breaches } = conditionBasins(vertices, model.cellCount);
    model.drainage = {
        vertices,
        breaches,
        totalRunoff: order.reduce((sum, point) => sum + point.runoff, 0),
        outletFlow: order.filter((point) => !point.downstream).reduce((sum, point) => sum + point.flow, 0),
    };

    const lakeAbundance = model.geography.settings.lakeAbundance;
    // Higher abundance admits shallower natural depressions, not arbitrary
    // water tiles. The default retains the original 12 m basin threshold.
    const minimumLakeDepth = 12 - Math.max(0, lakeAbundance - 50) * 0.18;
    for (const cell of model.cells) {
        const corners = cornersByCell.get(cell.id);
        const low = corners.reduce((best, point) =>
            point.drainageElevation < best.drainageElevation ? point : best,
        );
        cell.drainageElevation = Math.max(cell.elevation, low.drainageElevation);
        cell.outletId = low.outletId;
        cell.drainageVertexId = low.id;
        cell.flow = Math.max(...corners.map((point) => point.flow));
        if (cell.terrain === 'ocean') continue;
        const filledCorners = corners.filter(
            (point) => point.drainageElevation - point.elevation > minimumLakeDepth,
        ).length;
        if (filledCorners >= 3 && low.drainageElevation - cell.elevation > minimumLakeDepth) {
            cell.terrain = 'lake';
            cell.waterLevel = low.drainageElevation;
            cell.waterDepth = cell.waterLevel - cell.elevation;
        } else {
            // Small unresolved pits are conditioned ground, not uphill river reaches.
            cell.elevation = cell.drainageElevation;
        }
    }
    for (const cell of model.cells) {
        if (cell.terrain !== 'lake' || cell.lakeId) continue;
        const lake = {
            id: 'lake-' + (model.lakes.length + 1),
            name: model.lakes.length ? 'Lake ' + (model.lakes.length + 1) : 'Lake Mere',
            cellIds: [cell.id],
            waterLevel: cell.waterLevel,
        };
        cell.lakeId = lake.id;
        for (let head = 0; head < lake.cellIds.length; head++)
            for (const next of neighbors(model.cellById.get(lake.cellIds[head]))) {
                if (
                    next?.terrain !== 'lake' ||
                    next.lakeId ||
                    Math.abs(next.waterLevel - lake.waterLevel) > 0.001
                )
                    continue;
                next.lakeId = lake.id;
                lake.cellIds.push(next.id);
            }
        model.lakes.push(lake);
    }

    model.lakes = model.lakes.filter((lake) => {
        // Stable basin selection: lowering abundance omits whole lakes, not
        // random holes within a lake. Unretained pits become conditioned ground
        // at the drainage surface, consistent with the small-pit treatment above.
        let hash = 2166136261;
        for (const char of `${model.geography.settings.seed}:${lake.cellIds[0]}`)
            hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        const selected = lakeAbundance >= 50 || (hash >>> 0) / 4294967296 < lakeAbundance / 50;
        const oversizedShallowLake = lakeAbundance > 50 && lake.cellIds.length > model.cellCount * 4;
        if (selected && !oversizedShallowLake) return true;
        for (const id of lake.cellIds) {
            const cell = model.cellById.get(id);
            cell.terrain = 'plains';
            cell.elevation = cell.drainageElevation;
            delete cell.waterLevel;
            delete cell.waterDepth;
            delete cell.lakeId;
        }
        return false;
    });
    model.lakes.forEach((lake, index) => {
        lake.id = `lake-${index + 1}`;
        lake.name = index ? `Lake ${index + 1}` : 'Lake Mere';
        for (const id of lake.cellIds) model.cellById.get(id).lakeId = lake.id;
    });

    const threshold = model.scale === 'world' ? 0.65 : 0.18;
    const outgoing = new Map(),
        incoming = new Map();
    for (const point of order) {
        if (!point.downstream || point.flow < threshold) continue;
        const { vertex: next, edge } = point.downstream;
        if (edge.cellIds.length !== 2 || edge.cellIds.some((id) => isWater(model.cellById.get(id)))) continue;
        Object.assign(edge, {
            flow: point.flow,
            fromId: point.id,
            toId: next.id,
            fromElevation: point.drainageElevation,
            toElevation: next.drainageElevation,
        });
        model.riverEdges.set(edge.id, edge);
        outgoing.set(point.id, { point, next, edge });
        incoming.set(next.id, (incoming.get(next.id) ?? 0) + 1);
    }
    const visited = new Set();
    const startCourse = (start) => {
        const river = {
            id: 'river-' + (model.rivers.length + 1),
            name: 'River ' + (model.rivers.length + 1),
            edgeIds: [],
            points: [],
        };
        let link = start;
        river.points.push({ id: link.point.id, x: link.point.x, y: link.point.y });
        while (link && !visited.has(link.edge.id)) {
            visited.add(link.edge.id);
            river.edgeIds.push(link.edge.id);
            river.points.push({ id: link.next.id, x: link.next.x, y: link.next.y });
            if (incoming.get(link.next.id) !== 1) break;
            link = outgoing.get(link.next.id);
        }
        model.rivers.push(river);
    };
    for (const link of outgoing.values()) if (incoming.get(link.point.id) !== 1) startCourse(link);
    for (const link of outgoing.values()) if (!visited.has(link.edge.id)) startCourse(link);
    for (const edge of model.riverEdges.values())
        for (const id of edge.cellIds) model.cellById.get(id).riverEdgeIds.push(edge.id);
    for (const edge of edges.values()) {
        if (edge.cellIds.length !== 2) continue;
        const [a, b] = edge.cellIds.map((id) => model.cellById.get(id));
        if ((a.terrain === 'lake' && !isWater(b)) || (b.terrain === 'lake' && !isWater(a)))
            model.lakeShores.push(edge);
    }
    for (const cell of model.cells) {
        if (isWater(cell)) {
            cell.frozen = cell.polarIce || (cell.terrain === 'lake' && cell.snowCover);
            Object.assign(cell, {
                // Frozen water must still read as water, never as a white land
                // bridge at the poles. Only actual snow-covered land is white.
                terrainColor: cell.frozen ? '#325f75' : cell.terrain === 'lake' ? '#368d9e' : '#294b5d',
                movementCost: null,
                population: 0,
                controllerId: null,
                damage: 0,
                landform: 'water',
                vegetation: 'none',
                moisture: 1,
            });
        } else classifyTerrain(cell, neighbors(cell).filter(Boolean), model.cellCount);
    }
}
