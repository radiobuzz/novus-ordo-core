import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { TerrainField, terrainColor, terrainNoise } from '../../resources/js/map/terrain-v2-field.js';
import { waterDepthTone, riverWidth, riverStrokes } from '../../resources/js/map/water-visuals.js';
import { TerrainV2 } from '../../resources/js/map-lab/terrain-v2.js';

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

test('water retains overview depth contrast, deeper variation, subtle texture and ice', () => {
    const field = { noise: () => 0.5 };
    const color = (depth, land = 0, ice = 0) =>
        terrainColor(field, [1, land, -depth * 550, 0, 1, 0, ice, 1, 0.5, depth * (1 - land)], 0, 0);
    const colors = [0, 0.2, 0.6, 1, 2, 4, 8].map((d) => color(d));
    for (let i = 1; i < colors.length; i++) assert.ok(colors[i][1] < colors[i - 1][1]);
    assert.deepEqual(waterDepthTone(0), [66, 139, 152]);
    assert.deepEqual(waterDepthTone(1), [25, 61, 86]);
    assert.deepEqual(color(1, 0.4), color(1), 'nearby land does not fabricate shallow water');
    assert.ok(color(1, 0, 1)[0] > color(1)[0] + 100, 'ice remains visible');
    for (const d of [1, 3, 8]) {
        const a = waterDepthTone(d - 1e-6),
            b = waterDepthTone(d + 1e-6);
        assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 0.001));
    }
    const noisy = { noise: () => 1 };
    const textured = terrainColor(noisy, [1, 0, -110, 0, 1, 0, 0, 1, 0.5, 0.2], 1, 2);
    assert.ok(textured.slice(0, 3).every((v, i) => Math.abs(v - waterDepthTone(0.2)[i]) < 3));
});

test('lake depth is relative to its elevated surface; blending excludes land from depth weights', () => {
    const model = createMapLabModel(19, 'world');
    const water = model.cells.find((c) => c.q > 0 && model.cellById.has(`${c.q + 1},${c.r}`));
    // Use actual grid neighbours without depending on the generated biome.
    const land = model.cells.find((c) => c.q === water.q + 1 && c.r === water.r);
    Object.assign(water, {
        terrain: 'lake',
        elevation: 1000,
        waterLevel: 1070,
        waterDepth: 70,
        frozen: false,
    });
    Object.assign(land, { terrain: 'mountains', elevation: 1800 });
    const before = JSON.stringify(model.cells),
        field = new TerrainField(model);
    assert.ok(Math.abs(field.sample(water.x, water.y)[9] - 0.5) < 1e-8);
    const sample = field.sample(water.x * 0.75 + land.x * 0.25, water.y * 0.75 + land.y * 0.25);
    assert.ok(sample[1] > 0 && sample[1] < 0.5);
    assert.ok(Math.abs(sample[9] / (1 - sample[1]) - 0.5) < 1e-8);
    assert.equal(JSON.stringify(model.cells), before);
});

test('river pieces retain local flow, rounded continuity and exact confluences without changing drainage', () => {
    const model = createMapLabModel(19, 'world'),
        before = JSON.stringify(model.rivers);
    const strokes = riverStrokes(model);
    assert.equal(strokes.length, model.riverEdges.size);
    for (const river of model.rivers) {
        const pieces = river.edgeIds.map((id) => strokes.find((s) => s.id === id));
        assert.equal(pieces[0].start.x, river.points[0].x);
        assert.equal(pieces.at(-1).end.y, river.points.at(-1).y);
        for (let i = 0; i < pieces.length; i++) {
            assert.equal(
                pieces[i].width,
                riverWidth(model.cellSize, model.riverEdges.get(pieces[i].id).flow),
            );
            if (i) assert.deepEqual(pieces[i - 1].end, pieces[i].start);
        }
    }
    assert.ok(new Set(strokes.map((s) => s.width)).size > 10);
    assert.ok(riverWidth(10, 4) > riverWidth(10, 0.7));
    assert.equal(JSON.stringify(model.rivers), before);
});

test('river rendering uses local widths at close zoom, all banks first, cached paths and reset cleanup', () => {
    const original = globalThis.Path2D;
    globalThis.Path2D = class {
        moveTo() {}
        lineTo() {}
        quadraticCurveTo() {}
    };
    try {
        const model = createMapLabModel(7, 'world'),
            renderer = new TerrainV2(() => {});
        const drawn = [],
            ctx = {
                save() {},
                restore() {},
                stroke(path) {
                    drawn.push({ path, width: this.lineWidth, color: this.strokeStyle });
                },
            };
        renderer.reset(model);
        renderer.drawRivers(ctx, model, { zoom: 10 });
        const paths = renderer.riverPaths,
            count = paths.length;
        assert.ok(count > 10 && count <= 91);
        assert.equal(drawn.length, count * 3);
        assert.ok(drawn.slice(0, count).every((s) => s.color === '#6e7554'));
        assert.ok(drawn.slice(count * 2).every((s) => s.color === '#60b6cc'));
        for (let i = 0; i < count; i++)
            assert.ok(Math.abs(drawn[i].width / drawn[count * 2 + i].width - 1.8) < 1e-9);
        drawn.length = 0;
        renderer.drawRivers(ctx, model, { zoom: 20 });
        assert.equal(renderer.riverPaths, paths);
        assert.ok(drawn.at(-1).width > drawn[count * 2].width);
        renderer.destroy();
        assert.equal(renderer.riverPaths, null);
    } finally {
        if (original) globalThis.Path2D = original;
        else delete globalThis.Path2D;
    }
});
