import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792'; // Disposable database only; never use the live app.
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
});
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const session = await (await page.request.get(origin + '/client/session')).json();
    const headers = { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken };
    assert.equal(
        (
            await page.request.post(origin + '/login-user', {
                headers,
                data: { username: 'map-player', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    const csrf = (await (await page.request.get(origin + '/client/session')).json()).csrfToken;
    headers['X-CSRF-TOKEN'] = csrf;
    const read = async () => {
        const response = await page.request.get(origin + '/client/gameplay', { headers });
        assert.equal(response.status(), 200, (await response.text()).slice(0, 500));
        return response.json();
    };
    const initial = await read();
    assert.equal(initial.budget.turn_number, initial.turn_number);
    const command = async (button, path, expected = 201) => {
        const response = page.waitForResponse(
            (r) => r.url().endsWith(path) && r.request().method() === 'POST',
        );
        await button.click();
        const result = await response;
        if (result.status() !== expected)
            throw new Error(`Command returned ${result.status()}: ${(await result.text()).slice(0, 1000)}`);
        if (path === '/ready-for-next-turn')
            await page.getByRole('button', { name: 'Continue playing' }).click();
        if (path === '/nation/production-plan') {
            await expect(page.locator('.planner-footer')).toContainText('Command accepted');
            await expect(button).toBeEnabled();
            return;
        }
        await expect(page.locator('.game-message')).toContainText('Command accepted');
        await expect(page.locator('.game-workspace [data-command]').first()).toBeEnabled();
    };
    await page.goto(origin + '/client#/nation');
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await expect(page.getByRole('heading', { name: initial.identity.usual_name, exact: true })).toBeVisible();
    await expect(page.getByText('Total population', { exact: true })).toBeVisible();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation').getByRole('link', { name: 'Economy', exact: true }).click();
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    const planner = page.getByRole('dialog', { name: 'National production planner', exact: true });
    await page.getByLabel('Ore extra / turn', { exact: true }).fill('0.25');
    await page.locator('.planner-advanced > summary').click();
    await page.getByLabel('Ore minimum productivity', { exact: true }).fill('1');
    await planner.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation').getByRole('link', { name: 'Nation', exact: true }).click();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation').getByRole('link', { name: 'Economy', exact: true }).click();
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    await expect(page.getByLabel('Ore extra / turn', { exact: true })).toHaveValue('0.25');
    await command(
        page.getByRole('button', { name: 'Apply production plan', exact: true }),
        '/nation/production-plan',
        204,
    );
    assert.equal((await read()).bids.find((b) => b.resource_type === 'Ore').max_quantity, 250000);
    await page.getByLabel('Ore extra / turn', { exact: true }).fill('0');
    await command(
        page.getByRole('button', { name: 'Apply production plan', exact: true }),
        '/nation/production-plan',
        204,
    );
    await planner.getByRole('button', { name: 'Close', exact: true }).click();
    const beforeBad = await read();
    const fence = {
        game_id: beforeBad.game_id,
        turn_number: beforeBad.turn_number + 1,
        nation_id: beforeBad.nation.nation_id,
        user_id: (await page.evaluate(() => JSON.parse(document.getElementById('client-boot').textContent)))
            .userId,
    };
    const bad = await page.request.post(origin + '/nation/production-bids', {
        headers,
        data: {
            resource_type: 'Ore',
            max_quantity: 1000000,
            max_labor_allocation_per_unit: 1000000,
            client_context: fence,
        },
    });
    assert.equal(bad.status(), 409);
    assert.equal((await read()).bids.find((b) => b.resource_type === 'Ore').max_quantity, 0);
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation').getByRole('link', { name: 'Military', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Request deployment', exact: true })).toBeVisible();
    await expect(page.locator('.map-notice')).toBeHidden();
    await command(
        page.getByRole('button', { name: 'Request deployment', exact: true }),
        '/nation/territories/deployments',
    );
    const pending = (await read()).deployments.at(-1);
    await command(
        page.getByRole('button', { name: `Cancel deployment #${pending.deployment_id}`, exact: true }),
        '/nation/deployments/cancel-deployment-requests',
        204,
    );
    await command(
        page.getByRole('button', { name: 'Request deployment', exact: true }),
        '/nation/territories/deployments',
    );
    const beforeTurn = await read();
    await command(page.getByRole('button', { name: 'Ready', exact: true }), '/ready-for-next-turn', 200);
    const afterTurn = await read();
    assert.equal(afterTurn.turn_number, beforeTurn.turn_number + 1);
    assert.ok(afterTurn.divisions.length > 0);
    const division = afterTurn.divisions[0];
    const base = (await (await page.request.get(origin + '/territories/base-infos')).json()).data;
    const source = base.find((t) => t.territory_id === division.territory_id);
    const target = source.connected_territory_ids.find(
        (id) => base.find((t) => t.territory_id === id)?.terrain_type !== 'Water',
    );
    await page.getByLabel(`Select division ${division.division_id}`, { exact: true }).check();
    await page.getByLabel('Order destination', { exact: true }).selectOption(String(target));
    await command(
        page.getByRole('button', { name: 'Send move / attack orders', exact: true }),
        '/nation/divisions/move-orders',
    );
    assert.ok((await read()).divisions.find((d) => d.division_id === division.division_id).order);
    await page.getByLabel(`Select division ${division.division_id}`, { exact: true }).check();
    await command(
        page.getByRole('button', { name: 'Cancel selected orders', exact: true }),
        '/nation/divisions:cancel-orders',
        204,
    );
    assert.equal((await read()).divisions.find((d) => d.division_id === division.division_id).order, null);
    await page.getByLabel(`Select division ${division.division_id}`, { exact: true }).check();
    page.once('dialog', (d) => d.accept());
    await command(
        page.getByRole('button', { name: 'Disband selected divisions', exact: true }),
        '/nation/divisions/disband-orders',
    );
    await page.getByLabel(`Select division ${division.division_id}`, { exact: true }).check();
    await command(
        page.getByRole('button', { name: 'Cancel selected orders', exact: true }),
        '/nation/divisions:cancel-orders',
        204,
    );
    await page.screenshot({ path: '/tmp/no7-gameplay-military.png', fullPage: true });
    // Resolve an actual battle as well as merely queueing an order.
    const turns = (await (await page.request.get(origin + '/territories/turn-infos')).json()).data;
    const neutral = source.connected_territory_ids.find(
        (id) =>
            base.find((t) => t.territory_id === id)?.terrain_type !== 'Water' &&
            !turns.find((t) => t.territory_id === id)?.owner_nation_id,
    );
    if (neutral) {
        await page.getByLabel(`Select division ${division.division_id}`, { exact: true }).check();
        await page.getByLabel('Order destination', { exact: true }).selectOption(String(neutral));
        await command(
            page.getByRole('button', { name: 'Send move / attack orders', exact: true }),
            '/nation/divisions/move-orders',
        );
        await command(page.getByRole('button', { name: 'Ready', exact: true }), '/ready-for-next-turn', 200);
        const battleResponse = await page.request.get(origin + '/nation/battle-logs');
        assert.ok((await battleResponse.json()).length > 0, 'Attack should produce a private battle report.');
    }
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation').getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Victory progress', exact: true })).toBeVisible();
    assert.equal(
        await page
            .locator('.report-text')
            .evaluateAll((nodes) => nodes.some((node) => /##(?:nation|territory)#/.test(node.textContent))),
        false,
    );
    await page.getByLabel('Battle report turn', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Load battle turn', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Battle reports · turn 1', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation').getByRole('link', { name: 'Economy', exact: true }).click();
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    await expect(page.getByLabel('Food extra / turn', { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: '/tmp/no7-gameplay-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
        'PASS: isolated real game nation, budget, bid/draft/cancel, stale command fencing, deployment/cancel, ready/turn resolution, move/cancel/disband orders, reports/history and mobile layout.',
    );
} finally {
    await browser.close();
}
