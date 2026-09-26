import { test, expect } from '@playwright/test';
const d = (page) => page.evaluate(() => window.mapLabDiagnostics());
const selected = (s) => s.development.sites.find((p) => p.id === s.development.selectedId);
const ready = async (page) => {
    await expect.poll(async () => (await d(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
    await expect.poll(async () => (await d(page)).development.artwork).toBe('ready');
};

test('painted architecture forms a high-rise core while independent footprint/activity controls and layers persist', async ({
    page,
}) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try development visuals', exact: true }).click();
    await page.getByRole('button', { name: 'Established', exact: true }).click();
    await ready(page);
    const before = await d(page);
    await page.getByRole('button', { name: 'Metropolis', exact: true }).click();
    await expect.poll(async () => (await d(page)).development.architecture.tower ?? 0).toBeGreaterThan(0);
    await ready(page);
    const metro = await d(page);
    expect(selected(metro).urbanIntensity).toBe(100);
    expect(selected(metro).sample).toEqual(selected(before).sample);
    expect(metro.terrainV2.surfaceKey).not.toBe(before.terrainV2.surfaceKey);
    expect(metro.terrainV2.rasterizedChunks).toBe(before.terrainV2.rasterizedChunks);
    expect(metro.terrainV2.clearedTrees).toBeGreaterThanOrEqual(before.terrainV2.clearedTrees);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-art-metropolis.png' });
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-art-city-close.png' });
    await page.getByRole('button', { name: 'Find development example', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Idle / downturn', exact: true }).click();
    expect(selected(await d(page)).urbanIntensity).toBe(100);
    expect((await d(page)).development.architecture).toEqual(metro.development.architecture);
    await page.getByRole('button', { name: 'Town', exact: true }).click();
    expect(selected(await d(page)).activity).toBe(0);
    expect((await d(page)).development.architecture.tower ?? 0).toBe(0);
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-art-town.png' });
    for (const kind of ['industry', 'mine', 'oil']) {
        await page.getByLabel('Development example', { exact: true }).selectOption(`development-${kind}`);
        await expect(page.getByLabel('Urban intensity', { exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Metropolis', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Find development example', exact: true }).click();
        await page.getByRole('button', { name: 'Established', exact: true }).click();
        await ready(page);
        expect(selected(await d(page)).complex).toBe(true);
        await page.locator('canvas').screenshot({ path: `test-results/client/map-art-${kind}.png` });
    }
    expect((await d(page)).geographySignature).toBe(before.geographySignature);
    expect((await d(page)).economy.accounts).toEqual(before.economy.accounts);
    await page.getByRole('button', { name: 'Reset development values', exact: true }).click();
    expect((await d(page)).development.sites.find((s) => s.living).urbanIntensity).toBe(35);
    expect(errors).toEqual([]);
});

test('new exact density control works by keyboard on narrow layout', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try development visuals', exact: true }).click();
    await page.getByLabel('Urban intensity', { exact: true }).fill('72');
    expect(selected(await d(page)).urbanIntensity).toBe(72);
    await page.getByLabel('Urban intensity slider', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    expect(selected(await d(page)).urbanIntensity).toBe(73);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('missing art reports a simplified fallback and does not break the map', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/development-atlas-v2-*.png', (route) => route.abort());
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try development visuals', exact: true }).click();
    await expect.poll(async () => (await d(page)).development.artwork).toBe('error');
    await expect(page.locator('[data-development-art-status]')).toContainText('Simplified fallback');
    expect((await d(page)).development.drawnPlots).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Metropolis', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Development footprints', exact: true }).uncheck();
    await expect.poll(async () => (await d(page)).development.visible).toBe(false);
    expect(errors).toEqual([]);
});
