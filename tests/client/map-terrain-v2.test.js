import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { TerrainField, terrainColor, terrainNoise } from '../../resources/js/map-lab/terrain-v2-field.js';

test('visual fields preserve exact cell-centre identity and never mutate geography', () => {
    for (const density of [7, 19, 37]) {
        const model = createMapLabModel(density, 'world');
        const before = JSON.stringify(model.cells),
            field = new TerrainField(model);
        for (let i = 0; i < model.cells.length; i += 13) {
            const cell = model.cells[i],
                sample = field.sample(cell.x, cell.y);
            assert.ok(Math.abs(sample[1] - (['lake', 'ocean'].includes(cell.terrain) ? 0 : 1)) < 1e-8);
            const p = field.geographic(cell.x, cell.y),
                world = field.world(p.x, p.y);
            assert.ok(Math.hypot(world.x - cell.x, world.y - cell.y) < 1e-7);
            const color = terrainColor(field, sample, p.x, p.y);
            assert.ok(color.every((n) => Number.isFinite(n) && n >= 0 && n <= 255));
            assert.deepEqual(color, terrainColor(field, sample, p.x, p.y));
            assert.equal(field.cellAt(cell.x, cell.y).id, cell.id);
        }
        assert.equal(field.sample(-10000, -10000)[0], 0);
        assert.equal(JSON.stringify(model.cells), before);
    }
});
test('noise is seeded, continuous, non-mirrored and not bound to cell IDs', () => {
    const a = terrainNoise('same'),
        b = terrainNoise('same'),
        c = terrainNoise('different');
    assert.equal(a.noise(1.24, 2.79), b.noise(1.24, 2.79));
    assert.notEqual(a.noise(1.24, 2.79), c.noise(1.24, 2.79));
    assert.notEqual(a.noise(1.24, 2.79), a.noise(-1.24, 2.79));
    assert.ok(Math.abs(a.noise(1.999999, 3.45) - a.noise(2.000001, 3.45)) < 0.00001);
});
