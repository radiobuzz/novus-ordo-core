import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
test.beforeEach(async ({ page }) => prepareHud(page));
async function refresh(page) {
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
}
test('public owner portrait, compact productivity and defense update without replacing the inspector', async ({
    page,
}) => {
    const territories = fixtures('/territories/turn-infos');
    const chosen = territories.data.find((t) => t.territory_id === 156);
    chosen.base_productivity = { Food: 4, Oil: 1 };
    chosen.production_population_unit = 1000000;
    let leaders = [
        {
            nation_id: 7,
            name: 'Ada <Leader>',
            title: 'President',
            picture_src: '/res/bundled/entry/hires.png',
        },
    ];
    await page.route('**/territories/turn-infos?*', (route) => route.fulfill({ json: territories }));
    await page.route('**/game/identities', (route) =>
        route.fulfill({ json: { ...fixtures('/game/identities'), leaders } }),
    );
    await page.goto('/client?game_id=1#/world?territory=156');
    const panel = page.locator('.inspector-panel');
    await expect(panel.locator('h3')).toHaveText('Aster Reach');
    await panel.locator('.nation-inspector summary').click();
    await expect(panel.locator('.nation-inspector')).toContainText('President Ada <Leader>');
    await expect(panel.locator('.nation-portrait')).toBeVisible();
    await expect
        .poll(() => panel.locator('.nation-portrait').evaluate((img) => img.complete && img.naturalWidth > 0))
        .toBe(true);
    await panel.locator('.productivity-details summary').click();
    await expect(panel.locator('.productivity-details')).toContainText('Loyal population: 0.04 million');
    await expect(panel.locator('.productivity-details')).toContainText('4×');
    await expect(panel.locator('.defense-summary')).toContainText('Projected defense before battles:');
    await panel.locator('.nation-portrait').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/client/stage4-owner.png' });
    await page.evaluate(() => (window.originalInspector = document.querySelector('.nation-inspector')));
    chosen.base_productivity.Food = 2;
    await refresh(page);
    await expect(panel.locator('.productivity-details')).toContainText('2×');
    expect(await page.evaluate(() => originalInspector === document.querySelector('.nation-inspector'))).toBe(
        true,
    );
    await expect(panel.locator('.nation-inspector')).toHaveAttribute('open', '');
    chosen.owner_nation_id = 8;
    leaders = [{ nation_id: 8, name: 'Second leader', title: 'General', picture_src: null }];
    await page.route('**/territories/156/turn-info?*', (route) => route.fulfill({ json: chosen }));
    await refresh(page);
    await expect(panel.locator('.nation-inspector')).toContainText('General Second leader');
    await expect(panel.locator('.nation-portrait')).toBeHidden();
    await expect(panel.locator('.defense-summary')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/stage4-territory.png' });
});
test('selected force power is visible and follows selection in World and Military', async ({ page }) => {
    await page.goto('/client?game_id=1#/world');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="forces"]').click();
    await page.getByLabel('Select all shown units', { exact: true }).check();
    const count = fixtures('/client/gameplay').divisions.length;
    await expect(page.locator('.world-command-dock .force-summary')).toContainText(
        `Selected attack: ${count * 30}`,
    );
    await page.getByLabel('Select all shown units', { exact: true }).uncheck();
    await expect(page.locator('.world-command-dock .force-summary')).toContainText('Selected attack: 0');
    await page.goto('/client?game_id=1#/military');
    await page.getByLabel('Select all divisions', { exact: true }).check();
    await expect(page.locator('.force-summary')).toContainText(`Selected attack: ${count * 30}`);
});
test('background turn attention flashes, acknowledges on return, and cleans up on game exit', async ({
    page,
}) => {
    await page.clock.install();
    let turn = 1;
    await page.addInitScript(() => {
        window.testHidden = false;
        Object.defineProperty(document, 'hidden', { get: () => window.testHidden });
    });
    for (const path of [
        '/game',
        '/game/ready-status',
        '/user/nation-setup-status',
        '/client/gameplay',
        '/game/identities',
        '/nation/territories/turn-infos',
        '/territories/turn-infos',
    ]) {
        await page.route(
            (url) => url.pathname === path,
            (route) => route.fulfill({ json: fixtures(path, turn) }),
        );
    }
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    const original = await page.locator('link[rel="icon"]').getAttribute('href');
    await page.evaluate(() => (window.testHidden = true));
    await refresh(page);
    await expect(page.locator('[data-turn-attention]')).toHaveCount(0);
    turn = 2;
    await refresh(page);
    const attention = page.locator('[data-turn-attention]');
    await expect(attention).toHaveCount(1);
    const frame = await attention.getAttribute('href');
    await page.clock.runFor(1100);
    await expect(attention).not.toHaveAttribute('href', frame);
    await page.evaluate(() => {
        window.testHidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(attention).toHaveCount(0);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', original);
    const news = page.getByRole('button', { name: 'Continue playing', exact: true });
    if (await news.isVisible()) await news.click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => (window.testHidden = true));
    turn = 3;
    await refresh(page);
    await expect(attention).toHaveCount(1);
    const still = await attention.getAttribute('href');
    await page.clock.runFor(2200);
    await expect(attention).toHaveAttribute('href', still);
    if (await news.isVisible()) await news.click();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByRole('button', { name: 'Games', exact: true }).click();
    await expect(attention).toHaveCount(0);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', original);
});
