import { test, expect } from '@playwright/test';
const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const ready = async (page) => {
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
};
const pixels = (page) => page.locator('canvas').evaluate((canvas) => canvas.toDataURL());

test('coastal artwork is independent, reversible, and follows the existing edge examples', async ({
    page,
}) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await diagnostics(page);
    const detail = page.getByRole('checkbox', { name: 'Coastal terrain detail', exact: true });
    await expect(detail).toBeChecked();
    for (const kind of ['gentle', 'steep', 'exposed', 'sheltered', 'lake']) {
        await page.getByLabel('Shore example', { exact: true }).selectOption(kind);
        await page.getByRole('button', { name: 'Find shore example', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Shoreline analysis', exact: true }).uncheck();
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await ready(page);
        await page.locator('canvas').screenshot({ path: `test-results/client/map-coastal-art-${kind}.png` });
        if (kind === 'steep') {
            const on = await pixels(page),
                selected = (await diagnostics(page)).coasts.selected;
            await detail.uncheck();
            await expect.poll(async () => (await diagnostics(page)).terrainV2.coastalDetail).toBe(false);
            await ready(page);
            const off = await pixels(page);
            expect(off).not.toBe(on);
            await page.locator('canvas').screenshot({ path: 'test-results/client/map-coastal-art-off.png' });
            await detail.check();
            await expect.poll(async () => (await diagnostics(page)).terrainV2.coastalDetail).toBe(true);
            await ready(page);
            expect(await pixels(page)).toBe(on);
            expect((await diagnostics(page)).coasts.selected).toEqual(selected);
        }
    }
    const after = await diagnostics(page);
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.economy.accounts).toEqual(before.economy.accounts);
    expect(after.terrainV2.coastalEdges).toBeGreaterThan(100);
    expect(after.terrainV2.pixels).toBeLessThanOrEqual(after.terrainV2.pixelBudget);
    expect(errors).toEqual([]);
});

test('coast detail survives 37-cell regeneration, narrow layout and diagnostic views', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/map-lab');
    await page.getByRole('button', { name: '37', exact: true }).click();
    await page.getByLabel('Shore example', { exact: true }).selectOption('steep');
    await page.getByRole('button', { name: 'Find shore example', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Shoreline analysis', exact: true }).uncheck();
    await ready(page);
    await page.screenshot({ path: 'test-results/client/map-coastal-art-mobile.png', fullPage: true });
    const state = await diagnostics(page);
    expect(state.totalCells).toBe(22200);
    expect(state.terrainV2.pixels).toBeLessThanOrEqual(state.terrainV2.pixelBudget);
    await page.getByRole('checkbox', { name: 'Terrain transitions', exact: true }).uncheck();
    await ready(page);
    await page.getByRole('checkbox', { name: 'Terrain transitions', exact: true }).check();
    await ready(page);
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(async () => (await diagnostics(page)).terrainV2.coastalDetail).toBe(false);
    await expect(page.getByRole('checkbox', { name: 'Coastal terrain detail', exact: true })).toBeChecked();
    await page.getByLabel('Map view', { exact: true }).selectOption('terrain');
    await ready(page);
    expect((await diagnostics(page)).terrainV2.coastalDetail).toBe(true);
});
