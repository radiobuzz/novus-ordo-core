import test from 'node:test';
import assert from 'node:assert/strict';
import { Scope } from '../../resources/js/client/runtime/Scope.js';
import { Instance } from '../../resources/js/client/runtime/Instance.js';
import { Host } from '../../resources/js/client/runtime/Host.js';
import { FeatureLoader } from '../../resources/js/client/runtime/FeatureLoader.js';
import { Signal } from '../../resources/js/client/runtime/Signal.js';
import { installTrait } from '../../resources/js/client/runtime/traits.js';

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('a refused close during mounting does not invalidate the existing operation', async () => {
    const gate = deferred();
    class Guarded extends Instance {
        async onMount() {
            await gate.promise;
        }
        async canClose() {
            return false;
        }
    }
    const host = new Host({
        loader: new FeatureLoader(new Map([['guard', () => ({ createInstance: () => new Guarded() })]])),
        services: {},
        createSlot: () => ({}),
        showStatus: () => {},
    });
    const pending = host.open('guard');
    await tick();
    const instance = host.current;
    assert.equal(await host.close(), false);
    gate.resolve();
    assert.equal(await pending, true);
    assert.equal(host.current, instance);
    assert.equal(instance.state, 'ready');
    await host.dispose();
    await assert.rejects(instance.mount({}), /destroyed/);
});
test('scope cancellation, reverse cleanup, failure aggregation, repeated disposal and counts', async () => {
    const baseline = Scope.diagnostics(),
        scope = new Scope(),
        order = [];
    scope.own(() => order.push(1));
    scope.own(() => {
        order.push(2);
        throw new Error('cleanup');
    });
    scope.own(() => order.push(3));
    const first = scope.dispose();
    assert.equal(scope.dispose(), first);
    assert.equal(scope.signal.aborted, true);
    await assert.rejects(first, AggregateError);
    assert.deepEqual(order, [3, 2, 1]);
    assert.deepEqual(Scope.diagnostics(), baseline);
});
test('subscriptions/timers released and no callback after disposal', async () => {
    const baseline = Scope.diagnostics(),
        scope = new Scope(),
        signal = new Signal(),
        target = new EventTarget();
    let calls = 0;
    signal.subscribe(scope, () => calls++);
    scope.listen(target, 'test', () => calls++);
    scope.timeout(() => calls++, 1);
    signal.emit();
    target.dispatchEvent(new Event('test'));
    assert.equal(calls, 2);
    await scope.dispose();
    signal.emit();
    target.dispatchEvent(new Event('test'));
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(calls, 2);
    assert.deepEqual(Scope.diagnostics(), baseline);
});
test('mount once, single host, partial failure cleans up, close during initialization', async () => {
    const gate = deferred();
    let starts = 0,
        cleanups = 0;
    class Slow extends Instance {
        async onMount() {
            starts++;
            this.scope.own(() => cleanups++);
            await gate.promise;
            this.scope.signal.throwIfAborted();
        }
    }
    const instance = new Slow(),
        element = {};
    const first = instance.mount(element);
    assert.equal(first, instance.mount(element));
    await assert.rejects(instance.mount({}), /one host/);
    await tick();
    const destroy = instance.destroy();
    assert.equal(destroy, instance.destroy());
    await destroy;
    gate.resolve();
    await assert.rejects(first);
    assert.equal(starts, 1);
    assert.equal(cleanups, 1);
    assert.equal(instance.state, 'destroyed');
    class Bad extends Instance {
        async onMount() {
            this.scope.own(() => cleanups++);
            throw new Error('failed');
        }
    }
    const bad = new Bad();
    await assert.rejects(bad.mount({}), /failed/);
    assert.equal(bad.state, 'destroyed');
    assert.equal(cleanups, 2);
});
test('traits are independent and reject missing requirements, duplicates, inherited collisions', async () => {
    const trait = {
        name: 'counter',
        requires: ['scope'],
        exports: ['increment'],
        install: () => {
            let count = 0;
            return { capabilities: { increment: () => ++count } };
        },
    };
    const a = new Instance(),
        b = new Instance();
    installTrait(a, trait);
    installTrait(b, trait);
    assert.equal(a.increment(), 1);
    assert.equal(a.increment(), 2);
    assert.equal(b.increment(), 1);
    assert.throws(() => installTrait(a, trait), /Duplicate/);
    assert.throws(() => installTrait(a, { ...trait, name: 'bad', exports: ['toString'] }), /collision/);
    assert.throws(
        () => installTrait(a, { ...trait, name: 'dependency', requires: ['missing'] }),
        /requirement/,
    );
    await a.destroy();
    await b.destroy();
    assert.equal(a.increment, undefined);
});
test('loader shares code, not instances; failed code loads can retry', async () => {
    let loads = 0;
    const loader = new FeatureLoader(
        new Map([
            [
                'sample',
                async () => {
                    loads++;
                    return { createInstance: (options) => new Instance(options) };
                },
            ],
        ]),
    );
    const [a, b] = await Promise.all([loader.load('sample'), loader.load('sample')]);
    assert.equal(loads, 1);
    assert.equal(a, b);
    const first = a.createInstance(),
        second = b.createInstance();
    assert.notEqual(first.id, second.id);
    await first.destroy();
    await second.destroy();
    await assert.rejects(loader.load('unknown'), /Unknown/);
    let failed = true;
    const retry = new FeatureLoader(
        new Map([
            [
                'x',
                () => {
                    if (failed) {
                        failed = false;
                        throw new Error('network');
                    }
                    return a;
                },
            ],
        ]),
    );
    await assert.rejects(retry.load('x'));
    assert.equal(await retry.load('x'), a);
});
test('host A→B→C resolves on C only; closing a loading host never resurrects content', async () => {
    const baseline = Scope.diagnostics();
    const a = deferred(),
        b = deferred(),
        c = deferred();
    let mounted = [];
    const states = [];
    class Feature extends Instance {
        async onMount() {
            mounted.push(this.inputs.id);
        }
    }
    const module = { createInstance: (options) => new Feature(options) };
    const loader = new FeatureLoader(
        new Map([
            ['a', () => a.promise],
            ['b', () => b.promise],
            ['c', () => c.promise],
        ]),
    );
    const host = new Host({
        loader,
        services: {},
        createSlot: () => ({}),
        showStatus: (state) => states.push(state),
    });
    const pa = host.open('a', { id: 'a' }),
        pb = host.open('b', { id: 'b' }),
        pc = host.open('c', { id: 'c' });
    await tick();
    c.resolve(module);
    await pc;
    b.resolve(module);
    a.resolve(module);
    await Promise.all([pa, pb]);
    assert.deepEqual(mounted, ['c']);
    assert.equal(host.current.inputs.id, 'c');
    await host.dispose();
    assert.deepEqual(Scope.diagnostics(), baseline);
    const delayed = deferred();
    const closing = new Host({
        loader: new FeatureLoader(new Map([['slow', () => delayed.promise]])),
        services: {},
        createSlot: () => ({}),
        showStatus: (state) => states.push(state),
    });
    const pending = closing.open('slow');
    await tick();
    await closing.close();
    delayed.resolve(module);
    await pending;
    assert.equal(closing.current, null);
    assert.equal(states.at(-1), 'closed');
    await closing.dispose();
});
test('host close guards preserve instance; init failure is recoverable', async () => {
    let allowed = false;
    class Guarded extends Instance {
        async canClose() {
            return allowed;
        }
    }
    const states = [];
    const loader = new FeatureLoader(
        new Map([
            ['guard', () => ({ createInstance: () => new Guarded() })],
            [
                'bad',
                () => {
                    throw new Error('bad');
                },
            ],
        ]),
    );
    const host = new Host({
        loader,
        services: {},
        createSlot: () => ({}),
        showStatus: (s) => states.push(s),
    });
    await host.open('guard');
    const first = host.current;
    assert.equal(await host.close(), false);
    assert.equal(host.current, first);
    allowed = true;
    await host.open('bad');
    assert.equal(states.at(-1), 'error');
    await host.open('guard');
    assert.equal(states.at(-1), 'ready');
    await host.dispose();
});
