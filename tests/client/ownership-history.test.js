import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';

function setup(read) {
    const scope = new Scope();
    const snapshot = { game_id: 1, turn_number: 2, territories: [{ territory_id: 5, owner_nation_id: 7 }] };
    const world = {
        scope,
        snapshot,
        generation: 1,
        marker: async () => world.snapshot,
        same: (a, b) => !!a && !!b && a.game_id === b.game_id && a.turn_number === b.turn_number,
    };
    const calls = [];
    const service = new GameplayService(
        {
            getAllTerritoriesTurnInfo: async ({ query, signal }) => {
                calls.push(query.turn_number);
                await read?.(query.turn_number, signal);
                return {
                    data: [
                        {
                            territory_id: 5,
                            turn_number: query.turn_number,
                            owner_nation_id: query.turn_number === 1 ? null : 7,
                        },
                    ],
                };
            },
        },
        world,
        {},
    );
    return { scope, snapshot, world, service, calls };
}

test('ownership frames coalesce, keep neutral explicit, and never change the confirmed snapshot', async () => {
    const { service, snapshot, scope, calls } = setup();
    try {
        const [one, two] = await Promise.all([
            service.ownershipComparison(snapshot),
            service.ownershipComparison(snapshot),
        ]);
        assert.equal(one, two);
        assert.deepEqual(calls, [1, 2]);
        assert.equal(one.before.territories[0].owner_nation_id, null);
        assert.equal(one.after.territories[0].owner_nation_id, 7);
        assert.equal(snapshot.territories[0].owner_nation_id, 7);
        assert.ok(Object.isFrozen(one.before.territories[0]));
    } finally {
        await scope.dispose();
    }
});

test('closing one history consumer does not cancel another', async () => {
    let finish;
    const gate = new Promise((resolve) => {
        finish = resolve;
    });
    const { service, snapshot, scope } = setup(() => gate);
    const consumer = new AbortController();
    const cancelled = service.ownershipComparison(snapshot, consumer.signal);
    const active = service.ownershipComparison(snapshot);
    consumer.abort();
    finish();
    try {
        await assert.rejects(cancelled, { name: 'AbortError' });
        assert.equal((await active).after.turn, 2);
    } finally {
        await scope.dispose();
    }
});

test('late generation and changed game results are discarded and can be retried', async () => {
    let finish;
    const gate = new Promise((resolve) => {
        finish = resolve;
    });
    const { service, snapshot, world, scope, calls } = setup(() => gate);
    const pending = service.ownershipComparison(snapshot);
    await new Promise((resolve) => setImmediate(resolve));
    world.generation++;
    finish();
    try {
        await assert.rejects(pending, { category: 'conflict' });
        assert.equal((await service.ownershipComparison(snapshot)).after.turn, 2);
        assert.equal(calls.length, 4);
        world.snapshot = { ...snapshot, game_id: 9 };
        await assert.rejects(service.ownershipComparison(snapshot), { category: 'conflict' });
    } finally {
        await scope.dispose();
    }
});

test('missing, wrong-turn and ambiguous ownership records fail instead of inventing neutral land', async () => {
    for (const data of [
        [],
        [{ territory_id: 5, turn_number: 0, owner_nation_id: 7 }],
        [{ territory_id: 5, turn_number: 1 }],
    ]) {
        const { service, snapshot, scope } = setup();
        service.api.getAllTerritoriesTurnInfo = async () => ({ data });
        try {
            await assert.rejects(service.ownershipComparison(snapshot), { category: 'malformed' });
        } finally {
            await scope.dispose();
        }
    }
});
