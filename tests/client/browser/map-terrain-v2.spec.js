import { test, expect } from '@playwright/test';

const ready = (page) =>
    expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().terrainV2.pending), { timeout: 45000 })
        .toBe(0);
test('terrain v2 is permanent, retains geography and supports independent overlays', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    await expect(page.locator('[data-layer="terrainV2"]')).toHaveCount(0);
    expect(original.layers.terrainV2).toBe(true);
    await page.getByRole('button', { name: 'Find landscape detail', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().terrainV2.active)).toBe(true);
    await ready(page);
    await page.screenshot({ path: 'test-results/client/map-terrain-v2-detail.png', fullPage: true });
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    expect(before.geographySignature).toBe(original.geographySignature);
    const pixels = () =>
        page.locator('canvas').evaluate((el) => {
            const bytes = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
            let hash = 2166136261;
            for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
            return hash;
        });
    const v2 = await pixels();
    await page.getByRole('checkbox', { name: 'Illustrated terrain', exact: true }).uncheck();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().terrainV2.active)).toBe(false);
    expect(await pixels()).not.toBe(v2);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).camera).toEqual(before.camera);
    await page.getByRole('checkbox', { name: 'Illustrated terrain', exact: true }).check();
    await ready(page);
    await expect.poll(pixels).toBe(v2);
    for (const layer of [
        'Micro-cell grid',
        'Political ownership',
        'Rivers',
        'Relief shading',
        'Terrain transitions',
    ]) {
        const checkbox = page.getByRole('checkbox', { name: layer, exact: true });
        const previousPixels = await pixels();
        await checkbox.setChecked(!(await checkbox.isChecked()));
        await ready(page);
        await expect.poll(pixels).not.toBe(previousPixels);
        await checkbox.setChecked(!(await checkbox.isChecked()));
        await ready(page);
    }
    const after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.geographySignature).toBe(original.geographySignature);
    expect(after.terrainV2.pixels).toBeLessThanOrEqual(after.terrainV2.pixelBudget);
    expect(after.terrainV2.chunks).toBeLessThanOrEqual(after.terrainV2.maxChunks);
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().terrainV2.active)).toBe(false);
    expect(errors).toEqual([]);
});

test('v2 renders without old artwork and survives coast, mountain, zoom and density changes', async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.route('**/terrain-atlas-*.webp', (route) => route.abort());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Find landscape detail', exact: true }).click();
    await ready(page);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    await page.screenshot({ path: 'test-results/client/map-terrain-v2-close.png', fullPage: true });
    await page.getByRole('button', { name: 'Try naval demo', exact: true }).click();
    await ready(page);
    await page.screenshot({ path: 'test-results/client/map-terrain-v2-coast.png', fullPage: true });
    await page.getByRole('button', { name: '37', exact: true }).click();
    await page.getByRole('button', { name: 'Find landscape detail', exact: true }).click();
    await ready(page);
    const after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.totalCells).toBe(22200);
    expect(after.terrainV2.active).toBe(true);
    expect(after.terrainV2.pixels).toBeLessThanOrEqual(after.terrainV2.pixelBudget);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().terrainV2.active)).toBe(false);
    expect(errors).toEqual([]);
});
