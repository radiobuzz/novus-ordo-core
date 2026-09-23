import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../../resources/js/client/api/createTransport.js';
import { createEndpointClient } from '../../resources/js/client/api/createEndpointClient.js';
import { endpoints } from '../../resources/js/client/api/generated.js';

const response = (value, status = 200) =>
    new Response(typeof value === 'string' ? value : JSON.stringify(value), { status });
const transport = (fetchImpl) =>
    createTransport({ baseUrl: 'https://example.test/game-root', csrfToken: 'test-csrf', fetchImpl });
test('generated client encodes every placeholder, special asset URI, keeps payload/options separate', async () => {
    const calls = [];
    const api = createEndpointClient(
        { ...endpoints, pair: { method: 'GET', path: '/things/{first}/{second}' } },
        async (request) => {
            calls.push(request);
            return { ok: true };
        },
    );
    const data = Object.freeze({ orders: [{ division_id: 1, path: [2, 3] }] });
    const controller = new AbortController();
    const result = api.sendMoveOrders({ body: data, signal: controller.signal });
    assert.ok(result instanceof Promise);
    await result;
    assert.equal(calls[0].body, data);
    assert.equal(calls[0].signal, controller.signal);
    assert.equal(data._token, undefined);
    await api.pair({ params: { first: 'a/b', second: '? space' } });
    assert.equal(calls[1].path, '/things/a%2Fb/%3F%20space');
    await api.getAssetInfo({ params: { encodedUri: 'res/bundled/a b.png' } });
    assert.equal(calls[2].path, '/assets/res%252Fbundled%252Fa%2520b.png');
    await assert.rejects(api.pair({ params: { first: 'x' } }), /Missing route parameter/);
    await assert.rejects(api.pair({ params: { first: '..', second: 'x' } }), /Invalid route/);
});
test('GET nested query and wrapped collections survive; no query payload mutation', async () => {
    const get = transport(async (url, options) => {
        assert.equal(url.pathname, '/game-root/territories');
        assert.equal(url.searchParams.get('filter[ids][1]'), '3');
        assert.equal(url.searchParams.get('name'), 'a & b');
        assert.equal(options.credentials, 'same-origin');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.headers.Accept, 'application/json');
        assert.equal(options.body, undefined);
        return response({ data: [{ id: 1 }] });
    });
    assert.deepEqual(await get({ path: '/territories', query: { filter: { ids: [2, 3] }, name: 'a & b' } }), {
        data: [{ id: 1 }],
    });
});
test('POST JSON and CSRF headers, empty response and 204', async () => {
    const post = transport(async (url, options) => {
        assert.equal(options.headers['X-CSRF-TOKEN'], 'test-csrf');
        assert.deepEqual(JSON.parse(options.body), { orders: [{ path: [1, 2] }] });
        return new Response(null, { status: 204 });
    });
    assert.equal(await post({ path: '/orders', method: 'POST', body: { orders: [{ path: [1, 2] }] } }), null);
    assert.equal(await transport(async () => response(''))({ path: '/empty' }), null);
});
for (const [status, category] of [
    [401, 'session'],
    [419, 'session'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [422, 'validation'],
    [429, 'unavailable'],
    [503, 'unavailable'],
    [500, 'server'],
]) {
    test(`normalizes ${status} without leaking server text`, async () => {
        await assert.rejects(
            transport(async () =>
                response({ message: 'SECRET TRACE', errors: { name: ['Required'] } }, status),
            )({ path: '/x' }),
            (error) => {
                assert.equal(error.category, category);
                assert.equal(error.status, status);
                assert.ok(!error.message.includes('SECRET'));
                if (status === 422) assert.deepEqual(error.fields, { name: ['Required'] });
                return true;
            },
        );
    });
}
test('HTML success and JSON parse failure are malformed; text error retains status', async () => {
    await assert.rejects(transport(async () => response('<html>login</html>'))({ path: '/x' }), {
        category: 'malformed',
    });
    await assert.rejects(transport(async () => response('<html>error</html>', 503))({ path: '/x' }), {
        category: 'unavailable',
    });
    const redirected = response('<html>login</html>');
    Object.defineProperty(redirected, 'redirected', { value: true });
    await assert.rejects(transport(async () => redirected)({ path: '/x' }), { category: 'session' });
});
test('network and aborted mutations are uncertain, never retried', async () => {
    let calls = 0;
    const send = transport(async () => {
        calls++;
        throw new TypeError('offline');
    });
    await assert.rejects(send({ method: 'POST', path: '/x', body: {} }), {
        category: 'network',
        uncertain: true,
    });
    assert.equal(calls, 1);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(send({ method: 'POST', path: '/x', signal: abort.signal }), {
        category: 'abort',
        uncertain: true,
    });
    assert.equal(calls, 2);
});

test('separate game transports pin reads, JSON commands and uploads without session state', async () => {
    const calls = [];
    const make = (gameId) =>
        createTransport({
            baseUrl: 'https://example.test',
            gameId,
            fetchImpl: async (url, options) => {
                calls.push({ url, options });
                return response({});
            },
        });
    const a = make(11),
        b = make(22);
    const upload = new FormData();
    upload.append('nation_name', 'Example');
    await Promise.all([
        a({ path: '/game' }),
        b({ path: '/game' }),
        a({ path: '/ready-for-next-turn', method: 'POST', body: { turn_number: 3 } }),
        b({ path: '/create-nation', method: 'POST', body: upload }),
    ]);
    assert.deepEqual(
        calls.map(({ options }) => options.headers['X-Game-Id']),
        ['11', '22', '11', '22'],
    );
    assert.equal(calls[3].options.body, upload);
    // Conflicting caller IDs stay visible for authoritative server rejection.
    await a({ path: '/game/map', query: { game_id: 22 } });
    assert.equal(calls[4].url.searchParams.get('game_id'), '22');
    assert.equal(calls[4].options.headers['X-Game-Id'], '11');
});

test('entry transport follows refreshed selection and can clear its initial game', async () => {
    let selected = 11;
    const ids = [];
    const send = createTransport({
        baseUrl: 'https://example.test',
        gameId: 11,
        getGameId: () => selected,
        fetchImpl: async (url, options) => {
            ids.push(options.headers['X-Game-Id']);
            return response({});
        },
    });
    await send({ path: '/client/session' });
    selected = 22;
    await send({ path: '/client/setup' });
    selected = null;
    await send({ path: '/client/session' });
    assert.deepEqual(ids, ['11', '22', undefined]);
});
