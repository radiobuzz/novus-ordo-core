import { request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const f = JSON.parse(readFileSync(`${root}/diplomacy-fixture.json`, 'utf8'));
const origin = 'http://127.0.0.1:8792';
const clients = [];
async function login(name) {
    const api = await request.newContext({
        baseURL: origin,
        extraHTTPHeaders: { Accept: 'application/json', 'X-Game-Id': String(f.game_id) },
    });
    clients.push(api);
    let session = await (await api.get('/client/session')).json();
    if (name) {
        assert.equal(
            (
                await api.post('/login-user', {
                    headers: { 'X-CSRF-TOKEN': session.csrfToken },
                    data: { username: name, password: 'fixture-password' },
                })
            ).status(),
            200,
        );
        session = await (await api.get('/client/session')).json();
    }
    const post = (url, data) => api.post(url, { headers: { 'X-CSRF-TOKEN': session.csrfToken }, data });
    return { api, post, userId: session.userId };
}
try {
    const a = await login('diplomat-a'),
        b = await login('diplomat-b'),
        c = await login('diplomat-c'),
        guest = await login();
    const captured = await (await a.api.get('/client/gameplay')).json();
    const context = {
        game_id: f.game_id,
        turn_number: captured.turn_number,
        nation_id: f.nations[0],
        user_id: a.userId,
        turn_context_revision: captured.turn_context_revision,
    };
    const body = {
        nation_id: f.nations[1],
        body: 'HTTP context test',
        request_key: randomUUID(),
        client_context: context,
    };
    const valid = await a.post('/nation/diplomacy/messages', body);
    assert.equal(valid.status(), 201, await valid.text());
    const message = await valid.json();
    const duplicate = await a.post('/nation/diplomacy/messages', body);
    assert.deepEqual(await duplicate.json(), message);
    assert.equal(
        (
            await a.post('/nation/diplomacy/messages', {
                ...body,
                client_context: { ...context, turn_context_revision: randomUUID() },
            })
        ).status(),
        409,
    );
    assert.equal(
        (
            await a.post('/nation/diplomacy/messages', {
                ...body,
                client_context: { ...context, nation_id: f.nations[2] },
            })
        ).status(),
        409,
    );
    const { client_context, ...noContext } = body;
    assert.equal((await a.post('/nation/diplomacy/messages', noContext)).status(), 409);
    assert.equal(
        (
            await a.post('/nation/diplomacy/messages', {
                ...body,
                nation_id: f.nations[3],
                request_key: randomUUID(),
            })
        ).status(),
        404,
    );
    assert.equal((await guest.api.get('/nation/diplomacy')).status(), 401);
    const pair = await b.api.get('/nation/diplomacy/conversations/' + f.nations[0]);
    assert.match(pair.headers()['cache-control'], /no-store/);
    assert.ok((await pair.json()).messages.some((m) => m.id === message.message_id));
    const other = await c.api.get('/nation/diplomacy/conversations/' + f.nations[0]);
    assert.ok(!(await other.json()).messages.some((m) => m.id === message.message_id));
    assert.equal(
        (
            await c.post('/nation/diplomacy/read', {
                nation_id: f.nations[0],
                message_id: message.message_id,
            })
        ).status(),
        404,
    );
    console.log(
        'PASS: authenticated HTTP, mandatory current revision, forged nation rejection, cross-game rejection, deduplication, private no-store reads and unread access.',
    );
} finally {
    for (const api of clients) await api.dispose();
}
