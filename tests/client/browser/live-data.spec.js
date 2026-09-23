import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
test.beforeEach(async ({ page }) => prepareHud(page));
import { createMapModel } from '../../../resources/js/map/model.js';
import { exportMap } from '../../../resources/js/map/snapshot.js';

async function start(page) {
    await page.goto('/client?game_id=1');
    await expect(page.locator('[data-resource="Capital"] dd').last()).toHaveText('30');
    await page.locator('[data-mode="military"]').click();
    await page.evaluate(() => {
        window.originalCanvas = document.querySelector('.world-canvas');
        window.originalWorkspace = document.querySelector('.world-workspace');
        window.originalMinimap = document.querySelector('.minimap-canvas');
    });
}
async function stable(page) {
    expect(
        await page.evaluate(
            () =>
                originalCanvas === document.querySelector('.world-canvas') &&
                originalWorkspace === document.querySelector('.world-workspace') &&
                originalMinimap === document.querySelector('.minimap-canvas'),
        ),
    ).toBe(true);
}
async function draft(page, quantity = '1') {
    await page.locator('[data-tool="deploy"]').click();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('156');
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill(quantity);
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).focus();
}

test('a turn advanced elsewhere is detected promptly, including with a simulated hidden document', async ({
    page,
}) => {
    let turn = 1,
        ownerReads = 0;
    await page.route('**/var/turn-status/game-1.json?*', (route) =>
        route.fulfill({
            json: {
                version: 1,
                game_id: 1,
                turn_number: turn,
                state: 'ready',
                revision: String(turn).repeat(32),
                updated_at: Date.now(),
            },
        }),
    );
    await page.addInitScript(() => {
        window.testHidden = false;
        Object.defineProperty(document, 'hidden', { get: () => window.testHidden });
    });
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
    ])
        await page.route(pattern, (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path === '/client/gameplay') ownerReads++;
            return route.fulfill({ json: fixtures(path, turn) });
        });
    await start(page);
    const reads = ownerReads;
    // An unchanged fast check must not trigger a heavy owner refresh.
    await page.waitForResponse((r) => new URL(r.url()).pathname.includes('/var/turn-status/'));
    expect(ownerReads).toBe(reads);
    turn = 2;
    await expect(page.locator('.header-context strong')).toHaveText('Turn 2', { timeout: 5000 });
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    await stable(page);
    await page.evaluate(() => {
        window.testHidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    turn = 3;
    await expect(page.locator('.header-context strong')).toHaveText('Turn 3', { timeout: 5000 });
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    await stable(page);
    await page.evaluate(() => {
        window.testHidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
    });
    await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
});

test('a confirmation opened in an old turn cannot submit into the new turn', async ({ page }) => {
    let turn = 1,
        writes = 0;
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
    ])
        await page.route(pattern, (route) =>
            route.fulfill({ json: fixtures(new URL(route.request().url()).pathname, turn) }),
        );
    page.on('request', (request) => {
        if (request.method() === 'POST') writes++;
    });
    await start(page);
    await page.locator('[data-tool="forces"]').click();
    await page.getByLabel('Select division 11', { exact: true }).check();
    await page.getByText('More actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Disband selected units', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Disband selected units' })).toBeVisible();
    turn = 2;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.header-context strong')).toHaveText('Turn 2');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('Refresh the current game');
    expect(writes).toBe(0);
    await stable(page);
});

test('a successful command preserves a newer draft typed while its response was pending', async ({
    page,
}) => {
    let release, requested;
    const response = new Promise((resolve) => {
        release = resolve;
    });
    const submitted = new Promise((resolve) => {
        requested = resolve;
    });
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await page.route('**/nation/territories/deployments', async (route) => {
        requested();
        await response;
        data.budget.available_production.Capital = 27;
        data.deployment_limits.Infantry = 9;
        await route.fulfill({ status: 201, json: {} });
    });
    await start(page);
    await draft(page, '1');
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await submitted;
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('5');
    release();
    await expect(page.locator('.world-command-message')).toContainText('latest server state is shown');
    await expect(page.getByLabel('Quantity (up to 100 per request)', { exact: true })).toHaveValue('5');
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 9');
    await stable(page);
});

test('deployment and cancellation reconcile a shared bundle without replacing the world or canvases', async ({
    page,
}) => {
    let data = structuredClone(fixtures('/client/gameplay')),
        reads = 0,
        writes = 0;
    await page.route('**/client/gameplay', (route) => {
        reads++;
        return route.fulfill({ json: data });
    });
    await page.route('**/nation/territories/deployments', (route) => {
        writes++;
        data.budget.available_production.Capital = 27;
        data.deployment_limits.Infantry = 9;
        data.deployments = [{ deployment_id: 42, territory_id: 156, division_type: 'Infantry' }];
        return route.fulfill({ status: 201, json: {} });
    });
    await page.route('**/nation/deployments/cancel-deployment-requests', (route) => {
        writes++;
        data = structuredClone(fixtures('/client/gameplay'));
        return route.fulfill({ status: 204 });
    });
    await start(page);
    expect(reads).toBe(1);
    const initialZoom = await page.locator('.zoom-value').textContent();
    await page.locator('.world-canvas').focus();
    await page.keyboard.press('+');
    await expect(page.locator('.zoom-value')).not.toHaveText(initialZoom);
    const zoom = await page.locator('.zoom-value').textContent();
    await draft(page);
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('[data-resource="Capital"] dd').last()).toHaveText('27');
    await page.locator('.pending-order-group summary').click();
    await expect(page.getByRole('button', { name: 'Cancel deployment #42', exact: true })).toBeEnabled();
    await stable(page);
    expect(await page.locator('.zoom-value').textContent()).toBe(zoom);
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 9');
    await page.locator('[data-tool="orders"]').click();
    await page.locator('.pending-order-group summary').click();
    await page.getByRole('button', { name: 'Cancel deployment #42', exact: true }).click();
    await expect(page.locator('[data-resource="Capital"] dd').last()).toHaveText('30');
    await expect(page.locator('.world-command-message')).toContainText('latest server state');
    await expect(page.getByRole('button', { name: 'Cancel deployment #42', exact: true })).toHaveCount(0);
    await stable(page);
    expect(writes).toBe(2);
    expect(reads).toBe(3);
});

test('focus refresh notices another-tab changes without replacing input, focus, draft or canvas', async ({
    page,
}) => {
    let data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await start(page);
    await draft(page, '4');
    await page.evaluate(() => {
        window.quantityField = document.activeElement;
    });
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    data.deployment_limits.Infantry = 2;
    data.budget.available_production.Capital = 6;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 0');
    await expect(page.locator('[data-resource="Capital"] dd').last()).toHaveText('6');
    expect(
        await page.evaluate(
            () =>
                quantityField === document.activeElement &&
                quantityField.isConnected &&
                quantityField.value === '4',
        ),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await expect(page.locator('.world-command-dock')).toContainText('draft is no longer affordable');
    await stable(page);
    for (let i = 0; i < 3; i++) {
        await page
            .getByRole('button', { name: 'Refresh', exact: true, includeHidden: true })
            .dispatchEvent('click');
        await expect(page.locator('.shell-footer')).toContainText('synchronized');
    }
    expect(
        await page.evaluate(() => quantityField === document.activeElement && quantityField.value === '4'),
    ).toBe(true);
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
});

test('accepted but unreadable state offers refresh without resubmission, then recovers in place', async ({
    page,
}) => {
    let fail = false,
        writes = 0;
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => (fail ? route.abort() : route.fulfill({ json: data })));
    await page.route('**/nation/territories/deployments', (route) => {
        writes++;
        fail = true;
        data.deployments = [{ deployment_id: 42, territory_id: 156, division_type: 'Infantry' }];
        return route.fulfill({ status: 201, json: {} });
    });
    await start(page);
    await draft(page);
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('Retry refresh, not the command');
    await expect(page.locator('.shell-footer')).toContainText('last confirmed state');
    await stable(page);
    fail = false;
    await page.locator('.game-menu > summary').click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('.pending-order-group summary').click();
    await expect(page.getByRole('button', { name: 'Cancel deployment #42', exact: true })).toBeEnabled();
    expect(writes).toBe(1);
    await stable(page);
});

test('uncertain commands are not retried; editable draft survives and explicit review is required', async ({
    page,
}) => {
    let writes = 0;
    await page.route('**/nation/territories/deployments', (route) => {
        writes++;
        return route.abort();
    });
    await start(page);
    await draft(page, '3');
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('uncertain');
    await expect(page.getByLabel('Quantity (up to 100 per request)', { exact: true })).toHaveValue('3');
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await page.locator('[data-tool="orders"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'I have checked the orders and budget', exact: true }).click();
    expect(writes).toBe(1);
    await stable(page);
});

test('beta ownership updates refresh main-map and minimap caches without replacing geography', async ({
    page,
}) => {
    const map = exportMap(createMapModel());
    let owner = 7;
    await page.route('**/game/map?*', (route) =>
        route.fulfill({ json: { game_id: 1, fingerprint: 'fixture-beta', map } }),
    );
    await page.route('**/territories/turn-infos?*', (route) =>
        route.fulfill({
            json: {
                data: fixtures('/territories/turn-infos').data.map((t) => ({ ...t, owner_nation_id: owner })),
            },
        }),
    );
    await start(page);
    const main = page.locator('.world-canvas'),
        mini = page.locator('.minimap-canvas');
    // Allow the renderer to finish its initial cached overview before comparing ownership colors.
    await page.waitForTimeout(500);
    const first = await main.evaluate((canvas) => canvas.toDataURL());
    const firstMini = await mini.evaluate((canvas) => canvas.toDataURL());
    owner = 8;
    await page.locator('.game-menu > summary').click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.shell-footer')).toContainText('synchronized');
    await expect.poll(() => main.evaluate((canvas) => canvas.toDataURL())).not.toBe(first);
    await expect.poll(() => mini.evaluate((canvas) => canvas.toDataURL())).not.toBe(firstMini);
    await stable(page);
});
