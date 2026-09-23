import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { productionPlanBids } from '../../resources/js/client/services/production.js';

// Hardcoded isolated HTTP service. Never point this test at the live game.
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const api = context.request;
    const anonymous = await browser.newContext();
    const anonCsrf = (await (await anonymous.request.get(origin + '/client/session')).json()).csrfToken;
    assert.equal(
        (
            await anonymous.request.post(origin + '/nation/production-plan', {
                headers: { Accept: 'application/json', 'X-CSRF-TOKEN': anonCsrf },
                data: { bids: [] },
            })
        ).status(),
        401,
    );
    await anonymous.close();
    const loginCsrf = (await (await api.get(origin + '/client/session')).json()).csrfToken;
    assert.equal(
        (
            await api.post(origin + '/login-user', {
                headers: { Accept: 'application/json', 'X-CSRF-TOKEN': loginCsrf },
                data: { username: 'map-player', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    const headers = {
        Accept: 'application/json',
        'X-CSRF-TOKEN': (await (await api.get(origin + '/client/session')).json()).csrfToken,
    };
    const html = await (await api.get(origin + '/client')).text();
    const boot = JSON.parse(
        html.match(/<script id="client-boot" type="application\/json">([\s\S]*?)<\/script>/)[1],
    );
    const read = async () => {
        const response = await api.get(origin + '/client/gameplay', { headers });
        assert.equal(response.status(), 200);
        return response.json();
    };
    const before = await read();
    const client_context = {
        game_id: before.game_id,
        turn_number: before.turn_number,
        nation_id: before.nation.nation_id,
        user_id: boot.userId,
    };
    const bids = productionPlanBids(before, { Oil: { quantity: '0.25', productivity: '0' } });
    assert.equal(
        (
            await api.post(origin + '/nation/production-plan', {
                headers: { Accept: 'application/json' },
                data: { bids, client_context },
            })
        ).status(),
        419,
    );
    for (const field of Object.keys(client_context)) {
        const response = await api.post(origin + '/nation/production-plan', {
            headers,
            data: { bids, client_context: { ...client_context, [field]: client_context[field] + 1000 } },
        });
        assert.equal(response.status(), 409, `Context fence: ${field}`);
    }
    for (const invalid of [
        bids.slice(1),
        [...bids.slice(1), bids[1]],
        bids.map((bid, i) => (i ? bid : { ...bid, max_quantity: -1 })),
    ]) {
        assert.equal(
            (
                await api.post(origin + '/nation/production-plan', {
                    headers,
                    data: { bids: invalid, client_context },
                })
            ).status(),
            422,
        );
    }
    const afterGuards = await read();
    assert.deepEqual(afterGuards.budget, before.budget);
    assert.deepEqual(afterGuards.bids, before.bids);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/client');
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    await page.locator('button[data-mode="economic"]').click();
    const modal = page.getByRole('dialog', { name: 'National production planner', exact: true });
    await modal.getByLabel('Oil extra / turn', { exact: true }).fill('0.25');
    await page.evaluate(() => (window.beforePlanCanvas = document.querySelector('.world-canvas')));
    const response = page.waitForResponse((response) => response.url().endsWith('/nation/production-plan'));
    await modal.getByRole('button', { name: 'Apply production plan', exact: true }).click();
    assert.equal((await response).status(), 204);
    await expect(modal.locator('.planner-footer')).toContainText('Command accepted.');
    await expect(modal.getByRole('button', { name: 'Apply production plan', exact: true })).toBeEnabled();
    const after = await read();
    assert.equal(after.bids.find((bid) => bid.resource_type === 'Oil').max_quantity, 250000);
    assert.equal(
        await page.evaluate(() => beforePlanCanvas === document.querySelector('.world-canvas')),
        true,
    );
    await page.screenshot({ path: '/tmp/no7-production-planner-real.png' });
    assert.deepEqual(errors, []);
    console.log(
        'PASS: isolated HTTP auth/CSRF/all four context fences, invalid batch nonmutation, real planner save/reconciliation and stable canvas.',
    );
} finally {
    await browser.close();
}
