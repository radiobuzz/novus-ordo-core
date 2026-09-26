import { test, expect } from '@playwright/test';
const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const selected = (d) => d.development.sites.find((s) => s.id === d.development.selectedId);
const ready = async (page) => {
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
};
const start = async (page) => {
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try development visuals', exact: true }).click();
};

test('woodland settlement integrates ground, clearing and roofs while idle preserves the landscape', async ({
    page,
}) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    await ready(page);
    let d = await diagnostics(page);
    expect(selected(d).living).toBe(true);
    expect(selected(d).streets).toBeGreaterThan(0);
    expect(d.terrainV2.clearedTrees).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Established', exact: true }).click();
    await expect
        .poll(async () => (await diagnostics(page)).terrainV2.surfaceKey)
        .toContain('development-inland:100');
    await ready(page);
    const established = await diagnostics(page);
    expect(established.terrainV2.rasterizedChunks).toBe(d.terrainV2.rasterizedChunks);
    expect(established.terrainV2.pixels).toBeLessThanOrEqual(established.terrainV2.pixelBudget);
    await page.screenshot({ path: 'test-results/client/map-living-established.png', fullPage: true });
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-living-scene.png' });
    await page.getByRole('button', { name: 'Idle / downturn', exact: true }).click();
    await ready(page);
    d = await diagnostics(page);
    expect(d.terrainV2.surfaceKey).toBe(established.terrainV2.surfaceKey);
    expect(d.terrainV2.clearedTrees).toBe(established.terrainV2.clearedTrees);
    expect(selected(d).sample).toEqual(selected(established).sample);
    await page.screenshot({ path: 'test-results/client/map-living-idle.png', fullPage: true });
    await page.getByRole('checkbox', { name: 'Development footprints', exact: true }).uncheck();
    await expect.poll(async () => (await diagnostics(page)).terrainV2.surfaceKey).toBe('natural');
    await ready(page);
    expect((await diagnostics(page)).terrainV2.clearedTrees).toBe(0);
    await page.screenshot({ path: 'test-results/client/map-living-natural.png', fullPage: true });
    await page.getByRole('checkbox', { name: 'Development footprints', exact: true }).check();
    await expect
        .poll(async () => (await diagnostics(page)).terrainV2.surfaceKey)
        .toBe(established.terrainV2.surfaceKey);
    await ready(page);
    expect((await diagnostics(page)).geographySignature).toBe(established.geographySignature);
    await page.getByRole('button', { name: 'Sparse', exact: true }).click();
    await ready(page);
    await page.screenshot({ path: 'test-results/client/map-living-sparse.png', fullPage: true });
    expect(errors).toEqual([]);
});

test('development footprints grow in place and remain during idling without changing other simulations', async ({
    page,
}) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await diagnostics(page);
    await page.getByRole('button', { name: 'Try development visuals', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).development.drawnPlots).toBeGreaterThan(0);
    expect((await diagnostics(page)).development.active).toBe(true);
    await page.getByRole('button', { name: 'Sparse', exact: true }).click();
    const sparse = selected(await diagnostics(page));
    await ready(page);
    await page.screenshot({ path: 'test-results/client/map-development-sparse.png', fullPage: true });
    await page.getByRole('button', { name: 'Established', exact: true }).click();
    const mature = selected(await diagnostics(page));
    await ready(page);
    expect(mature.count).toBeGreaterThan(sparse.count);
    await page.screenshot({ path: 'test-results/client/map-development-established.png', fullPage: true });
    await page.getByRole('button', { name: 'Idle / downturn', exact: true }).click();
    const idle = selected(await diagnostics(page));
    expect(idle.count).toBe(mature.count);
    expect(idle.sample).toEqual(mature.sample);
    expect(idle.activity).toBe(0);
    await expect(page.locator('[data-development-description]')).toContainText('Idle');
    await page.getByRole('button', { name: 'Resume activity', exact: true }).click();
    expect(selected(await diagnostics(page)).activity).toBe(100);
    await page.getByLabel('Built extent', { exact: true }).fill('0');
    expect(selected(await diagnostics(page)).count).toBe(0);
    await page.getByRole('button', { name: 'Reset development values', exact: true }).click();
    const after = await diagnostics(page);
    const values = (d) =>
        d.development.sites.map(({ id, built, activity, count }) => ({ id, built, activity, count }));
    expect(values(after)).toEqual(values(before));
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.atlas.features).toEqual(before.atlas.features);
    expect(after.economy.accounts).toEqual(before.economy.accounts);
    expect(after.administration.revision).toBe(before.administration.revision);
    expect(after.armyCellId).toBe(before.armyCellId);
    await page.getByRole('checkbox', { name: 'Development footprints', exact: true }).uncheck();
    await expect.poll(async () => (await diagnostics(page)).development.visible).toBe(false);
    expect(errors).toEqual([]);
});

test('all activity types render on Terrain V2, names scale with zoom, and diagnostic views stay clean', async ({
    page,
}) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    expect((await diagnostics(page)).layers.terrainV2).toBe(true);
    for (const site of (await diagnostics(page)).development.sites) {
        await page.getByLabel('Development example', { exact: true }).selectOption(site.id);
        await page.getByRole('button', { name: 'Find development example', exact: true }).click();
        await page.getByRole('button', { name: 'Established', exact: true }).click();
        await expect
            .poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 })
            .toBe(0);
        await expect(page.locator('[data-development-title]')).toHaveText(site.name);
        await expect.poll(async () => (await diagnostics(page)).development.detail).toBe(true);
        await page.screenshot({
            path: `test-results/client/map-development-${site.kind}-v2.png`,
            fullPage: true,
        });
    }
    await page.getByRole('button', { name: 'Idle / downturn', exact: true }).click();
    await page.screenshot({ path: 'test-results/client/map-development-idle-v2.png', fullPage: true });
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).development.labels.length).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/client/map-development-overview.png', fullPage: true });
    await page.getByRole('checkbox', { name: 'Settlement & district names', exact: true }).uncheck();
    await expect.poll(async () => (await diagnostics(page)).development.labels.length).toBe(0);
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(async () => (await diagnostics(page)).development.visible).toBe(false);
    await expect(page.locator('[data-development-inspector]')).toBeHidden();
    await page.getByLabel('Map view', { exact: true }).selectOption('terrain');
    await page.getByRole('button', { name: 'Try coasts & bays', exact: true }).click();
    await expect(page.locator('[data-coast-inspector]')).toBeVisible();
    expect(errors).toEqual([]);
});

test('native exact controls, narrow layout and regeneration preserve optional preferences', async ({
    page,
}) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 430, height: 900 });
    await start(page);
    await page.getByLabel('Built extent', { exact: true }).fill('42');
    await page.getByLabel('Current activity', { exact: true }).fill('25');
    expect(selected(await diagnostics(page)).built).toBe(42);
    expect(selected(await diagnostics(page)).activity).toBe(25);
    await page.getByLabel('Built extent slider', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    expect(selected(await diagnostics(page)).built).toBe(43);
    await page.getByRole('button', { name: '37', exact: true }).click();
    const state = await diagnostics(page);
    expect(state.totalCells).toBe(22200);
    expect(state.development.sites.length).toBe(6);
    expect(state.layers.development).toBe(true);
    await page.getByRole('button', { name: 'Find development example', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/map-development-mobile.png', fullPage: true });
});
