import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeography, climateTemperature, materialFor } from '../../resources/js/map-lab/geography.js';
import { createMapLabModel, moveArmy } from '../../resources/js/map-lab/model.js';
import { conditionBasins } from '../../resources/js/map-lab/drainage.js';
import { isWater } from '../../resources/js/map-lab/water.js';
import { neighborCoordinates, axialKey } from '../../resources/js/map-lab/hex.js';

test('latitude produces two cold poles; height produces colder mountains', () => {
    assert.equal(climateTemperature(90, 0), 0);
    assert.equal(climateTemperature(-90, 0), 0);
    assert.ok(climateTemperature(0, 0) > 0.9);
    assert.ok(climateTemperature(0, 1500) < climateTemperature(0, 0));
    const field = createGeography();
    for (const x of [0, 6, 15, 24, 30]) {
        assert.ok(field.sample(x, 0).temperature < 0.14);
        assert.ok(field.sample(x, (19 * Math.sqrt(3)) / 2).temperature < 0.14);
    }
});

test('mountain strength does not change the continental coastline', () => {
    const low = createGeography({ mountains: 0 }),
        high = createGeography({ mountains: 100 });
    let higher = 0;
    for (let y = 0; y <= 16; y++)
        for (let x = 0; x < 30; x++) {
            const a = low.sample(x, y),
                b = high.sample(x, y);
            assert.equal(a.elevation > 0, b.elevation > 0);
            higher += b.elevation > a.elevation;
        }
    assert.ok(higher > 100);
});

test('oversized basins get lowered spillways and still conserve downstream flow', () => {
    const vertices = new Map(
        [
            ['sea', 0],
            ['rim', 320],
            ['pit', 20],
            ['hill', 400],
        ].map(([id, elevation]) => [id, { id, elevation, runoff: 1, terminal: id === 'sea', links: [] }]),
    );
    for (const [a, b] of [
        ['sea', 'rim'],
        ['rim', 'pit'],
        ['pit', 'hill'],
    ]) {
        vertices.get(a).links.push({ vertex: vertices.get(b), edge: { id: a + b } });
        vertices.get(b).links.push({ vertex: vertices.get(a), edge: { id: a + b } });
    }
    const { breaches } = conditionBasins(vertices, 19);
    assert.ok(breaches > 0);
    assert.ok(vertices.get('rim').elevation < 320);
    assert.ok(vertices.get('pit').drainageElevation - vertices.get('pit').elevation <= 85);
    assert.equal(vertices.get('sea').flow, 4);
    for (const point of vertices.values())
        if (point.downstream) {
            assert.ok(point.downstream.vertex.drainageElevation <= point.drainageElevation);
            assert.ok(point.downstream.vertex.sequence < point.sequence);
        }
});

test('100 default worlds keep separate continents, modest lakes, and both polar caps', () => {
    let largestLake = 0;
    for (let index = 0; index < 100; index++) {
        const seed = 'audit-' + index,
            model = createMapLabModel(7, 'world', { seed });
        const stats = model.generation;
        assert.equal(stats.majorContinents, 3, seed + ': continental cores must remain separated');
        assert.ok(stats.largestLakeCells / model.cellCount <= 6, seed + ': giant basin returned');
        assert.ok(stats.lakeCells / model.cells.length < 0.06, seed + ': too much inland lake area');
        assert.ok(Math.abs(model.drainage.outletFlow - model.drainage.totalRunoff) < 1e-8);
        for (const sign of [-1, 1]) {
            const polar = model.cells.filter((cell) => cell.latitude * sign > 88);
            assert.ok(polar.length > 0);
            assert.ok(polar.every((cell) => (isWater(cell) ? cell.frozen : cell.terrain === 'snow')));
        }
        largestLake = Math.max(largestLake, stats.largestLakeCells / model.cellCount);
    }
    console.log(
        '100-seed audit: 3 continents per world; largest lake ' + largestLake.toFixed(2) + ' region-areas',
    );
});

test('higher resolutions and extreme controls retain valid hydrology and water movement', () => {
    for (const [resolution, options] of [
        [19, { seed: 'ember-19' }],
        [37, { seed: 'ember-19' }],
        [19, { seed: 'audit-65' }],
        [19, { seed: 'riverlands', continents: 5 }],
        [19, { seed: 'dry-frontier', continents: 2, land: 25, wetness: 0, mountains: 100, scale: 50 }],
        [19, { seed: 'wet-world', continents: 5, land: 80, wetness: 100, mountains: 100, scale: 180 }],
    ]) {
        const model = createMapLabModel(resolution, 'world', options);
        assert.ok(model.generation.largestLakeCells / resolution < 8, JSON.stringify(options));
        assert.ok(Math.abs(model.drainage.outletFlow - model.drainage.totalRunoff) < 1e-8);
        for (const point of model.drainage.vertices.values())
            if (point.downstream) {
                assert.ok(point.downstream.vertex.drainageElevation <= point.drainageElevation);
                assert.ok(point.downstream.vertex.sequence < point.sequence);
            }
        const ice = model.cells.find(
            (cell) =>
                cell.frozen &&
                neighborCoordinates(cell.q, cell.r).some(({ q, r }) => {
                    const neighbor = model.cellById.get(axialKey(q, r));
                    return neighbor && !isWater(neighbor);
                }),
        );
        assert.ok(ice);
        assert.ok(isWater(ice));
        assert.equal(materialFor(ice), 'ice');
        assert.equal(ice.population, 0);
        const bank = neighborCoordinates(ice.q, ice.r)
            .map(({ q, r }) => model.cellById.get(axialKey(q, r)))
            .find((cell) => cell && !isWater(cell));
        model.army.cellId = bank.id;
        assert.equal(moveArmy(model, ice.id), false);
    }
});
