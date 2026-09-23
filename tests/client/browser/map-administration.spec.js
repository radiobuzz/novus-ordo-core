import { test, expect } from '@playwright/test';
const diagnostics = (page) => page.evaluate(() => window.mapLabDiagnostics());
const start = async (page) => {
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try provinces & zones', exact: true }).click();
};
const ready = (page) =>
    expect.poll(async () => (await diagnostics(page)).terrainV2.pending, { timeout: 45000 }).toBe(0);
const apply = async (page, id) => {
    await page.getByLabel('Administration cell coordinates', { exact: true }).fill(id);
    await page.getByRole('button', { name: 'Apply tool at coordinates', exact: true }).click();
};

test('zone colours and continuous fast strokes remain local, undoable and safely interruptible', async ({
    page,
}) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    await expect(page.getByLabel('Zone overlay colour', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Find overlapping zones', exact: true }).click();
    const before = await diagnostics(page);
    const firstZone = before.administration.editor.areaId;
    const originalColor = before.administration.zones.find((z) => z.id === firstZone).color;
    await page.getByLabel('Administrative area name', { exact: true }).fill('Painted turquoise zone');
    await page.getByRole('button', { name: 'Create area', exact: true }).click();
    const zoneId = (await diagnostics(page)).administration.editor.areaId;
    const color = page.getByLabel('Zone overlay colour', { exact: true });
    await color.fill('#22bb99');
    await page.getByLabel('Administrative area', { exact: true }).selectOption(firstZone);
    await expect(color).toHaveValue(originalColor);
    await page.getByLabel('Administrative area', { exact: true }).selectOption(zoneId);
    await expect(color).toHaveValue('#22bb99');
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('add');
    const initial = await diagnostics(page);
    const box = await page.locator('canvas').boundingBox(),
        point = initial.administration.selected.screen;
    const x = box.x + point.x,
        y = box.y + point.y;
    const count = async () =>
        (await diagnostics(page)).administration.zones.find((z) => z.id === zoneId).count;
    await page.mouse.move(x, y);
    await page.mouse.down();
    expect(await count()).toBe(1); // Paint on down, not on release.
    await page.mouse.move(x + 180, y, { steps: 1 });
    expect(await count()).toBeGreaterThan(2); // Interpolate between sparse pointer events.
    await page.mouse.move(x, y, { steps: 1 });
    const painted = await count();
    await page.mouse.up();
    let after = await diagnostics(page);
    expect(after.administration.historyLength).toBe(1);
    expect(after.camera).toEqual(initial.camera);
    expect(after.geographySignature).toBe(initial.geographySignature);
    await page.screenshot({
        path: 'test-results/client/map-administration-paint-colour.png',
        fullPage: true,
    });
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('remove');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 180, y, { steps: 1 });
    await page.mouse.up();
    expect(await count()).toBe(0);
    const undo = page.getByRole('button', { name: 'Undo last boundary edit', exact: true });
    await undo.click();
    expect(await count()).toBe(painted);
    await undo.click();
    expect(await count()).toBe(0);
    await expect(color).toHaveValue('#22bb99');
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('add');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.keyboard.press('Escape');
    await page.mouse.move(x + 180, y);
    await page.mouse.up();
    expect(await count()).toBe(1);
    await expect(page.getByLabel('Administration map tool', { exact: true })).toHaveValue('inspect');
    await undo.click();
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('add');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.locator('canvas').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.move(x + 180, y);
    await page.mouse.up();
    expect(await count()).toBe(1);
    await undo.click();
    // Pointer capture releases outside the map and never leaves the brush stuck down.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 1 });
    await page.mouse.up();
    await page.mouse.move(x + 180, y);
    expect(await count()).toBe(1);
    after = await diagnostics(page);
    expect(after.administration.historyLength).toBe(1);
    expect(after.administration.countries).toEqual(before.administration.countries);
    expect(after.administration.provinces).toEqual(before.administration.provinces);
    expect(after.administration.zones.find((z) => z.id === firstZone).color).toBe(originalColor);
    expect(errors).toEqual([]);
});

test('administration edits exclusive provinces and overlapping zones without changing terrain or ownership', async ({
    page,
}) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    const before = await diagnostics(page);
    expect(before.administration.active).toBe(true);
    await page.screenshot({ path: 'test-results/client/map-administration-world.png', fullPage: true });
    const listedProvince = page.locator('[data-admin-list] button').filter({ hasText: 'Heartland Province' });
    await listedProvince.click();
    await expect(listedProvince).toBeFocused();
    await page.getByRole('button', { name: 'Find overlapping zones', exact: true }).click();
    const overlap = await diagnostics(page),
        id = overlap.administration.selected.cellId;
    expect(overlap.administration.selected.zoneIds.length).toBeGreaterThan(1);
    await expect(page.locator('[data-admin-membership]')).toContainText('Coastal development');
    await expect(page.locator('[data-admin-membership]')).toContainText('River-valley development');
    await page.getByLabel('Administrative area type', { exact: true }).selectOption('province');
    await page.getByLabel('Administrative area name', { exact: true }).fill('Cross-hex Province');
    await page.getByRole('button', { name: 'Create area', exact: true }).click();
    const province = (await diagnostics(page)).administration.editor.areaId;
    await apply(page, id);
    let after = await diagnostics(page);
    expect(after.administration.selected.provinceId).toBe(province);
    expect(after.administration.selected.zoneIds).toEqual(overlap.administration.selected.zoneIds);
    await page.getByLabel('Administrative area name', { exact: true }).fill('<New & Safe> Province');
    await page.getByRole('button', { name: 'Rename area', exact: true }).click();
    await expect(page.locator('[data-admin-membership]')).toContainText('<New & Safe> Province');
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('remove');
    await apply(page, id);
    expect((await diagnostics(page)).administration.selected.provinceId).toBeUndefined();
    await page.getByRole('button', { name: 'Undo last boundary edit', exact: true }).click();
    expect((await diagnostics(page)).administration.selected.provinceId).toBe(province);
    await page.getByLabel('Administrative area type', { exact: true }).selectOption('zone');
    await page.getByLabel('Administrative area name', { exact: true }).fill('Research corridor');
    await page.getByRole('button', { name: 'Create area', exact: true }).click();
    const zone = (await diagnostics(page)).administration.editor.areaId;
    await apply(page, id);
    after = await diagnostics(page);
    expect(after.administration.selected.zoneIds).toContain(zone);
    expect(after.administration.selected.zoneIds.length).toBe(
        overlap.administration.selected.zoneIds.length + 1,
    );
    expect(after.administration.selected.provinceId).toBe(province);
    const home = after.administration.editor.nationId;
    const other = after.administration.countries.find((n) => n.id !== home).id;
    await page.getByLabel('Administration country', { exact: true }).selectOption(other);
    const foreign = (await diagnostics(page)).administration.samples[0].id;
    await page.getByLabel('Administration country', { exact: true }).selectOption(home);
    await page.getByLabel('Administrative area', { exact: true }).selectOption(zone);
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('add');
    await apply(page, foreign);
    await expect(page.locator('.map-status')).toContainText('Ownership cannot be edited');
    after = await diagnostics(page);
    expect(after.geographySignature).toBe(before.geographySignature);
    expect(after.administration.countries).toEqual(before.administration.countries);
    expect(after.economy.accounts).toEqual(before.economy.accounts);
    expect(after.armyCellId).toBe(before.armyCellId);
    expect(after.atlas.features).toEqual(before.atlas.features);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Reset political setup', exact: true }).click();
    expect((await diagnostics(page)).administration.zones.some((z) => z.id === zone)).toBe(true);
    const camera = (await diagnostics(page)).camera;
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Reset political setup', exact: true }).click();
    after = await diagnostics(page);
    expect(after.administration.provinces).toEqual(before.administration.provinces);
    expect(after.administration.zones).toEqual(before.administration.zones);
    expect(after.camera).toEqual(camera);
    expect(errors).toEqual([]);
});

test('Terrain V2 supports stamps, pan, zoom, independent borders and clean return to old fixtures', async ({
    page,
}) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map-lab');
    await page.getByRole('button', { name: 'Try military demo', exact: true }).click();
    const before = await diagnostics(page);
    await page.getByRole('button', { name: 'Try provinces & zones', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Terrain v2 · layered landscape', exact: true }).check();
    await page.getByRole('button', { name: 'Find overlapping zones', exact: true }).click();
    await ready(page);
    await expect.poll(async () => (await diagnostics(page)).terrainV2.active).toBe(true);
    await page.screenshot({ path: 'test-results/client/map-administration-v2.png', fullPage: true });
    await page.getByLabel('Administrative area name', { exact: true }).fill('Stamped zone');
    await page.getByRole('button', { name: 'Create area', exact: true }).click();
    await page.getByLabel('Administration brush size', { exact: true }).selectOption('1');
    let state = await diagnostics(page);
    const box = await page.locator('canvas').boundingBox(),
        point = state.administration.selected.screen;
    await page.mouse.click(box.x + point.x, box.y + point.y);
    state = await diagnostics(page);
    const selected = state.administration.zones.find((z) => z.id === state.administration.editor.areaId);
    expect(selected.count).toBeGreaterThan(0);
    const revision = state.administration.revision;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.55 + 30, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    state = await diagnostics(page);
    expect(state.administration.revision).toBe(revision);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await ready(page);
    await page.locator('canvas').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Administration map tool', { exact: true })).toHaveValue('inspect');
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('add');
    await page.getByRole('checkbox', { name: 'Development zones', exact: true }).uncheck();
    await expect(page.getByLabel('Administration map tool', { exact: true })).toHaveValue('inspect');
    await page.getByRole('checkbox', { name: 'Development zones', exact: true }).check();
    await page.getByLabel('Administration map tool', { exact: true }).selectOption('add');
    const beforeNavigation = (await diagnostics(page)).administration.revision;
    await page.getByRole('button', { name: 'Find army', exact: true }).click();
    expect((await diagnostics(page)).administration.revision).toBe(beforeNavigation);
    await expect(page.getByLabel('Administration map tool', { exact: true })).toHaveValue('inspect');
    for (const label of [
        'National borders & tint',
        'Provincial borders',
        'Development zones',
        'Region borders',
        'Micro-cell grid',
    ]) {
        const field = page.getByRole('checkbox', { name: label, exact: true });
        const checked = await field.isChecked();
        await field.setChecked(!checked);
        await field.setChecked(checked);
    }
    expect((await diagnostics(page)).terrainV2.pixels).toBeLessThanOrEqual(
        (await diagnostics(page)).terrainV2.pixelBudget,
    );
    await page.getByLabel('Map view', { exact: true }).selectOption('elevation');
    await expect.poll(async () => (await diagnostics(page)).administration.labels.length).toBe(0);
    await page.getByLabel('Map view', { exact: true }).selectOption('terrain');
    await page.getByRole('button', { name: 'Inspect formations', exact: true }).click();
    const restored = await diagnostics(page);
    expect(restored.administration.active).toBe(false);
    expect(restored.layers.formations).toBe(before.layers.formations);
    expect(restored.geographySignature).toBe(before.geographySignature);
    await expect(page.locator('[data-field="military-panel"]')).toBeVisible();
    expect(errors).toEqual([]);
});

test('narrow controls, coordinate alternative and 22,200-cell regeneration stay usable', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 430, height: 900 });
    await start(page);
    let state = await diagnostics(page);
    await apply(page, state.administration.samples[0].id);
    await expect(page.locator('[data-admin-membership]')).toContainText(
        state.administration.countries[0].name,
    );
    await page.getByRole('button', { name: '37', exact: true }).click();
    state = await diagnostics(page);
    expect(state.totalCells).toBe(22200);
    expect(state.administration.editor.operation).toBe('inspect');
    expect(state.administration.provinces.length).toBe(9);
    await page.screenshot({ path: 'test-results/client/map-administration-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});
