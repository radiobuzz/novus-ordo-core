import { test, expect } from '@playwright/test';
import { prepareHud } from './hud-helpers.js';
import { fixtures } from '../fixtures.js';

test('Apache-style signal displays processing before the last Ready response returns', async ({ page }) => {
    await prepareHud(page);
    let turn = 1,
        processing = false,
        checks = 0,
        writes = 0,
        release;
    const held = new Promise((resolve) => {
        release = resolve;
    });
    await page.route('**/var/turn-status/game-1.json?*', (route) => {
        checks++;
        return route.fulfill({
            json: {
                version: 1,
                game_id: 1,
                turn_number: turn,
                state: processing ? 'processing' : 'ready',
                revision: (processing || turn === 2 ? 'b' : 'a').repeat(32),
                updated_at: Date.now(),
            },
        });
    });
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
    ])
        await page.route(pattern, (route) =>
            route.fulfill({ json: fixtures(new URL(route.request().url()).pathname, turn) }),
        );
    await page.route('**/ready-for-next-turn', async (route) => {
        writes++;
        processing = true;
        await held;
        turn = 2;
        processing = false;
        await route.fulfill({ json: fixtures('/game/ready-status', turn) });
    });
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.evaluate(() => {
        window.originalCanvas = document.querySelector('.world-canvas');
    });
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.locator('.turn-transition')).toBeVisible({ timeout: 5000 });
    expect(writes).toBe(1);
    expect(turn).toBe(1);
    const count = checks;
    await expect.poll(() => checks, { timeout: 5000 }).toBeGreaterThan(count);
    await expect(page.locator('.turn-transition')).toBeVisible();
    release();
    await expect(page.locator('.header-context strong')).toHaveText('Turn 2');
    await expect(page.locator('.turn-transition')).not.toBeVisible();
    await expect(page.locator('.turn-briefing')).toBeVisible();
    expect(writes).toBe(1);
    expect(await page.evaluate(() => originalCanvas === document.querySelector('.world-canvas'))).toBe(true);
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    const after = checks;
    await expect.poll(() => checks, { timeout: 5000 }).toBeGreaterThan(after);
    await expect(page.locator('.turn-transition')).not.toBeVisible();
});
