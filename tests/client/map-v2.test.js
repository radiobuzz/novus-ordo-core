import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapModel } from '../../resources/js/map/model.js';
import { exportMap, restoreMap, CELL_FIELDS } from '../../resources/js/map/snapshot.js';
import {
    defaultProfiles,
    generateResources,
    validateProfiles,
    agriculturalSuitability,
} from '../../resources/js/map/resources.js';
import { worldOptions } from '../../resources/js/map/world.js';
import { writeFileSync } from 'node:fs';

for (const [columns, rows] of [
    [30, 20],
    [40, 30],
])
    for (const count of [7, 19, 37]) {
        test(`${columns}x${rows}/${count}: complete geography round-trip and area invariants`, () => {
            const start = performance.now();
            const model = createMapModel(count, 'world', { regionColumns: columns, regionRows: rows });
            const snapshot = exportMap(model);
            const encoded = JSON.stringify(snapshot);
            const restored = restoreMap(JSON.parse(encoded));
            assert.equal(restored.cells.length, columns * rows * count);
            assert.equal(new Set(restored.cells.map((c) => c.id)).size, restored.cells.length);
            assert.equal(restored.regions.length, columns * rows);
            assert(restored.regions.every((r) => r.cellIds.length === count));
            assert.deepEqual(exportMap(restored), snapshot);
            assert(restored.cells.every((c) => c.population === undefined));
            assert.equal(restored.drainage.totalRunoff, model.drainage.totalRunoff);
            assert.equal(restored.atlas.features.length, model.atlas.features.length);
            assert(restored.atlas.features.every((f) => f.name && !f.name.includes('#')));
            assert(Math.abs(restored.cells.length / count - columns * rows) < 1e-8);
            if (process.env.MAP_V2_FIXTURES)
                writeFileSync(`/tmp/no7-map-v2-${columns}-${rows}-${count}.json`, encoded);
            console.log(
                JSON.stringify({
                    columns,
                    rows,
                    count,
                    bytes: encoded.length,
                    milliseconds: Math.round(performance.now() - start),
                }),
            );
        });
    }
test('resource-only regeneration retains geography; exclusions and zero abundance are explicit', () => {
    const model = createMapModel(7, 'world', { regionColumns: 10, regionRows: 8 });
    const first = exportMap(model);
    const profiles = defaultProfiles();
    profiles.find((p) => p.key === 'ore').abundance = 0;
    generateResources(model, profiles);
    const next = exportMap(model);
    assert.deepEqual(next.cells, first.cells);
    assert.deepEqual(next.features, first.features);
    assert.deepEqual(next.edges, first.edges);
    assert.equal(next.resources.find((r) => r.key === 'ore').cells.length, 0);
    assert(next.resourceProfiles.some((r) => r.key === 'ore'));
    assert.throws(
        () => validateProfiles([...profiles, { ...profiles[2], key: 'copper', excludes: ['ore'] }]),
        /conflicts/,
    );
    assert.throws(() => restoreMap({ ...first, format: 'hex-beta-1' }), /Unsupported/);
    assert.throws(() => worldOptions({ regionColumns: 0 }), /positive/);
    assert.throws(() => worldOptions({ regionColumns: 300, regionRows: 200, cellCount: 37 }), /limit/);
    assert.equal(
        worldOptions({ regionColumns: 300, regionRows: 200, cellCount: 37 }, { maxCells: 3000000 })
            .regionColumns,
        300,
    );
});
test('agriculture is zero on water and responds to drought, cold, slope and excessive wetness', () => {
    const cell = { terrain: 'plains', temperature: 0.8, moisture: 0.6, slope: 0 };
    const good = agriculturalSuitability(cell);
    for (const change of [
        { terrain: 'ocean' },
        { moisture: 0.01 },
        { temperature: 0.1 },
        { slope: 1800 },
        { moisture: 1 },
    ])
        assert(agriculturalSuitability({ ...cell, ...change }) < good);
});
