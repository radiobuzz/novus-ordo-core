import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldService } from '../../resources/js/client/services/WorldService.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';
import { fixtures } from './fixtures.js';
const make = (request = async ({ path }) => fixtures(path)) =>
    new WorldService(createEndpointClient(endpoints, request), { userName: 'fixture-player' });
test('world service adapts collections and keeps snapshots immutable, merges owned details separately', async () => {
    const world = make();
    await world.refresh();
    assert.equal(world.snapshot.territories.length, 600);
    assert.ok(Object.isFrozen(world.snapshot.territories[0]));
    const own = await world.territory(156, new AbortController().signal);
    assert.equal(own.isOwn, true);
    assert.equal(own.ownerInfo.can_deploy, true);
    assert.equal(own.nation.usual_name, 'The Aurelian Union');
    const other = await world.territory(158, new AbortController().signal);
    assert.equal(other.isOwn, false);
    assert.equal(other.ownerInfo, null);
    await world.dispose();
});
test('a mixed-turn snapshot is discarded and retried at most once', async () => {
    let turn = 1,
        calls = 0;
    const world = make(async ({ path }) => {
        const result = fixtures(path, turn);
        if (path === '/territories/turn-infos') {
            calls++;
            turn++;
        }
        return result;
    });
    const events = [];
    world.changed.subscribe(world.scope, (event) => events.push(event));
    await world.refresh();
    assert.equal(world.snapshot, null);
    assert.equal(calls, 2);
    assert.equal(events.at(-1).error.category, 'unavailable');
    await world.dispose();
});
test('session mismatch and upkeep prevent rendering a snapshot', async () => {
    for (const failure of ['session', 'upkeep']) {
        const world = make(async ({ path }) =>
            failure === 'session' && path === '/user'
                ? { user_name: 'different' }
                : failure === 'upkeep' && path === '/game/ready-status'
                  ? { ...fixtures(path), is_game_ready: false }
                  : fixtures(path),
        );
        const events = [];
        world.changed.subscribe(world.scope, (event) => events.push(event));
        await world.refresh();
        assert.equal(world.snapshot, null);
        assert.equal(events.at(-1).error.category, failure === 'session' ? 'session' : 'unavailable');
        await world.dispose();
    }
});
test('invalidate immediately prevents pending territory results from committing', async () => {
    let release;
    let blocked = false;
    const world = make(async ({ path }) => {
        if (blocked && path === '/territories/156/turn-info') await new Promise((r) => (release = r));
        return fixtures(path);
    });
    await world.refresh();
    blocked = true;
    const pending = world.territory(156, new AbortController().signal);
    await new Promise((r) => setImmediate(r));
    world.invalidate(new Error('turn changed'));
    release();
    await assert.rejects(pending, { category: 'stale' });
    await world.dispose();
});
