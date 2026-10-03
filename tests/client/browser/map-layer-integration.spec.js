import { test, expect } from '@playwright/test';
import { prepareHud } from './hud-helpers.js';
import { fixtures } from '../fixtures.js';

test('live map layers use actual geographic and territorial payloads and retain display choices', async ({
    page,
}) => {
    await prepareHud(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/client/gameplay', (route) => {
        const nation = fixtures('/client/gameplay');
        nation.economy = {
            territories: [
                {
                    id: 156,
                    population: 42000,
                    state: { infrastructure: 0.65, economic_strength: 0.6, unrest: 0.12, informal: 0.22 },
                },
            ],
            last_season: { territories: [{ id: 156, population: 40000, income: 800, tax: 200 }] },
        };
        return route.fulfill({ json: nation });
    });
    await page.goto('/client?game_id=1');
    await expect(page.getByRole('tab', { name: 'Land & climate', exact: true })).toBeVisible({
        timeout: 30000,
    });
    await page.getByRole('tab', { name: 'Land & climate', exact: true }).click();
    await page.getByLabel('Biomes', { exact: true }).check();
    const categorical = await page.locator('.ml-legend').boundingBox();
    const viewport = await page.locator('.map-viewport').boundingBox();
    expect(categorical.width).toBeLessThanOrEqual(viewport.width - 24);
    await page.getByLabel('Temperature', { exact: true }).check();
    await expect(page.locator('.ml-legend')).toContainText('°C');
    await page.getByRole('tab', { name: 'Population & economy', exact: true }).click();
    await page.getByLabel('Infrastructure', { exact: true }).check();
    await expect(page.locator('.ml-legend')).toContainText('Territorial values');
    await expect(page.locator('.ml-legend')).toContainText('100%');
    await page.getByLabel('Last-season civilian income', { exact: true }).check();
    await expect(page.locator('.ml-legend')).toContainText('800');
    await page.getByRole('tab', { name: 'Resources', exact: true }).click();
    await page.getByLabel('Resource distribution', { exact: true }).check();
    await expect(page.locator('.ml-resource option[value=food]')).toHaveCount(0);
    await page.locator('.ml-resource select').selectOption('oil');
    await expect(page.locator('.ml-legend')).toContainText('Mineral deposits');
    await page.getByRole('tab', { name: 'Display', exact: true }).click();
    await page.locator('.ml-drawer summary').filter({ hasText: 'Base map' }).click();
    await page.getByLabel('Ocean', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Clear analysis', exact: true }).click();
    await expect(page.locator('.ml-legend')).toBeHidden();
    await expect(page.getByLabel('Ocean', { exact: true })).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab', { name: 'Display', exact: true })).toBeFocused();
    await page.screenshot({ path: 'test-results/client/map-layers-live.png' });
    expect(errors).toEqual([]);
});

test('economic layers update through seasons and rollback without replacing the canvas or selection', async ({
    page,
}) => {
    await prepareHud(page);
    let turn = 1,
        revision = 1,
        infrastructure = 0.1;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
    ])
        await page.route(pattern, (route) => {
            const path = new URL(route.request().url()).pathname,
                json = fixtures(path, turn);
            if (path === '/game' || path === '/client/gameplay')
                json.turn_context_revision = String(revision).repeat(32);
            if (path === '/client/gameplay')
                json.economy = {
                    territories: [
                        {
                            id: 156,
                            population: 42000,
                            state: {
                                infrastructure,
                                economic_strength: turn / 10,
                                unrest: 0.1,
                                informal: 0.2,
                            },
                        },
                    ],
                };
            return route.fulfill({ json });
        });
    await page.route('**/var/turn-status/game-1.json?*', (route) =>
        route.fulfill({
            json: {
                version: 1,
                game_id: 1,
                turn_number: turn,
                state: 'ready',
                revision: String(revision).repeat(32),
                updated_at: Date.now(),
            },
        }),
    );
    await page.goto('/client?game_id=1');
    await expect(page.getByRole('tab', { name: 'Population & economy', exact: true })).toBeVisible({
        timeout: 30000,
    });
    await page.getByRole('tab', { name: 'Population & economy', exact: true }).click();
    await page.getByLabel('Infrastructure', { exact: true }).check();
    await page.evaluate(() => {
        location.hash = '#/world?territory=156';
        window.layerCanvas = document.querySelector('.world-canvas');
    });
    await expect(page.locator('.ml-selection')).toContainText('10%');
    await page.getByRole('button', { name: 'Close layers', exact: true }).click();
    for (const next of [2, 3, 1]) {
        turn = next;
        infrastructure = turn / 10;
        revision++;
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('.ml-selection')).toContainText(`${turn * 10}%`, { timeout: 15000 });
        const resume = page.getByRole('button', { name: 'Continue playing', exact: true });
        if (await resume.isVisible()) await resume.click();
        expect(
            await page.evaluate(() => window.layerCanvas === document.querySelector('.world-canvas')),
        ).toBe(true);
        await expect(page.locator('.ml-legend strong')).toContainText('Infrastructure');
    }
    // A revision change at the same turn still republishes current conditions.
    revision++;
    infrastructure = 0.45;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.ml-selection')).toContainText('45%', { timeout: 15000 });
    expect(errors).toEqual([]);
});

test('late Guard reads cannot replace geography; French narrow controls stay usable', async ({ page }) => {
    await prepareHud(page);
    let release;
    const hold = new Promise((r) => (release = r));
    let reads = 0;
    await page.route('**/nation/defense-coverage', async (route) => {
        reads++;
        await hold;
        await route.fulfill({
            json: {
                game_id: 1,
                turn_number: 1,
                territories: [155, 156, 157].map((territory_id) => ({
                    territory_id,
                    guard_defense: 60,
                    guard_divisions: 2,
                })),
            },
        });
    });
    await page.goto('/client?game_id=1');
    await expect(page.getByRole('tab', { name: 'Military', exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('tab', { name: 'Military', exact: true }).click();
    await page.getByLabel('Guard contribution', { exact: true }).check();
    await expect.poll(() => reads).toBe(1);
    await page.getByRole('tab', { name: 'Land & climate', exact: true }).click();
    await page.getByLabel('Elevation', { exact: true }).check();
    release();
    await page.waitForResponse((r) => r.url().includes('/nation/defense-coverage'));
    await expect(page.locator('.ml-legend strong')).toHaveText('Elevation');
    await page.getByRole('button', { name: 'Close layers', exact: true }).click();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByLabel('Language', { exact: true }).selectOption('fr');
    await page.getByLabel('Menu du jeu', { exact: true }).click();
    for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByRole('tab', { name: 'Affichage', exact: true }).click();
        const drawer = page.locator('.ml-drawer');
        await expect(drawer).toBeVisible();
        const box = await drawer.boundingBox();
        expect(box.width).toBeLessThanOrEqual(width);
        expect(box.height).toBeGreaterThan(70);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.getByRole('button', { name: 'Fermer les couches', exact: true }).click();
    }
    await page.screenshot({ path: 'test-results/client/map-layers-live-mobile-fr.png' });
});
