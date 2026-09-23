import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../resources/js/client/runtime/Store.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';

test('store publishes immutable bundles, immediately subscribes, releases and skips closed scopes', async () => {
    const baseline = Scope.diagnostics();
    const { store, publish } = createStore({ amount: 2, orders: [] });
    const scope = new Scope(),
        seen = [];
    store.subscribe(scope, (value) => seen.push(value));
    assert.equal(seen.length, 1);
    assert.equal(store.publish, undefined);
    assert.throws(() => store.value.orders.push(1));
    publish({ amount: 1, orders: [7] });
    assert.equal(seen[1].amount, 1);
    assert.deepEqual(seen[1].orders, [7]);
    publish(store.value);
    assert.equal(seen.length, 2);
    const closing = scope.dispose();
    publish({ amount: 0 });
    assert.equal(seen.length, 2);
    await closing;
    assert.deepEqual(Scope.diagnostics(), baseline);
});

test('subscriber failures and attempted nested publications cannot suppress other consumers', async () => {
    const errors = [],
        seen = [];
    const { store, publish } = createStore(0, { onError: (e) => errors.push(e) });
    const scope = new Scope();
    store.subscribe(scope, (value) => {
        if (value) publish(3);
    });
    store.subscribe(scope, (value) => {
        if (value) throw new Error('Broken view');
    });
    store.subscribe(scope, (value) => seen.push(value));
    publish(1);
    assert.deepEqual(seen, [0, 1]);
    assert.equal(errors.length, 2);
    assert.equal(store.value, 1);
    await scope.dispose();
});

test('an unsubscribe during delivery takes effect before the released listener is called', async () => {
    const { store, publish } = createStore(0);
    const scope = new Scope(),
        seen = [];
    let release;
    store.subscribe(scope, (value) => {
        if (value) release();
    });
    release = store.subscribe(scope, (value) => seen.push(value));
    publish(1);
    assert.deepEqual(seen, [0]);
    await scope.dispose();
});
