import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyBiomes,
    desertStrength,
    desertColor,
    findDesertCell,
} from '../../resources/js/map/biomes.js';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createMapModel } from '../../resources/js/map/model.js';
import { TerrainField, terrainColor } from '../../resources/js/map/terrain-v2-field.js';

const dry = {
    terrain: 'plains',
    landform: 'plains',
    temperature: 0.8,
    moisture: 0.2,
    terrainColor: '#64765b',
    vegetation: 'grass',
    snowCover: false,
};
test('desert is a warm/dry cover over all three landforms; water, forest, tundra and snow stay distinct', () => {
    for (const landform of ['plains', 'hills', 'mountain']) {
        const cell = { ...dry, landform, terrain: landform };
        const model = { cells: [cell] };
        applyBiomes(model);
        assert.equal(cell.biome, 'desert');
        assert.equal(cell.landform, landform);
        assert.equal(cell.terrain, landform);
        const first = cell.terrainColor;
        applyBiomes(model);
        assert.equal(cell.terrainColor, first);
    }
    for (const patch of [
        { terrain: 'ocean' },
        { terrain: 'lake' },
        { snowCover: true },
        { temperature: 0.2 },
        { moisture: 0.6 },
    ])
        assert.equal(desertStrength({ ...dry, ...patch }), 0);
    assert.ok(
        desertStrength({ ...dry, moisture: 0.39, temperature: 0.9 }) >
            desertStrength({ ...dry, moisture: 0.39, temperature: 0.4 }),
    );
    assert.ok(desertStrength({ ...dry, moisture: 0.4 }) > desertStrength({ ...dry, moisture: 0.5 }));
    assert.notDeepEqual(desertColor(0), desertColor(1));
});

test('default desert patches are deterministic at every resolution and do not alter geography or mechanics', () => {
    const physical = (m) =>
        m.cells.map((c) => [
            c.id,
            c.elevation,
            c.baseElevation,
            c.rainfall,
            c.moisture,
            c.temperature,
            c.flow,
            c.terrain,
            c.vegetation,
            c.landform,
            c.movementCost,
            c.riverEdgeIds,
        ]);
    for (const density of [7, 19, 37]) {
        const lab = createMapLabModel(density, 'world');
        const shared = createMapModel(
            density,
            'world',
            {},
            lab.regions.map(({ id, name, q, r }) => ({ id, name, q, r })),
        );
        assert.deepEqual(physical(lab), physical(shared));
        assert.deepEqual(lab.rivers, shared.rivers);
        assert.ok(
            shared.cells.every((c) => typeof c.biome === 'string'),
            'shared generator preserves biome metadata',
        );
        const desert = lab.cells.filter((c) => c.biome === 'desert');
        assert.ok(desert.length > 0 && desert.length < lab.cells.length * 0.15);
        assert.ok(desert.every((c) => c.vegetation !== 'forest' && c.temperature >= 0.32 && !c.snowCover));
        const field = new TerrainField(lab);
        for (const cell of desert.slice(0, 25)) {
            const sample = field.sample(cell.x, cell.y),
                geo = field.geographic(cell.x, cell.y);
            assert.ok(Math.abs(sample[10] - cell.desertStrength) < 1e-6);
            const color = terrainColor(field, sample, geo.x, geo.y);
            assert.ok(color.every((v) => Number.isFinite(v)));
            const natural = Float64Array.from(sample);
            natural[10] = 0;
            assert.notDeepEqual(color, terrainColor(field, natural, geo.x, geo.y));
        }
        const repeat = createMapLabModel(density, 'world');
        assert.deepEqual(
            repeat.cells.map((c) => c.biome),
            lab.cells.map((c) => c.biome),
        );
    }
});

test('existing wetness controls desert extent without forcing a desert into a wet world', () => {
    const counts = [25, 55, 85].map((wetness) => {
        const model = createMapLabModel(19, 'world', { wetness });
        const count = model.cells.filter((c) => c.biome === 'desert').length;
        assert.equal(Boolean(findDesertCell(model)), count > 0);
        return count;
    });
    assert.ok(counts[0] > counts[1] && counts[1] > counts[2]);
    assert.equal(counts[2], 0);
});
