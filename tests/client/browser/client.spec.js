import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
test.beforeEach(async ({ page }) => prepareHud(page));
const start = async (page) => {
    await prepareHud(page);
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.map-notice')).toBeHidden();
};
const select = async (page, name) => {
    if (!(await page.getByRole('searchbox', { name: 'Search territories' }).isVisible())) {
        const drawer = page.locator('.ui-edge-drawer');
        if (
            (await drawer.getAttribute('data-mobile')) === 'true' &&
            (await drawer.getAttribute('data-open')) === 'false'
        )
            await page.getByRole('button', { name: 'Map modes', exact: true }).click();
        await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    }
    await page.getByRole('searchbox', { name: 'Search territories' }).fill(name);
    await page.getByRole('button', { name: new RegExp(name) }).click();
};

test('production lazy loading, real canvas, independent inspectors and responsive reflow', async ({
    page,
}) => {
    const requests = [],
        errors = [];
    page.on('request', (req) => requests.push(req.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    expect(requests.some((url) => url.includes('territory.feature-'))).toBe(false);
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    await select(page, 'Aster Reach');
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    await expect(page.locator('.inspector-panel')).toContainText('Owner information');
    expect(requests.some((url) => url.includes('territory.feature-'))).toBe(true);
    await page.getByRole('button', { name: 'Open separate inspector' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.inspector-dialog h3')).toHaveText('Aster Reach');
    await page.locator('.inspector-dialog .territory-connections summary').click();
    await expect(page.locator('.inspector-dialog .territory-connections')).toHaveAttribute('open', '');
    await expect(page.locator('.inspector-panel .territory-connections')).not.toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.locator('.inspector-panel .territory-connections summary').click();
    const countBefore = requests.filter((url) => url.includes('/territories/156/turn-info')).length;
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.inspector-panel .territory-connections')).toHaveAttribute('open', '');
    expect(requests.filter((url) => url.includes('/territories/156/turn-info')).length).toBe(countBefore);
    expect(await page.locator('.inspector-panel').evaluate((el) => getComputedStyle(el).position)).toBe(
        'fixed',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/mobile-inspector.png' });
    await page.locator('.inspector-panel').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.inspector-panel')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('searchbox').fill('');
    await page.screenshot({ path: 'test-results/client/desktop-world.png' });
    expect(errors).toEqual([]);
});

test('rapid A→B→C and close-during-load cannot resurrect stale inspectors', async ({ page }) => {
    await page.route('**/territories/*/turn-info?*', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const id = Number(pathname.split('/')[2]);
        await new Promise((r) => setTimeout(r, id === 156 ? 500 : id === 157 ? 250 : 10));
        await route.fulfill({ json: fixtures(pathname) });
    });
    await start(page);
    for (const id of [156, 157, 158]) {
        await page.evaluate((id) => (location.hash = `#/world?territory=${id}`), id);
        await page.waitForTimeout(50);
    }
    await expect(page.locator('.inspector-panel h3')).toHaveText('Cinder Vale');
    await page.waitForTimeout(600);
    await expect(page.locator('.inspector-panel h3')).toHaveText('Cinder Vale');
    await expect(page.locator('.inspector-panel')).not.toContainText('Owner information');
    await page.evaluate(() => (location.hash = '#/world?territory=156'));
    await page.locator('.inspector-panel').getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.inspector-panel')).toBeHidden();
});

test('pan, anchored zoom, keyboard controls, transformed picking and preferences', async ({ page }) => {
    await start(page);
    const canvas = page.locator('.world-canvas'),
        box = await canvas.boundingBox();
    const initial = await page.locator('.zoom-value').textContent();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await expect(page.locator('.zoom-value')).not.toHaveText(initial);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.inspector-panel')).toBeHidden();
    await canvas.focus();
    await page.keyboard.press('Home');
    await expect(page.locator('.zoom-value')).toHaveText(initial);
    await page.keyboard.press('+');
    await expect(page.locator('.zoom-value')).not.toHaveText(initial);
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    await page.locator('.hud-layers > summary').click();
    await page.getByLabel('Territory names', { exact: true }).check();
    // A directory selection centers the camera at the territory's exact tile center.
    await select(page, 'Aster Reach');
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    const zoomBefore = await page.locator('.zoom-value').textContent();
    await page.reload();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.zoom-value')).toHaveText(zoomBefore);
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    await page.locator('.hud-layers > summary').click();
    await expect(page.getByLabel('Territory names', { exact: true })).toBeChecked();
});

test('upkeep retains a visibly stale map; session expiry clears private panels', async ({ page }) => {
    await start(page);
    await select(page, 'Aster Reach');
    await expect(page.locator('.inspector-panel h3')).toBeVisible();
    await page.route('**/territories/turn-infos?*', (route) =>
        route.fulfill({ status: 503, json: { message: 'Upkeep fixture' } }),
    );
    await page.locator('.game-menu > summary').click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.shell-footer')).toContainText('last confirmed state');
    await expect(page.getByRole('button', { name: 'Ready', exact: true })).toBeDisabled();
    await page.unroute('**/territories/turn-infos?*');
    await page.locator('.game-menu > summary').click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.route('**/user', (route) =>
        route.fulfill({ status: 401, json: { message: 'Unauthenticated' } }),
    );
    await page.locator('.game-menu > summary').click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
    await expect(page.locator('.inspector-panel')).toBeHidden();
});

test('image failures fall back to selectable geometry; corrupt preferences are harmless', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.setItem('no7:v1:user-1:game-1:world', '{bad'));
    await page.route('**/map_layer_*.png', (route) => route.abort());
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.map-notice')).toContainText('could not load');
    await select(page, 'Aster Reach');
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
});

test('repeated open/close releases owned resources and Back restores selection', async ({ page }) => {
    await start(page);
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    for (let i = 0; i < 6; i++) {
        await select(page, 'Aster Reach');
        await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
        await page.locator('.inspector-panel').getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.locator('.inspector-panel')).toBeHidden();
    }
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
    await page.goBack();
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
});

test('high-DPI transformed canvas picking matches the directory selection', async ({ browser }) => {
    const context = await browser.newContext({
        viewport: { width: 1200, height: 800 },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await start(page);
    await select(page, 'Aster Reach');
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    await page.locator('.inspector-panel').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.inspector-panel')).toBeHidden();
    const canvas = page.locator('.world-canvas');
    await expect
        .poll(() => canvas.evaluate((el) => el.width / Math.round(el.getBoundingClientRect().width)))
        .toBe(2);
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    await context.close();
});

test('emulated touch pan and pinch navigate without accidental selection', async ({ browser }) => {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    await start(page);
    const session = await context.newCDPSession(page),
        box = await page.locator('.world-canvas').boundingBox();
    const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
            { x: x - 30, y, id: 1 },
            { x: x + 30, y, id: 2 },
        ],
    });
    const before = await page.locator('.zoom-value').textContent();
    await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
            { x: x - 60, y: y + 20, id: 1 },
            { x: x + 60, y: y + 20, id: 2 },
        ],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.zoom-value')).not.toHaveText(before);
    await expect(page.locator('.inspector-panel')).toBeHidden();
    await select(page, 'Aster Reach');
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    const header = await page.locator('.inspector-panel .surface-header').boundingBox();
    await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: header.x + 70, y: header.y + 20, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: header.x + 70, y: header.y + 130, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.inspector-panel')).toBeHidden();
    await context.close();
});

test('theme tokens update the canvas palette', async ({ page }) => {
    await start(page);
    await page.evaluate(() => document.documentElement.style.setProperty('--map-ocean', 'rgb(10, 20, 30)'));
    await expect
        .poll(() =>
            page
                .locator('.world-canvas')
                .evaluate((el) => Array.from(el.getContext('2d').getImageData(0, 0, 1, 1).data)),
        )
        .toEqual([10, 20, 30, 255]);
});

test('a player without a nation can browse without requesting owner-only data', async ({ page }) => {
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.route('**/user/nation-setup-status', (route) =>
        route.fulfill({
            json: {
                game_id: 1,
                nation_id: null,
                nation_setup_status: 'NotCreated',
            },
        }),
    );
    await start(page);
    await expect(page.getByRole('link', { name: 'Create your nation', exact: true })).toHaveAttribute(
        'href',
        /\/client\/entry\?game_id=1$/,
    );
    expect(requests.some((url) => url.includes('/nation/territories/turn-infos'))).toBe(false);
    await page.evaluate(() => {
        location.hash = '#/world?territory=160';
    });
    await expect(page.locator('.inspector-panel h3')).toHaveText('Territory 160');
    await expect(page.locator('.inspector-panel')).toContainText('Unknown');
    await expect(page.locator('.inspector-panel')).not.toContainText('Owner information');
});
