import { test, expect } from '@playwright/test';

test('bottom layer dock uses generated geography, one analysis and independent decorations', async ({
    page,
}) => {
    const errors = [],
        commands = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
        if (r.method() !== 'GET') commands.push(r.url());
    });
    await page.goto('/dev-panel/ui-foundations#map-layers');
    const lab = page.locator('.map-layers-lab');
    await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await lab.scrollIntoViewIfNeeded();
    await lab.getByLabel('Elevation', { exact: true }).check();
    await expect(lab.locator('.ll-legend')).toContainText('Elevation');
    await lab.getByRole('tab', { name: 'Resources', exact: true }).click();
    await lab.getByLabel('Resource distribution', { exact: true }).check();
    await lab.getByLabel('Resource', { exact: true }).selectOption('oil');
    await expect(lab.locator('.ll-legend')).toContainText('Oil');
    await expect(lab.locator('input[type=radio]:checked')).toHaveCount(1);
    await lab.getByRole('tab', { name: 'Military', exact: true }).click();
    await expect(lab.getByLabel('Defense strength', { exact: true })).toBeDisabled();
    await lab.getByLabel('Viewing context', { exact: true }).selectOption('governing');
    await lab.getByLabel('Defense strength', { exact: true }).check();
    await expect(lab.locator('.ll-legend')).toContainText('hatched = unavailable');
    await lab.getByRole('tab', { name: 'Display', exact: true }).click();
    await lab.locator('summary').filter({ hasText: 'Lines & markers' }).click();
    await lab.getByLabel('Unit markers (sample)', { exact: true }).check();
    await lab.getByLabel('Region borders', { exact: true }).uncheck();
    await expect(lab.locator('.ll-legend')).toContainText('Defense strength');
    await page.keyboard.press('Escape');
    await expect(lab.locator('.ll-drawer')).toBeHidden();
    await expect(lab.getByRole('tab', { name: 'Display', exact: true })).toBeFocused();
    await expect(lab.locator('.ll-legend')).toBeVisible();
    await lab.screenshot({ path: 'test-results/client/layer-menu-defense.png' });
    await lab.getByLabel('Viewing context', { exact: true }).selectOption('founding');
    await expect(lab.locator('.ll-legend')).toContainText('Natural landscape');
    await lab.getByRole('tab', { name: 'Water & coasts', exact: true }).click();
    await lab.getByLabel('Shore accessibility', { exact: true }).check();
    await lab.screenshot({ path: 'test-results/client/layer-menu-coasts.png' });
    expect(errors).toEqual([]);
    expect(commands).toEqual([]);
});

test('French mobile labels, keyboard categories, retained inputs and lifecycle cleanup', async ({ page }) => {
    await page.goto('/dev-panel/ui-foundations');
    const baseline = await page.evaluate(() => window.novusFoundationDiagnostics());
    await page.getByRole('button', { name: 'Open map layers experiment', exact: true }).click();
    const lab = page.locator('.map-layers-lab');
    await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await lab.getByRole('tab', { name: 'Resources', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(lab.getByRole('tab', { name: 'Population & economy', exact: true })).toBeFocused();
    await lab.getByLabel('Lab language', { exact: true }).selectOption('fr');
    await page.setViewportSize({ width: 390, height: 900 });
    await lab.getByRole('tab', { name: 'Ressources', exact: true }).click();
    await lab.getByLabel('Potentiel agricole', { exact: true }).check();
    await expect(lab.locator('.ll-legend')).toContainText('Potentiel agricole');
    await lab.screenshot({ path: 'test-results/client/layer-menu-mobile-fr.png' });
    for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const drawer = await lab.locator('.ll-drawer').boundingBox();
        const dock = await lab.locator('.ll-dock').boundingBox();
        expect(drawer.y + drawer.height).toBeLessThanOrEqual(dock.y);
    }
    await lab.getByRole('button', { name: 'Fermer l’expérience des couches', exact: true }).click();
    await expect(page.locator('.map-layers-dialog')).not.toBeVisible();
    expect(await page.evaluate(() => window.novusFoundationDiagnostics())).toEqual(baseline);
});

test('appearance keeps river geometry independent from names, supplies legends and hides oceans', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
        // Observe the actual canvas draw rather than trusting checkbox state.
        const proto = CanvasRenderingContext2D.prototype;
        const fillRect = proto.fillRect,
            stroke = proto.stroke,
            fillText = proto.fillText;
        proto.fillRect = function (...args) {
            if (this.canvas.closest('.map-layers-lab') && args[0] === 0 && args[1] === 0) {
                window.layerPaint = { rivers: [], names: [] };
            }
            return fillRect.apply(this, args);
        };
        proto.stroke = function (...args) {
            if (this.canvas.closest('.map-layers-lab') && ['#60c6e0', '#60b6cc'].includes(this.strokeStyle))
                window.layerPaint?.rivers.push(this.globalAlpha);
            return stroke.apply(this, args);
        };
        proto.fillText = function (text, ...args) {
            if (this.canvas.closest('.map-layers-lab')) window.layerPaint?.names.push(text);
            return fillText.call(this, text, ...args);
        };
    });
    await page.goto('/dev-panel/ui-foundations#map-layers');
    const lab = page.locator('.map-layers-lab');
    await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await lab.getByLabel('Temperature', { exact: true }).check();
    await expect(lab.getByLabel('Include water in analysis')).not.toBeChecked();
    await expect.poll(() => page.evaluate(() => window.layerPaint.rivers.length)).toBeGreaterThan(0);
    await lab.getByRole('tab', { name: 'Display', exact: true }).click();
    await lab.getByLabel('Ocean', { exact: true }).uncheck();
    await expect(lab.locator('.ll-legend')).toContainText('Ocean hidden');
    await expect
        .poll(() => page.evaluate(() => window.layerPaint.names.some((n) => /Ocean/.test(n))))
        .toBe(false);
    await lab.getByLabel('Detail zoom threshold', { exact: true }).fill('48');
    await lab
        .locator('summary')
        .filter({ hasText: /^Names$/ })
        .click();
    await lab.getByLabel('River names', { exact: true }).uncheck();
    await expect
        .poll(() => page.evaluate(() => window.layerPaint.names.some((n) => /River/.test(n))))
        .toBe(false);
    await expect.poll(() => page.evaluate(() => window.layerPaint.rivers.length)).toBeGreaterThan(0);
    await lab.getByLabel('Geographic names', { exact: true }).uncheck();
    await expect.poll(() => page.evaluate(() => window.layerPaint.names.length)).toBe(0);
    await lab.locator('summary').filter({ hasText: 'Lines & markers' }).click();
    await expect(lab.getByLabel('Rivers', { exact: true })).toBeChecked();
    await lab.getByLabel('Rivers opacity', { exact: true }).fill('35');
    await expect
        .poll(() => page.evaluate(() => window.layerPaint.rivers.every((a) => Math.abs(a - 0.35) < 0.001)))
        .toBe(true);
    await lab.getByLabel('Rivers opacity', { exact: true }).fill('100');
    await lab.getByRole('tab', { name: 'Land & climate', exact: true }).click();
    await lab.getByLabel('Biomes', { exact: true }).check();
    await expect(lab.locator('.ll-legend-entries')).toContainText('Grassland');
    await expect(lab.locator('.ll-legend-entries')).toContainText('Forest');
    await lab.screenshot({ path: 'test-results/client/layer-menu-polished-biomes.png' });
    await lab.getByLabel('Temperature', { exact: true }).check();
    await lab.getByRole('button', { name: 'Close layers', exact: true }).click();
    await lab.screenshot({ path: 'test-results/client/layer-menu-polished-temperature.png' });
    await lab.getByRole('tab', { name: 'Display', exact: true }).click();
    await expect(lab.getByLabel('Ocean', { exact: true })).not.toBeChecked();
    await expect(lab.getByLabel('River names', { exact: true })).not.toBeChecked();
    await expect(lab.getByLabel('Detail zoom threshold', { exact: true })).toHaveValue('48');
    await page.setViewportSize({ width: 390, height: 900 });
    await lab.screenshot({ path: 'test-results/client/layer-menu-polished-appearance-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
});

test('fullscreen lab actually renders distant detail when the threshold is lowered', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/dev-panel/ui-foundations#map-layers');
    const lab = page.locator('.map-layers-lab');
    await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    const bounds = await lab.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(1430);
    expect(bounds.height).toBeGreaterThanOrEqual(890);
    await expect(lab).toHaveAttribute('data-detail-state', 'zoom');
    await lab.getByRole('tab', { name: 'Display', exact: true }).click();
    const canvas = lab.locator('canvas');
    const pixelHash = () =>
        canvas.evaluate((c) => {
            const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let hash = 0;
            for (let i = 0; i < data.length; i += 37) hash = (Math.imul(hash, 31) + data[i]) | 0;
            return hash;
        });
    const before = await pixelHash();
    await lab.getByLabel('Detail zoom threshold', { exact: true }).fill('8');
    await expect(lab).toHaveAttribute('data-detail-state', 'active');
    await expect(lab).toHaveAttribute('data-detail-pending', '0', { timeout: 75000 });
    expect(await pixelHash()).not.toBe(before);
    expect(errors).toEqual([]);
    await lab.screenshot({ path: 'test-results/client/layer-menu-fullscreen-detail.png' });
    await lab.getByLabel('Detail zoom threshold', { exact: true }).fill('192');
    await expect(lab).toHaveAttribute('data-detail-state', 'zoom');
    await lab.getByRole('button', { name: 'Close map layers experiment', exact: true }).click();
    await expect(page.locator('.map-layers-dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Open map layers experiment', exact: true })).toBeFocused();
});

test('legends and cell inspection use readable units in English and French', async ({ page }) => {
    await page.goto('/dev-panel/ui-foundations#map-layers');
    const lab = page.locator('.map-layers-lab');
    await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await lab.getByLabel('Temperature', { exact: true }).check();
    await expect(lab.locator('.ll-ticks')).toHaveText('-20 °C5 °C30 °C');
    await lab.getByLabel('Include water in analysis').check();
    await lab.getByRole('button', { name: 'Close layers', exact: true }).click();
    const canvas = lab.locator('canvas'),
        box = await canvas.boundingBox();
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(lab.locator('.ll-detail')).toContainText('°C');
    await lab.getByLabel('Lab language', { exact: true }).selectOption('fr');
    await expect(lab.locator('.ll-detail')).toContainText('Température');
    await expect(lab.locator('.ll-detail')).toContainText('°C');
    await lab.getByRole('tab', { name: 'Terres et climat', exact: true }).click();
    await lab.getByLabel('Précipitations', { exact: true }).check();
    await expect(lab.locator('.ll-ticks')).toHaveText('0/10050/100100/100');
    await expect(lab.locator('.ll-legend')).toContainText('Score de précipitations');
    await expect(lab.locator('.ll-detail')).toContainText('/100');
    await page.setViewportSize({ width: 390, height: 900 });
    await lab.screenshot({ path: 'test-results/client/layer-menu-readable-units-fr.png' });
    expect(await lab.locator('.ll-legend').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test('wide basin legend wraps entries across rows with one bounded scrolling list', async ({ page }) => {
    await page.goto('/dev-panel/ui-foundations#map-layers');
    const lab = page.locator('.map-layers-lab');
    await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await lab.getByRole('tab', { name: 'Water & coasts', exact: true }).click();
    await lab.getByLabel('Drainage basins', { exact: true }).check();
    const legend = lab.locator('.ll-legend'),
        entries = lab.locator('.ll-legend-entries');
    const compactWidth = async () => {
        expect((await legend.boundingBox()).width).toBeLessThanOrEqual(361);
        expect(await legend.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    };
    await lab.getByLabel('Drainage flow', { exact: true }).check();
    await compactWidth();
    await lab.screenshot({ path: 'test-results/client/layer-menu-compact-gradient.png' });
    await lab.getByRole('tab', { name: 'Land & climate', exact: true }).click();
    await lab.getByLabel('Snow & ice', { exact: true }).check();
    await compactWidth();
    await lab.getByRole('tab', { name: 'Water & coasts', exact: true }).click();
    await lab.getByLabel('Drainage basins', { exact: true }).check();

    await expect(legend).toContainText('outlet catchments');
    await expect(legend).toContainText('colours do not measure water quantity');
    await expect(entries.locator('.ll-legend-entry').first()).toContainText('Outlet (');
    const mapBox = await lab.locator('.ll-stage').boundingBox(),
        legendBox = await legend.boundingBox();
    expect(legendBox.width).toBeGreaterThan(mapBox.width * 0.9);
    const a = await entries.locator('.ll-legend-entry').nth(0).boundingBox();
    const b = await entries.locator('.ll-legend-entry').nth(1).boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(await entries.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await legend.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await entries.focus();
    await page.keyboard.press('End');
    await expect.poll(() => entries.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await entries.evaluate((el) => {
        el.scrollTop = 0;
    });
    await lab.screenshot({ path: 'test-results/client/layer-menu-horizontal-basins.png' });
    await lab.getByLabel('Lab language', { exact: true }).selectOption('fr');
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(legend).toContainText('coordonnées');
    expect(await legend.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await lab.screenshot({ path: 'test-results/client/layer-menu-horizontal-basins-mobile.png' });
    await lab.getByLabel('Profondeur de l’eau', { exact: true }).check();
    await expect(lab.locator('.ll-legend-help')).toBeHidden();
    await expect(lab.locator('.ll-ticks')).toContainText('m');
});
