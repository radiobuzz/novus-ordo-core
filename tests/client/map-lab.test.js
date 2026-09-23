import assert from 'node:assert/strict';
import test from 'node:test';
import { isWater, sharedEdgeId } from '../../resources/js/map-lab/water.js';
import { axialKey, hexDisk, hexDistance, neighborCoordinates } from '../../resources/js/map-lab/hex.js';
import {
    createMapLabModel,
    moveArmy,
    reachableCells,
    regionControl,
} from '../../resources/js/map-lab/model.js';

test('hex resolutions contain the advertised number of cells', () => {
    assert.equal(hexDisk(1).length, 7);
    assert.equal(hexDisk(2).length, 19);
    assert.equal(hexDisk(3).length, 37);
});

for (const count of [7, 19, 37]) {
    test(`${count}-cell regions generate unique, connected operational cells`, () => {
        const model = createMapLabModel(count);
        assert.equal(model.regions.length, 7);
        assert.equal(model.cells.length, count * model.regions.length);
        assert.equal(model.cellById.size, model.cells.length);
        for (const region of model.regions) {
            assert.equal(region.cellIds.length, count);
            for (const id of region.cellIds) assert.equal(model.cellById.get(id).regionId, region.id);
        }
        for (const region of model.regions.filter((candidate) => candidate.id !== 'emberfall')) {
            const touchesCenter = region.cellIds.some((id) => {
                const cell = model.cellById.get(id);
                return neighborCoordinates(cell.q, cell.r).some(({ q, r }) => {
                    return model.cellById.get(axialKey(q, r))?.regionId === 'emberfall';
                });
            });
            assert.equal(touchesCenter, true, `${region.name} should touch Emberfall`);
        }
    });
}

test('an army captures only adjacent cells and updates regional control', () => {
    const model = createMapLabModel(19);
    const before = regionControl(model, 'emberfall');
    const origin = model.cellById.get(model.army.cellId);
    const target = reachableCells(model).find((cell) => cell.controllerId !== model.army.nationId);
    assert.ok(target);
    assert.equal(hexDistance(origin, target), 1);
    assert.equal(moveArmy(model, target.id), true);
    assert.equal(model.army.cellId, target.id);
    assert.equal(target.controllerId, model.army.nationId);
    assert.equal(target.damage, 1);
    const after = regionControl(model, 'emberfall');
    assert.equal(
        after.controlledCells.get(model.army.nationId),
        before.controlledCells.get(model.army.nationId) + 1,
    );
    const distant = model.cells.find((cell) => hexDistance(target, cell) > 1);
    assert.equal(moveArmy(model, distant.id), false);
});

test('full-scale model reproduces a 30 by 20 world at 19 cells per region', () => {
    const model = createMapLabModel(19, 'world');
    assert.equal(model.scale, 'world');
    assert.equal(model.regions.length, 600);
    assert.ok(model.regions.some((region) => region.isLand));
    assert.ok(model.regions.some((region) => !region.isLand));
    assert.ok(
        model.regions.some(
            (region) => region.isLand && region.cellIds.some((id) => isWater(model.cellById.get(id))),
        ),
    );
    assert.equal(model.cells.length, 11_400);
    assert.equal(model.cellById.size, 11_400);
    assert.equal(model.regionById.get('emberfall').cellIds.length, 19);
    assert.ok(model.width > model.height);
});

for (const scale of ['scenario', 'world']) {
    for (const resolution of [7, 19, 37]) {
        test(`${scale}/${resolution}: lakes and continuous rivers belong to actual geography`, () => {
            const model = createMapLabModel(resolution, scale);
            if (scale === 'world') assert.ok(model.lakes.length > 0);
            assert.ok(model.rivers.length > 0);
            assert.ok(!isWater(model.cellById.get(model.army.cellId)));
            for (const lake of model.lakes) {
                assert.ok(lake.cellIds.length >= 1); // Small basins may resolve to one coarse cell.
                const visited = new Set([lake.cellIds[0]]);
                const queue = [lake.cellIds[0]];
                for (let i = 0; i < queue.length; i++) {
                    const cell = model.cellById.get(queue[i]);
                    assert.equal(cell.population, 0);
                    assert.equal(cell.controllerId, null);
                    assert.equal(cell.city, false);
                    for (const coord of neighborCoordinates(cell.q, cell.r)) {
                        const id = axialKey(coord.q, coord.r);
                        if (lake.cellIds.includes(id) && !visited.has(id)) {
                            visited.add(id);
                            queue.push(id);
                        }
                    }
                }
                assert.equal(visited.size, lake.cellIds.length);
            }
            for (const river of model.rivers) {
                assert.equal(river.points.length, river.edgeIds.length + 1);
                assert.equal(new Set(river.points.map((point) => point.id)).size, river.points.length);
                river.edgeIds.forEach((id, index) => {
                    const edge = model.riverEdges.get(id);
                    const [a, b] = edge.cellIds.map((cellId) => model.cellById.get(cellId));
                    assert.equal(hexDistance(a, b), 1);
                    assert.ok(!isWater(a) && !isWater(b));
                    assert.equal(id, sharedEdgeId(a.id, b.id));
                    assert.deepEqual(
                        new Set([edge.a.id, edge.b.id]),
                        new Set([river.points[index].id, river.points[index + 1].id]),
                    );
                    assert.ok(
                        Math.abs(Math.hypot(edge.a.x - edge.b.x, edge.a.y - edge.b.y) - model.cellSize) <
                            1e-8,
                    );
                    assert.ok(a.riverEdgeIds.includes(id) && b.riverEdgeIds.includes(id));
                });
            }
            // The full world must demonstrate cross-border geography. A small
            // crop may contain only short headwater reaches within one region.
            if (scale === 'world') {
                assert.ok(
                    model.lakes.some(
                        (lake) => new Set(lake.cellIds.map((id) => model.cellById.get(id).regionId)).size > 1,
                    ),
                );
                assert.ok(
                    model.rivers.some(
                        (river) =>
                            new Set(
                                river.edgeIds.flatMap((id) =>
                                    model.riverEdges
                                        .get(id)
                                        .cellIds.map((cellId) => model.cellById.get(cellId).regionId),
                                ),
                            ).size > 1,
                    ),
                );
            }
        });
    }
}

test('lake cells reject occupation; river crossings preserve political ownership', () => {
    const model = createMapLabModel(19, 'world');
    const lake = model.cellById.get(model.lakes[0].cellIds[0]);
    const bank = neighborCoordinates(lake.q, lake.r)
        .map(({ q, r }) => model.cellById.get(axialKey(q, r)))
        .find((cell) => cell && !isWater(cell));
    assert.ok(bank);
    model.army.cellId = bank.id;
    assert.ok(!reachableCells(model).some((cell) => cell.id === lake.id));
    assert.equal(moveArmy(model, lake.id), false);
    assert.equal(model.army.cellId, bank.id);
    const edge = model.riverEdges.values().next().value;
    const target = model.cellById.get(edge.cellIds[1]);
    const owner = target.politicalOwnerId;
    model.army.cellId = edge.cellIds[0];
    assert.equal(moveArmy(model, target.id), true);
    assert.equal(target.politicalOwnerId, owner);
    assert.equal(target.controllerId, 'sable');
});
