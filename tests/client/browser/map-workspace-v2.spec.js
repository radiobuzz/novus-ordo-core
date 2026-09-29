import { test, expect } from '@playwright/test';
test('icon tabs preserve category inputs, worker generates custom geography, inspector collapses', async ({
    page,
}) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/client/map-generation');
    await expect(page.getByRole('tab', { name: 'World', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    await page.getByLabel('Regions wide', { exact: true }).fill('40');
    await page.getByLabel('Regions tall', { exact: true }).fill('30');
    await page.getByLabel('Resolution', { exact: true }).selectOption('7');
    await page.getByRole('tab', { name: 'Climate', exact: true }).click();
    await page.getByRole('tab', { name: 'World', exact: true }).click();
    await expect(page.getByLabel('Regions wide', { exact: true })).toHaveValue('40');
    await page.getByRole('tab', { name: 'Resources', exact: true }).click();
    await expect(page.getByLabel('Copper', { exact: true })).toBeDisabled();
    await page.getByLabel('Generic ore', { exact: true }).uncheck();
    await page.getByLabel('Copper', { exact: true }).check();
    await expect(page.getByLabel('Generic ore', { exact: true })).toBeDisabled();
    await page.getByLabel('Copper', { exact: true }).uncheck();
    await page.getByLabel('Generic ore', { exact: true }).check();
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect(
        page.getByRole('button', {
            name: 'Start new game with this map',
            exact: true,
        }),
    ).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('.generation-summary')).toContainText('40 × 30');
    await page.getByRole('tab', { name: 'Names', exact: true }).click();
    await expect(page.getByLabel('Geographic feature', { exact: true }).locator('option')).not.toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Ember Sea');
    await page.getByLabel('Find a feature', { exact: true }).fill('Ember Sea');
    await expect(page.getByLabel('Geographic feature', { exact: true }).locator('option')).toHaveCount(1);
    await page.getByLabel('Find a feature', { exact: true }).fill('');
    await page.getByRole('tab', { name: 'Terrain', exact: true }).click();
    await page.getByRole('tab', { name: 'Names', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ember Sea');
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await page.getByLabel('Analysis layer', { exact: true }).selectOption('depth');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('tab', { name: 'Resources', exact: true }).click();
    await page.getByLabel('Generic ore', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect(
        page.getByRole('button', {
            name: 'Start new game with this map',
            exact: true,
        }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await expect(page.getByLabel('Analysis layer', { exact: true })).toHaveValue('depth');
    await expect(page.locator('.map-analysis-legend')).toContainText('Water depth');
    await page.getByRole('tab', { name: 'Names', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ember Sea');
    const inspector = page.getByRole('button', {
        name: 'Inspector',
        exact: true,
    });
    await inspector.click();
    await expect(inspector).toHaveAttribute('aria-expanded', 'false');
    await inspector.click();
    await page.screenshot({
        path: 'test-results/client/map-workspace-v2-desktop.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('tab', { name: 'World', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'World', exact: true }).click();
    await expect(page.getByLabel('Regions wide', { exact: true })).toHaveValue('40');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({
        path: 'test-results/client/map-workspace-v2-narrow.png',
    });
    expect(errors).toEqual([]);
});

test('French narrow sidebar keeps settings and cancellation releases controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/client/map-generation?lang=fr');
    await expect(page.getByRole('tab', { name: 'Monde', exact: true })).toBeVisible();
    await page.getByLabel('Régions en largeur', { exact: true }).fill('40');
    await page.getByRole('tab', { name: 'Climat', exact: true }).click();
    await page.getByRole('tab', { name: 'Monde', exact: true }).click();
    await expect(page.getByLabel('Régions en largeur', { exact: true })).toHaveValue('40');
    await page.getByRole('button', { name: 'Générer le paysage', exact: true }).click();
    await page.getByRole('button', { name: 'Annuler la génération', exact: true }).click();
    await expect(page.getByLabel('Régions en largeur', { exact: true })).toBeEnabled();
    await expect(page.locator('.generation-summary')).toContainText('annulée');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({
        path: 'test-results/client/map-workspace-v2-fr.png',
    });
});
