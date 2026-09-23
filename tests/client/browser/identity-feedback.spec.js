import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
import { createMapModel } from '../../../resources/js/map/model.js';
import { exportMap } from '../../../resources/js/map/snapshot.js';

test.beforeEach(async ({ page }) => prepareHud(page));
async function menu(page) {
    await page.getByLabel('Game menu', { exact: true }).click();
}

test('national bands remain distinct and rivers stay visible without decorative map detail', async ({
    page,
}) => {
    test.setTimeout(45000);
    const map = exportMap(createMapModel());
    expect(map.rivers.length).toBeGreaterThan(0);
    const current = fixtures('/territories/turn-infos');
    current.data.forEach((t, i) => {
        t.owner_nation_id = i % 30 < 15 ? 7 : 8;
    });
    await page.route('**/territories/turn-infos?*', (route) => route.fulfill({ json: current }));
    await page.route('**/game/map?*', (route) =>
        route.fulfill({ json: { game_id: 1, fingerprint: 'borders-rivers', map } }),
    );
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.map-notice')).toBeHidden();
    await page.getByText('Layers · Geopolitical', { exact: true }).click();
    await page.getByLabel('Ownership', { exact: true }).uncheck();
    await page.getByLabel('Map detail', { exact: true }).uncheck();
    await expect(page.getByLabel('Rivers', { exact: true })).toBeChecked();
    const canvas = page.locator('.world-canvas');
    const countRed = () =>
        canvas.evaluate((c) => {
            const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let count = 0;
            for (let i = 0; i < pixels.length; i += 4)
                if (pixels[i] > 150 && pixels[i] > pixels[i + 1] * 1.7 && pixels[i] > pixels[i + 2] * 1.3)
                    count++;
            return count;
        });
    await expect.poll(countRed).toBeGreaterThan(100);
    await page.getByLabel('Borders', { exact: true }).uncheck();
    await expect.poll(countRed).toBe(0);
    await page.getByLabel('Borders', { exact: true }).check();
    await expect.poll(countRed).toBeGreaterThan(100);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'test-results/client/borders-rivers.png' });
    const riverImage = await canvas.evaluate((c) => c.toDataURL());
    await page.getByText('Layers · Geopolitical', { exact: true }).click();
    await page.getByLabel('Rivers', { exact: true }).uncheck();
    await expect.poll(() => canvas.evaluate((c) => c.toDataURL())).not.toBe(riverImage);
    await page.getByLabel('Rivers', { exact: true }).check();
    await expect.poll(() => canvas.evaluate((c) => c.toDataURL())).toBe(riverImage);
});

test('sound is silent by default, independently switchable, remembered and not replayed by refresh', async ({
    page,
}) => {
    let turn = 1;
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
    ])
        await page.route(pattern, (route) =>
            route.fulfill({ json: fixtures(new URL(route.request().url()).pathname, turn) }),
        );
    await page.route('**/ready-for-next-turn', (route) => {
        turn++;
        return route.fulfill({ status: 200, json: {} });
    });
    await page.addInitScript(() => {
        window.audioCues = [];
        window.audioContexts = 0;
        window.AudioContext = class {
            constructor() {
                audioContexts++;
                this.state = 'running';
                this.currentTime = 0;
                this.destination = {};
            }
            resume() {
                this.state = 'running';
                return Promise.resolve();
            }
            suspend() {
                this.state = 'suspended';
                return Promise.resolve();
            }
            close() {
                this.state = 'closed';
                return Promise.resolve();
            }
            createOscillator() {
                let frequency;
                return {
                    frequency: { setValueAtTime: (f) => (frequency = f), exponentialRampToValueAtTime() {} },
                    connect: (node) => node,
                    disconnect() {},
                    start() {
                        audioCues.push(frequency);
                    },
                    stop() {
                        this.onended?.();
                    },
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime() {},
                        linearRampToValueAtTime() {},
                        exponentialRampToValueAtTime() {},
                    },
                    connect() {},
                    disconnect() {},
                };
            }
        };
    });
    await page.goto('/client?game_id=1');
    await menu(page);
    expect(await page.evaluate(() => audioContexts)).toBe(0);
    await expect(page.getByLabel('Enable sound', { exact: true })).not.toBeChecked();
    await page.getByLabel('Enable sound', { exact: true }).check();
    await page.getByLabel('Hover and click sounds', { exact: true }).uncheck();
    await page.getByLabel('Unit and game-event sounds', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    const silent = await page.evaluate(() => audioCues.length);
    await page.locator('[data-mode="military"]').click();
    await menu(page);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
    expect(await page.evaluate(() => audioCues.length)).toBe(silent);
    await menu(page);
    await page.getByLabel('Unit and game-event sounds', { exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => audioCues.filter((f) => f === 620 || f === 940).length))
        .toBe(2);
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    const afterTurn = await page.evaluate(() => audioCues.length);
    await menu(page);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
    expect(await page.evaluate(() => audioCues.length)).toBe(afterTurn);
    await menu(page);
    await page.getByLabel('Unit and game-event sounds', { exact: true }).uncheck();
    await page.getByLabel('Enable sound', { exact: true }).uncheck();
    await page.reload();
    // prepareHud seeds the old seen-turn marker on every document load.
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    await menu(page);
    await expect(page.getByLabel('Enable sound', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Hover and click sounds', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Unit and game-event sounds', { exact: true })).not.toBeChecked();
    expect(await page.evaluate(() => audioContexts)).toBe(0);
});

test('Economic mode preserves production inputs through refresh, selection and mixed command outcomes', async ({
    page,
}) => {
    const data = fixtures('/client/gameplay'),
        errors = [],
        writes = [];
    let reject = true;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await page.route('**/nation/production-plan', (route) => {
        const body = route.request().postDataJSON();
        writes.push(body);
        if (reject) return route.fulfill({ status: 422, json: { message: 'Fixture rejection' } });
        data.bids = body.bids;
        data.budget.production.Food = 6;
        return route.fulfill({ status: 204 });
    });
    await page.goto('/client?game_id=1');
    await page.locator('[data-mode="economic"]').click();
    const food = page.locator('[data-production-resource="Food"]');
    const quantity = food.getByLabel('Food extra / turn', { exact: true });
    const quantitySlider = food.getByLabel('Food target slider', { exact: true });
    await page.locator('.planner-advanced > summary').click();
    const productivity = page.getByLabel('Food minimum productivity', { exact: true });
    await quantity.fill('9');
    await productivity.fill('3');
    await expect(quantitySlider).toHaveValue('9');
    await quantitySlider.fill('8');
    await expect(quantity).toHaveValue('8');
    await quantity.fill('9');
    await expect(food).toContainText('below target');
    await page.evaluate(() => {
        window.productionField = document.querySelector('[data-production-resource="Food"] input');
        window.productionCanvas = document.querySelector('.world-canvas');
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
    await expect(quantity).toHaveValue('9');
    await page.evaluate(() => (location.hash = '#/world?territory=156'));
    await expect(quantity).toHaveValue('9');
    expect(
        await page.evaluate(
            () => productionField === document.querySelector('[data-production-resource="Food"] input'),
        ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Apply production plan', exact: true }).click();
    await expect(page.locator('.production-planner')).toContainText('Production plan rejected');
    await expect(quantity).toHaveValue('9');
    reject = false;
    await page.getByRole('button', { name: 'Apply production plan', exact: true }).click();
    await expect(food).toContainText('6 →');
    await expect(productivity).toHaveValue('3');
    expect(writes).toHaveLength(2);
    expect(writes[1].bids.find((bid) => bid.resource_type === 'Food').max_quantity).toBe(9000000);
    expect(writes[1].bids.find((bid) => bid.resource_type === 'Food').max_labor_allocation_per_unit).toBe(
        333334,
    );
    expect(await page.evaluate(() => productionCanvas === document.querySelector('.world-canvas'))).toBe(
        true,
    );
    await page.screenshot({ path: 'test-results/client/economic-production.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(quantity).toBeVisible();
    await expect(quantitySlider).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: 'test-results/client/economic-production-mobile.png' });
    expect(errors).toEqual([]);
});
