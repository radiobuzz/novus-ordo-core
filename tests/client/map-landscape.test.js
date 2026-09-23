import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createGeography, geographyOptions } from '../../resources/js/map-lab/geography.js';
import { prepareRelief } from '../../resources/js/map-lab/relief.js';

test('polar extent changes ice without changing geography or drainage; snowline stays independent', () => {
    const none = createMapLabModel(19, 'world', { polarExtent: 0 });
    const small = createMapLabModel(19, 'world');
    const large = createMapLabModel(19, 'world', { polarExtent: 25 });
    assert.equal(none.cells.filter((cell) => cell.terrain === 'ocean' && cell.frozen).length, 0);
    assert.ok(none.generation.snowCells > 0, 'Alpine snow remains with polar caps off');
    assert.ok(small.generation.frozenWaterCells < large.generation.frozenWaterCells * 0.6);
    for (const model of [small, large]) {
        assert.deepEqual(
            model.cells.map((cell) => cell.baseElevation),
            none.cells.map((cell) => cell.baseElevation),
        );
        assert.equal(model.generation.landCells, none.generation.landCells);
        assert.equal(model.generation.coastEdges, none.generation.coastEdges);
        assert.deepEqual(
            model.cells.map((cell) => cell.landform === 'water'),
            none.cells.map((cell) => cell.landform === 'water'),
        );
        assert.deepEqual([...model.riverEdges.keys()], [...none.riverEdges.keys()]);
    }
    const highSnowline = createMapLabModel(19, 'world', { polarExtent: 0, snowline: 3200 });
    assert.equal(highSnowline.generation.snowCells, 0);
    assert.deepEqual(
        highSnowline.cells.map((cell) => cell.baseElevation),
        none.cells.map((cell) => cell.baseElevation),
    );
});

test('coastal detail adds measured shoreline complexity independently of island groups', () => {
    const plain = createMapLabModel(19, 'world', { coastComplexity: 0, islandAbundance: 0 });
    const rich = createMapLabModel(19, 'world', { coastComplexity: 100, islandAbundance: 0 });
    assert.ok(rich.generation.coastEdges > plain.generation.coastEdges * 1.3);
    assert.equal(rich.geography.features.islands.length, 0);
    assert.ok(Math.abs(rich.generation.landPercent - plain.generation.landPercent) < 3);
    assert.equal(rich.generation.majorContinents, 3);
    const land = rich.cells.filter((cell) => cell.landform !== 'water');
    assert.ok(land.filter((cell) => cell.landform === 'plains').length / land.length > 0.45);
    assert.ok(land.some((cell) => cell.landform === 'mountain'));
    assert.ok(rich.geography.features.coasts.some((feature) => feature.amplitude < 0));
    assert.ok(rich.geography.features.coasts.some((feature) => feature.amplitude > 0));
    assert.ok(rich.geography.features.ranges.length > rich.geography.cores.length);
});

test('relief colors remain bounded, deterministic, and do not alter map data', () => {
    const model = createMapLabModel(19, 'world');
    const before = model.cells.map((cell) => [
        cell.id,
        cell.terrain,
        cell.elevation,
        cell.flow,
        cell.movementCost,
        cell.reliefColor,
    ]);
    prepareRelief(model);
    assert.deepEqual(
        model.cells.map((cell) => [
            cell.id,
            cell.terrain,
            cell.elevation,
            cell.flow,
            cell.movementCost,
            cell.reliefColor,
        ]),
        before,
    );
    for (const cell of model.cells) {
        assert.match(cell.reliefColor, /^#[0-9a-f]{6}$/i);
        assert.ok(cell.reliefShade >= 0.5 && cell.reliefShade <= 1.25);
    }
    assert.ok(new Set(model.cells.map((cell) => cell.reliefColor)).size > 30);
});

test('landscape controls are bounded and independent of seed repeatability', () => {
    const settings = geographyOptions({ polarExtent: -10, snowline: 99999, coastComplexity: NaN });
    assert.equal(settings.polarExtent, 0);
    assert.equal(settings.snowline, 3200);
    assert.equal(settings.coastComplexity, 75);
    assert.equal(geographyOptions({ islandAbundance: -1, lakeAbundance: -1 }).islandAbundance, 0);
    assert.equal(geographyOptions({ islandAbundance: -1, lakeAbundance: -1 }).lakeAbundance, 0);
    assert.equal(geographyOptions({ islandAbundance: 999, lakeAbundance: 999 }).islandAbundance, 100);
    assert.equal(geographyOptions({ islandAbundance: 999, lakeAbundance: 999 }).lakeAbundance, 100);
    assert.equal(geographyOptions({ islandAbundance: NaN, lakeAbundance: Infinity }).islandAbundance, 50);
    assert.equal(geographyOptions({ islandAbundance: NaN, lakeAbundance: Infinity }).lakeAbundance, 50);
    const a = createGeography(),
        b = createGeography();
    assert.deepEqual(a.features, b.features);
    assert.deepEqual(a.sample(17, 8), b.sample(17, 8));
});

test('island abundance adds stable groups independently of coast detail and relief', () => {
    for (const coastComplexity of [0, 75]) {
        const sparse = createMapLabModel(19, 'world', { coastComplexity, islandAbundance: 0 });
        const normal = createMapLabModel(19, 'world', { coastComplexity, islandAbundance: 50 });
        const plenty = createMapLabModel(19, 'world', { coastComplexity, islandAbundance: 100 });
        assert.equal(sparse.geography.features.islands.length, 0);
        assert.ok(plenty.generation.islands > normal.generation.islands + 5);
        assert.ok(normal.generation.islands > sparse.generation.islands);
        assert.equal(plenty.generation.majorContinents, 3);
        assert.ok(Math.abs(plenty.generation.landPercent - sparse.generation.landPercent) < 2);
        for (const key of ['coasts', 'ranges', 'plateaus'])
            assert.deepEqual(sparse.geography.features[key], plenty.geography.features[key]);
        for (const island of normal.geography.features.islands)
            assert.ok(
                plenty.geography.features.islands.some(
                    (other) => JSON.stringify(island) === JSON.stringify(other),
                ),
            );
        assert.deepEqual(
            plenty.geography.features,
            createGeography({ coastComplexity, islandAbundance: 100 }).features,
        );
    }
});

test('lake abundance retains natural basins without changing ocean or losing runoff', () => {
    const models = [0, 25, 50, 75, 100].map((lakeAbundance) =>
        createMapLabModel(19, 'world', { lakeAbundance }),
    );
    assert.equal(models[0].lakes.length, 0);
    assert.ok(models[4].lakes.length > models[2].lakes.length);
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        if (i) assert.ok(model.lakes.length >= models[i - 1].lakes.length);
        assert.deepEqual(
            model.cells.map((cell) => cell.baseElevation),
            models[0].cells.map((cell) => cell.baseElevation),
        );
        assert.deepEqual(
            model.cells.map((cell) => cell.terrain === 'ocean'),
            models[0].cells.map((cell) => cell.terrain === 'ocean'),
        );
        assert.ok(Math.abs(model.drainage.totalRunoff - model.drainage.outletFlow) < 1e-8);
        for (const lake of model.lakes) {
            assert.ok(lake.cellIds.length <= model.cellCount * 4);
            for (const id of lake.cellIds) {
                const cell = model.cellById.get(id);
                assert.equal(cell.terrain, 'lake');
                assert.equal(cell.lakeId, lake.id);
                assert.ok(cell.waterDepth > 3);
                assert.ok(Math.abs(cell.elevation + cell.waterDepth - lake.waterLevel) < 0.001);
            }
        }
        for (const cell of model.cells) if (cell.terrain !== 'lake') assert.equal(cell.lakeId, undefined);
        for (const point of model.drainage.vertices.values())
            if (point.downstream) {
                assert.ok(point.downstream.vertex.sequence < point.sequence);
                assert.ok(point.downstream.vertex.drainageElevation <= point.drainageElevation);
            }
    }
    const wet = createMapLabModel(19, 'world', { lakeAbundance: 100, wetness: 100 });
    assert.deepEqual(wet.lakes, models[4].lakes);
});
