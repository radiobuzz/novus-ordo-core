import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
test.beforeEach(async ({ page }) => prepareHud(page));

async function start(page) {
    await page.goto('/client?game_id=1');
    await expect(page.locator('[data-resource="Capital"] dd').last()).toHaveText('30');
    await expect(page.locator('.world-directory')).toBeHidden();
    await page.locator('[data-mode="military"]').click();
}

test('map-first modes, stack selection, minimap and explicit deployment', async ({ page }) => {
    const errors = [],
        writes = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
        if (r.method() === 'POST') writes.push(r.postDataJSON());
    });
    await start(page);
    const map = page.locator('.world-canvas');
    const original = await map.boundingBox();
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('.ui-image-choice')).toHaveCount(5);
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 10');
    expect(await map.boundingBox()).toEqual(original);
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('156');
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('11');
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeEnabled();
    expect(writes).toHaveLength(0);
    await page.route('**/nation/territories/deployments', (route) =>
        route.fulfill({ status: 201, json: {} }),
    );
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('Command accepted');
    expect(writes).toHaveLength(1);
    expect(writes[0].deployments).toEqual([
        { division_type: 'Infantry', territory_id: 156 },
        { division_type: 'Infantry', territory_id: 156 },
    ]);
    expect(writes[0].client_context.game_id).toBe(1);
    await page.locator('.world-command-dock').getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => (location.hash = '#/world?territory=156'));
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeVisible();
    await page.getByLabel('Select division 11', { exact: true }).check();
    await page.getByRole('button', { name: 'Move / attack', exact: true }).click();
    await page.getByText('Choose from a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('157');
    await expect(page.getByRole('button', { name: 'Send move / attack orders', exact: true })).toBeEnabled();
    expect(writes).toHaveLength(1);
    await page.locator('[data-mode="geopolitical"]').click();
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    await expect(page.locator('.world-command-dock')).toBeHidden();
    await expect(page.locator('.minimap-canvas')).toBeVisible();
    expect(await map.boundingBox()).toEqual(original);
    await page.locator('.minimap-canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    expect(errors).toEqual([]);
});

test('counted unit stacks, icon toolbar and mobile map picking keep commands compact', async ({ page }) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    data.divisions = [21, 22, 23].map((division_id) => ({
        division_id,
        division_type: 'Artillery',
        territory_id: 156,
        order: null,
    }));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await start(page);
    await page.locator('[data-tool="forces"]').click();
    const group = page.locator('.world-unit-group');
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('3 × Artillery');
    await expect(group.locator('.world-unit-count')).toHaveText('3');
    await page.getByLabel('Select 3 Artillery units', { exact: true }).check();
    const toolbar = page.getByRole('toolbar');
    for (const name of ['Move / attack', 'Cancel selected orders', 'Deploy'])
        await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/client/compact-selection-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await toolbar.getByRole('button', { name: 'Move / attack', exact: true }).click();
    const dock = page.locator('.world-command-dock');
    await expect(dock).toHaveAttribute('data-picking', 'true');
    await expect(dock.locator('.mobile-pick-prompt')).toHaveText('Choose a destination on the map');
    expect((await dock.boundingBox()).height).toBeLessThanOrEqual(110);
    await page.screenshot({ path: 'test-results/client/compact-orders-picking-mobile.png' });
    await page.evaluate(() => {
        location.hash = '#/world?territory=157';
    });
    await expect(dock).toHaveAttribute('data-picking', 'false');
    await expect(dock).toContainText('3 of 3 units can reach Boreal March');
    await expect(dock.locator('.world-route-details')).not.toHaveAttribute('open', '');
    await dock.locator('.world-route-details > summary').click();
    await expect(dock.locator('.world-route-details')).toContainText('3 ×');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/compact-orders-mobile.png' });
});

test('unavailable units, French copy, narrow layout and tool lifetime', async ({ page }) => {
    await page.route('**/client/gameplay', (route) =>
        route.fulfill({ json: { ...fixtures('/client/gameplay'), deployment_limits: { Infantry: 0 } } }),
    );
    await start(page);
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    for (let i = 0; i < 5; i++) {
        await page.locator('[data-tool="deploy"]').click();
        await expect(page.locator('.deployment-draft-validation')).toContainText('No more units available.');
        await page.locator('.world-command-dock').getByRole('button', { name: 'Close', exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.game-menu > summary').click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await page.locator('.ui-edge-handle').click();
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('.world-command-dock')).toContainText('Infanterie');
    await expect(page.locator('.deployment-draft-validation')).toContainText(
        'Aucune unité supplémentaire disponible.',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/command-mobile.png' });
});
