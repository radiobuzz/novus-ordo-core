import { request } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792';
const anonymous = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Accept: 'application/json' },
});
const player = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Accept: 'application/json' },
});
try {
    assert.equal((await anonymous.get('/client/gameplay')).status(), 401);
    const identities = await (await anonymous.get('/game/identities')).json();
    assert.ok(Array.isArray(identities.nations));
    assert.equal(JSON.stringify(identities).includes('stockpiles'), false);
    const session = await (await player.get('/client/session')).json();
    assert.equal(
        (
            await player.post('/login-user', {
                headers: { 'X-CSRF-TOKEN': session.csrfToken },
                data: { username: 'map-player', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    const csrf = (await (await player.get('/client/session')).json()).csrfToken;
    const html = await (await player.get('/client')).text();
    const boot = JSON.parse(
        html.match(/<script id="client-boot" type="application\/json">([\s\S]*?)<\/script>/)[1],
    );
    const current = await (await player.get('/client/gameplay')).json();
    const client_context = {
        game_id: current.game_id,
        turn_number: current.turn_number,
        nation_id: current.nation.nation_id,
        user_id: boot.userId,
    };
    const body = {
        resource_type: 'Ore',
        max_quantity: 1000000,
        max_labor_allocation_per_unit: 1000000,
        client_context,
    };
    const catalogue = (await (await player.get('/game')).json()).nation_colors;
    assert.equal(catalogue.colors.length, 24);
    const own = catalogue.assignments.find((a) => a.nation_id === client_context.nation_id);
    assert.ok(own);
    assert.equal(
        (
            await player.post('/nation/colors', {
                headers: { 'X-CSRF-TOKEN': csrf },
                data: {
                    primary_color_id: own.primary_color_id,
                    secondary_color_id: own.secondary_color_id,
                    client_context,
                },
            })
        ).status(),
        404,
    );
    assert.equal((await player.post('/nation/production-bids', { data: body })).status(), 419);
    for (const field of Object.keys(client_context)) {
        const response = await player.post('/nation/production-bids', {
            headers: { 'X-CSRF-TOKEN': csrf },
            data: { ...body, client_context: { ...client_context, [field]: client_context[field] + 1000 } },
        });
        assert.equal(response.status(), 409, field);
    }
    const territory = (await (await player.get('/nation/territories/turn-infos')).json()).data.find(
        (t) => t.can_deploy,
    );
    const tooExpensive = await player.post('/nation/territories/deployments', {
        headers: { 'X-CSRF-TOKEN': csrf },
        data: {
            client_context,
            deployments: Array.from({ length: 100 }, () => ({
                division_type: 'Bomber',
                territory_id: territory.territory_id,
            })),
        },
    });
    assert.equal(tooExpensive.status(), 422);
    const after = await (await player.get('/client/gameplay')).json();
    assert.deepEqual(after.deployments, current.deployments);
    assert.deepEqual(after.bids, current.bids);
    assert.deepEqual(after.budget.expenses, current.budget.expenses);
    console.log(
        'PASS: owner authentication, public identity privacy, retired post-setup colour mutation, CSRF, all four identity-fence fields and unaffordable deployment rejection with unchanged state.',
    );
} finally {
    await anonymous.dispose();
    await player.dispose();
}
