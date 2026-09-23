import { expect, test } from '@playwright/test';

test('map laboratory compares resolutions and advances through an operational cell', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    const canvas = page.getByRole('application', { name: /hex map/i }).or(page.locator('canvas'));
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Landscape laboratory' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().totalCells)).toBe(11_400);
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.tileStatus)).toBe('ready');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().rivers)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Find a lake' }).click();
    await expect(page.locator('[data-field="cell-title"]')).toHaveText(/ Lake$/);
    await expect(page.locator('[data-field="cell-details"]')).toContainText('Impassable to land army');
    await page.getByRole('checkbox', { name: 'Illustrated terrain' }).uncheck();
    await page.getByRole('checkbox', { name: 'Illustrated terrain' }).check();
    await page.getByRole('checkbox', { name: 'Rivers', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Rivers', exact: true }).check();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitionsPending))
        .toBe(0);
    await page.screenshot({ path: 'test-results/client/map-lab-water-tiles.png' });

    await page.getByRole('button', { name: '600-region world', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().regionCount)).toBe(600);
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().totalCells)).toBe(11_400);
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().lakes)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().rivers)).toBeGreaterThan(0);
    await expect(page.locator('.performance-status')).toContainText('11,400');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.frameMs)).toBeLessThan(50);
    await page.screenshot({ path: 'test-results/client/map-lab-world.png', fullPage: true });
    for (let step = 0; step < 7; step++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.detail))
        .toBe('cell detail');
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.visibleCells))
        .toBeLessThan(5_000);
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitionsPending), {
            timeout: 15000,
        })
        .toBe(0);
    await page.screenshot({ path: 'test-results/client/map-lab-world-detail.png', fullPage: true });
    await page.getByRole('button', { name: '7-region scenario', exact: true }).click();

    await page.getByRole('button', { name: '37', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().totalCells)).toBe(259);
    await page.getByRole('button', { name: '19', exact: true }).click();

    const box = await canvas.boundingBox();
    const army = await page.evaluate(() => window.mapLabDiagnostics().armyScreen);
    await page.mouse.click(box.x + army.x, box.y + army.y);
    await expect(page.locator('.map-status')).toContainText('Army selected');
    const target = await page.evaluate(() =>
        window.mapLabDiagnostics().reachableTargets.find((cell) => cell.controllerId === 'aurelia'),
    );
    expect(target).toBeTruthy();
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().armyCellId)).toBe(target.id);
    await expect(page.locator('.map-status')).toContainText('advanced inside Emberfall');
    await page.screenshot({ path: 'test-results/client/map-lab.png', fullPage: true });
    expect(errors).toEqual([]);
});

test('terrain image failure retains usable water geography and cell selection', async ({ page }) => {
    await page.route('**/terrain-atlas-*.png', (route) => route.abort());
    await page.goto('/map-lab');
    await expect(page.locator('[data-field="tile-status"]')).toContainText('Artwork unavailable');
    await page.getByRole('button', { name: 'Find a lake' }).click();
    await expect(page.locator('[data-field="cell-title"]')).toHaveText(/ Lake$/);
    await page.getByRole('button', { name: 'Find army' }).click();
    await expect(page.locator('.map-status')).toContainText('Army selected');
});

test('terrain transitions blend the rendered map without changing cells or movement', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Find a lake' }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitions)).toBe(true);
    await page.getByRole('checkbox', { name: 'Micro-cell grid' }).uncheck();
    await page.getByRole('checkbox', { name: 'Political ownership' }).uncheck();
    const canvas = page.locator('canvas');
    const pixels = () =>
        canvas.evaluate((el) => {
            const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
            let hash = 2166136261;
            for (const value of data) hash = Math.imul(hash ^ value, 16777619);
            return hash;
        });
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitionsPending))
        .toBe(0);
    const beforeState = await page.evaluate(() => window.mapLabDiagnostics());
    await page.screenshot({ path: 'test-results/client/map-lab-transitions.png' });
    const blended = await pixels();
    await page.getByRole('checkbox', { name: 'Terrain transitions' }).uncheck();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitions)).toBe(false);
    const hard = await pixels();
    expect(blended).not.toBe(hard);
    const afterState = await page.evaluate(() => window.mapLabDiagnostics());
    expect(afterState.armyCellId).toBe(beforeState.armyCellId);
    expect(afterState.totalCells).toBe(beforeState.totalCells);
    expect(afterState.reachableTargets).toEqual(beforeState.reachableTargets);
    await page.getByRole('checkbox', { name: 'Terrain transitions' }).check();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitions)).toBe(true);
    expect(await pixels()).toBe(blended);
    expect(afterState.metrics.transitionTilesCached).toBeLessThanOrEqual(1024);
    expect(errors).toEqual([]);
});

test('seeded geography controls and diagnostic views rebuild safely at full scale', async ({ page }) => {
    // Several 11,400/22,200-cell rebuilds plus screenshots; this is a correctness
    // journey, not a 30-second whole-test performance budget.
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: '600-region world', exact: true }).click();
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('checkbox', { name: 'Region borders', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Micro-cell grid' }).uncheck();
    await page.getByRole('checkbox', { name: 'Political ownership' }).uncheck();
    for (const view of ['elevation', 'moisture', 'drainage', 'terrain']) {
        await page.getByLabel('Map view', { exact: true }).selectOption(view);
        await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().view)).toBe(view);
        await expect(page.locator('[data-field="view-legend"]')).not.toBeEmpty();
        await page.screenshot({ path: `test-results/client/map-lab-generated-${view}.png`, fullPage: true });
    }
    const inspect = await page.evaluate(() => window.mapLabDiagnostics());
    expect(inspect.armyCellId).toBe(original.armyCellId);
    expect(inspect.geographySignature).toBe(original.geographySignature);
    await page.getByLabel('World seed', { exact: true }).fill('riverlands');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.settings.seed))
        .toBe('riverlands');
    const changed = await page.evaluate(() => window.mapLabDiagnostics());
    expect(changed.geographySignature).not.toBe(original.geographySignature);
    expect(changed.totalCells).toBe(11_400);
    await page.getByLabel('World seed', { exact: true }).fill('ember-19');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().geographySignature))
        .toBe(original.geographySignature);
    await page.getByRole('button', { name: '37', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().totalCells)).toBe(22_200);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).generation.settings.seed).toBe('ember-19');
    await page.getByRole('button', { name: 'Find army', exact: true }).click();
    await expect(page.locator('[data-field="cell-details"]')).toContainText('Drainage outlet');
    await page.getByLabel('Map view', { exact: true }).selectOption('drainage');
    await page.screenshot({ path: 'test-results/client/map-lab-drainage-trace.png', fullPage: true });
    await page.getByLabel('Wetness', { exact: false }).focus();
    await page.getByLabel('Wetness', { exact: false }).press('Home');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.settings.wetness))
        .toBe(0);
    expect(errors).toEqual([]);
});

test('an unplayable scenario reports the issue and keeps the previous map', async ({ page }) => {
    await page.goto('/map-lab');
    await page.getByRole('button', { name: '7-region scenario', exact: true }).click();
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByLabel('World seed', { exact: true }).fill('crop-62');
    for (const label of ['Land target', 'Mountain strength', 'Coastal detail', 'Small island abundance']) {
        await page.getByLabel(label, { exact: false }).focus();
        await page.getByLabel(label, { exact: false }).press('Home');
    }
    await page.getByLabel('Continental cores', { exact: false }).focus();
    await page.getByLabel('Continental cores', { exact: false }).press('End');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect(page.locator('.map-status')).toContainText('previous landscape is still loaded');
    const after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.armyCellId).toBe(before.armyCellId);
    expect(after.generation.settings.seed).toBe('ember-19');
    await page.getByRole('button', { name: 'Find army', exact: true }).click();
    await expect(page.locator('.map-status')).toContainText('Army selected');
});

test('landscape controls shrink caps independently and relief is a display-only layer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    for (const name of [
        'Political ownership',
        'Military control',
        'Micro-cell grid',
        'Region borders',
        'Battle traces',
    ])
        await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    expect(original.scale).toBe('world');
    await page.screenshot({ path: 'test-results/client/map-lab-landscape-overview.png', fullPage: true });
    await page.getByLabel('Polar extent', { exact: false }).focus();
    await page.getByLabel('Polar extent', { exact: false }).press('Home');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    const warm = await page.evaluate(() => window.mapLabDiagnostics());
    expect(warm.generation.settings.polarExtent).toBe(0);
    expect(warm.geographySignature).toBe(original.geographySignature);
    expect(warm.generation.frozenWaterCells).toBeLessThan(original.generation.frozenWaterCells);
    expect(warm.generation.snowCells).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Find north polar ice', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Find south polar ice', exact: true })).toBeDisabled();
    await page.getByLabel('Mountain snowline', { exact: false }).focus();
    await page.getByLabel('Mountain snowline', { exact: false }).press('End');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.snowCells)).toBe(0);
    const checksum = () =>
        page.locator('canvas').evaluate((canvas) => {
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261;
            for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
            return hash;
        });
    const shaded = await checksum();
    await page.getByRole('checkbox', { name: 'Relief shading', exact: true }).uncheck();
    await expect.poll(checksum).not.toBe(shaded);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).geographySignature).toBe(
        original.geographySignature,
    );
    await page.getByRole('checkbox', { name: 'Relief shading', exact: true }).check();
    await expect.poll(checksum).toBe(shaded);
    await page.screenshot({ path: 'test-results/client/map-lab-no-polar-caps.png', fullPage: true });
    await page.getByLabel('Coastal detail', { exact: false }).focus();
    await page.getByLabel('Coastal detail', { exact: false }).press('Home');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).generation.coastEdges).toBeLessThan(
        original.generation.coastEdges,
    );
    expect(errors).toEqual([]);
});

test('island and lake abundance controls regenerate and persist across resolution changes', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    for (const label of ['Small island abundance', 'Lake abundance'])
        await page.getByLabel(label, { exact: false }).press('End');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    const rich = await page.evaluate(() => window.mapLabDiagnostics());
    expect(rich.generation.settings.islandAbundance).toBe(100);
    expect(rich.generation.settings.lakeAbundance).toBe(100);
    expect(rich.generation.islands).toBeGreaterThan(original.generation.islands);
    expect(rich.lakes).toBeGreaterThan(original.lakes);
    expect(rich.generation.settings.coastComplexity).toBe(original.generation.settings.coastComplexity);
    expect(rich.generation.settings.wetness).toBe(original.generation.settings.wetness);
    await page.screenshot({
        path: 'test-results/client/map-lab-plentiful-islands-lakes.png',
        fullPage: true,
    });
    await page.getByRole('button', { name: '37', exact: true }).click();
    const fine = await page.evaluate(() => window.mapLabDiagnostics());
    expect(fine.totalCells).toBe(22200);
    expect(fine.generation.settings.islandAbundance).toBe(100);
    expect(fine.generation.settings.lakeAbundance).toBe(100);
    await page.getByRole('button', { name: '19', exact: true }).click();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).geographySignature).toBe(
        rich.geographySignature,
    );
    await page.getByLabel('Lake abundance', { exact: false }).press('Home');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).lakes).toBe(0);
    await expect(page.getByRole('button', { name: 'Find a lake' })).toBeDisabled();
    for (const label of ['Small island abundance', 'Lake abundance']) {
        const slider = page.getByLabel(label, { exact: false });
        await slider.press('Home');
        for (let step = 0; step < 5; step++) await slider.press('PageUp');
        await expect(slider).toHaveValue('50');
    }
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).geographySignature).toBe(
        original.geographySignature,
    );
    expect(errors).toEqual([]);
});

test('continental worlds show polar materials and keep ice classified as water', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: '600-region world', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.majorContinents))
        .toBe(3);
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.frozenWaterCells))
        .toBeGreaterThan(0);
    await page.getByRole('checkbox', { name: 'Region borders', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Micro-cell grid' }).uncheck();
    await page.getByRole('checkbox', { name: 'Political ownership' }).uncheck();
    await page.getByLabel('Map view', { exact: true }).selectOption('temperature');
    await page.screenshot({ path: 'test-results/client/map-lab-polar-climate.png', fullPage: true });
    await page.getByLabel('Map view', { exact: true }).selectOption('terrain');
    for (const side of ['north', 'south']) {
        await page.getByRole('button', { name: `Find ${side} polar ice`, exact: true }).click();
        await expect
            .poll(() => page.evaluate(() => window.mapLabDiagnostics().metrics.transitionsPending), {
                timeout: 15000,
            })
            .toBe(0);
        const cell = await page.evaluate(() => window.mapLabDiagnostics().selectedCell);
        expect(Math.abs(cell.latitude)).toBeGreaterThan(80);
        expect(cell.temperature).toBeLessThan(0.16);
        expect(cell.frozen || cell.terrain === 'snow').toBe(true);
        if (cell.frozen)
            await expect(page.locator('[data-field="cell-details"]')).toContainText('still impassable');
        await page.screenshot({ path: `test-results/client/map-lab-${side}-pole.png`, fullPage: true });
    }
    await page.getByLabel('Continental cores', { exact: false }).focus();
    await page.getByLabel('Continental cores', { exact: false }).press('End');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.settings.continents))
        .toBe(5);
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().generation.majorContinents))
        .toBeGreaterThanOrEqual(4);
    expect(errors).toEqual([]);
});
