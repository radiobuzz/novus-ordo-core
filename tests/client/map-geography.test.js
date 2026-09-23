import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeography, geographyPoint, geographyOptions } from '../../resources/js/map-lab/geography.js';
import { createMapLabModel, reachableCells } from '../../resources/js/map-lab/model.js';
import { regionCenter, neighborCoordinates, axialKey } from '../../resources/js/map-lab/hex.js';
import { drainGraph } from '../../resources/js/map-lab/drainage.js';
import { isWater } from '../../resources/js/map-lab/water.js';

const snapshot = (model) =>
    model.cells.map((cell) => [
        cell.id,
        cell.baseElevation,
        cell.terrain,
        cell.moisture,
        cell.flow,
        cell.outletId,
    ]);

test('generation is reproducible; different seeds actually change geography', () => {
    assert.deepEqual(snapshot(createMapLabModel()), snapshot(createMapLabModel()));
    assert.notDeepEqual(
        snapshot(createMapLabModel()),
        snapshot(createMapLabModel(19, 'scenario', { seed: 'second-world' })),
    );
});

test('continuous geography is identical at region centers for every density', () => {
    const field = createGeography();
    for (const [q, r] of [
        [0, 0],
        [10, 10],
        [3, -2],
        [-1, 1],
    ]) {
        const samples = [1, 2, 3].map((radius) => {
            const center = regionCenter(q, r, radius);
            return field.at(center.q, center.r, radius, false);
        });
        assert.deepEqual(samples[0], samples[1]);
        assert.deepEqual(samples[1], samples[2]);
    }
    assert.deepEqual(geographyPoint(0, 0, 2, true), geographyPoint(10, 70, 2, false));
});

test('land coverage and wetness controls have geographic effects; inputs are bounded', () => {
    const dry = createGeography({ land: 25, wetness: 0 });
    const wet = createGeography({ land: 80, wetness: 100 });
    let dryLand = 0,
        wetLand = 0;
    for (let y = 0; y < 17; y++)
        for (let x = 0; x < 30; x++) {
            const a = dry.sample(x, y),
                b = wet.sample(x, y);
            dryLand += a.elevation > 0;
            wetLand += b.elevation > 0;
            assert.ok(b.rainfall > a.rainfall);
        }
    assert.ok(wetLand > dryLand * 2);
    assert.equal(geographyOptions({ land: Infinity }).land, 53);
    assert.equal(geographyOptions({ scale: -3 }).scale, 50);
    assert.equal(geographyOptions({ wetness: 999 }).wetness, 100);
    assert.equal(geographyOptions({ seed: 'x'.repeat(90) }).seed.length, 64);
});

test('Priority-Flood fills a known basin to its spill level, without cycles or loss of flow', () => {
    const vertices = new Map(
        [
            ['sea', 0],
            ['spill', 100],
            ['pit', 20],
            ['hill', 180],
        ].map(([id, elevation]) => [id, { id, elevation, runoff: 1, terminal: id === 'sea', links: [] }]),
    );
    for (const [a, b] of [
        ['sea', 'spill'],
        ['spill', 'pit'],
        ['pit', 'hill'],
    ]) {
        vertices.get(a).links.push({ vertex: vertices.get(b), edge: { id: a + b } });
        vertices.get(b).links.push({ vertex: vertices.get(a), edge: { id: a + b } });
    }
    drainGraph(vertices);
    assert.equal(vertices.get('pit').drainageElevation, 100);
    assert.equal(vertices.get('pit').elevation, 20);
    assert.equal(vertices.get('hill').drainageElevation, 180);
    assert.equal(vertices.get('sea').flow, 4);
    assert.equal(vertices.get('hill').outletId, 'sea');
});

for (const seed of ['ember-19', 'riverlands', 'dry-frontier']) {
    test(`${seed}: complete world has downhill drainage, conserved runoff and valid lakes`, () => {
        const model = createMapLabModel(19, 'world', { seed });
        assert.ok(Math.abs(model.drainage.totalRunoff - model.drainage.outletFlow) < 1e-8);
        for (const point of model.drainage.vertices.values()) {
            assert.ok(Number.isFinite(point.flow) && point.flow >= point.runoff);
            if (!point.downstream) {
                assert.equal(point.terminal, true);
                continue;
            }
            const next = point.downstream.vertex;
            assert.ok(next.sequence < point.sequence, 'Every route terminates; there can be no cycles');
            assert.ok(next.drainageElevation <= point.drainageElevation);
            assert.ok(next.flow >= point.flow);
            assert.equal(next.outletId, point.outletId);
        }
        for (const edge of model.riverEdges.values()) assert.ok(edge.fromElevation >= edge.toElevation);
        for (const lake of model.lakes)
            for (const id of lake.cellIds) {
                const cell = model.cellById.get(id);
                assert.ok(cell.waterDepth > 12);
                assert.ok(Math.abs(cell.elevation + cell.waterDepth - lake.waterLevel) < 0.001);
                assert.ok(!cell.city && cell.population === 0 && cell.controllerId === null);
            }
        const army = model.cellById.get(model.army.cellId);
        assert.ok(!isWater(army));
        assert.ok(reachableCells(model).length > 0);
        assert.equal(model.cells.filter((cell) => cell.city).length, 1);
        // Neighbour heights vary much less than distant unrelated samples.
        const land = model.cells.filter((cell) => !isWater(cell));
        let near = 0,
            far = 0,
            count = 0;
        for (let i = 0; i < land.length; i++) {
            const cell = land[i];
            const neighbor = neighborCoordinates(cell.q, cell.r)
                .map(({ q, r }) => model.cellById.get(axialKey(q, r)))
                .find((c) => c && !isWater(c));
            if (!neighbor) continue;
            near += Math.abs(cell.baseElevation - neighbor.baseElevation);
            far += Math.abs(
                cell.baseElevation - land[(i + Math.floor(land.length / 2)) % land.length].baseElevation,
            );
            count++;
        }
        assert.ok(count > 1000 && near < far * 0.5);
    });
}
