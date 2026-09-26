import { test, expect } from '@playwright/test';
const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const start = async (page) => {
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try coasts & bays', exact: true }).click();
};

test('bay candidates join the geographic atlas and show selectable interiors and mouths', async ({
    page,
}) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await diagnostics(page);
    await page.getByRole('button', { name: 'Try coasts & bays', exact: true }).click();
    let state = await diagnostics(page);
    expect(state.coasts.bays.length).toBeGreaterThan(1);
    expect(state.coasts.active).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).coasts.visible).toBe(true);
    const second = state.coasts.bays[1];
    await page.getByLabel('Bay candidate', { exact: true }).selectOption(second.id);
    await page.getByRole('button', { name: 'Find bay', exact: true }).click();
    await expect(page.locator('[data-coast-title]')).toHaveText(second.name);
    await expect(page.locator('[data-coast-metrics]')).toContainText('Proposed mouth length');
    await expect
        .poll(async () => (await diagnostics(page)).atlas.labels.some((l) => l.id === second.id))
        .toBe(true);
    state = await diagnostics(page);
    expect(state.atlas.memberships).toContain(second.id);
    expect(state.geographySignature).toBe(before.geographySignature);
    expect(state.economy.accounts).toEqual(before.economy.accounts);
    expect(state.atlas.features).toEqual(before.atlas.features);
    await page.screenshot({ path: 'test-results/client/map-coasts-bay.png', fullPage: true });
    await page.getByLabel('Named feature', { exact: true }).selectOption(second.id);
    await page.getByRole('button', { name: 'Find named feature', exact: true }).click();
    await expect(page.locator('[data-atlas-title]')).toHaveText(second.name);
    await page.getByRole('checkbox', { name: 'Bay names', exact: true }).uncheck();
    await expect
        .poll(async () => (await diagnostics(page)).atlas.labels.some((l) => l.kind === 'bay'))
        .toBe(false);
    await page.getByLabel('Shoreline view', { exact: true }).selectOption('access');
    await expect(page.getByRole('checkbox', { name: 'Bay names', exact: true })).not.toBeChecked();
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(async () => (await diagnostics(page)).coasts.visible).toBe(false);
    await expect(page.locator('[data-coast-inspector]')).toBeHidden();
    expect(errors).toEqual([]);
});

test('shore examples explain separate exposure and access including lake surface; simulations remain unchanged', async ({
    page,
}) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    const before = await diagnostics(page);
    for (const example of ['sheltered', 'exposed', 'gentle', 'steep', 'lake']) {
        await page.getByLabel('Shore example', { exact: true }).selectOption(example);
        await page.getByRole('button', { name: 'Find shore example', exact: true }).click();
        const state = await diagnostics(page);
        expect(state.coasts.selected).toBeTruthy();
        await expect(page.locator('[data-coast-metrics]')).toContainText('Why');
        if (example === 'lake') {
            expect(state.coasts.selected.waterType).toBe('lake');
            expect(state.coasts.selected.surface).toBeGreaterThan(0);
        }
        if (example === 'gentle' || example === 'steep') expect(state.coasts.lens).toBe('access');
        if (example === 'sheltered' || example === 'steep')
            await page.screenshot({ path: `test-results/client/map-coasts-${example}.png`, fullPage: true });
    }
    expect((await diagnostics(page)).layers.terrainV2).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
    await page.screenshot({ path: 'test-results/client/map-coasts-lake-v2.png', fullPage: true });
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect((await diagnostics(page)).labFocus).toBe('coasts');
    await page.getByRole('checkbox', { name: 'Shoreline analysis', exact: true }).uncheck();
    await expect.poll(async () => (await diagnostics(page)).coasts.visible).toBe(false);
    const after = await diagnostics(page);
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.economy.accounts).toEqual(before.economy.accounts);
    expect(after.armyCellId).toBe(before.armyCellId);
    await page.getByRole('button', { name: 'Try military demo', exact: true }).click();
    await expect(page.locator('[data-field="military-panel"]')).toBeVisible();
    expect((await diagnostics(page)).coasts.active).toBe(false);
    expect(errors).toEqual([]);
});

test('coast test survives resolution changes and remains usable on narrow screens', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 430, height: 900 });
    await start(page);
    await page.getByLabel('Shoreline view', { exact: true }).selectOption('access');
    await page.getByRole('button', { name: '37', exact: true }).click();
    let state = await diagnostics(page);
    expect(state.totalCells).toBe(22200);
    expect(state.coasts.lens).toBe('access');
    expect(state.coasts.bays.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Find bay', exact: true }).click();
    await expect(page.locator('[data-coast-inspector]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/map-coasts-mobile.png', fullPage: true });
    await page.getByRole('button', { name: '7', exact: true }).click();
    state = await diagnostics(page);
    expect(state.totalCells).toBe(4200);
    expect(state.coasts.shoreCount).toBeGreaterThan(0);
});
