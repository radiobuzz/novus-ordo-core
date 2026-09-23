import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnAutomation } from '../../resources/js/client/experimental-ai/TurnAutomation.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';
import { Signal } from '../../resources/js/client/runtime/Signal.js';

function fixture() {
    const scope = new Scope();
    let time = 0;
    const calls = [];
    const snapshot = {
        game_id: 1,
        turn_number: 1,
        setup: { nation_id: 7 },
        ready: { is_game_ready: true, ready_for_next_turn_nation_ids: [] },
        nation: {
            automation: {
                game_id: 1,
                turn_id: 1,
                generation: 'epoch',
                enabled: true,
                next_enabled: true,
                next_nation_id: 8,
            },
        },
    };
    const services = {
        world: { current: true, snapshot },
        aiCommands: { step: async (body) => calls.push({ name: 'experimentalAIStep', body }) },
        gameplay: {
            changed: new Signal(),
            drafts: () => ({}),
            deploymentDraft: () => ({ entries: [] }),
            command: async (name, body) => calls.push({ name, body }),
        },
    };
    const driver = new TurnAutomation(services, scope, { now: () => time, locks: null });
    return {
        driver,
        scope,
        services,
        calls,
        snapshot,
        advance: (seconds) => {
            time += seconds * 1000;
        },
    };
}
test('one AI step at a time with exact turn and participant context', async () => {
    const f = fixture();
    try {
        await f.driver.tick();
        assert.deepEqual(f.calls, [
            {
                name: 'experimentalAIStep',
                body: { game_id: 1, turn_id: 1, generation: 'epoch', nation_id: 8 },
            },
        ]);
        assert.equal(f.driver.autoReady, false);
    } finally {
        await f.scope.dispose();
    }
});
test('Auto-ready waits for countdown and AI completion, then uses ordinary Ready', async () => {
    const f = fixture();
    try {
        f.driver.setAutoReady(true);
        await f.driver.tick();
        f.snapshot.nation.automation.next_nation_id = null;
        f.advance(9);
        await f.driver.tick();
        assert.equal(f.calls.length, 1);
        f.advance(1);
        await f.driver.tick();
        assert.equal(f.calls[1].name, 'readyForNextTurn');
        f.snapshot.ready.ready_for_next_turn_nation_ids = [7];
        await f.driver.tick();
        assert.equal(f.calls.length, 2);
    } finally {
        await f.scope.dispose();
    }
});
test('failed mutation is not retried automatically', async () => {
    const f = fixture();
    let attempts = 0;
    try {
        f.services.aiCommands.step = async () => {
            attempts++;
            throw new Error('lost response');
        };
        await f.driver.tick();
        await f.driver.tick();
        assert.equal(attempts, 1);
        assert.equal(f.driver.paused, true);
    } finally {
        await f.scope.dispose();
    }
});
test('manual command during a slow AI step still pauses Auto-ready, without another AI submission', async () => {
    const f = fixture();
    let finish;
    f.services.aiCommands.step = () =>
        new Promise((resolve) => {
            finish = resolve;
        });
    try {
        f.driver.setAutoReady(true);
        const pending = f.driver.tick();
        assert.equal(f.driver.running, true);
        f.services.gameplay.outcome = { state: 'sending' };
        f.services.gameplay.changed.emit();
        assert.equal(f.driver.autoReady, false);
        assert.equal(f.driver.reason, 'manual');
        await f.driver.tick();
        finish();
        await pending;
        assert.equal(f.driver.paused, false);
    } finally {
        finish?.();
        await f.scope.dispose();
    }
});
test('drafts and manual commands pause Auto-ready without switching off AI turns', async () => {
    const f = fixture();
    try {
        f.driver.setAutoReady(true);
        f.services.gameplay.drafts = () => ({ Food: { quantity: 2 } });
        await f.driver.tick();
        assert.equal(f.driver.autoReady, false);
        assert.equal(f.calls.length, 1);
        f.driver.setAutoReady(true);
        f.services.gameplay.outcome = { state: 'sending' };
        f.services.gameplay.changed.emit();
        assert.equal(f.driver.autoReady, false);
    } finally {
        await f.scope.dispose();
    }
});
test('paused, finished, disabled and stale states do not submit', async () => {
    for (const flag of ['paused', 'finished', 'disabled', 'stale']) {
        const f = fixture();
        try {
            if (flag === 'stale') f.services.world.current = false;
            else if (flag === 'disabled') f.snapshot.nation.automation.enabled = false;
            else f.snapshot.nation.automation[flag] = true;
            await f.driver.tick();
            assert.equal(f.calls.length, 0, flag);
        } finally {
            await f.scope.dispose();
        }
    }
});
test('an AI-controlled owner can watch the bot loop without submitting human Ready', async () => {
    const f = fixture();
    try {
        f.snapshot.nation.automated_nation = true;
        f.driver.setAutoReady(true);
        await f.driver.tick();
        assert.equal(f.driver.autoReady, false);
        assert.equal(f.calls[0].name, 'experimentalAIStep');
        f.snapshot.nation.automation.next_nation_id = null;
        f.advance(60);
        await f.driver.tick();
        assert.equal(f.calls.length, 1);
    } finally {
        await f.scope.dispose();
    }
});
test('another tab owns driver lock and new games disable Auto-ready', async () => {
    const f = fixture();
    try {
        f.driver.locks = { request: async (_key, _options, callback) => callback(null) };
        f.driver.setAutoReady(true);
        await f.driver.tick();
        assert.equal(f.calls.length, 0);
        f.snapshot.game_id = 2;
        await f.driver.tick();
        assert.equal(f.driver.autoReady, false);
    } finally {
        await f.scope.dispose();
    }
});
