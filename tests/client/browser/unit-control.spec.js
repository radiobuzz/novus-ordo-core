import { test, expect } from '@playwright/test';
import { prepareHud } from './hud-helpers.js';
import { fixtures } from '../fixtures.js';
import { createMapModel } from '../../../resources/js/map/model.js';
import { exportMap, restoreMap } from '../../../resources/js/map/snapshot.js';
import { isWater } from '../../../resources/js/map/water.js';

test.beforeEach(async ({ page }) => {
    await prepareHud(page);
    await page.addInitScript(() =>
        localStorage.setItem(
            'no7:v1:user-1:game-1:world',
            JSON.stringify({
                version: 1,
                value: { mode: 'military', camera: { x: 165, y: 110, zoom: 8 }, minimapCollapsed: true },
            }),
        ),
    );
});
async function start(page) {
    await page.goto('/client?game_id=1');
    await expect(page.locator('[data-resource="Capital"] dd').last()).toHaveText('30');
    await expect(page.locator('.zoom-value')).toHaveText('800%');
    await page.evaluate(() => {
        window.originalUnitCanvas = document.querySelector('.world-canvas');
    });
    const bounds = await page.locator('.world-canvas').boundingBox();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function drag(page, a, b, button = 'left') {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down({ button });
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up({ button });
}

test('near-zoom picking, rectangle selection, Shift toggle, right-pan and replaceable palette', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const center = await start(page);
    await page.mouse.click(center.x, center.y);
    await expect(page.locator('.world-command-dock')).toContainText('1 units selected');
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeChecked();
    await page.keyboard.down('Shift');
    await page.mouse.click(center.x - 72, center.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('.world-command-dock')).toContainText('2 units selected');
    await page.keyboard.down('Shift');
    await page.mouse.click(center.x, center.y);
    await page.keyboard.up('Shift');
    await expect(page.locator('.world-command-dock')).toContainText('1 units selected');
    await drag(page, { x: center.x - 104, y: center.y - 38 }, { x: center.x + 32, y: center.y + 38 });
    await expect(page.locator('.world-command-dock')).toContainText('2 units selected');
    await expect(page.locator('.map-selection-box')).toBeHidden();
    await drag(page, center, { x: center.x + 100, y: center.y + 40 }, 'right');
    await expect(page.locator('.world-command-dock')).toContainText('2 units selected');
    await expect(page.locator('.world-unit-appearance')).toHaveCount(0);
    const canvas = page.locator('.world-canvas');
    await page.waitForTimeout(400);
    const before = await canvas.evaluate((c) => c.toDataURL());
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByLabel('Map unit style').selectOption('flat');
    await page.keyboard.press('Escape');
    await expect.poll(() => canvas.evaluate((c) => c.toDataURL())).not.toBe(before);
    await expect(page.locator('.world-command-dock')).toContainText('2 units selected');
    await page.screenshot({ path: 'test-results/client/units-flat.png' });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByLabel('Map unit style').selectOption('miniatures');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'test-results/client/units-miniatures.png' });
    expect(await page.evaluate(() => originalUnitCanvas === document.querySelector('.world-canvas'))).toBe(
        true,
    );
    expect(errors).toEqual([]);
});

test('mixed territory/type clicks are ghosts until one confirmation; undo, budgets and rejection preserve draft', async ({
    page,
}) => {
    const writes = [];
    let reject = true;
    await page.route('**/nation/territories/deployments', (route) => {
        writes.push(route.request().postDataJSON());
        return route.fulfill({
            status: reject ? 422 : 201,
            json: reject ? { message: 'Fixture rejection' } : {},
        });
    });
    const center = await start(page);
    await page.locator('[data-tool="deploy"]').click();
    await page.mouse.click(center.x, center.y);
    await page.mouse.click(center.x, center.y);
    await page.locator('[data-unit-type="Armored"]').click();
    await page.mouse.click(center.x + 240, center.y);
    await expect(page.locator('.deployment-draft-summary')).toHaveText('3 ghost units · 2 territories');
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 6');
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Undo last', exact: true }).click();
    await expect(page.locator('.deployment-draft-summary')).toContainText('2 ghost units');
    await page.mouse.click(center.x + 240, center.y);
    await page.screenshot({ path: 'test-results/client/units-ghosts.png' });
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('rejected');
    await expect(page.locator('.deployment-draft-summary')).toContainText('3 ghost units');
    expect(writes[0].deployments).toEqual([
        { division_type: 'Infantry', territory_id: 156 },
        { division_type: 'Infantry', territory_id: 156 },
        { division_type: 'Armored', territory_id: 157 },
    ]);
    reject = false;
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('accepted');
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('.deployment-draft-summary')).toContainText('0 ghost units');
    expect(writes).toHaveLength(2);
    expect(await page.evaluate(() => originalUnitCanvas === document.querySelector('.world-canvas'))).toBe(
        true,
    );
});

test('draft revalidation, native list placement and French mobile controls', async ({ page }) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await start(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.ui-edge-handle').click();
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('156');
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('4');
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    data.budget.available_production.Capital = 3;
    data.deployment_limits.Infantry = 1;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.deployment-draft-validation')).toContainText('no longer affordable');
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await expect(page.locator('.deployment-draft-summary')).toContainText('4 ghost units');
    await page.locator('.game-menu > summary').click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Confirmer le déploiement' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/units-mobile.png' });
});

test('new placements made during submission survive; only accepted submitted ghosts clear', async ({
    page,
}) => {
    let release, requested;
    const pending = new Promise((resolve) => {
        release = resolve;
    });
    const sending = new Promise((resolve) => {
        requested = resolve;
    });
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await page.route('**/nation/territories/deployments', async (route) => {
        requested();
        await pending;
        data.deployments = [{ deployment_id: 20, division_type: 'Infantry', territory_id: 156 }];
        data.budget.available_production.Capital = 27;
        data.deployment_limits.Infantry = 9;
        await route.fulfill({ status: 201, json: {} });
    });
    const center = await start(page);
    await page.locator('[data-tool="deploy"]').click();
    await page.mouse.click(center.x, center.y);
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await sending;
    await page.mouse.click(center.x + 240, center.y);
    await expect(page.locator('.deployment-draft-summary')).toContainText('2 ghost units');
    release();
    await expect(page.locator('.world-command-message')).toContainText('accepted');
    await expect(page.locator('.deployment-draft-summary')).toHaveText('1 ghost units · 1 territories');
    await expect(page.locator('.deployment-draft-list')).toContainText('Boreal March');
    await expect(page.locator('.deployment-draft-list')).not.toContainText('Aster Reach');
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 8');
});

test('accepted ghosts cannot return after navigating away during submission', async ({ page }) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    Object.assign(data.budget, { free_labor: 0, labor_pools: [], labor_facility_allocations: [] });
    Object.assign(data.definitions, { labor_per_unit: 1000000, bid_resources: [] });
    data.bids = [];
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    let release, requested;
    const pending = new Promise((resolve) => {
        release = resolve;
    });
    const sending = new Promise((resolve) => {
        requested = resolve;
    });
    await page.route('**/nation/territories/deployments', async (route) => {
        requested();
        await pending;
        await route.fulfill({ status: 201, json: {} });
    });
    const center = await start(page);
    await page.locator('[data-tool="deploy"]').click();
    await page.mouse.click(center.x, center.y);
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await sending;
    await page.locator('.game-menu > summary').click();
    await page.locator('.hud-navigation [data-page="economy"]').click();
    await expect(page.getByRole('heading', { name: 'Economy & production', exact: true })).toBeVisible();
    release();
    await expect(page.locator('.shell-footer')).toContainText('latest server state');
    await page.locator('.game-menu > summary').click();
    await page.locator('.hud-navigation [data-page="world"]').click();
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('.deployment-draft-summary')).toContainText('0 ghost units');
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
});

test('generated-map land slots, aircraft, rectangle selection and palette share the same stable canvas', async ({
    page,
}) => {
    test.setTimeout(45000);
    const map = exportMap(createMapModel());
    const base = fixtures('/territories/base-infos').data;
    const model = restoreMap(map, base);
    const region = model.regions.find((r) => r.cellIds.every((id) => !isWater(model.cellById.get(id))));
    const position = region.cellIds
        .map((id) => model.cellById.get(id))
        .sort(
            (a, b) => Math.hypot(a.x - region.x, a.y - region.y) - Math.hypot(b.x - region.x, b.y - region.y),
        )[0];
    await page.addInitScript(
        (p) =>
            localStorage.setItem(
                'no7:v1:user-1:game-1:world',
                JSON.stringify({
                    version: 1,
                    value: {
                        mode: 'military',
                        camera: { x: p.x, y: p.y, zoom: 3.2 },
                        minimapCollapsed: true,
                    },
                }),
            ),
        position,
    );
    const data = structuredClone(fixtures('/client/gameplay'));
    data.divisions = ['Infantry', 'Armored', 'Artillery', 'Fighter', 'Bomber'].map(
        (division_type, index) => ({
            division_id: 11 + index,
            division_type,
            territory_id: region.territoryId,
            order: null,
        }),
    );
    await page.route('**/game/map?*', (route) =>
        route.fulfill({ json: { game_id: 1, fingerprint: 'units-beta-fixture', map } }),
    );
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await page.goto('/client?game_id=1');
    await expect(page.locator('.zoom-value')).toHaveText('320%');
    const box = await page.locator('.world-canvas').boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.click(center.x, center.y);
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeChecked();
    await drag(page, { x: center.x - 200, y: center.y - 190 }, { x: center.x + 200, y: center.y + 190 });
    await expect(page.locator('.world-command-dock')).toContainText('5 units selected');
    await page.screenshot({ path: 'test-results/client/units-beta.png' });
    for (let i = 0; i < 3; i++)
        await page.getByRole('button', { name: 'Rotate map right 15°', exact: true }).click();
    await expect(page.locator('.map-orientation-value')).toHaveText('45°');
    await page.mouse.click(center.x, center.y);
    await expect(page.locator('.world-command-dock')).toContainText('1 units selected');
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeChecked();
    await drag(page, { x: center.x - 210, y: center.y - 210 }, { x: center.x + 210, y: center.y + 210 });
    await expect(page.locator('.world-command-dock')).toContainText('5 units selected');
    await page.screenshot({ path: 'test-results/client/map-rotation-beta-detail.png' });
    await page.locator('.world-canvas').focus();
    await page.keyboard.press('Home');
    await expect(page.locator('.world-command-dock')).toContainText('5 units selected');
    await page.screenshot({ path: 'test-results/client/map-rotation-beta-overview.png' });
});
