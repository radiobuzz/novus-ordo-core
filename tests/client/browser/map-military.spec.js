import { expect, test } from '@playwright/test';

test('ground orders can be previewed, cancelled, confirmed and advanced without immediate movement', async ({
    page,
}) => {
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try military demo', exact: true }).click();
    await page.getByRole('button', { name: 'Hold / cancel order', exact: true }).click();
    const before = await page.evaluate(() => window.mapLabDiagnostics());
    const occupied = new Set(before.military.formations.map((group) => group.cellId));
    const target = before.reachableTargets.find((cell) => !occupied.has(cell.id));
    expect(target).toBeTruthy();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await expect(page.getByRole('button', { name: 'Confirm order', exact: true })).toBeEnabled();
    await page.screenshot({ path: 'test-results/client/map-lab-movement-preview.png', fullPage: true });
    await page.getByRole('button', { name: 'Discard preview', exact: true }).click();
    expect(
        (await page.evaluate(() => window.mapLabDiagnostics())).military.formations.find(
            (group) => group.id === 'sable-1',
        ).order,
    ).toBeNull();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
    expect(
        (await page.evaluate(() => window.mapLabDiagnostics())).military.formations.find(
            (group) => group.id === 'sable-1',
        ).cellId,
    ).toBe(before.armyCellId);
    for (let i = 0; i < 3; i++)
        await page.getByRole('button', { name: 'Advance simulation', exact: true }).click();
    expect(
        (await page.evaluate(() => window.mapLabDiagnostics())).military.formations.find(
            (group) => group.id === 'sable-1',
        ).cellId,
    ).toBe(target.id);
});

test('military and flag layers preserve the landscape, support individual selection and orders', async ({
    page,
}) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map-lab');
    const original = await page.evaluate(() => window.mapLabDiagnostics());
    await page.getByRole('button', { name: 'Try military demo', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Military formations', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Faction flags', exact: true })).toBeChecked();
    await expect(page.getByRole('group', { name: 'Formation roster' }).getByRole('button')).toHaveCount(15);
    await expect(page.getByRole('progressbar', { name: 'Formation strength' })).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().military.flagsDrawn))
        .toBeGreaterThan(0);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).geographySignature).toBe(
        original.geographySignature,
    );
    await page.screenshot({ path: 'test-results/client/map-lab-military-orders.png', fullPage: true });

    // Collocated aircraft remain individually selectable rather than merged.
    await page.locator('[data-formation="sable-5"]').click();
    await expect(page.getByRole('button', { name: 'Air strike', exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).military.selectedId).toBe('sable-5');
    await page.getByRole('button', { name: 'Air strike', exact: true }).click();
    const enemy = await page.evaluate(() =>
        window.mapLabDiagnostics().military.formations.find((group) => group.id === 'aurelia-1'),
    );
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + enemy.x, box.y + enemy.y);
    await expect(page.getByRole('button', { name: 'Confirm order', exact: true })).toBeEnabled();
    let diagnostics = await page.evaluate(() => window.mapLabDiagnostics());
    expect(diagnostics.military.preview.type).toBe('strike');
    expect(diagnostics.military.formations.find((group) => group.id === 'sable-5').order).toBeNull();
    await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
    await page.getByRole('button', { name: 'Advance simulation', exact: true }).click();
    diagnostics = await page.evaluate(() => window.mapLabDiagnostics());
    expect(diagnostics.military.tick).toBe(1);
    expect(diagnostics.military.formations.find((group) => group.id === 'aurelia-1').strength).toBeLessThan(
        enemy.strength,
    );
    expect(diagnostics.military.formations.find((group) => group.id === 'sable-5').order).toBeNull();
    expect(diagnostics.geographySignature).toBe(original.geographySignature);
    await page.screenshot({ path: 'test-results/client/map-lab-military-combat.png', fullPage: true });

    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: 'test-results/client/map-lab-political-flags.png', fullPage: true });
    await page.getByRole('checkbox', { name: 'Order arrows', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Military formations', exact: true }).uncheck();
    await expect(page.locator('[data-field="military-panel"]')).toBeHidden();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).military.tick).toBe(1);
    await page.getByRole('checkbox', { name: 'Faction flags', exact: true }).uncheck();
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().military.flagsDrawn)).toBe(0);
    await page.getByRole('checkbox', { name: 'Military formations', exact: true }).check();
    await page.getByRole('button', { name: 'Reset military demo', exact: true }).click();
    diagnostics = await page.evaluate(() => window.mapLabDiagnostics());
    expect(diagnostics.military.tick).toBe(0);
    expect(diagnostics.layers.orders).toBe(false);
    expect(diagnostics.layers.flags).toBe(false);
    expect(diagnostics.geographySignature).toBe(original.geographySignature);
    await page.getByRole('button', { name: '37', exact: true }).click();
    expect((await page.evaluate(() => window.mapLabDiagnostics())).totalCells).toBe(22200);
    await expect(page.getByRole('checkbox', { name: 'Military formations', exact: true })).toBeChecked();
    expect(errors).toEqual([]);
});

test('map markers cycle stacked formations and diagnostic views suppress the new overlays', async ({
    page,
}) => {
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try military demo', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().military.markers.length))
        .toBeGreaterThan(0);
    const marker = await page.evaluate(() =>
        window.mapLabDiagnostics().military.markers.find((entry) => entry.ids.includes('sable-1')),
    );
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + marker.x, box.y + marker.y);
    expect((await page.evaluate(() => window.mapLabDiagnostics())).military.selectedId).not.toBe('sable-1');
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().military.markers.length)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.mapLabDiagnostics().military.flagsDrawn)).toBe(0);
    await expect(page.getByRole('checkbox', { name: 'Faction flags', exact: true })).toBeChecked();
    await page.getByLabel('Map view', { exact: true }).selectOption('terrain');
    await expect
        .poll(() => page.evaluate(() => window.mapLabDiagnostics().military.markers.length))
        .toBeGreaterThan(0);
});
