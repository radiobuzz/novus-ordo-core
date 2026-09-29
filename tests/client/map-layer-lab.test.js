import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapModel } from '../../resources/js/map/model.js';
import { exportMap, restoreMap } from '../../resources/js/map/snapshot.js';
import { catalogue, available } from '../../resources/js/client/experiments/map-layers/catalogue.js';
import {
    makeSamples,
    valuesFor,
    analysisStyle,
} from '../../resources/js/client/experiments/map-layers/data.js';

test('layer lab keeps national fixtures unavailable before founding and unknown outside the sample nation', () => {
    const model = restoreMap(exportMap(createMapModel(7, 'world', { regionColumns: 22, regionRows: 16 })));
    const samples = makeSamples(model);
    const population = catalogue.find((l) => l.id === 'population');
    assert.equal(available(population, 'founding'), false);
    assert.equal(available(population, 'governing'), true);
    const values = valuesFor(model, samples, population, 'ore');
    let foreign = 0,
        own = 0;
    for (const cell of model.cells.filter((c) => !['lake', 'ocean'].includes(c.terrain))) {
        const sample = samples.get(cell.regionId);
        if (!sample.own) {
            assert.equal(values.get(cell.id), null);
            foreign++;
        } else {
            assert.equal(values.get(cell.id), sample.population);
            own++;
        }
    }
    assert.ok(foreign > 0 && own > 0);
    const potential = valuesFor(
        model,
        samples,
        catalogue.find((l) => l.id === 'potential'),
        'ore',
    );
    for (const c of model.cells.filter((c) => c.resourcePotential?.ore)) {
        assert.equal(potential.get(c.id), c.resourcePotential.ore.capacity);
    }
    assert.ok(model.cells.every((c) => c.population === undefined));
});

test('percent scales remain absolute and unknown is distinct from zero', () => {
    const unrest = catalogue.find((l) => l.id === 'unrest');
    const style = analysisStyle(
        unrest,
        new Map([
            ['low', 0.01],
            ['high', 0.2],
            ['unknown', null],
        ]),
    );
    assert.equal(style.maximum, 1);
    assert.equal(style.colour(null), null);
    assert.notEqual(style.colour(0), null);
    assert.notEqual(style.colour(0), style.colour(1));
});

test('water participation is explicit and Ocean off excludes it even from water analyses', () => {
    const cells = [
        { id: 'land', terrain: 'plains', temperature: 0.7 },
        { id: 'sea', terrain: 'ocean', temperature: 0.5, baseElevation: -40 },
        { id: 'lake', terrain: 'lake', temperature: 0.4, waterDepth: 20 },
    ];
    const model = { cells },
        samples = new Map();
    const temperature = catalogue.find((l) => l.id === 'temperature');
    assert.deepEqual([...valuesFor(model, samples, temperature).values()], [0.7, null, null]);
    assert.deepEqual(
        [...valuesFor(model, samples, temperature, null, { includeWater: true }).values()],
        [0.7, 0.5, 0.4],
    );
    const depth = catalogue.find((l) => l.id === 'depth');
    assert.deepEqual(
        [...valuesFor(model, samples, depth, null, { ocean: false }).values()],
        [null, null, 20],
    );
});

test('categorical legends expose exactly the colours used by the map, including numeric basin IDs', () => {
    const style = analysisStyle(
        { scale: 'category' },
        new Map([
            ['a', 12],
            ['b', 23],
            ['c', null],
        ]),
    );
    assert.deepEqual(style.categories, [12, 23]);
    assert.notEqual(style.colour(12), style.colour(23));
    assert.equal(style.colour(null), null);
});

test('restored river courses preserve every detailed stroke and confluence', async () => {
    const { riverStrokes } = await import('../../resources/js/map/water-visuals.js');
    const model = createMapModel(7, 'world', { regionColumns: 22, regionRows: 16 });
    const restored = restoreMap(exportMap(model));
    const ordered = (m) => riverStrokes(m).sort((a, b) => a.id.localeCompare(b.id));
    assert.ok(model.riverEdges.size > 0);
    assert.deepEqual(ordered(restored), ordered(model));
});
