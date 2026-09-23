import test from 'node:test';
import assert from 'node:assert/strict';
import { GameDataService } from '../../resources/js/client/services/GameDataService.js';
import { createTurnStatusReader } from '../../resources/js/client/api/createTurnStatusReader.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';
import { fixtures } from './fixtures.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const hint = (state = 'ready', turn = 1, revision = 'a') => ({
    version: 1,
    game_id: 1,
    turn_number: turn,
    state,
    revision: revision.repeat(32),
    updated_at: Date.now(),
});

test('static transport is uncached, credential-free, game-scoped and validates public shape', async () => {
    let value = hint(),
        request;
    const read = createTurnStatusReader('https://fixture.invalid/base', async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => value };
    });
    assert.equal((await read(1)).state, 'ready');
    assert.equal(request.url.pathname, '/base/var/turn-status/game-1.json');
    assert.ok(request.url.searchParams.has('_'));
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.credentials, 'omit');
    value = { ...hint(), game_id: 2 };
    await assert.rejects(read(1));
    value = { ...hint(), revision: '<script>' };
    await assert.rejects(read(1));
});

test('three-second static polling continues during commands and PHP reads; only confirmed reads unlock', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let status = hint(),
        turn = 1,
        checks = 0,
        reads = 0,
        release,
        held = null;
    const api = createEndpointClient(endpoints, async ({ path }) => {
        if (path === '/client/gameplay') {
            reads++;
            if (held) await held;
        }
        return fixtures(path, turn);
    });
    const world = new GameDataService(api, { userName: 'fixture-player' }, async () => {
        checks++;
        return status;
    });
    await world.refresh();
    const document = new EventTarget();
    document.hidden = true;
    world.startPolling(document, null);
    t.mock.timers.tick(2999);
    await settle();
    assert.equal(checks, 0);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(checks, 1);
    assert.equal(reads, 1);
    world.beginCommand(world.snapshot);
    status = hint('processing', 1, 'b');
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(world.store.value.turnTransition, true);
    assert.equal(world.store.value.status, 'pending');
    assert.equal(reads, 1);
    status = hint('ready', 2, 'b');
    turn = 2;
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(world.snapshot.turn_number, 1, 'static hints are not confirmed data');
    held = new Promise((resolve) => {
        release = resolve;
    });
    const reconciliation = world.reconcile();
    await settle();
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(checks, 4, 'PHP read cannot suspend static polling');
    assert.equal(world.store.value.turnTransition, true);
    release();
    await reconciliation;
    assert.equal(world.snapshot.turn_number, 2);
    assert.equal(world.store.value.turnTransition, false);
    for (let i = 0; i < 9; i++) {
        t.mock.timers.tick(3000);
        await settle();
    }
    assert.equal(reads, 2, 'unchanged static hints do not reload owner data');
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(reads, 3, 'full thirty-second refresh retained');
    await world.dispose();
    const count = checks;
    t.mock.timers.tick(60000);
    await settle();
    assert.equal(checks, count);
});

test('missing static file falls back; stale processing recovers and does not relock the confirmed turn', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let status = null,
        phpChecks = 0;
    const api = createEndpointClient(endpoints, async ({ path }) => {
        if (path === '/game') phpChecks++;
        return fixtures(path);
    });
    const world = new GameDataService(api, { userName: 'fixture-player' }, async () => {
        if (!status) throw new Error('missing');
        return status;
    });
    await world.refresh();
    const initial = phpChecks;
    world.startPolling(new EventTarget(), null);
    t.mock.timers.tick(3000);
    await settle();
    assert.ok(phpChecks > initial);
    status = { ...hint('processing'), updated_at: -100000 };
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(world.current, true, 'authoritative read recovers stale processing hint');
    const reads = phpChecks;
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(world.store.value.turnTransition, false);
    assert.equal(phpChecks, reads);
    await world.dispose();
});

test('Ready reconciliation before the next static check does not replay the transition; same-number revision still refreshes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let status = hint(),
        turn = 1,
        reads = 0;
    const api = createEndpointClient(endpoints, async ({ path }) => {
        if (path === '/client/gameplay') reads++;
        return fixtures(path, turn);
    });
    const world = new GameDataService(api, { userName: 'fixture-player' }, async () => status);
    await world.refresh();
    world.startPolling(new EventTarget(), null);
    t.mock.timers.tick(3000);
    await settle();
    world.beginCommand(world.snapshot);
    status = hint('processing', 1, 'b');
    t.mock.timers.tick(3000);
    await settle();
    turn = 2;
    await world.reconcile();
    const before = reads;
    status = hint('ready', 2, 'b');
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(reads, before);
    assert.equal(world.store.value.turnTransition, false);
    status = hint('ready', 2, 'c');
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(reads, before + 1, 'a different operation at the same number still refreshes');
    await world.dispose();
});

test('static-enabled startup retries when no confirmed snapshot exists', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let fail = true;
    const api = createEndpointClient(endpoints, async ({ path }) => {
        if (fail) throw new Error('Offline');
        return fixtures(path);
    });
    const world = new GameDataService(api, { userName: 'fixture-player' }, async () => hint());
    await world.refresh();
    assert.equal(world.snapshot, null);
    world.startPolling(new EventTarget(), null);
    fail = false;
    t.mock.timers.tick(3000);
    await settle();
    assert.equal(world.current, true);
    await world.dispose();
});
