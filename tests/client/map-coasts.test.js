import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoasts } from '../../resources/js/map/coasts.js';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createCartography } from '../../resources/js/map/cartography.js';
import { hexDisk, axialKey, axialToPixel } from '../../resources/js/map-lab/hex.js';

function fixture(density, kind, altitude = 0) {
    const cellSize = 1 / Math.sqrt(density);
    const cells = hexDisk(Math.ceil(4 * Math.sqrt(density))).map(({ q, r }) => {
        const { x, y } = axialToPixel(q, r, cellSize);
        const wet =
            kind === 'channel'
                ? Math.abs(y) < 0.6
                : kind === 'island'
                  ? Math.hypot(x, y) > 0.9
                  : x > 0 || (kind !== 'straight' && x > -2.1 && Math.abs(y) < 0.7);
        return {
            id: axialKey(q, r),
            q,
            r,
            x,
            y,
            terrain: wet ? (kind === 'lake' ? 'lake' : 'ocean') : 'plains',
            elevation: wet ? altitude - 30 : altitude + 40,
            waterLevel: altitude,
        };
    });
    return {
        cells,
        cellById: new Map(cells.map((c) => [c.id, c])),
        cellSize,
        cellCount: density,
        offsetX: 0,
        offsetY: 0,
    };
}

test('enclosed inlets are candidates; straight coasts, islands and through-channels are not bays', () => {
    for (const density of [7, 19, 37]) {
        for (const kind of ['straight', 'channel', 'island'])
            assert.equal(createCoasts(fixture(density, kind)).bays.length, 0, `${density}: ${kind}`);
        for (const kind of ['inlet', 'lake']) {
            const result = createCoasts(fixture(density, kind, kind === 'lake' ? 800 : 0));
            assert.ok(result.bays.length > 0, `${density}: ${kind}`);
            for (const bay of result.bays) {
                assert.ok(bay.mouth.length && bay.inward > 0);
                assert.ok(bay.cellIds.includes(bay.anchorId));
                assert.ok(bay.area >= 0.15);
                assert.equal(bay.waterType, kind === 'lake' ? 'lake' : 'ocean');
            }
        }
    }
});

test('lake shoreline uses its own surface and separates shelter from land access', () => {
    const model = fixture(19, 'lake', 800);
    const before = JSON.stringify(model.cells);
    const lake = createCoasts(model);
    assert.equal(JSON.stringify(model.cells), before);
    assert.ok(lake.shores.every((s) => s.surface === 800 && s.shoreRise < 350));
    assert.ok(lake.shores.some((s) => s.exposureGrade === 0));
    for (const c of model.cells) if (c.terrain === 'plains') c.elevation += 1400;
    const cliffs = createCoasts(model);
    assert.deepEqual(
        cliffs.shores.map((s) => s.exposure),
        lake.shores.map((s) => s.exposure),
    );
    assert.ok(cliffs.shores.every((s) => s.accessGrade === 3));
    assert.ok(cliffs.shores.some((s) => s.truncated));
});

test('broad bay area is comparable across resolutions rather than proportional to microcell count', () => {
    const areas = [7, 19, 37].map((d) =>
        createCoasts(fixture(d, 'inlet')).bays.reduce((sum, b) => sum + b.area, 0),
    );
    assert.ok(Math.max(...areas) / Math.min(...areas) < 2, JSON.stringify(areas));
});

test('generated bays share the atlas and retain existing geographic names and model state', () => {
    const model = createMapLabModel(19, 'world');
    const before = JSON.stringify(model.cells);
    const a = createCartography(model),
        b = createCartography(model, { continentMinimum: 80 });
    assert.ok(a.bays.length);
    assert.deepEqual(a.bays, b.bays);
    assert.deepEqual(a.oceans, b.oceans);
    assert.equal(JSON.stringify(model.cells), before);
    for (const bay of a.bays) {
        assert.equal(a.featureById.get(bay.id), bay);
        assert.ok(a.featuresByCell.get(bay.anchorId).includes(bay.id));
        assert.ok(bay.relations.length);
        for (const r of bay.relations) assert.ok(a.featureById.has(r.featureId));
        for (const id of bay.cellIds) assert.equal(model.cellById.get(id).terrain, bay.waterType);
    }
    assert.deepEqual(a.coasts.shores, b.coasts.shores);
});
