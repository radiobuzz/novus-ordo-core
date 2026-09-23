// Real mutations only on the explicit isolated fixture host/database.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
try {
    const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:8792',
        viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const session = await (await context.request.get('/client/session')).json();
    assert.equal(
        (
            await context.request.post('/login-user', {
                headers: { 'X-CSRF-TOKEN': session.csrfToken },
                data: { username: 'map-player', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    const read = async () => (await context.request.get('/client/gameplay')).json();
    const before = await read();
    assert.equal(before.turn_number, 1);
    assert.ok(before.deployment_limits.Armored >= 1);
    await page.goto('/client');
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await page.evaluate(() => {
        window.unitMap = document.querySelector('.world-canvas');
    });
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    const select = page.getByLabel('Destination territory', { exact: true });
    const homes = await select
        .locator('option')
        .evaluateAll((nodes) => nodes.map((n) => n.value).filter(Boolean));
    assert.ok(homes.length >= 2);
    await select.selectOption(homes[0]);
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await page.locator('[data-unit-type="Armored"]').click();
    await select.selectOption(homes[1]);
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await expect(page.locator('.deployment-draft-summary')).toHaveText('2 ghost units · 2 territories');
    assert.equal((await read()).deployments.length, 0, 'Ghosts never mutate the server.');
    const response = page.waitForResponse(
        (r) => r.url().endsWith('/nation/territories/deployments') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    assert.equal((await response).status(), 201);
    await expect(page.locator('.world-command-message')).toContainText('latest server state');
    const after = await read();
    assert.equal(after.deployments.length, 2);
    assert.deepEqual(after.deployments.map((d) => d.division_type).sort(), ['Armored', 'Infantry']);
    assert.equal(new Set(after.deployments.map((d) => d.territory_id)).size, 2);
    assert.equal(after.divisions.length, before.divisions.length);
    assert.equal(after.budget.available_production.Capital, before.budget.available_production.Capital - 8);
    assert.equal(after.budget.available_production.Ore, before.budget.available_production.Ore - 5);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Turn 2 · Briefing' })).toBeVisible({ timeout: 30000 });
    const next = await read();
    assert.equal(next.divisions.length, before.divisions.length + 2);
    assert.deepEqual(next.turn_summary.completed_units, { Infantry: 1, Armored: 1 });
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await page.locator('[data-tool="forces"]').click();
    await expect(page.locator('.world-unit-row')).toHaveCount(2);
    assert.equal(await page.evaluate(() => unitMap === document.querySelector('.world-canvas')), true);
    assert.deepEqual(errors, []);
    console.log(
        `PASS real mixed deployment/next-turn activation: isolated game ${before.game_id}, two types, two territories, exact shared costs, same map.`,
    );
} finally {
    await browser.close();
}
