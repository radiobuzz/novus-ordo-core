import { test, expect } from '@playwright/test';
const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const ready = async (page) => {
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
};

test('deserts are discoverable and readable at overview/detail without changing geography or orders', async ({
    page,
}) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await diagnostics(page);
    expect(before.desertCells).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Find desert', exact: true }).click();
    await ready(page);
    const detail = await diagnostics(page);
    expect(detail.selectedCell.biome).toBe('desert');
    expect(detail.selectedCell.desertStrength).toBeGreaterThanOrEqual(0.5);
    await expect(page.locator('[data-field="cell-title"]')).toContainText('Desert');
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-desert-detail.png' });
    expect(detail.geographySignature).toBe(before.geographySignature);
    expect(detail.armyCellId).toBe(before.armyCellId);
    expect(detail.economy.accounts).toEqual(before.economy.accounts);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-desert-close.png' });
    await page.getByRole('checkbox', { name: 'Illustrated terrain', exact: true }).uncheck();
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(false);
    expect((await diagnostics(page)).selectedCell.biome).toBe('desert');
    await page.getByRole('checkbox', { name: 'Illustrated terrain', exact: true }).check();
    await ready(page);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-desert-world.png' });
    await page.getByLabel('Map view', { exact: true }).selectOption('moisture');
    expect((await diagnostics(page)).selectedCell.biome).toBe('desert');
    expect(errors).toEqual([]);
});

test('wetness changes desert coverage and a wet map explains its empty result without moving the camera', async ({
    page,
}) => {
    test.setTimeout(90000);
    await page.goto('/map-lab');
    const original = await diagnostics(page);
    await page.getByLabel('Wetness', { exact: false }).press('End');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    expect((await diagnostics(page)).desertCells).toBe(0);
    const camera = (await diagnostics(page)).camera;
    await page.getByRole('button', { name: 'Find desert', exact: true }).click();
    expect((await diagnostics(page)).camera).toEqual(camera);
    await expect(page.locator('.map-status')).toContainText('No desert biome');
    await page.getByLabel('Wetness', { exact: false }).press('Home');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    expect((await diagnostics(page)).desertCells).toBeGreaterThan(original.desertCells);
    await page.getByRole('button', { name: 'Find desert', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-desert-dry-world.png' });
});

test('desert navigation and detail survive narrow layout and 37-cell regeneration', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/map-lab');
    await page.getByRole('button', { name: '37', exact: true }).click();
    await page.getByRole('button', { name: 'Find desert', exact: true }).focus();
    await page.keyboard.press('Enter');
    await ready(page);
    const d = await diagnostics(page);
    expect(d.totalCells).toBe(22200);
    expect(d.selectedCell.biome).toBe('desert');
    expect(d.terrainV2.pixels).toBeLessThanOrEqual(d.terrainV2.pixelBudget);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/map-desert-mobile.png', fullPage: true });
});
