import test from 'node:test';
import assert from 'node:assert/strict';
import { GameDataService } from '../../resources/js/client/services/GameDataService.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';
import { ApiError } from '../../resources/js/client/api/ApiError.js';
import { fixtures } from './fixtures.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};
const make = (request = async ({ path }) => fixtures(path)) => {
    const api = createEndpointClient(endpoints, request);
    const world = new GameDataService(api, { userName: 'fixture-player' });
    return { world, gameplay: new GameplayService(api, world, { userId: 1 }) };
};

test('turn transition is separate from ordinary refresh, persists on failure and clears on recovery', async () => {
    let turn = 1,
        fail = false,
        hold = null;
    const { world } = make(async ({ path }) => {
        if (path === '/client/gameplay') {
            if (hold) await hold.promise;
            if (fail) throw new ApiError('network', 'Offline');
        }
        return fixtures(path, turn);
    });
    await world.refresh();
    assert.equal(world.store.value.turnTransition, false);
    const normal = world.refresh();
    assert.equal(world.store.value.turnTransition, false);
    await normal;
    hold = deferred();
    turn = 2;
    const advance = world.refresh();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(world.store.value.turnTransition, true);
    assert.equal(world.current, false);
    assert.equal(world.snapshot.turn_number, 1);
    fail = true;
    hold.resolve();
    await advance;
    assert.equal(world.store.value.turnTransition, true);
    fail = false;
    await world.refresh();
    assert.equal(world.store.value.turnTransition, false);
    assert.equal(world.snapshot.turn_number, 2);
    assert.equal(world.current, true);
    await world.dispose();
});

test('not-ready world blocks interaction, but readiness submission alone does not; access loss clears transition', async () => {
    let ready = true;
    const { world } = make(async ({ path }) => {
        const result = fixtures(path);
        return path === '/game/ready-status' ? { ...result, is_game_ready: ready } : result;
    });
    await world.refresh();
    world.beginCommand(world.snapshot);
    assert.equal(world.store.value.turnTransition, false);
    ready = false;
    await world.reconcile();
    assert.equal(world.store.value.turnTransition, true);
    assert.equal(world.current, false);
    world.invalidate(new ApiError('session', 'Signed out'));
    assert.equal(world.store.value.turnTransition, false);
    assert.equal(world.snapshot, null);
    await world.dispose();
});

test('manual turn recovery supersedes a stuck read and ignores its late response', async () => {
    const held = deferred();
    let turn = 1,
        block = true;
    const { world } = make(async ({ path }) => {
        const result = fixtures(path, turn);
        if (path === '/client/gameplay' && turn === 2 && block) await held.promise;
        return result;
    });
    await world.refresh();
    turn = 2;
    const first = world.refresh();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(world.store.value.turnTransition, true);
    block = false;
    turn = 3;
    assert.equal(await world.retryTurnTransition(), true);
    held.resolve();
    await first;
    assert.equal(world.snapshot.turn_number, 3);
    assert.equal(world.store.value.turnTransition, false);
    await world.dispose();
});

test('production batch clears only accepted unchanged drafts after reconciliation, never newer edits', async () => {
    const write = deferred(),
        read = deferred();
    let blockRead = false,
        writes = 0;
    const { world, gameplay } = make(async ({ path }) => {
        if (path === '/nation/production-plan') {
            writes++;
            await write.promise;
            blockRead = true;
            return null;
        }
        if (path === '/client/gameplay' && blockRead) await read.promise;
        return fixtures(path);
    });
    await world.refresh();
    const snapshot = world.snapshot,
        drafts = gameplay.drafts(snapshot);
    drafts.Food = { quantity: '2', productivity: '0' };
    drafts.Oil = { quantity: '1', productivity: '0' };
    const pending = gameplay.command(
        'applyProductionPlan',
        { bids: [{ resource_type: 'Food' }, { resource_type: 'Oil' }] },
        snapshot,
    );
    await new Promise((resolve) => setImmediate(resolve));
    drafts.Oil = { quantity: '3', productivity: '0' };
    write.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(gameplay.drafts(snapshot).Food.quantity, '2', 'keep inputs during reconciliation');
    read.resolve();
    await pending;
    assert.equal(gameplay.drafts(snapshot).Food, undefined);
    assert.equal(gameplay.drafts(snapshot).Oil.quantity, '3');
    assert.equal(writes, 1);
    await world.dispose();
});

test('uncertain production batch is never retried and retains the complete draft for review', async () => {
    let writes = 0;
    const { world, gameplay } = make(async ({ path }) => {
        if (path === '/nation/production-plan') {
            writes++;
            throw new ApiError('network', 'Response lost', { uncertain: true });
        }
        return fixtures(path);
    });
    await world.refresh();
    const snapshot = world.snapshot;
    gameplay.drafts(snapshot).Oil = { quantity: '1', productivity: '0' };
    await assert.rejects(
        gameplay.command('applyProductionPlan', { bids: [{ resource_type: 'Oil' }] }, snapshot),
    );
    assert.equal(gameplay.outcome.state, 'uncertain');
    assert.equal(gameplay.needsReview, true);
    assert.equal(gameplay.drafts(snapshot).Oil.quantity, '1');
    await world.refresh();
    await assert.rejects(gameplay.command('applyProductionPlan', { bids: [] }, snapshot));
    assert.equal(writes, 1);
    await world.dispose();
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('two-second turn checks continue hidden; unchanged turns keep full reads at thirty seconds', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let reads = 0,
        checks = 0;
    const { world } = make(async ({ path }) => {
        if (path === '/client/gameplay') reads++;
        if (path === '/game') checks++;
        return fixtures(path);
    });
    const document = new EventTarget(),
        window = new EventTarget();
    document.hidden = false;
    await world.refresh();
    const initialChecks = checks;
    world.startPolling(document, window);
    world.startPolling(document, window); // No duplicate scheduler.
    window.dispatchEvent(new Event('pageshow')); // Initial load must not refresh twice.
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    t.mock.timers.tick(1999);
    await settle();
    assert.equal(checks, initialChecks);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(checks, initialChecks + 1);
    assert.equal(reads, 1, 'the fast check does not rebuild the owner bundle');
    const revision = world.store.value.revision;
    for (let i = 0; i < 13; i++) {
        t.mock.timers.tick(2000);
        await settle();
    }
    assert.equal(reads, 1);
    assert.equal(world.store.value.revision, revision, 'unchanged hints do not publish snapshots');
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(reads, 2, 'same-turn values still refresh at thirty seconds while hidden');
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    t.mock.timers.tick(100);
    await settle();
    assert.equal(reads, 3, 'return events share a single full refresh');
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await world.dispose();
    const beforeDispose = checks;
    t.mock.timers.tick(60000);
    await settle();
    assert.equal(checks, beforeDispose);
    assert.equal(world.snapshot, null);
});

test('hidden turn changes and lower-number rollbacks trigger full reconciliation without waiting thirty seconds', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let turn = 1,
        reads = 0;
    const { world } = make(async ({ path }) => {
        if (path === '/client/gameplay') reads++;
        return fixtures(path, turn);
    });
    await world.refresh();
    const document = new EventTarget();
    document.hidden = true;
    world.startPolling(document, null);
    turn = 2;
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(world.snapshot.turn_number, 2);
    assert.equal(world.snapshot.nation.budget.turn_number, 2);
    turn = 1;
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(world.snapshot.turn_number, 1);
    assert.equal(reads, 3);
    await world.dispose();
});

test('a late turn hint cannot invalidate a command or a newer full read', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const hint = deferred();
    let hold = false,
        hintSignal,
        reads = 0;
    const { world, gameplay } = make(async ({ path, method, signal }) => {
        if (path === '/game' && hold) {
            hold = false;
            hintSignal = signal;
            await hint.promise;
            return fixtures(path, 99);
        }
        if (path === '/client/gameplay') reads++;
        return method === 'POST' ? {} : fixtures(path);
    });
    await world.refresh();
    world.startPolling(new EventTarget(), null);
    hold = true;
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(world.current, true);
    await gameplay.command('deploy', { deployments: [] }, world.snapshot);
    assert.equal(hintSignal.aborted, true);
    hint.resolve();
    await settle();
    assert.equal(world.snapshot.turn_number, 1);
    assert.equal(world.current, true);
    assert.equal(reads, 2);
    await world.dispose();
});

test('poll failures back off, retain stale data and recover promptly on return', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let fail = false,
        checks = 0;
    const { world } = make(async ({ path }) => {
        if (path === '/game') {
            checks++;
            if (fail) throw new ApiError('network', 'Offline');
        }
        return fixtures(path);
    });
    await world.refresh();
    const snapshot = world.snapshot,
        window = new EventTarget();
    world.startPolling(new EventTarget(), window);
    fail = true;
    t.mock.timers.tick(2000);
    await settle();
    const failedChecks = checks;
    assert.equal(world.store.value.status, 'stale');
    assert.equal(world.snapshot, snapshot);
    assert.equal(world.current, false);
    t.mock.timers.tick(3999);
    await settle();
    assert.equal(checks, failedChecks);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(checks, failedChecks + 1);
    fail = false;
    window.dispatchEvent(new Event('online'));
    t.mock.timers.tick(100);
    await settle();
    assert.equal(world.current, true);
    await world.dispose();
});

test('a changed-game hint clears private state while loading; session failures clear it too', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let gameId = 1,
        blocked,
        expired = false;
    const { world } = make(async ({ path }) => {
        if (path === '/game' && expired) throw new ApiError('session', 'Expired');
        if (path === '/client/gameplay' && blocked) await blocked.promise;
        const result = structuredClone(fixtures(path));
        if (result && 'game_id' in result) result.game_id = gameId;
        return result;
    });
    await world.refresh();
    world.startPolling(new EventTarget(), null);
    blocked = deferred();
    gameId = 2;
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(world.snapshot, null);
    assert.equal(world.current, false);
    blocked.resolve();
    await settle();
    assert.equal(world.snapshot.game_id, 2);
    expired = true;
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(world.snapshot, null);
    assert.equal(world.store.value.error.category, 'session');
    await world.dispose();
});

test('incompatible game scope clears private state before its replacement read completes', async () => {
    let gameId = 1,
        block;
    const { world } = make(async ({ path }) => {
        if (block && path === '/client/gameplay') await block.promise;
        const data = structuredClone(fixtures(path));
        if (data && 'game_id' in data) data.game_id = gameId;
        return data;
    });
    await world.refresh();
    gameId = 2;
    block = deferred();
    const pending = world.refresh();
    await new Promise((r) => setImmediate(r));
    assert.equal(world.snapshot, null);
    block.resolve();
    await pending;
    assert.equal(world.snapshot.game_id, 2);
    assert.equal(world.snapshot.nation.game_id, 2);
    await world.dispose();
});

test('shared reads keep confirmed display and publish owner budget/orders together; unchanged sections are reused', async () => {
    let block,
        reads = 0,
        amount = 30;
    const { world } = make(async ({ path }) => {
        if (path === '/client/gameplay') {
            reads++;
            if (block) await block.promise;
            const data = structuredClone(fixtures(path));
            data.budget.available_production.Capital = amount;
            data.deployments = amount === 30 ? [] : [{ deployment_id: 42 }];
            return data;
        }
        return fixtures(path);
    });
    await world.refresh();
    const first = world.snapshot,
        values = [];
    world.store.subscribe(world.scope, (state) => {
        if (state.status === 'ready') values.push(state.snapshot.nation);
    });
    block = deferred();
    amount = 27;
    const a = world.refresh(),
        b = world.refresh();
    assert.equal(a, b);
    assert.equal(world.snapshot, first);
    assert.equal(world.current, true);
    block.resolve();
    await a;
    assert.equal(reads, 2);
    assert.equal(world.snapshot.territories, first.territories);
    assert.equal(values.at(-1).budget.available_production.Capital, 27);
    assert.equal(values.at(-1).deployments[0].deployment_id, 42);
    const second = world.snapshot;
    await world.refresh();
    assert.equal(second.nation, world.snapshot.nation);
    await world.dispose();
});

test('network failure retains stale data, session failure clears it; late responses cannot restore it', async () => {
    let error, block;
    const { world } = make(async ({ path }) => {
        if (path === '/client/gameplay') {
            if (block) await block.promise;
            if (error) throw error;
        }
        return fixtures(path);
    });
    await world.refresh();
    const snapshot = world.snapshot;
    error = new ApiError('network', 'Offline');
    assert.equal(await world.refresh(), false);
    assert.equal(world.snapshot, snapshot);
    assert.equal(world.store.value.status, 'stale');
    assert.throws(() => world.beginCommand(snapshot));
    error = null;
    block = deferred();
    const pending = world.refresh();
    await new Promise((r) => setImmediate(r));
    assert.equal(world.current, false, 'retrying a stale read must not enable commands');
    world.invalidate(new ApiError('session', 'Expired'));
    block.resolve();
    await pending;
    assert.equal(world.snapshot, null);
    assert.equal(world.store.value.error.category, 'session');
    await world.dispose();
});

test('a command during a healthy poll cancels that read and publishes only post-command state', async () => {
    let block,
        writes = 0,
        amount = 30;
    const { world, gameplay } = make(async ({ path, method }) => {
        if (method === 'POST') {
            writes++;
            amount = 27;
            return {};
        }
        const data = structuredClone(fixtures(path));
        if (path === '/client/gameplay') {
            data.budget.available_production.Capital = amount;
            const wait = block;
            block = null;
            if (wait) await wait.promise;
        }
        return data;
    });
    await world.refresh();
    const pause = deferred();
    block = pause;
    const poll = world.refresh();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(world.current, true);
    await gameplay.command('deploy', { deployments: [] }, world.snapshot);
    assert.equal(writes, 1);
    assert.equal(world.snapshot.nation.budget.available_production.Capital, 27);
    pause.resolve();
    await poll;
    assert.equal(world.snapshot.nation.budget.available_production.Capital, 27);
    await world.dispose();
});

test('same-turn refresh does not reject old object identity; accepted command with failed reconciliation stays accepted', async () => {
    let failure = false,
        writes = 0;
    const { world, gameplay } = make(async ({ path, method }) => {
        if (method === 'POST') {
            writes++;
            failure = true;
            return {};
        }
        if (failure && path === '/client/gameplay') throw new ApiError('network', 'Offline');
        return fixtures(path);
    });
    await world.refresh();
    const old = world.snapshot;
    await world.refresh();
    await gameplay.command('deploy', { deployments: [] }, old);
    assert.equal(writes, 1);
    assert.equal(gameplay.outcome.state, 'accepted');
    assert.equal(gameplay.outcome.reconciled, false);
    assert.match(gameplay.notice, /Retry refresh, not the command/);
    assert.equal(world.store.value.status, 'stale');
    assert.equal(gameplay.busy, false);
    failure = false;
    await world.refresh();
    assert.equal(writes, 1);
    assert.equal(gameplay.outcome.reconciled, true);
    assert.match(gameplay.notice, /latest server state is shown/);
    await world.dispose();
});

test('commands exclude polling, reconcile after response, never retry uncertainty, and require review', async () => {
    const response = deferred();
    let reads = 0,
        writes = 0;
    const { world, gameplay } = make(async ({ path, method }) => {
        if (method === 'POST') {
            writes++;
            await response.promise;
            throw new ApiError('network', 'Lost response', { uncertain: true });
        }
        if (path === '/client/gameplay') reads++;
        return fixtures(path);
    });
    await world.refresh();
    const pending = gameplay.command('deploy', { deployments: [] }, world.snapshot);
    const rejected = assert.rejects(pending, { uncertain: true });
    await new Promise((r) => setImmediate(r));
    assert.equal(await world.refresh(), false);
    assert.equal(reads, 1);
    response.resolve();
    await rejected;
    assert.equal(reads, 2);
    assert.equal(writes, 1);
    assert.equal(gameplay.needsReview, true);
    await assert.rejects(gameplay.command('deploy', {}, world.snapshot));
    assert.equal(writes, 1);
    gameplay.acknowledgeOutcome();
    assert.equal(gameplay.needsReview, false);
    await world.dispose();
});

test('owner access loss clears private data; mixed owner turn is never published', async () => {
    let mode;
    const { world } = make(async ({ path }) => {
        if (path === '/client/gameplay' && mode === 'forbidden') throw new ApiError('forbidden', 'No access');
        return fixtures(path, path === '/client/gameplay' && mode === 'mixed' ? 2 : 1);
    });
    await world.refresh();
    const snapshot = world.snapshot;
    mode = 'mixed';
    await world.refresh();
    assert.equal(world.snapshot, snapshot);
    assert.equal(world.store.value.status, 'stale');
    mode = 'forbidden';
    await world.refresh();
    assert.equal(world.snapshot, null);
    await world.dispose();
});

test('owner spectator instance never reads private nation data and clears all snapshots on disposal', async () => {
    const paths = [];
    const api = createEndpointClient(endpoints, async ({ path }) => {
        paths.push(path);
        return fixtures(path);
    });
    const world = new GameDataService(api, { userName: 'fixture-player', spectator: true });
    assert.equal(await world.refresh(), true);
    assert.equal(world.snapshot.setup.nation_id, null);
    assert.equal(world.snapshot.nation, null);
    assert.deepEqual(world.snapshot.ownTerritories, []);
    assert.equal(paths.includes('/client/gameplay'), false);
    assert.equal(paths.includes('/nation/territories/turn-infos'), false);
    await world.dispose();
    assert.equal(world.snapshot, null);
});

test('public nation identities share their read, survive one consumer closing, and refresh with the world generation', async () => {
    const held = deferred();
    let reads = 0;
    const { world, gameplay } = make(async ({ path }) => {
        if (path === '/game/identities') {
            reads++;
            await held.promise;
        }
        return fixtures(path);
    });
    await world.refresh();
    const closing = new AbortController();
    const a = gameplay.identities(world.snapshot, closing.signal);
    const b = gameplay.identities(world.snapshot);
    const rejected = assert.rejects(a, (error) => error.name === 'AbortError');
    closing.abort();
    held.resolve();
    await rejected;
    assert.equal((await b).game_id, 1);
    assert.equal(reads, 1);
    await gameplay.identities(world.snapshot);
    assert.equal(reads, 1);
    const cached = gameplay.identities(world.snapshot);
    const stale = assert.rejects(cached, (error) => error.category === 'conflict');
    await world.refresh();
    await stale;
    await gameplay.identities(world.snapshot);
    assert.equal(reads, 2);
    const retiring = gameplay.identities(world.snapshot);
    const retired = assert.rejects(retiring, (error) => error.name === 'AbortError');
    await world.dispose();
    await retired;
});
