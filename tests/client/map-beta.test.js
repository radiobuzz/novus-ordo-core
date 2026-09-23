import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapModel } from '../../resources/js/map/model.js';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { exportMap, restoreMap } from '../../resources/js/map/snapshot.js';
import { connectedHomelands } from '../../resources/js/client/services/NationSetupService.js';
import { WorldService } from '../../resources/js/client/services/WorldService.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';
import { fixtures } from './fixtures.js';

test('shared generation preserves lab geography and stores a self-contained map without demo state', () => {
    const model = createMapModel(),
        lab = createMapLabModel(19, 'world');
    assert.deepEqual(
        model.cells.map((c) => [c.q, c.r, c.terrain, c.elevation]),
        lab.cells.map((c) => [c.q, c.r, c.terrain, c.elevation]),
    );
    assert.equal(model.army, undefined);
    assert(model.cells.every((c) => c.population === undefined && c.controllerId === undefined));
    const snapshot = JSON.parse(JSON.stringify(exportMap(model)));
    const territories = model.regions.map((r, i) => ({
        territory_id: 50000 + i,
        x: r.column,
        y: r.row,
        name: 'Live ' + i,
        owner_nation_id: i % 2 ? 97 : null,
    }));
    const restored = restoreMap(snapshot, territories);
    assert.equal(restored.cells.length, 11400);
    assert.equal(restored.riverEdges.size, model.riverEdges.size);
    assert.equal(restored.lakeShores.length, model.lakeShores.length);
    assert.deepEqual(
        restored.cells.map((c) => [c.id, c.x, c.y, c.terrain, c.reliefColor]),
        model.cells.map((c) => [c.id, c.x, c.y, c.terrain, c.reliefColor]),
    );
    assert.equal(restored.regions[1].ownerId, 97);
    assert.equal(restored.regions[1].name, 'Live 1');
    assert(restored.regions[1].cellIds.every((id) => restored.cellById.get(id).politicalOwnerId === 97));
    assert.throws(() => restoreMap(snapshot, territories.slice(1)), /does not match/);
    assert.throws(() => exportMap(createMapModel(7)), /19 cells/);
});

test('small claimable islands do not become impossible homeland choices', () => {
    const territories = Array.from({ length: 8 }, (_, i) => ({
        territory_id: i + 1,
        connected_land_territory_ids:
            i < 5 ? [i, i + 2].filter((id) => id >= 1 && id <= 5) : [6, 7, 8].filter((id) => id !== i + 1),
    }));
    assert.deepEqual(connectedHomelands(territories, [1, 2, 3, 4, 5, 6, 7, 8], 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(connectedHomelands(territories, [1, 2, 4, 5, 6, 7, 8], 5), []);
});

test('world caches immutable geography for a game and rejects a foreign map', async () => {
    let calls = 0;
    const world = new WorldService(
        createEndpointClient(endpoints, async ({ path }) => {
            if (path === '/game/map') calls++;
            return fixtures(path);
        }),
        { userName: 'fixture-player' },
    );
    await world.refresh();
    await world.refresh();
    assert.equal(calls, 1);
    assert.equal(world.snapshot.map, null);
    await world.dispose();
    const foreign = new WorldService(
        createEndpointClient(endpoints, async ({ path }) =>
            path === '/game/map' ? { game_id: 999, map: null } : fixtures(path),
        ),
        { userName: 'fixture-player' },
    );
    await foreign.refresh();
    assert.equal(foreign.snapshot, null);
    await foreign.dispose();
});
