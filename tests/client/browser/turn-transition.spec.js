import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';

test('turn overlay blocks input, survives failed reads, retries and hands over to news without remounting', async ({
    page,
}) => {
    await prepareHud(page);
    let turn = 1,
        fail = false,
        release;
    const held = new Promise((resolve) => {
        release = resolve;
    });
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
    ])
        await page.route(pattern, async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path === '/client/gameplay' && turn === 2) {
                await held;
                if (fail) return route.abort();
            }
            return route.fulfill({ json: fixtures(path, turn) });
        });
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.locator('.world-canvas').focus();
    await page.evaluate(() => {
        window.originalCanvas = document.querySelector('.world-canvas');
    });
    const zoom = await page.locator('.zoom-value').textContent();
    await expect(page.locator('.turn-transition')).not.toBeVisible();
    turn = 2;
    const overlay = page.locator('.turn-transition');
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await expect(overlay).toContainText('A new turn is taking shape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('+');
    await page.locator('[data-mode="military"]').click({ force: true });
    await expect(overlay).toBeVisible();
    await expect(page.locator('.zoom-value')).toHaveText(zoom);
    await expect(page.locator('[data-mode="military"]')).not.toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await overlay.evaluate((el) => el.getBoundingClientRect().width <= innerWidth)).toBe(true);
    expect(
        await page
            .locator('.turn-transition-orbit')
            .evaluate((el) => getComputedStyle(el, '::before').animationName),
    ).toBe('none');
    await expect(overlay).toContainText('taking longer than usual', { timeout: 17000 });
    await expect(overlay.getByRole('button', { name: 'Retry loading' })).toBeEnabled();
    fail = true;
    release();
    await expect(overlay).toContainText('couldn’t load the new turn');
    await expect(overlay.getByRole('button', { name: 'Retry loading' })).toBeEnabled();
    fail = false;
    await overlay.getByRole('button', { name: 'Retry loading' }).click();
    await expect(overlay).not.toBeVisible();
    await expect(page.locator('.turn-briefing')).toBeVisible();
    await expect(page.locator('.header-context strong')).toHaveText('Turn 2');
    expect(await page.evaluate(() => originalCanvas === document.querySelector('.world-canvas'))).toBe(true);
});
