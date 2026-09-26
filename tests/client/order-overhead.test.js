import test from 'node:test';
import assert from 'node:assert/strict';
import { GameDataService } from '../../resources/js/client/services/GameDataService.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';
import { fixtures } from './fixtures.js';
import { draftMoveOrders } from '../../resources/js/client/services/militaryCommands.js';
import { ApiError } from '../../resources/js/client/api/ApiError.js';

async function fixture(handler) {
    const paths = [];
    const api = createEndpointClient(endpoints, async (request) => {
        paths.push(request.path);
        return handler ? handler(request) : fixtures(request.path);
    });
    const world = new GameDataService(api, { userName: 'fixture-player' });
    const gameplay = new GameplayService(api, world, { userId: 1 });
    await world.refresh();
    paths.length = 0;
    return { world, gameplay, paths };
}

test('orders post immediately and still reconcile all changing world and owner data', async () => {
    const { world, gameplay, paths } = await fixture();
    try {
        await gameplay.command('sendMoveOrders', { orders: [] }, world.snapshot);
        assert.equal(paths[0], '/nation/divisions/move-orders');
        assert.equal(paths.length, 12);
        assert.equal(paths.includes('/territories/base-infos'), false);
        for (const path of ['/territories/turn-infos', '/nation/territories/turn-infos', '/client/gameplay'])
            assert.ok(paths.includes(path));
        assert.equal(paths.filter((path) => path === '/game').length, 2);
        assert.equal(gameplay.outcome.reconciled, true);
    } finally {
        await world.dispose();
    }
});

test('geography cache expires on rollback revision, next turn and access loss', async () => {
    let turn = 1,
        revision = 'first';
    const { world, paths } = await fixture(({ path }) => {
        const result = fixtures(path, turn);
        if (path === '/game' || path === '/client/gameplay') result.turn_context_revision = revision;
        return result;
    });
    try {
        await world.refresh();
        assert.equal(paths.includes('/territories/base-infos'), false);
        revision = 'reset';
        paths.length = 0;
        await world.refresh();
        assert.ok(paths.includes('/territories/base-infos'));
        turn++;
        paths.length = 0;
        await world.refresh();
        assert.ok(paths.includes('/territories/base-infos'));
        world.invalidate(new ApiError('session', 'Signed out'));
        paths.length = 0;
        await world.refresh();
        assert.ok(paths.includes('/territories/base-infos'));
    } finally {
        await world.dispose();
    }
});

test('a rejected server context is not retried and refreshes into the new turn', async () => {
    let turn = 1;
    const { world, gameplay, paths } = await fixture(({ path }) => {
        if (path === '/nation/divisions/move-orders') {
            turn = 2;
            throw new ApiError('conflict', 'Turn changed');
        }
        return fixtures(path, turn);
    });
    try {
        await assert.rejects(gameplay.command('sendMoveOrders', { orders: [] }, world.snapshot), {
            category: 'conflict',
        });
        assert.equal(paths.filter((path) => path === '/nation/divisions/move-orders').length, 1);
        assert.equal(world.snapshot.turn_number, 2);
        assert.equal(gameplay.outcome.state, 'rejected');
    } finally {
        await world.dispose();
    }
});

test('route drafts compute once per origin/type and return independent paths', () => {
    const nation = fixtures('/client/gameplay');
    const territories = fixtures('/territories/base-infos').data.map((base) => ({
        ...base,
        owner_nation_id: 7,
    }));
    const source = territories.find((territory) => territory.territory_id === 156);
    const connections = source.connected_territory_ids;
    let visits = 0;
    Object.defineProperty(source, 'connected_territory_ids', {
        get() {
            visits++;
            return connections;
        },
    });
    const snapshot = { territories, setup: { nation_id: 7 }, nation };
    const data = {
        ...nation,
        divisions: Array.from({ length: 500 }, (_, division_id) => ({
            division_id,
            division_type: 'Infantry',
            territory_id: 156,
        })),
    };
    const orders = draftMoveOrders(snapshot, data, new Set(data.divisions.map((d) => d.division_id)), 157);
    assert.equal(orders.length, 500);
    assert.equal(visits, 1);
    orders[0].path_territory_ids.push(999);
    assert.deepEqual(orders[1].path_territory_ids, []);
    visits = 0;
    source.connected_territory_ids; // Cached paths belong only to one draft call.
    draftMoveOrders(snapshot, data, new Set([0]), 157);
    assert.equal(visits, 2);
});
