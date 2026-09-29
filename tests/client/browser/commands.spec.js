import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
test.beforeEach(async ({ page }) => prepareHud(page));

async function start(page) {
    await page.goto('/client?game_id=1');
    await expect(page.locator('[data-resource="money"] dd').last()).toHaveText('30', { timeout: 30000 });
    await expect(page.locator('.world-directory')).toBeHidden();
    await page.locator('[data-mode="military"]').click();
}

test('map-first modes, stack selection, minimap and explicit deployment', async ({ page }) => {
    const errors = [],
        writes = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
        if (r.method() === 'POST') writes.push(r.postDataJSON());
    });
    await start(page);
    const map = page.locator('.world-canvas');
    const original = await map.boundingBox();
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('.ui-image-choice')).toHaveCount(5);
    await expect(page.locator('[data-unit-type="Infantry"]')).toContainText('Max affordable: 10');
    expect(await map.boundingBox()).toEqual(original);
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await page.getByText('Place using a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('156');
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('11');
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeDisabled();
    await page.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirm deployment', exact: true })).toBeEnabled();
    expect(writes).toHaveLength(0);
    await page.route('**/nation/territories/deployments', (route) =>
        route.fulfill({ status: 201, json: {} }),
    );
    await page.getByRole('button', { name: 'Confirm deployment', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('Command accepted');
    expect(writes).toHaveLength(1);
    expect(writes[0].deployments).toEqual([
        { division_type: 'Infantry', territory_id: 156 },
        { division_type: 'Infantry', territory_id: 156 },
    ]);
    expect(writes[0].client_context.game_id).toBe(1);
    await page.locator('.world-command-dock').getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => (location.hash = '#/world?territory=156'));
    await expect(page.getByLabel('Select division 11', { exact: true })).toBeVisible();
    await page.getByLabel('Select division 11', { exact: true }).check();
    await page.getByRole('button', { name: 'Move / attack', exact: true }).click();
    await page.getByText('Choose from a list', { exact: true }).click();
    await page.getByLabel('Destination territory', { exact: true }).selectOption('157');
    await expect(
        page.getByRole('button', {
            name: 'Send move / attack orders',
            exact: true,
        }),
    ).toBeEnabled();
    expect(writes).toHaveLength(1);
    await page.locator('[data-mode="geopolitical"]').click();
    await expect(page.locator('.inspector-panel h3')).toHaveText('Aster Reach');
    await expect(page.locator('.world-command-dock')).toBeHidden();
    await expect(page.locator('.minimap-canvas')).toBeVisible();
    expect(await map.boundingBox()).toEqual(original);
    await page.locator('.minimap-canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    expect(errors).toEqual([]);
});

test('counted unit stacks, icon toolbar and mobile map picking keep commands compact', async ({ page }) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    data.divisions = [21, 22, 23].map((division_id) => ({
        division_id,
        division_type: 'Artillery',
        territory_id: 156,
        order: null,
    }));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await start(page);
    await page.locator('[data-tool="forces"]').click();
    const group = page.locator('.world-unit-group');
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('3 × Artillery');
    await expect(group.locator('.world-unit-count')).toHaveText('3');
    await page.getByLabel('Select 3 Artillery units', { exact: true }).check();
    const toolbar = page.getByRole('toolbar');
    for (const name of [
        'Move / attack',
        'Cancel selected orders',
        'Deploy',
        'Guard selected units',
        'Disband selected units',
    ])
        await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(
        toolbar.getByRole('button', {
            name: 'Guard selected units',
            exact: true,
        }),
    ).toHaveAttribute('data-icon', 'shield');
    await expect(
        toolbar.getByRole('button', {
            name: 'Disband selected units',
            exact: true,
        }),
    ).toHaveAttribute('data-icon', 'scrap');
    await page.screenshot({
        path: 'test-results/client/compact-selection-desktop.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await toolbar.getByRole('button', { name: 'Move / attack', exact: true }).click();
    const dock = page.locator('.world-command-dock');
    await expect(dock).toHaveAttribute('data-picking', 'true');
    await expect(dock.locator('.mobile-pick-prompt')).toHaveText('Choose a destination on the map');
    expect((await dock.boundingBox()).height).toBeLessThanOrEqual(110);
    await page.screenshot({
        path: 'test-results/client/compact-orders-picking-mobile.png',
    });
    await page.evaluate(() => {
        location.hash = '#/world?territory=157';
    });
    await expect(dock).toHaveAttribute('data-picking', 'false');
    await expect(dock).toContainText('3 of 3 units can reach Boreal March');
    await expect(dock.locator('.world-route-details')).not.toHaveAttribute('open', '');
    await dock.locator('.world-route-details > summary').click();
    await expect(dock.locator('.world-route-details')).toContainText('3 ×');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
        path: 'test-results/client/compact-orders-mobile.png',
    });
});

test('Guard follows the game flag and submits selected division IDs', async ({ page }) => {
    let submitted;
    await page.route('**/nation/divisions/guard-orders', async (route) => {
        submitted = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { data: [] } });
    });
    await start(page);
    await page.locator('[data-tool="forces"]').click();
    await page.getByLabel('Select division 11', { exact: true }).check();
    await page
        .getByRole('toolbar')
        .getByRole('button', { name: 'Guard selected units', exact: true })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Guard selected units' });
    await expect(dialog).toContainText('Readiness costs 25% of normal operations');
    await expect(dialog).toContainText('responding brings that turn’s cost to 100%');
    await expect(dialog).toContainText('Releasing them later requires one stand-down turn.');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.locator('.world-command-message')).toContainText('Command accepted');
    expect(submitted.division_ids).toEqual([11]);
    expect(submitted.client_context.game_id).toBe(1);
});

test('Guard stays absent when the game rule is disabled', async ({ page }) => {
    await page.route('**/game', (route) =>
        route.fulfill({ json: { ...fixtures('/game'), guard_enabled: false } }),
    );
    await start(page);
    await page.locator('[data-tool="forces"]').click();
    await page.getByLabel('Select division 11', { exact: true }).check();
    await expect(page.getByRole('button', { name: 'Guard selected units', exact: true })).toHaveCount(0);
    await expect(
        page.getByRole('toolbar').getByRole('button', {
            name: 'Disband selected units',
            exact: true,
        }),
    ).toBeVisible();
});

test('Layers menu keeps military history and unit detail controls together', async ({ page }) => {
    await start(page);
    await page.getByRole('tab', { name: 'Military', exact: true }).click();
    const layers = page.locator('.ml-drawer');
    await expect(layers.getByText('Military', { exact: true })).toBeVisible();
    const units = layers.getByLabel('Show units', { exact: true });
    const battles = layers.getByLabel('Show last-turn battles', {
        exact: true,
    });
    const details = layers.getByLabel('Show unit details', { exact: true });
    const muted = layers.getByLabel('Mute foreign colours', { exact: true });
    await expect(units).toBeChecked();
    await expect(battles).not.toBeChecked();
    await expect(details).not.toBeChecked();
    await expect(muted).not.toBeChecked();
    await units.uncheck();
    await battles.check();
    await details.check();
    await muted.check();
    await expect
        .poll(() =>
            page.evaluate(() => {
                const values = Object.values(localStorage).map((value) => {
                    try {
                        return JSON.parse(value)?.value;
                    } catch {
                        return null;
                    }
                });
                return values.some(
                    (value) =>
                        value?.military?.showUnits === false &&
                        value?.military?.lastTurnBattles &&
                        value?.military?.unitDetails &&
                        value?.military?.muteForeignColors,
                );
            }),
        )
        .toBe(true);
});

test('analysis overlays show defence, population, production and loyalty values', async ({ page }) => {
    await page.route('**/nation/defense-coverage', (route) =>
        route.fulfill({
            json: {
                game_id: 1,
                turn_number: 1,
                territories: [
                    { territory_id: 155, guard_defense: 0, guard_divisions: 0 },
                    {
                        territory_id: 156,
                        guard_defense: 90,
                        guard_divisions: 3,
                    },
                    {
                        territory_id: 157,
                        guard_defense: 30,
                        guard_divisions: 1,
                    },
                ],
            },
        }),
    );
    await start(page);
    await page.getByRole('tab', { name: 'Military', exact: true }).click();
    await page.getByLabel('Defense strength', { exact: true }).check();
    const legend = page.locator('.ml-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Defense strength');
    await expect(legend).toContainText('0 points');
    await expect(legend).toContainText('150+ points');
    await page.evaluate(() => (location.hash = '#/world?territory=156'));
    const dock = page.locator('.world-command-dock');
    await expect(dock).toContainText('Potential defence for one attack: 150');
    await expect(dock).toContainText('Base 60 · Reachable Guard 90 (3 units)');
    await expect(legend).toContainText('Aster Reach · 150 points');
    await page.screenshot({ path: 'test-results/client/defense-heatmap.png' });

    await page.getByRole('tab', { name: 'Population & economy', exact: true }).click();
    await page.getByLabel('Population density', { exact: true }).check();
    await expect(legend).toContainText('Population density');
    await expect(legend).toContainText('Aster Reach · 2.8 people/km²');

    await page.getByLabel('Planned resource output', { exact: true }).check();
    await expect(page.getByLabel('Resource', { exact: true })).toBeVisible();
    await page.getByLabel('Resource', { exact: true }).selectOption('oil');
    await expect(legend).toContainText('Planned resource output · Oil');
    await expect(legend).toContainText('Aster Reach · 42,000,000 units/season');

    await page.getByRole('tab', { name: 'Politics', exact: true }).click();
    await page.getByLabel('Loyalty', { exact: true }).check();
    await expect(legend).toContainText('Loyalty');
    await expect(legend).toContainText('Aster Reach · 85%');
    await expect
        .poll(() =>
            page.evaluate(() =>
                Object.values(localStorage).some((value) => {
                    try {
                        const saved = JSON.parse(value)?.value;
                        return saved?.mapLayers?.type === 'loyalty';
                    } catch {
                        return false;
                    }
                }),
            ),
        )
        .toBe(true);
});

test('unit filters include, exclude and keep hidden units out of selection', async ({ page }) => {
    const data = structuredClone(fixtures('/client/gameplay'));
    data.divisions = [
        {
            division_id: 21,
            division_type: 'Infantry',
            territory_id: 156,
            order: null,
        },
        {
            division_id: 22,
            division_type: 'Armored',
            territory_id: 156,
            order: { order_type: 'Guard' },
        },
        {
            division_id: 23,
            division_type: 'Fighter',
            territory_id: 157,
            order: { order_type: 'Move', destination_territory_id: 156 },
        },
    ];
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: data }));
    await start(page);
    await page.locator('[data-tool="forces"]').click();
    const filters = page.getByRole('toolbar', { name: 'Filter units' });
    const idle = filters.getByRole('button', { name: 'Filter by Idle' });
    await idle.click();
    await expect(filters.getByRole('button', { name: 'Including only Idle' })).toHaveAttribute(
        'data-filter-state',
        'include',
    );
    await expect(page.locator('.world-unit-group')).toHaveCount(1);
    await page.screenshot({
        path: 'test-results/client/unit-selection-filters.png',
    });
    await page.getByLabel('Select all shown units', { exact: true }).check();
    await expect(page.locator('.world-command-body')).toContainText('1 units selected · 1 shown');
    await filters.getByRole('button', { name: 'Including only Idle' }).click({ modifiers: ['Shift'] });
    await expect(filters.getByRole('button', { name: 'Excluding Idle' })).toHaveAttribute(
        'data-filter-state',
        'exclude',
    );
    await expect(page.locator('.world-command-body')).toContainText('0 units selected · 2 shown');
    await filters.getByRole('button', { name: 'Clear unit filters' }).click();
    await expect(page.locator('.world-unit-group')).toHaveCount(3);
});

test('unavailable units, French copy, narrow layout and tool lifetime', async ({ page }) => {
    await page.route('**/client/gameplay', (route) =>
        route.fulfill({
            json: {
                ...fixtures('/client/gameplay'),
                deployment_limits: { Infantry: 0 },
            },
        }),
    );
    await start(page);
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    for (let i = 0; i < 5; i++) {
        await page.locator('[data-tool="deploy"]').click();
        await expect(page.locator('.deployment-draft-validation')).toContainText('No more units available.');
        await page.locator('.world-command-dock').getByRole('button', { name: 'Close', exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(baseline);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.game-menu > summary').click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await page.locator('.ui-edge-handle').click();
    await page.locator('[data-tool="deploy"]').click();
    await expect(page.locator('.world-command-dock')).toContainText('Infanterie');
    await expect(page.locator('.deployment-draft-validation')).toContainText(
        'Aucune unité supplémentaire disponible.',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/command-mobile.png' });
});
