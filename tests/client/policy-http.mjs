import { request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(readFileSync(`${root}/policy-fixture.json`, 'utf8'));
const clients = [];
async function login(name) {
    const api = await request.newContext({
        baseURL: 'http://127.0.0.1:8792',
        extraHTTPHeaders: { Accept: 'application/json', 'X-Game-Id': String(fixture.game_id) },
    });
    clients.push(api);
    let session = await (await api.get('/client/session')).json();
    if (name) {
        const response = await api.post('/login-user', {
            headers: { 'X-CSRF-TOKEN': session.csrfToken },
            data: { username: name, password: 'fixture-password' },
        });
        assert.equal(response.status(), 200, await response.text());
        session = await (await api.get('/client/session')).json();
    }
    return {
        api,
        session,
        write: (method, url, data) =>
            api[method](url, { headers: { 'X-CSRF-TOKEN': session.csrfToken }, data }),
    };
}

try {
    const a = await login(fixture.users[0]);
    const b = await login(fixture.users[1]);
    const admin = await login(fixture.admin);
    const guest = await login();
    assert.equal((await guest.api.get('/nation/policies')).status(), 401);
    assert.equal((await a.api.get('/client/admin/api/policy-sets')).status(), 403);
    assert.equal((await a.write('post', '/client/admin/api/policy-sets', { document: {} })).status(), 403);
    let state = await (await a.api.get('/nation/policies')).json();
    const game = await (await a.api.get('/client/gameplay')).json();
    const context = {
        game_id: fixture.game_id,
        nation_id: fixture.nations[0],
        user_id: a.session.userId,
        turn_number: game.turn_number,
        resource_edit_counter: game.definitions.edit_counter,
        turn_context_revision: game.turn_context_revision,
    };
    const change = { income_tax: { option: 'standard', parameters: { rate: '0.31', test_switch: false } } };
    const body = {
        turn_id: state.turn_id,
        edit_counter: state.edit_counter,
        changes: change,
        acquisitions: game.acquisitions,
        client_context: context,
    };
    assert.equal(
        (await a.api.put('/nation/policies/pending', { data: body })).status(),
        419,
        'Missing CSRF accepted',
    );
    assert.equal(
        (
            await a.write('put', '/nation/policies/pending', {
                ...body,
                client_context: { ...context, nation_id: fixture.nations[1] },
            })
        ).status(),
        409,
        'Foreign nation context accepted',
    );
    assert.equal(
        (
            await a.write('put', '/nation/policies/pending', {
                ...body,
                client_context: { ...context, turn_context_revision: randomUUID() },
            })
        ).status(),
        409,
        'Old rollback context accepted',
    );
    assert.equal(
        (await a.write('put', '/nation/policies/pending', { ...body, edit_counter: 1 })).status(),
        409,
        'Old rules accepted',
    );
    assert.equal(
        (
            await a.write('put', '/nation/policies/pending', {
                ...body,
                changes: {
                    income_tax: { option: 'standard', parameters: { rate: '9', test_switch: false } },
                },
            })
        ).status(),
        422,
        'Out-of-range parameter accepted',
    );
    const preview = await a.write('post', '/nation/policies/preview', body);
    assert.equal(preview.status(), 200, await preview.text());
    assert.ok((await preview.json()).indicator_forecast.expected);
    assert.deepEqual(
        (await (await a.api.get('/nation/policies')).json()).pending,
        state.pending,
        'Preview enacted change',
    );
    const submitted = await a.write('put', '/nation/policies/pending', body);
    assert.equal(submitted.status(), 200, await submitted.text());
    assert.equal((await submitted.json()).pending.income_tax.parameters.rate, '0.31');
    assert.deepEqual(
        (await (await b.api.get('/nation/policies')).json()).pending,
        [],
        'Pending leaked to another nation',
    );
    assert.equal((await a.write('put', '/nation/policies/pending', { ...body, changes: {} })).status(), 200);

    const catalogues = await admin.api.get('/client/admin/api/policy-sets');
    assert.equal(catalogues.status(), 200, await catalogues.text());
    const loaded = await (await admin.api.get(`/client/admin/api/policy-sets/${fixture.set_id}`)).json();
    const same = await admin.write('put', `/client/admin/api/policy-sets/${fixture.set_id}`, {
        edit_counter: loaded.set.edit_counter,
        document: loaded.document,
    });
    assert.equal(same.status(), 200, await same.text());
    assert.equal((await same.json()).catalogue.set.edit_counter, loaded.set.edit_counter + 1);
    assert.equal(
        (
            await admin.write('put', `/client/admin/api/policy-sets/${fixture.set_id}`, {
                edit_counter: loaded.set.edit_counter,
                document: loaded.document,
            })
        ).status(),
        409,
    );
    assert.equal(
        (await a.write('put', '/nation/policies/pending', body)).status(),
        409,
        'Admin edit failed to stale player proposal',
    );
    const cloned = await admin.write('post', `/client/admin/api/policy-sets/${fixture.set_id}/clone`, {
        name: 'HTTP template',
    });
    assert.equal(cloned.status(), 201, await cloned.text());
    const clone = await cloned.json();
    assert.equal(clone.set.kind, 'template');
    assert.notDeepEqual(clone.ids.policies, loaded.ids.policies);
    const foreignReset = await admin.write(
        'post',
        `/client/admin/api/games/${fixture.game_id}/policies/nations/${fixture.nations[2]}/reset`,
        {
            turn_id: state.turn_id,
            context_revision: context.turn_context_revision,
            edit_counter: loaded.set.edit_counter + 1,
            changes: {},
        },
    );
    assert.equal(foreignReset.status(), 404, await foreignReset.text());
    const disabled = await admin.write('post', `/client/admin/api/games/${fixture.game_id}/policies`, {
        context_revision: context.turn_context_revision,
        testing_enabled: false,
    });
    assert.equal(disabled.status(), 200, await disabled.text());
    assert.equal(
        (
            await admin.write('put', `/client/admin/api/policy-sets/${fixture.set_id}`, {
                edit_counter: loaded.set.edit_counter + 1,
                document: loaded.document,
            })
        ).status(),
        403,
        'Normal game definitions editable',
    );
    console.log(
        'PASS: policy HTTP authentication, authorization, CSRF, game/nation scope, rollback context, stale definitions, preview, pending isolation, admin editing, cloning and test-edit gate.',
    );
} finally {
    await Promise.all(clients.map((client) => client.dispose()));
}
