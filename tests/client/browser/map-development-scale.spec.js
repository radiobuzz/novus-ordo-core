import { test, expect } from '@playwright/test';
const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const selected = (d) => d.development.sites.find((s) => s.id === d.development.selectedId);
const ready = async (page) => {
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(true);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
    await expect.poll(async () => (await diagnostics(page)).development.artwork).toBe('ready');
};

test('fixed-camera scale comparison shrinks footprints and preserves the artwork checkpoint and other experiments', async ({
    page,
}) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try development visuals', exact: true }).click();
    await page.getByRole('button', { name: 'Established', exact: true }).click();
    await page.getByRole('button', { name: 'Metropolis', exact: true }).click();
    await ready(page);
    const before = await diagnostics(page);
    await page.getByRole('button', { name: 'Try scale comparison', exact: true }).click();
    await ready(page);
    const current = await diagnostics(page);
    expect(selected(current).useCellData).toBe(true);
    expect(current.layers.microGrid).toBe(true);
    expect(current.layers.developmentCells).toBe(true);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-scale-current.png' });
    let previous = selected(current).parcelArea;
    for (const [label, value] of [
        ['Half size', 50],
        ['Quarter size', 25],
    ]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await ready(page);
        const d = await diagnostics(page),
            site = selected(d);
        expect(site.footprintScale).toBe(value);
        expect(d.camera).toEqual(current.camera);
        expect(site.parcelArea).toBeLessThan(previous);
        expect(site.count).toBeGreaterThan(0);
        expect(d.terrainV2.rasterizedChunks).toBe(current.terrainV2.rasterizedChunks);
        for (const cell of site.studyCells)
            expect(cell.usedPercent).toBeLessThanOrEqual(cell.coverage + 0.0001);
        await page.locator('canvas').screenshot({ path: `test-results/client/map-scale-${value}.png` });
        previous = site.parcelArea;
    }
    await page.getByRole('button', { name: 'Hide study guides', exact: true }).click();
    expect((await diagnostics(page)).layers.microGrid).toBe(false);
    expect((await diagnostics(page)).layers.developmentCells).toBe(false);
    await ready(page);
    await page.locator('canvas').screenshot({ path: 'test-results/client/map-scale-quarter-clean.png' });
    await page.getByRole('button', { name: 'Restore scale checkpoint', exact: true }).click();
    await ready(page);
    const after = await diagnostics(page);
    expect(selected(after).sample).toEqual(selected(before).sample);
    expect(selected(after).count).toBe(selected(before).count);
    expect(selected(after).urbanIntensity).toBe(100);
    expect(after.terrainV2.surfaceKey).toBe(before.terrainV2.surfaceKey);
    expect(after.camera).toEqual(before.camera);
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.economy.accounts).toEqual(before.economy.accounts);
    expect(after.administration.revision).toBe(before.administration.revision);
    expect(after.armyCellId).toBe(before.armyCellId);
    expect(errors).toEqual([]);
});

test('cell allowances change drawn parcels, remain inspectable at zero, and survive idle/layer switching', async ({
    page,
}) => {
    test.setTimeout(100000);
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try scale comparison', exact: true }).click();
    await page.getByRole('button', { name: 'Established', exact: true }).click();
    await page.getByRole('button', { name: 'Half size', exact: true }).click();
    await ready(page);
    const before = await diagnostics(page),
        cell = selected(before).studyCells.sort((a, b) => b.area - a.area)[0];
    await page.getByLabel('Study microcell', { exact: true }).selectOption(cell.cellId);
    await page.getByLabel('Cell development allowance', { exact: true }).fill('0');
    await ready(page);
    let d = await diagnostics(page);
    expect(selected(d).studyCells.find((c) => c.cellId === cell.cellId).usedPercent).toBe(0);
    await expect(page.locator('[data-development-scale-summary]')).toContainText('0.0% drawn / 0% allowance');
    await page.getByLabel('Cell development allowance', { exact: true }).fill(String(cell.coverage));
    await ready(page);
    expect(
        selected(await diagnostics(page)).studyCells.find((c) => c.cellId === cell.cellId).usedPercent,
    ).toBeGreaterThan(0);
    const restored = await diagnostics(page);
    await page.getByRole('button', { name: 'Idle / downturn', exact: true }).click();
    await ready(page);
    expect(selected(await diagnostics(page)).parcelArea).toBe(selected(restored).parcelArea);
    expect((await diagnostics(page)).terrainV2.surfaceKey).toBe(restored.terrainV2.surfaceKey);
    await page.getByRole('checkbox', { name: 'Development footprints', exact: true }).uncheck();
    await ready(page);
    expect((await diagnostics(page)).terrainV2.surfaceKey).toBe('natural');
    await page.getByRole('checkbox', { name: 'Development footprints', exact: true }).check();
    await ready(page);
    expect(selected(await diagnostics(page)).footprintScale).toBe(50);
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(async () => (await diagnostics(page)).development.visible).toBe(false);
    expect((await diagnostics(page)).layers.developmentCells).toBe(true);
});

test('compact mines, oil, industry and rural examples stay visible and retain distant names', async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try scale comparison', exact: true }).click();
    for (const kind of ['coast', 'rural', 'industry', 'mine', 'oil']) {
        await page.getByLabel('Development example', { exact: true }).selectOption(`development-${kind}`);
        await page.getByRole('button', { name: 'Try scale comparison', exact: true }).click();
        await page.getByRole('button', { name: 'Established', exact: true }).click();
        await page.getByRole('button', { name: 'Quarter size', exact: true }).click();
        await ready(page);
        expect(selected(await diagnostics(page)).count).toBeGreaterThan(0);
        await page.locator('canvas').screenshot({ path: `test-results/client/map-scale-${kind}.png` });
    }
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect.poll(async () => (await diagnostics(page)).development.labels.length).toBeGreaterThan(0);
});

test('scale fields have exact/keyboard alternatives and regeneration resets examples without dropping layer preferences', async ({
    page,
}) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try scale comparison', exact: true }).click();
    await page.getByLabel('Development scale', { exact: true }).fill('40');
    await page.getByLabel('Structure size', { exact: true }).fill('65');
    await page.getByLabel('Structure spacing', { exact: true }).fill('90');
    await page.getByLabel('Structure spacing slider', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    const s = selected(await diagnostics(page));
    expect(s.footprintScale).toBe(40);
    expect(s.structureScale).toBe(65);
    expect(s.spacing).toBe(91);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/map-scale-mobile.png', fullPage: true });
    await page.getByRole('button', { name: '37', exact: true }).click();
    const d = await diagnostics(page);
    expect(d.totalCells).toBe(22200);
    expect(d.layers.developmentCells).toBe(true);
    expect(selected(d).footprintScale).toBe(100);
    expect(selected(d).useCellData).toBe(false);
});
