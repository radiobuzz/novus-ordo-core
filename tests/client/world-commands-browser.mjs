import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:8792'; // Only the isolated-app test server, never live data.
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
    page.on('pageerror', (error) => errors.push(error.message));
    const session = await (await page.request.get(origin + '/client/session')).json();
    const login = await page.request.post(origin + '/login-user', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
        data: { username: 'map-player', password: 'fixture-password' },
    });
    assert.equal(login.status(), 200);
    const read = async () => {
        const response = await page.request.get(origin + '/client/gameplay', {
            headers: { Accept: 'application/json' },
        });
        assert.equal(response.status(), 200, (await response.text()).slice(0, 400));
        return response.json();
    };
    const before = await read();
    for (const type of before.definitions.divisions) {
        const expected = Math.min(
            ...Object.entries(type.deployment_costs)
                .filter(([, cost]) => cost > 0)
                .map(([r, cost]) => Math.floor(before.budget.available_production[r] / cost)),
        );
        assert.equal(before.deployment_limits[type.division_type], expected);
    }
    const own = (await (await page.request.get(origin + '/nation/territories/turn-infos')).json()).data;
    const home = own.find((t) => t.can_deploy).territory_id;
    const base = (await (await page.request.get(origin + '/territories/base-infos')).json()).data;
    const mapData = await (await page.request.get(origin + '/game/map?game_id=' + before.game_id)).json();
    const kind = mapData.map ? 'beta' : 'classic';
    const command = async (button, path, expected) => {
        const waiting = page.waitForResponse(
            (r) => r.url().endsWith(path) && r.request().method() === 'POST',
        );
        await button.click();
        const response = await waiting;
        if (response.status() !== expected)
            throw new Error(`Command ${path}: ${response.status()} ${(await response.text()).slice(0, 500)}`);
        if (path === '/ready-for-next-turn')
            await page.getByRole('button', { name: 'Continue playing' }).click();
        await expect(page.locator('.hud-resources')).toContainText('Capital');
        await expect(page.locator('.world-command-message')).toContainText('latest server state is shown');
        assert.equal(
            await page.evaluate(() => window.liveDataCanvas === document.querySelector('.world-canvas')),
            true,
        );
    };
    await page.goto(origin + '/client');
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.evaluate(() => {
        window.liveDataCanvas = document.querySelector('.world-canvas');
    });
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    await expect(page.locator('.ui-image-choice')).toHaveCount(5);
    await page.getByLabel('Destination territory', { exact: true }).selectOption(String(home));
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await page.screenshot({ path: `/tmp/no7-command-${kind}-deploy.png` });
    await command(
        page.getByRole('button', { name: 'Confirm deployment', exact: true }),
        '/nation/territories/deployments',
        201,
    );
    let data = await read();
    assert.equal(data.deployments.length, before.deployments.length + 1);
    assert.ok(data.deployment_limits.Infantry < before.deployment_limits.Infantry);
    const deployment = data.deployments.at(-1);
    await command(
        page.getByRole('button', { name: `Cancel deployment #${deployment.deployment_id}`, exact: true }),
        '/nation/deployments/cancel-deployment-requests',
        204,
    );
    assert.equal((await read()).deployment_limits.Infantry, before.deployment_limits.Infantry);
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption(String(home));
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await command(
        page.getByRole('button', { name: 'Confirm deployment', exact: true }),
        '/nation/territories/deployments',
        201,
    );
    await command(page.getByRole('button', { name: 'Ready', exact: true }), '/ready-for-next-turn', 200);
    data = await read();
    assert.equal(data.turn_number, before.turn_number + 1);
    const division = data.divisions.find((d) => d.territory_id === home);
    assert.ok(division);
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    await page.getByRole('searchbox').fill(base.find((t) => t.territory_id === home).name);
    await page.locator(`[data-territory-id="${home}"]`).click();
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    await expect(page.getByLabel(`Select division ${division.division_id}`, { exact: true })).toBeChecked();
    await page.locator('.world-command-dock').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.world-command-dock')).toBeHidden();
    // Finder centred the camera. Clicking the actual map selects the existing unit stack.
    const canvas = page.locator('.world-canvas');
    const bounds = await canvas.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.getByLabel(`Select division ${division.division_id}`, { exact: true })).toBeChecked();
    const source = base.find((t) => t.territory_id === home);
    const target = source.connected_territory_ids.find(
        (id) => id !== home && base.find((t) => t.territory_id === id)?.terrain_type !== 'Water',
    );
    assert.ok(target);
    await page.getByRole('button', { name: 'Move / attack', exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption(String(target));
    await command(
        page.getByRole('button', { name: 'Send move / attack orders', exact: true }),
        '/nation/divisions/move-orders',
        201,
    );
    assert.ok((await read()).divisions.find((d) => d.division_id === division.division_id).order);
    await command(
        page.getByRole('button', { name: `Cancel order #${division.division_id}`, exact: true }),
        '/nation/divisions:cancel-orders',
        204,
    );
    assert.equal((await read()).divisions.find((d) => d.division_id === division.division_id).order, null);
    await page.locator('[data-tool="forces"]').click();
    await page.getByLabel(`Select division ${division.division_id}`, { exact: true }).check();
    await page.getByText('More actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Disband selected units', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Disband selected units' })).toBeVisible();
    await command(
        page.getByRole('button', { name: 'Confirm', exact: true }),
        '/nation/divisions/disband-orders',
        201,
    );
    await command(
        page.getByRole('button', { name: `Cancel order #${division.division_id}`, exact: true }),
        '/nation/divisions:cancel-orders',
        204,
    );
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.minimap-canvas')).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `/tmp/no7-command-${kind}-mobile.png` });
    assert.deepEqual(errors, []);
    console.log(
        `PASS: ${kind} map-first UI, authoritative maximums/reservations, deployment/cancel, turn activation, real map unit picking, movement/cancel, disband/cancel and mobile.`,
    );
} finally {
    await browser.close();
}
