import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';

test.beforeEach(async ({ page }) => prepareHud(page));

async function refresh(page) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function remember(page, selectors) {
    await page.evaluate((selectors) => {
        window.panelNodes = selectors.map((selector) => document.querySelector(selector));
        window.panelSelectors = selectors;
    }, selectors);
}
async function stable(page) {
    expect(
        await page.evaluate(() =>
            panelNodes.every((node, i) => node && node === document.querySelector(panelSelectors[i])),
        ),
    ).toBe(true);
}

test('Economy keeps its instance, inputs, focus, expansion and scroll as confirmed budget changes', async ({
    page,
}) => {
    let release;
    let held = null;
    let reads = 0;
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', async (route) => {
        reads++;
        if (held) await held;
        await route.fulfill({ json: data });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/client?game_id=1#/economy');
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    const food = page.locator('[data-production-resource="Food"]');
    const input = food.getByRole('spinbutton').first();
    await input.fill('7.25');
    await page.locator('.planner-breakdown > summary').click();
    await input.focus();
    await remember(page, [
        '.game-workspace',
        '.production-planner',
        '[data-production-resource="Food"] input[type="number"]',
        '.planner-breakdown',
    ]);
    const beforeScroll = await page.locator('.game-workspace').evaluate((element) => element.scrollTop);
    held = new Promise((resolve) => {
        release = resolve;
    });
    data.budget.production.Food = 9;
    await refresh(page);
    await expect.poll(() => reads).toBe(2);
    await expect(page.getByRole('button', { name: 'Apply production plan' })).toBeEnabled();
    await expect(input).toBeFocused();
    held = null;
    release();
    await expect(food).toContainText('9 →');
    const budget = page.getByRole('heading', { name: 'Resource budget' }).locator('..').locator('..');
    await expect(budget.getByRole('row').filter({ hasText: 'Food' })).toContainText('9');
    await expect(input).toHaveValue('7.25');
    await expect(input).toBeFocused();
    await expect(page.locator('.planner-breakdown')).toHaveAttribute('open', '');
    expect(await page.locator('.game-workspace').evaluate((element) => element.scrollTop)).toBe(beforeScroll);
    await stable(page);
    expect(errors).toEqual([]);
});

test('shared help supports hover, keyboard, Escape, tap and narrow overflow; errors stay short', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/client?game_id=1');
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="deploy"]').click();
    const help = page.getByRole('button', { name: 'Help: Deploy', exact: true });
    await help.hover();
    await expect(page.locator('.ui-tooltip:popover-open')).toContainText('Choose a type');
    await help.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-tooltip:popover-open')).toHaveCount(0);
    await expect(page.locator('.world-command-dock')).toBeVisible();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('156');
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('99');
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    const message = page.locator('.world-command-message .ui-message-text');
    await expect(message).toHaveText('Cannot place here.');
    await message.focus();
    await expect(page.locator('.ui-tooltip:popover-open')).toContainText('100-unit draft limit');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await help.click();
    await expect(page.locator('.ui-tooltip:popover-open')).toContainText('Choose a type');
    const rect = await page.locator('.ui-tooltip:popover-open').boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'test-results/client/help-tooltip-mobile.png' });
    await page.locator('.world-command-dock').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.ui-tooltip:popover-open')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('Military updates orders and deployment lists while keeping selection, quantity and canvas', async ({
    page,
}) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/client?game_id=1#/military');
    await page.getByLabel('Select division 11', { exact: true }).check();
    const input = page.getByLabel('Division quantity', { exact: true });
    await input.fill('4');
    await input.focus();
    await remember(page, [
        '.game-workspace',
        '.world-canvas',
        'input[aria-label="Division quantity"]',
        'input[aria-label="Select division 11"]',
    ]);
    data.divisions[0].order = { order_type: 'Raid', target_territory_id: 157 };
    data.deployments = [{ deployment_id: 91, division_type: 'Infantry', territory_id: 156 }];
    await refresh(page);
    await expect(page.getByRole('button', { name: 'Cancel deployment #91' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: '#11 Infantry' })).toContainText('Raid');
    await expect(input).toHaveValue('4');
    await expect(input).toBeFocused();
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeChecked();
    await stable(page);
    data.divisions = data.divisions.filter((division) => division.division_id !== 11);
    await refresh(page);
    await expect(page.getByLabel('Select division 11', { exact: true })).toHaveCount(0);
    await expect(page.locator('.game-message')).toContainText('Some selected units are no longer available');
    await expect(input).toHaveValue('4');
    await expect(input).toBeFocused();
    expect(errors).toEqual([]);
});

test('Nation updates readiness and metrics without remounting', async ({ page }) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    data.identity.stats = [];
    data.nation.stats = [];
    data.leaders = [];
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await page.goto('/client?game_id=1#/nation');
    await expect(page.getByText('Planning orders', { exact: true })).toBeVisible();
    await remember(page, [
        '.game-workspace',
        '.game-workspace .ui-card-strip',
        '.game-workspace .game-table',
    ]);
    data.nation.is_ready_for_next_turn = true;
    data.deployments = [{ deployment_id: 1, territory_id: 156, division_type: 'Infantry' }];
    await refresh(page);
    await expect(page.getByText('Ready for next turn', { exact: true })).toBeVisible();
    await expect(
        page.locator('.ui-metric').filter({ hasText: 'Pending deployments' }).locator('.ui-metric-value'),
    ).toHaveText('1');
    await stable(page);
});

test('territory inspector keeps disclosure and focus, updates production and clears lost owner details', async ({
    page,
}) => {
    const territories = structuredClone(fixtures('/territories/turn-infos'));
    const own = structuredClone(fixtures('/nation/territories/turn-infos'));
    await page.route('**/territories/turn-infos?*', (route) => route.fulfill({ json: territories }));
    await page.route('**/nation/territories/turn-infos?*', (route) => route.fulfill({ json: own }));
    await page.goto('/client?game_id=1#/world?territory=156');
    const panel = page.locator('.inspector-panel');
    await expect(panel.locator('h3')).toHaveText('Aster Reach');
    await panel.locator('.territory-connections summary').click();
    await panel.locator('.territory-connections summary').focus();
    await remember(page, [
        '.inspector-panel .feature-slot',
        '.inspector-panel .territory-connections',
        '.inspector-panel .territory-connections summary',
    ]);
    territories.data.find((t) => t.territory_id === 156).owner_production.Oil = 7;
    await refresh(page);
    await expect(panel.locator('dl div').filter({ hasText: 'Oil' }).locator('dd')).toHaveText('7');
    await expect(panel.locator('.territory-connections')).toHaveAttribute('open', '');
    await expect(panel.locator('.territory-connections summary')).toBeFocused();
    await stable(page);
    territories.data.find((t) => t.territory_id === 156).owner_nation_id = 8;
    own.data = own.data.filter((t) => t.territory_id !== 156);
    await refresh(page);
    await expect(panel.locator('.ownership')).toHaveText('The Northern Compact');
    await expect(panel.getByRole('heading', { name: 'Owner information' })).toHaveCount(0);
    await stable(page);
});

test('world force and order panels retain their controls during background data changes', async ({
    page,
}) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await page.goto('/client?game_id=1');
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="forces"]').click();
    await page.getByLabel('Select division 11', { exact: true }).check();
    await page.getByText('More actions', { exact: true }).click();
    await page.getByLabel('Select division 11', { exact: true }).focus();
    await remember(page, [
        '.world-command-dock .ui-panel',
        'input[aria-label="Select division 11"]',
        '.world-command-dock details',
    ]);
    data.divisions[0].order = { order_type: 'Raid', target_territory_id: 157 };
    await refresh(page);
    await expect(page.locator('.world-unit-row').first()).toContainText('Raid');
    await expect(page.locator('.world-command-dock details')).toHaveAttribute('open', '');
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeFocused();
    await stable(page);
    await page.locator('[data-tool="orders"]').click();
    await page.locator('.pending-order-group summary').click();
    await page.getByRole('button', { name: 'Cancel order #11', exact: true }).focus();
    await remember(page, ['.world-command-dock .ui-panel', '[data-order-key="division-11"]']);
    data.divisions[0].order.target_territory_id = 158;
    await refresh(page);
    await expect(page.locator('.world-command-dock')).toContainText('Cinder Vale');
    await expect(page.getByRole('button', { name: 'Cancel order #11', exact: true })).toBeFocused();
    await stable(page);
});

test('Reports refresh in place and preserve selected turn and expanded nation', async ({ page }) => {
    let news = 'First report.';
    let pause,
        release,
        reads = 0;
    const identities = fixtures('/game/identities');
    identities.nations = identities.nations.map((nation) => ({ ...nation, stats: [] }));
    await page.route('**/game/identities', (route) => route.fulfill({ json: identities }));
    await page.route('**/game/news', async (route) => {
        reads++;
        if (pause) await pause;
        await route.fulfill({ json: [{ content: news }] });
    });
    await page.route('**/game/rankings', (route) => route.fulfill({ json: [] }));
    await page.route('**/game/victory-status', (route) =>
        route.fulfill({ json: { goals: [], progressions: [], winner_nation_id: null } }),
    );
    await page.goto('/client?game_id=1#/reports');
    await expect(page.locator('.report-text')).toHaveText('First report.');
    const summary = page.locator('.game-workspace summary').first();
    await summary.click();
    await page.getByLabel('Battle report turn').focus();
    await remember(page, [
        '.game-workspace',
        'input[aria-label="Battle report turn"]',
        '.game-workspace details',
    ]);
    news = 'Updated report.';
    const previousReads = reads;
    pause = new Promise((resolve) => {
        release = resolve;
    });
    await refresh(page);
    await expect.poll(() => reads).toBeGreaterThan(previousReads);
    await expect(page.getByRole('button', { name: 'Load battle turn' })).toBeEnabled();
    pause = null;
    release();
    await expect(page.locator('.report-text')).toHaveText('Updated report.');
    await expect(page.locator('.game-workspace details').first()).toHaveAttribute('open', '');
    await expect(page.getByLabel('Battle report turn')).toBeFocused();
    await stable(page);
    await summary.focus();
    identities.nations[0].formal_name = 'Updated formal name';
    await refresh(page);
    await expect(page.locator('.game-workspace')).toContainText('Updated formal name');
    await expect(summary).toBeFocused();
    await expect(page.locator('.game-workspace details').first()).toHaveAttribute('open', '');
    await stable(page);
});

test('Reports identify battle attackers, defenders and neutral territories at a glance', async ({ page }) => {
    const identities = fixtures('/game/identities', 1);
    await page.route('**/game/identities', (route) => route.fulfill({ json: identities }));
    await page.route('**/game/news', (route) => route.fulfill({ json: fixtures('/game/news', 2) }));
    await page.goto('/client?game_id=1#/reports');

    const news = page.getByRole('heading', { name: 'News · current turn 1' }).locator('..').locator('..');
    const events = news.locator('.report-event');
    await expect(events).toHaveCount(2);
    await expect(events.first().locator('.report-identity-flag')).toHaveCount(2);
    await expect(events.first()).toContainText('The Aurelian UnionconqueredThe Northern Compact');
    await expect(events.nth(1).locator('.report-neutral-flag')).toHaveText('🏴‍☠️');
    await expect(events.nth(1)).toContainText('Neutral');
    await expect(events.nth(1)).toContainText('Cinder Vale');

    const colors = await events
        .first()
        .locator('.report-identity')
        .evaluateAll((nodes) =>
            nodes.map((node) => getComputedStyle(node).getPropertyValue('--identity-color').trim()),
        );
    expect(colors).toEqual(['#d94b57', '#428ee8']);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('long server errors stay available as safe text while the visible error is short', async ({ page }) => {
    const detail =
        'The requested quantity exceeds available labour. <img src=x onerror="window.badTooltip=true"> Keep this complete diagnostic available.';
    await page.route('**/nation/production-plan', (route) =>
        route.fulfill({ status: 422, json: { message: 'Invalid bid', errors: { max_quantity: [detail] } } }),
    );
    await page.goto('/client?game_id=1#/economy');
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    const food = page.locator('[data-production-resource="Food"]');
    await food.getByRole('spinbutton').first().fill('7');
    await page.getByRole('button', { name: 'Apply production plan' }).click();
    const status = page.locator('.planner-footer .ui-message-text');
    await expect(status).toHaveText('Production plan rejected.');
    await status.focus();
    await expect(page.locator('.ui-tooltip:popover-open')).toContainText(detail);
    expect(await page.evaluate(() => window.badTooltip)).toBeUndefined();
    await expect(page.locator('.ui-tooltip:popover-open img')).toHaveCount(0);
    await expect(food.getByRole('spinbutton').first()).toHaveValue('7');
});

test('turn advancement keeps the Economy instance and discards the previous turn bid draft', async ({
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
    await page.goto('/client?game_id=1#/economy');
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    const input = page.locator('[data-production-resource="Food"]').getByRole('spinbutton').first();
    await input.fill('7');
    await remember(page, [
        '.game-workspace',
        '.production-planner',
        '[data-production-resource="Food"] input[type="number"]',
    ]);
    turn = 2;
    await refresh(page);
    await expect(page.locator('.game-heading .eyebrow')).toContainText('Turn 2');
    await expect(input).toHaveValue('3');
    await stable(page);
});
