import test from 'node:test';
import assert from 'node:assert/strict';
import {
    coastStyle,
    CoastalLandscape,
    coastalColor,
    coastalClearing,
} from '../../resources/js/map/coastal-landscape.js';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createCoasts, shoreEdge } from '../../resources/js/map/coasts.js';
import { axialToPixel, neighborCoordinates } from '../../resources/js/map-lab/hex.js';

test('cliffs follow shore rise, not access or exposure; lake/cropped exposure is conservative', () => {
    const base = {
        shoreRise: 50,
        inlandRise: 1000,
        ground: 0,
        accessGrade: 3,
        exposure: 1,
        waterType: 'ocean',
    };
    const gentle = coastStyle(base);
    assert.equal(gentle.cliff, 0);
    assert.equal(gentle.rough, 1);
    assert.equal(gentle.exposure, 1);
    assert.equal(coastStyle({ ...base, shoreRise: 2000, exposure: 0 }).cliff, 1);
    assert.equal(coastStyle({ ...base, waterType: 'lake' }).exposure, 0.35);
    assert.equal(coastStyle({ ...base, truncated: true }).exposure, 0.5);
});

test('six sides retain independent profiles and corners blend without changing cells', () => {
    const land = { id: 'land', x: 0, y: 0, q: 0, r: 0 };
    const cells = neighborCoordinates(0, 0).map((p, i) => ({
        ...p,
        ...axialToPixel(p.q, p.r, 10),
        id: `water${i}`,
    }));
    const model = { cellSize: 10, cellById: new Map([land, ...cells].map((c) => [c.id, c])) };
    const coasts = {
        shores: cells.map((water, i) => ({
            landId: land.id,
            waterId: water.id,
            edge: shoreEdge(model, land, i),
            shoreRise: i * 400,
            exposure: i / 5,
            inlandRise: 0,
            ground: 1,
            waterType: 'ocean',
        })),
    };
    const index = new CoastalLandscape(model, coasts);
    const before = JSON.stringify(coasts);
    const profiles = cells.map((water) => ({ ...index.sample(water.x * 0.5, water.y * 0.5) }));
    assert.equal(profiles[0].cliff, 0);
    assert.equal(profiles[5].cliff, 1);
    assert.equal(new Set(profiles.map((p) => p.exposure)).size, 6);
    assert.equal(index.sample(100, 100), null);
    assert.equal(JSON.stringify(coasts), before);
});

test('art follows blended shore position, preserves ice and deep water, and clears only margins', () => {
    const p = { cliff: 1, rough: 0, exposure: 1, distance: 0.1, inland: 0.1, blend: true };
    const color = (profile, land, ice = 0) =>
        coastalColor([30, 65, 80], profile, land, 0, ice, () => 0.65, 1, 1);
    assert.deepEqual(color(p, 0.6), color({ ...p, inland: 0.4 }, 0.6));
    assert.notDeepEqual(color(p, 0.6), color({ ...p, cliff: 0 }, 0.6));
    assert.deepEqual(color(p, 0.48, 1), [30, 65, 80]);
    assert.ok(color(p, 0).every((v, i) => Math.abs(v - [30, 65, 80][i]) < 0.001));
    assert.equal(coastalClearing(p, 0.6), 1);
    assert.equal(coastalClearing(p, 1), 0);
    assert.notDeepEqual(color({ ...p, blend: false }, 1), color({ ...p, blend: false, inland: 1 }, 1));
});

test('generated profiles are finite and read-only at every supported resolution', () => {
    for (const density of [7, 19, 37]) {
        const model = createMapLabModel(density, 'world');
        const coasts = createCoasts(model),
            before = JSON.stringify(model.cells);
        const index = new CoastalLandscape(model, coasts);
        assert.ok(index.edgeCount > 100);
        for (const shore of coasts.shores) {
            const p = index.sample(shore.midpoint.x, shore.midpoint.y);
            assert.ok(
                p &&
                    ['cliff', 'rough', 'exposure'].every(
                        (key) => Number.isFinite(p[key]) && p[key] >= 0 && p[key] <= 1,
                    ),
            );
        }
        assert.equal(JSON.stringify(model.cells), before);
    }
});
