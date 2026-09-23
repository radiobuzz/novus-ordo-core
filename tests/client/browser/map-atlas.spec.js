import { test, expect } from '@playwright/test';

test('one feature atlas supports landmasses, ranges, lakes, overlap and area reclassification', async ({
    page,
}) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('button', { name: 'Try geographic names', exact: true }).click();
    for (const [type, label] of [
        ['continent', 'Continent names'],
        ['mountain', 'Mountain range names'],
        ['island', 'Island names'],
        ['lake', 'Lake names'],
    ]) {
        const feature = before.atlas.features.find((f) => f.type === type);
        expect(feature).toBeTruthy();
        await page.getByLabel('Named feature', { exact: true }).selectOption(feature.id);
        await page.getByRole('button', { name: 'Find named feature', exact: true }).click();
        await expect(page.locator('[data-atlas-title]')).toHaveText(feature.name);
        if (type === 'lake') await expect(page.locator('[data-field="cell-title"]')).toHaveText(feature.name);
        await expect
            .poll(() =>
                page.evaluate(
                    (id) => window.mapLabDiagnostics().atlas.labels.some((l) => l.id === id),
                    feature.id,
                ),
            )
            .toBe(true);
        const found = await page.evaluate(() => window.mapLabDiagnostics());
        expect(found.atlas.memberships).toContain(feature.id);
        if (type === 'lake' || type === 'mountain') expect(found.atlas.memberships.length).toBeGreaterThan(1);
        await page.screenshot({ path: `test-results/client/map-atlas-${type}.png`, fullPage: true });
        await page.getByRole('checkbox', { name: label, exact: true }).uncheck();
        await expect
            .poll(() =>
                page.evaluate((t) => window.mapLabDiagnostics().atlas.labels.some((l) => l.kind === t), type),
            )
            .toBe(false);
        await page.getByRole('checkbox', { name: label, exact: true }).check();
    }
    await page.getByLabel('Minimum continent area', { exact: true }).selectOption('80');
    await page.getByRole('button', { name: 'Classify landmasses', exact: true }).click();
    const classified = await page.evaluate(() => window.mapLabDiagnostics());
    expect(classified.atlas.featureSettings.continentMinimum).toBe(80);
    expect(classified.geographySignature).toBe(before.geographySignature);
    expect(classified.economy.accounts).toEqual(before.economy.accounts);
    expect(classified.atlas.features.map((f) => f.id)).toEqual(before.atlas.features.map((f) => f.id));
    await page.getByRole('button', { name: '37', exact: true }).click();
    expect(
        (await page.evaluate(() => window.mapLabDiagnostics())).atlas.featureSettings.continentMinimum,
    ).toBe(80);
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().atlas.labels.length)).toBe(0);
    expect(errors).toEqual([]);
});

test('ocean membership, centred names, river lookup and diagnostic suppression preserve geography', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('button', { name: 'Try geographic names', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () => window.mapLabDiagnostics().atlas.labels.filter((l) => l.kind === 'ocean').length,
            ),
        )
        .toBeGreaterThan(1);
    await page.screenshot({ path: 'test-results/client/map-atlas-oceans.png', fullPage: true });
    const named = await page.evaluate(() => window.mapLabDiagnostics());
    const label = named.atlas.labels.find((l) => l.kind === 'ocean');
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + label.x, box.y + label.y);
    await expect(page.locator('[data-atlas-title]')).toHaveText(label.name);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).atlas.selectedOcean).toBe(label.id);
    const river = named.atlas.rivers.reduce((best, r) => (r.length > best.length ? r : best));
    await page.getByLabel('Named feature', { exact: true }).selectOption(river.id);
    await page.getByRole('button', { name: 'Find named feature', exact: true }).click();
    await expect(page.locator('[data-atlas-title]')).toHaveText(river.name);
    await expect
        .poll(() =>
            page.evaluate(
                () => window.mapLabDiagnostics().atlas.labels.filter((l) => l.kind === 'river').length,
            ),
        )
        .toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/client/map-atlas-river.png', fullPage: true });
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().atlas.labels.length)).toBe(0);
    await expect(page.getByRole('checkbox', { name: 'Ocean names', exact: true })).toBeChecked();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).geographySignature).toBe(
        before.geographySignature,
    );
    expect(errors).toEqual([]);
});

test('all natural resources, abundance and richness controls update only the survey and economic capacity', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('button', { name: 'Try natural resources', exact: true }).click();
    for (const kind of ['Oil', 'Iron', 'Copper', 'Coal', 'Timber']) {
        await page.getByLabel('Natural resource', { exact: true }).selectOption(kind);
        await expect
            .poll(() => page.evaluate(() => window.mapLabDiagnostics().atlas.resourceCells))
            .toBeGreaterThan(0);
        await page.screenshot({
            path: `test-results/client/map-atlas-${kind.toLowerCase()}.png`,
            fullPage: true,
        });
    }
    await page.getByLabel('Resource richness', { exact: true }).selectOption('200');
    await page.getByRole('button', { name: 'Apply resource settings', exact: true }).click();
    let after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.atlas.totals.Oil.quantity).toBeCloseTo(before.atlas.totals.Oil.quantity * 2, 5);
    expect(after.economy.accounts).toEqual(before.economy.accounts);
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.atlas.oceans.map((o) => o.name)).toEqual(before.atlas.oceans.map((o) => o.name));
    await page.getByLabel('Deposit abundance', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: 'Apply resource settings', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().atlas.resourceCells)).toBe(0);
    after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.economy.totals.aurelia.Oil.production).toBe(0);
    await page.getByRole('button', { name: '37', exact: true }).click();
    after = await page.evaluate(() => window.mapLabDiagnostics());
    expect(after.totalCells).toBe(22200);
    expect(after.atlas.settings.abundance).toBe(0);
    expect(after.atlas.settings.richness).toBe(200);
    expect(after.layers.resources).toBe(true);
    expect(errors).toEqual([]);
});

test('atlas controls remain usable on a narrow viewport and names restore with the seed', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try geographic names', exact: true }).click();
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByLabel('World seed', { exact: true }).fill('riverlands');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await page.getByLabel('World seed', { exact: true }).fill('ember-19');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    const restored = await page.evaluate(() => window.mapLabDiagnostics());
    expect(restored.atlas.oceans.map((o) => [o.name, o.anchorId, o.count])).toEqual(
        original.atlas.oceans.map((o) => [o.name, o.anchorId, o.count]),
    );
    expect(restored.layers.oceanNames).toBe(true);
    await page.getByRole('button', { name: 'Try natural resources', exact: true }).click();
    await page.getByLabel('Natural resource', { exact: true }).selectOption('Copper');
    await page.screenshot({ path: 'test-results/client/map-atlas-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});
