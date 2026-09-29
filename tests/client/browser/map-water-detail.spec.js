import { test, expect } from '@playwright/test';

const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const ready = async (page) => {
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
};

test('detailed river drawing retains multiple local widths through zoom and independent river visibility', async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
        window.waterWidths = new Set();
        const stroke = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function (...args) {
            if (this.strokeStyle === '#60b6cc') window.waterWidths.add(this.lineWidth);
            return stroke.apply(this, args);
        };
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await diagnostics(page);
    const river = before.atlas.rivers.reduce((a, b) => (a.length > b.length ? a : b));
    await page.getByLabel('Named feature', { exact: true }).selectOption(river.id);
    await page.getByRole('button', { name: 'Find named feature', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-water-river-detail.png' });
    const widths = await page.evaluate(() => [...window.waterWidths].sort((a, b) => a - b));
    expect(widths.length).toBeGreaterThan(10);
    expect(widths.at(-1) / widths[0]).toBeGreaterThan(1.5);
    await page.evaluate(() => window.waterWidths.clear());
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    const close = await page.evaluate(() => [...window.waterWidths].sort((a, b) => a - b));
    expect(close).toEqual(widths); // World-space channel widths, not fixed screen strokes.
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-water-river-close.png' });
    await page.getByRole('checkbox', { name: 'Rivers', exact: true }).uncheck();
    await page.evaluate(
        () =>
            new Promise((resolve) =>
                requestAnimationFrame(() => {
                    window.waterWidths.clear();
                    resolve();
                }),
            ),
    );
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    expect(await page.evaluate(() => window.waterWidths.size)).toBe(0);
    await page.getByRole('checkbox', { name: 'Rivers', exact: true }).check();
    await expect.poll(() => page.evaluate(() => window.waterWidths.size)).toBeGreaterThan(10);
    expect((await diagnostics(page)).geographySignature).toBe(before.geographySignature);
    expect(errors).toEqual([]);
});

test('coast and lake depth colours survive close detail, cache rebuilding and resolution changes', async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.goto('/map-lab');
    const before = await diagnostics(page);
    await page.getByRole('button', { name: 'Try naval demo', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-water-coast.png' });
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-water-coast-close.png' });
    const lake = before.atlas.features.find((f) => f.type === 'lake');
    expect(lake).toBeTruthy();
    await page.getByLabel('Named feature', { exact: true }).selectOption(lake.id);
    await page.getByRole('button', { name: 'Find named feature', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-water-lake.png' });
    expect((await diagnostics(page)).geographySignature).toBe(before.geographySignature);
    await page.getByRole('button', { name: '37', exact: true }).click();
    await page.getByRole('button', { name: 'Find landscape detail', exact: true }).click();
    await ready(page);
    const after = await diagnostics(page);
    expect(after.totalCells).toBe(22200);
    expect(after.terrainV2.pixels).toBeLessThanOrEqual(after.terrainV2.pixelBudget);
});
