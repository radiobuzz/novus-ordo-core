import { test, expect } from '@playwright/test';

test('economic views, previews, settlement and independent layers preserve geography', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('button', { name: 'Try economy demo', exact: true }).click();
    await expect(page.getByLabel('Economic resource', { exact: true })).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().economy.sitesDrawn))
        .toBeGreaterThan(0);
    await page.screenshot({
        path: 'test-results/client/map-lab-food-economy.png',
        fullPage: true,
    });
    for (const lens of ['potential', 'demand', 'balance', 'production']) {
        await page.getByLabel('Economic view', { exact: true }).selectOption(lens);
        expect((await page.evaluate(() => window.mapLabDiagnostics())).economy.lens).toBe(lens);
    }
    await page.getByLabel('Economic resource', { exact: true }).selectOption('Oil');
    await page.screenshot({
        path: 'test-results/client/map-lab-oil-economy.png',
        fullPage: true,
    });
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('slider', { name: 'Food labor share', exact: true }).press('Home');
    await expect(page.locator('[data-field="labor-preview"]')).toContainText('Preview only');
    expect((await page.evaluate(() => window.mapLabDiagnostics())).economy.totals).toEqual(
        before.economy.totals,
    );
    await page.getByRole('button', { name: 'Apply to faction', exact: true }).click();
    expect(
        (await page.evaluate(() => window.mapLabDiagnostics())).economy.totals.aurelia.Food.production,
    ).toBe(0);
    for (let i = 0; i < 3; i++)
        await page.getByRole('button', { name: 'Advance economy turn', exact: true }).click();
    const after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.economy.lastTurn.aurelia.Food.shortage).toBeGreaterThan(0);
    expect(after.geographySignature).toBe(original.geographySignature);
    expect(after.generation.settings).toEqual(original.generation.settings);
    await page.getByRole('checkbox', { name: 'Economic overlay', exact: true }).uncheck();
    await expect(page.locator('[data-field="economy-panel"]')).toBeHidden();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).economy.tick).toBe(3);
    await page.getByRole('checkbox', { name: 'Economic overlay', exact: true }).check();
    await page.getByRole('button', { name: 'Reset economy demo', exact: true }).click();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).economy.tick).toBe(0);
    expect(errors).toEqual([]);
});

test('new layers retain preferences across resolution and seed changes and respect diagnostic views', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try economy demo', exact: true }).click();
    await page.getByRole('button', { name: 'Try naval demo', exact: true }).click();
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().naval.markers.length)).toBe(0);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).economy.sitesDrawn).toBe(0);
    await page.getByLabel('Map view', { exact: true }).selectOption('terrain');
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().naval.markers.length))
        .toBeGreaterThan(0);
    await page.getByRole('button', { name: '37', exact: true }).click();
    let changed = await page.evaluate(() => window.mapLabDiagnostics());
    expect(changed.totalCells).toBe(22200);
    expect(changed.layers).toEqual(before.layers);
    expect(changed.generation.settings).toEqual(before.generation.settings);
    await page.getByLabel('World seed', { exact: true }).fill('riverlands');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    changed = await page.evaluate(() => window.mapLabDiagnostics());
    expect(changed.generation.settings.seed).toBe('riverlands');
    expect(changed.layers).toEqual(before.layers);
    expect(changed.economy.tick).toBe(0);
    expect(changed.naval.tick).toBe(0);
    await page.getByRole('checkbox', { name: 'Naval landing overlay', exact: true }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Economic overlay', exact: true })).toBeChecked();
    expect(errors).toEqual([]);
});

test('naval landing, reinforcement, replay, evacuation and oil accounting work together', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('button', { name: 'Try naval demo', exact: true }).click();
    await expect(page.locator('[data-field="naval-phase"]')).toContainText('READY');
    await page.screenshot({
        path: 'test-results/client/map-lab-naval-approach.png',
        fullPage: true,
    });
    for (let i = 0; i < 20; i++) {
        const { naval } = await page.evaluate(() => window.mapLabDiagnostics());
        if (['secured', 'evacuated', 'failed'].includes(naval.phase)) break;
        if (naval.phase === 'beachhead' && !naval.secondWave)
            await page
                .getByRole('button', {
                    name: 'Commit second wave',
                    exact: true,
                })
                .click();
        await page.getByRole('button', { name: 'Advance naval step', exact: true }).click();
    }
    const completed = await page.evaluate(() => window.mapLabDiagnostics());
    expect(completed.naval.phase).toBe('secured');
    expect(completed.economy.pendingOil.sable).toBe(completed.naval.fuelSpent);
    expect(completed.geographySignature).toBe(original.geographySignature);
    await page.screenshot({
        path: 'test-results/client/map-lab-naval-beachhead.png',
        fullPage: true,
    });
    await page.getByRole('slider', { name: 'Recorded naval step', exact: true }).press('Home');
    await expect(page.locator('[data-field="naval-phase"]')).toContainText('READY');
    await expect(page.getByRole('button', { name: 'Advance naval step', exact: true })).toBeDisabled();
    await page.screenshot({
        path: 'test-results/client/map-lab-naval-replay.png',
        fullPage: true,
    });
    const replay = await page.evaluate(() => window.mapLabDiagnostics());
    expect(replay.naval.tick).toBe(completed.naval.tick);
    expect(replay.naval.history).toEqual(completed.naval.history);
    expect(replay.economy.pendingOil).toEqual(completed.economy.pendingOil);
    await page.getByRole('button', { name: 'Return to live operation', exact: true }).click();
    await expect(page.locator('[data-field="naval-phase"]')).toContainText('SECURED');
    await page.getByRole('button', { name: 'Try economy demo', exact: true }).click();
    await page.getByLabel('Economic faction', { exact: true }).selectOption('sable');
    await page.getByLabel('Economic resource', { exact: true }).selectOption('Oil');
    await page.getByLabel('Economic view', { exact: true }).selectOption('demand');
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().economy.oilSitesDrawn))
        .toBeGreaterThan(0);
    await page.screenshot({
        path: 'test-results/client/map-lab-oil-consumers.png',
        fullPage: true,
    });
    await page.getByRole('button', { name: 'Advance economy turn', exact: true }).click();
    const settled = await page.evaluate(() => window.mapLabDiagnostics());
    expect(settled.economy.lastTurn.sable.Oil.requested).toBe(completed.naval.fuelSpent);
    expect(settled.economy.pendingOil.sable).toBe(0);
    await page.getByRole('button', { name: 'Inspect navy', exact: true }).click();
    await page.getByRole('button', { name: 'Reset naval demo', exact: true }).click();
    await page.getByRole('slider', { name: 'Coastal defense', exact: true }).press('End');
    await page.getByRole('checkbox', { name: 'Escort support', exact: true }).uncheck();
    for (let i = 0; i < 20; i++) {
        const { naval } = await page.evaluate(() => window.mapLabDiagnostics());
        if (['secured', 'evacuated', 'failed'].includes(naval.phase)) break;
        await page.getByRole('button', { name: 'Advance naval step', exact: true }).click();
    }
    const failed = await page.evaluate(() => window.mapLabDiagnostics());
    expect(failed.naval.phase).toBe('evacuated');
    expect(failed.naval.waves.reduce((sum, wave) => sum + wave.evacuated, 0)).toBeGreaterThan(100);
    await page.screenshot({
        path: 'test-results/client/map-lab-naval-withdrawal.png',
        fullPage: true,
    });
    expect(errors).toEqual([]);
});
