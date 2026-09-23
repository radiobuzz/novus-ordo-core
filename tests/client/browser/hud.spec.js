import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';

async function enter(page) {
    await page.goto('/client?game_id=1');
    await expect(page.getByRole('dialog', { name: 'Turn 1 · Briefing' })).toBeVisible();
    await expect(page.locator('.briefing-reports')).toContainText('Aurelian');
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await expect(page.locator('.world-canvas')).toBeVisible();
}
async function refresh(page) {
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
}

test('compact header, budget detail, menu, layers and minimap preserve the map', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await enter(page);
    await expect(page.locator('a[href="/dashboard"]')).toHaveCount(0);
    await expect(page.locator('.game-hud > .hud-mark + .game-menu + .hud-navigation')).toBeVisible();
    await expect(page.locator('.hud-navigation-link')).toHaveCount(5);
    await expect(page.locator('.game-hud > button', { hasText: 'Games' })).toHaveCount(0);
    await page.getByLabel('Game menu', { exact: true }).click();
    await expect(
        page.locator('.game-menu').getByRole('button', { name: 'Games', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.game-menu').getByRole('button', { name: 'Nation colours' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect((await page.locator('.game-hud').boundingBox()).height).toBeLessThan(80);
    await page.evaluate(() => {
        window.mapBefore = document.querySelector('.world-canvas');
        window.miniBefore = document.querySelector('.minimap-canvas');
    });
    const box = await page.locator('.world-canvas').boundingBox();
    await page.locator('[data-resource="Capital"] summary').click();
    await expect(page.locator('[data-resource="Capital"] dl')).toContainText('Reserve held20');
    await expect(page.locator('[data-resource="Food"] summary')).toContainText('-2/turn');
    await expect(page.locator('[data-resource="RecruitmentPool"] summary')).toContainText('No reserve');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-resource="Capital"] summary')).toBeFocused();
    await page.locator('.hud-readiness summary').click();
    await expect(page.locator('.hud-readiness')).toContainText('The Northern Compact');
    await page.keyboard.press('Escape');
    await page.locator('.hud-layers summary').click();
    await page.getByLabel('Territory names', { exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Collapse minimap' }).click();
    await expect(page.locator('.minimap-canvas')).toBeHidden();
    expect(await page.locator('.world-canvas').boundingBox()).toEqual(box);
    await page.getByRole('button', { name: 'Expand minimap' }).click();
    expect(
        await page.evaluate(
            () =>
                mapBefore === document.querySelector('.world-canvas') &&
                miniBefore === document.querySelector('.minimap-canvas'),
        ),
    ).toBe(true);
    await refresh(page);
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
    await page.getByRole('button', { name: 'Collapse minimap' }).click();
    await page.reload();
    await expect(page.locator('.world-canvas')).toBeVisible();
    await expect(page.locator('.minimap-canvas')).toBeHidden();
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
    expect(errors).toEqual([]);
});

test('one-click Ready advances once and opens the new turn results once', async ({ page }) => {
    let turn = 1,
        writes = 0;
    for (const pattern of [
        '**/game',
        '**/game/ready-status',
        '**/client/gameplay',
        '**/territories/turn-infos?*',
        '**/game/identities',
        '**/game/news',
        '**/nation/battle-logs?*',
    ])
        await page.route(pattern, (route) =>
            route.fulfill({ json: fixtures(new URL(route.request().url()).pathname, turn) }),
        );
    await page.route('**/ready-for-next-turn', (route) => {
        writes++;
        turn = 2;
        return route.fulfill({ status: 204 });
    });
    page.on('dialog', () => {
        throw new Error('Ready must not confirm');
    });
    await enter(page);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Turn 2 · Briefing' })).toBeVisible();
    await expect(page.locator('.briefing-summary')).toContainText('+2,500');
    await expect(page.locator('.briefing-summary')).toContainText('2 Infantry');
    await expect(page.locator('.briefing-reports')).toContainText('Victory');
    const events = page.locator('.briefing-reports .report-event');
    await expect(events).toHaveCount(2);
    await expect(events.first().locator('.report-identity-flag')).toHaveCount(2);
    await expect(events.first()).toContainText('The Aurelian UnionconqueredThe Northern Compact');
    await expect(events.nth(1)).toContainText('The Aurelian Union');
    await expect(events.nth(1)).toContainText('was repelled by');
    await expect(events.nth(1)).toContainText('Neutral');
    await expect(events.nth(1).locator('.report-neutral-flag')).toHaveText('🏴‍☠️');
    await expect(events.nth(1)).toContainText('Cinder Vale');
    expect(writes).toBe(1);
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await refresh(page);
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
});

test('briefing failures are retryable reads and news content is rendered safely', async ({ page }) => {
    let fail = true,
        writes = 0;
    page.on('request', (r) => {
        if (r.method() === 'POST') writes++;
    });
    await page.route('**/game/news', (route) =>
        fail
            ? route.abort()
            : route.fulfill({
                  json: [{ content: '<img src=x onerror="alert(1)"> ##nation#7#usual_name##' }],
              }),
    );
    await page.goto('/client?game_id=1');
    await expect(page.locator('.turn-briefing')).toContainText('Reports could not be confirmed');
    fail = false;
    await page.getByRole('button', { name: 'Retry news' }).click();
    await expect(page.locator('.briefing-reports')).toContainText('<img src=x');
    await expect(page.locator('.briefing-reports img')).toHaveCount(0);
    expect(writes).toBe(0);
});

test('header fits narrow French layout and disclosures work by keyboard', async ({ page }) => {
    await enter(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Menu du jeu', { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Prêt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Réduire la minicarte' }).click();
    await expect(page.locator('.minimap-canvas')).toBeHidden();
    await page.getByRole('button', { name: 'Développer la minicarte' }).click();
    await expect(page.locator('.minimap-canvas')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/no7-hud-pass-ZKKVld/mobile.png' });
    await page.locator('[data-resource="Oil"] summary').focus();
    await page.keyboard.press('Enter');
    const box = await page.locator('[data-resource="Oil"] .ui-disclosure-content').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '/tmp/no7-hud-pass-ZKKVld/desktop.png' });
});

test('open resource details update in place and no stale private report survives session loss', async ({
    page,
}) => {
    let data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await enter(page);
    await page.locator('[data-resource="Capital"] summary').click();
    await page.evaluate(() => {
        window.resourceTrigger = document.activeElement;
    });
    data.budget.balances.Capital = -1234.5678;
    data.budget.expenses.Capital = 1244.5678;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('[data-resource="Capital"] dd').first()).toHaveText('-1,234.5678');
    expect(
        await page.evaluate(() => resourceTrigger === document.activeElement && resourceTrigger.isConnected),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'News', exact: true }).click();
    await expect(page.locator('.briefing-reports')).toContainText('Aurelian');
    await page.route('**/user', (route) =>
        route.fulfill({ status: 401, json: { message: 'Unauthenticated' } }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
    await expect(page.locator('.briefing-reports')).toBeEmpty();
    await expect(page.locator('.hud-resources')).toBeEmpty();
});

test('closing a slow briefing discards its response and repeat open/close releases resources', async ({
    page,
}) => {
    await enter(page);
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'News', exact: true }).click();
        await expect(page.locator('.turn-briefing > p')).toContainText('Results from the transition');
        await page.getByRole('button', { name: 'Continue playing' }).click();
    }
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
    let release;
    const waiting = new Promise((resolve) => {
        release = resolve;
    });
    await page.route('**/game/news', async (route) => {
        await waiting;
        await route.fulfill({ json: [{ content: 'Late stale headline' }] });
    });
    const requested = page.waitForRequest('**/game/news');
    await page.getByRole('button', { name: 'News', exact: true }).click();
    await requested;
    await page.getByRole('button', { name: 'Continue playing' }).click();
    release();
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
    await expect(page.locator('.briefing-reports')).not.toContainText('Late stale headline');
});
