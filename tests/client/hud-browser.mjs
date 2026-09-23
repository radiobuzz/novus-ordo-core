// Mutations are deliberately restricted to the separate localhost fixture host.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
    const session = await (await context.request.get('/client/session')).json();
    const login = await context.request.post('/login-user', {
        headers: { 'X-CSRF-TOKEN': session.csrfToken },
        data: { username: 'map-player', password: 'fixture-password' },
    });
    assert.equal(login.status(), 200);
    const first = await (await context.request.get('/client/gameplay')).json();
    assert.equal(first.turn_number, 1, 'Seed a fresh isolated game before this journey.');
    assert.equal(first.turn_summary.previous_turn_number, null);
    assert.equal(first.turn_summary.population_change, null);
    await page.goto('/client');
    await expect(page.locator('.turn-briefing')).toBeVisible();
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.evaluate(() => {
        window.originalMap = document.querySelector('.world-canvas');
    });
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    const destination = page.getByLabel('Destination territory', { exact: true });
    const value = await destination.locator('option').nth(1).getAttribute('value');
    await destination.selectOption(value);
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('latest server state');
    const requested = await (await context.request.get('/client/gameplay')).json();
    assert.equal(requested.deployments.length, 1);
    await page.locator('[data-tool="orders"]').click();
    await page
        .getByRole('button', {
            name: `Cancel deployment #${requested.deployments[0].deployment_id}`,
            exact: true,
        })
        .click();
    await expect(page.locator('.world-command-message')).toContainText('latest server state');
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    await destination.selectOption(value);
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('latest server state');
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Turn 2 · Briefing' })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.briefing-summary')).toContainText('1 Infantry');
    await expect(page.locator('.turn-briefing > p')).toContainText('Results from the transition');
    const next = await (await context.request.get('/client/gameplay')).json();
    assert.equal(next.turn_summary.previous_turn_number, 1);
    assert.equal(
        next.turn_summary.population_change,
        next.turn_summary.population - first.turn_summary.population,
    );
    assert.deepEqual(next.turn_summary.completed_units, { Infantry: 1 });
    assert.equal(await page.evaluate(() => originalMap === document.querySelector('.world-canvas')), true);
    await page.screenshot({ path: '/tmp/no7-hud-real-briefing.png' });
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await page.getByRole('button', { name: 'Collapse minimap' }).click();
    await page.reload();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
    await expect(page.locator('.minimap-canvas')).toBeHidden();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation [data-page="economy"]').click();
    await expect(page.getByRole('heading', { name: 'Economy & production', exact: true })).toBeVisible();
    await expect(page.locator('.hud-layer-slot')).toBeHidden();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.hud-navigation [data-page="world"]').click();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.minimap-canvas')).toBeHidden();
    assert.deepEqual(errors, []);
    console.log(
        `PASS: isolated game ${next.game_id}, exact growth, cancelled deployment excluded, completed unit, one-click turn, persistent canvas and seen/collapse preferences.`,
    );
} finally {
    await context.close();
    await browser.close();
}
