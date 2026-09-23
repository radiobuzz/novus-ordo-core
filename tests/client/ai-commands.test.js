import test from 'node:test';
import assert from 'node:assert/strict';
import { AICommands } from '../../resources/js/client/experimental-ai/AICommands.js';
import { GameDataService } from '../../resources/js/client/services/GameDataService.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';
import { ApiError } from '../../resources/js/client/api/ApiError.js';
import { fixtures } from './fixtures.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};
async function fixture(request) {
    const api = createEndpointClient(
        { ...endpoints, experimentalAIStep: { method: 'POST', path: '/nation/experimental-ai-step' } },
        request,
    );
    const boot = { userName: 'fixture-player', userId: 1 };
    const world = new GameDataService(api, boot);
    await world.refresh();
    return { world, ai: new AICommands(api, world, boot), gameplay: new GameplayService(api, world, boot) };
}

test('overlapping activity refreshes coalesce and reread after the latest completion', async () => {
    const read = deferred();
    let hold = false,
        reads = 0;
    const f = await fixture(async ({ path }) => {
        if (path === '/client/gameplay') {
            reads++;
            if (hold) {
                hold = false;
                await read.promise;
            }
        }
        return fixtures(path);
    });
    try {
        hold = true;
        const first = f.world.refreshAfterActivity();
        await settle();
        const second = f.world.refreshAfterActivity();
        assert.equal(first, second);
        assert.equal(f.world.current, true);
        read.resolve();
        assert.equal(await first, true);
        assert.equal(reads, 3, 'initial + first activity read + read after latest activity');
    } finally {
        read.resolve();
        await f.world.dispose();
    }
});

test('slow AI never owns human busy/outcome; Ready can overlap, with its own single-flight protection', async () => {
    const bot = deferred(),
        ready = deferred();
    let readySent = false,
        reads = 0,
        botBody;
    const f = await fixture(async ({ path, body }) => {
        if (path === '/nation/experimental-ai-step') {
            botBody = body;
            await bot.promise;
            return {};
        }
        if (path === '/ready-for-next-turn') {
            readySent = true;
            await ready.promise;
            return {};
        }
        if (path === '/client/gameplay') reads++;
        return fixtures(path);
    });
    try {
        const snapshot = f.world.snapshot;
        const aiWork = f.ai.step({ nation_id: 8 }, snapshot);
        assert.equal(f.world.current, true);
        assert.equal(f.gameplay.busy, false);
        assert.equal(f.gameplay.outcome, null);
        assert.equal(botBody.client_context.nation_id, 7);
        await assert.rejects(f.ai.step({ nation_id: 9 }, snapshot));
        const ownWork = f.gameplay.command('readyForNextTurn', { turn_number: 1 }, snapshot);
        await settle();
        assert.equal(readySent, true);
        assert.equal(f.gameplay.busy, true);
        await assert.rejects(f.gameplay.command('readyForNextTurn', {}, snapshot));
        bot.resolve();
        await settle();
        assert.equal(f.world.store.value.status, 'pending', 'AI must not clear human pending');
        assert.equal(reads, 1, 'AI waits for human reconciliation before starting its fresh read');
        ready.resolve();
        await Promise.all([aiWork, ownWork]);
        assert.equal(f.ai.outcome.reconciled, true);
        assert.equal(f.gameplay.outcome.reconciled, true);
        assert.equal(f.world.current, true);
        assert.equal(f.gameplay.busy, false);
    } finally {
        bot.resolve();
        ready.resolve();
        await f.world.dispose();
    }
});

test('AI result during human preflight does not invalidate or reject that submission', async () => {
    const bot = deferred(),
        marker = deferred();
    let holdMarker = false,
        writes = 0;
    const f = await fixture(async ({ path }) => {
        if (path === '/nation/experimental-ai-step') {
            await bot.promise;
            return {};
        }
        if (path === '/game' && holdMarker) await marker.promise;
        if (path === '/ready-for-next-turn') {
            writes++;
            return {};
        }
        return fixtures(path);
    });
    try {
        const snapshot = f.world.snapshot;
        const aiWork = f.ai.step({}, snapshot);
        holdMarker = true;
        const ownWork = f.gameplay.command('readyForNextTurn', {}, snapshot);
        bot.resolve();
        await settle();
        marker.resolve();
        await Promise.all([aiWork, ownWork]);
        assert.equal(writes, 1);
        assert.equal(f.gameplay.outcome.state, 'accepted');
    } finally {
        bot.resolve();
        marker.resolve();
        await f.world.dispose();
    }
});

test('human command supersedes AI reconciliation; late read cannot replace newer state or stop driver', async () => {
    const read = deferred();
    let hold = false,
        completed = false;
    const f = await fixture(async ({ path }) => {
        const data = fixtures(path);
        if (path === '/client/gameplay' && hold) {
            hold = false;
            await read.promise;
        }
        if (path === '/ready-for-next-turn') {
            completed = true;
            return {};
        }
        if (path === '/game/ready-status' && completed) data.ready_for_next_turn_nation_ids = [7];
        return data;
    });
    try {
        hold = true;
        const aiWork = f.ai.step({}, f.world.snapshot);
        await settle();
        assert.equal(f.world.current, true, 'background AI read keeps Ready available');
        await f.gameplay.command('readyForNextTurn', {}, f.world.snapshot);
        read.resolve();
        await aiWork;
        assert.equal(f.ai.outcome.reconciled, true);
        assert.deepEqual(f.world.snapshot.ready.ready_for_next_turn_nation_ids, [7]);
    } finally {
        read.resolve();
        await f.world.dispose();
    }
});

test('failed AI outcome is separate from human uncertainty, and refresh failure still gates stale data', async () => {
    let failRead = false,
        writes = 0;
    const f = await fixture(async ({ path }) => {
        if (path === '/nation/experimental-ai-step') {
            writes++;
            throw new ApiError('network', 'Response lost', { uncertain: true });
        }
        if (path === '/client/gameplay' && failRead) throw new ApiError('network', 'Offline');
        return fixtures(path);
    });
    try {
        await assert.rejects(f.ai.step({}, f.world.snapshot));
        assert.equal(f.ai.outcome.state, 'uncertain');
        assert.equal(f.ai.outcome.reconciled, true);
        assert.equal(f.gameplay.needsReview, false);
        assert.equal(f.gameplay.outcome, null);
        assert.equal(f.world.current, true);
        assert.equal(writes, 1);
        failRead = true;
        assert.equal(await f.world.refreshAfterActivity(), false);
        assert.equal(f.world.current, false);
    } finally {
        await f.world.dispose();
    }
});

test('background activity cannot clear human uncertainty or outlive disposal', async () => {
    const f = await fixture(async ({ path }) => {
        if (path === '/ready-for-next-turn') throw new ApiError('network', 'Lost', { uncertain: true });
        return fixtures(path);
    });
    await assert.rejects(f.gameplay.command('readyForNextTurn', {}, f.world.snapshot));
    await f.ai.step({}, f.world.snapshot);
    assert.equal(f.gameplay.needsReview, true);
    assert.equal(f.gameplay.outcome.state, 'uncertain');
    f.world.beginCommand(f.world.snapshot);
    const pending = f.world.refreshAfterActivity();
    await f.world.dispose();
    assert.equal(await pending, false);
    assert.equal(f.world.snapshot, null);
});
