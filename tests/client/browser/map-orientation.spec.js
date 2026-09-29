import { test, expect } from '@playwright/test';
import { prepareHud } from './hud-helpers.js';
import { generatedRegionFixture } from '../fixtures.js';

const key = 'no7:v1:user-1:game-1:world';
const home = generatedRegionFixture(156);
const fixtureZoom = 3.2;
test.use({ deviceScaleFactor: 2 });
test.beforeEach(async ({ page }) => {
    await prepareHud(page);
    await page.addInitScript(
        ({ key, home, fixtureZoom }) => {
            if (!localStorage.getItem(key))
                localStorage.setItem(
                    key,
                    JSON.stringify({
                        version: 1,
                        value: {
                            mode: 'military',
                            camera: { x: home.x, y: home.y, zoom: fixtureZoom },
                        },
                    }),
                );
        },
        { key, home, fixtureZoom },
    );
});
const savedCamera = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).value.camera, key);
async function drag(page, a, b, button = 'left') {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down({ button });
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up({ button });
}

test('rotation preserves unit picking, rectangle selection, screen-relative pan, ghosts and camera lifetime', async ({
    page,
}) => {
    const errors = [],
        writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (request.method() !== 'GET') writes.push(request.url());
    });
    await page.goto('/client?game_id=1');
    await expect(page.locator('.zoom-value')).toHaveText('320%');
    await page.evaluate(() => (window.rotationCanvas = document.querySelector('.world-canvas')));
    const box = await page.locator('.world-canvas').boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const clockwise = page.getByRole('button', { name: 'Rotate map right 15°', exact: true });
    const overview = page.locator('.minimap-canvas');
    await expect(overview).toBeVisible();
    await expect.poll(() => overview.evaluate((canvas) => canvas.width)).toBeGreaterThan(0);
    const overviewBefore = await overview.evaluate((canvas) => canvas.toDataURL());
    for (let i = 0; i < 6; i++) await clockwise.click();
    await expect(page.locator('.map-orientation-value')).toHaveText('90°');
    await expect.poll(() => overview.evaluate((canvas) => canvas.toDataURL())).not.toBe(overviewBefore);
    const second = home.cells[1];
    const division12 = {
        x: center.x - (second.y - home.y) * fixtureZoom,
        y: center.y + (second.x - home.x) * fixtureZoom,
    };
    await page.mouse.click(division12.x, division12.y);
    await expect(page.getByLabel('Select division 12', { exact: true })).toBeChecked();
    await drag(page, { x: center.x - 38, y: center.y - 104 }, { x: center.x + 130, y: center.y + 32 });
    await expect(page.locator('.world-command-dock')).toContainText('2 units selected');
    await drag(page, center, { x: center.x + 80, y: center.y + 30 }, 'right');
    await page.mouse.click(center.x + 80, center.y + 30);
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeChecked();
    await expect(page.locator('.world-command-dock')).toContainText('1 units selected');
    await page.locator('[data-tool="deploy"]').click();
    await page.mouse.click(center.x + 80, center.y + 30);
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('157');
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await expect(page.locator('.deployment-draft-summary')).toHaveText('2 ghost units · 2 territories');
    await clockwise.click();
    await expect(page.locator('.map-orientation-value')).toHaveText('105°');
    const saved = await savedCamera(page);
    expect(saved.angle).toBeCloseTo((Math.PI * 105) / 180);
    await page.screenshot({ path: 'test-results/client/map-rotation-generated.png' });
    expect(await page.evaluate(() => rotationCanvas === document.querySelector('.world-canvas'))).toBe(true);
    expect(writes).toEqual([]);
    await page.reload();
    await expect(page.locator('.map-orientation-value')).toHaveText('105°');
    expect((await savedCamera(page)).x).toBeCloseTo(saved.x);
    await page.getByRole('button', { name: 'Reset rotation (north up)', exact: true }).click();
    await expect(page.locator('.map-orientation-value')).toHaveText('0°');
    expect((await savedCamera(page)).angle).toBe(0);
    await page.getByRole('button', { name: 'Rotate map left 15°', exact: true }).click();
    await expect(page.locator('.map-orientation-value')).toHaveText('345°');
    expect(errors).toEqual([]);
});

test('orientation buttons support keyboard, narrow layout and French labels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/client?game_id=1');
    const clockwise = page.getByRole('button', { name: 'Rotate map right 15°', exact: true });
    await clockwise.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.map-orientation-value')).toHaveText('15°');
    await page.getByRole('button', { name: 'Reset rotation (north up)', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.map-orientation-value')).toHaveText('0°');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await page.locator('.map-controls').boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tourner la carte de 15° vers la gauche', exact: true }).click();
    await expect(page.locator('.map-orientation-value')).toHaveText('345°');
    await expect(
        page.getByRole('button', { name: 'Réinitialiser la rotation (nord en haut)', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/client/map-rotation-mobile.png' });
});
