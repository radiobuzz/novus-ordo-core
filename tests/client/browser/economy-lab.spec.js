import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function observations(page, label = 'Export observations') {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

test('economic experiments preserve seasonal evidence, balance accounts and make no data requests', async ({
    page,
}) => {
    const errors = [],
        dataRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (['fetch', 'xhr'].includes(request.resourceType())) dataRequests.push(request.url());
    });
    await page.goto('/dev-panel/economy-lab');
    await expect(page.getByRole('heading', { name: 'Economy Lab', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    await expect(page.getByTestId('conservation')).toContainText('Balanced');
    let snapshot = await observations(page);
    expect(snapshot.state.history[0].countries.aurelia.imports).toBe(20);
    expect(snapshot.state.history[0].price).toBe(10);
    await page.getByRole('button', { name: 'Military buildup', exact: true }).click();
    await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    await expect(page.locator('.economy-explanation')).toContainText('military need changed from 20 → 40');
    await page.getByRole('button', { name: 'Borealis export ban', exact: true }).click();
    await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    await expect(page.locator('.economy-explanation')).toContainText('withheld from export');
    await page.getByRole('button', { name: 'Run 20 seasons', exact: true }).click();
    snapshot = await observations(page);
    expect(snapshot.state.season).toBe(23);
    expect(snapshot.state.history[0].settings.countries.aurelia.military).toBe(20);
    for (const r of snapshot.state.history) {
        expect(Math.abs(r.accounts.moneyError)).toBeLessThan(0.000001);
        expect(Math.abs(r.accounts.copperError)).toBeLessThan(0.000001);
    }
    await page.getByLabel('Inspect season', { exact: true }).selectOption('1');
    await expect(page.getByLabel('Inspect season', { exact: true })).toBeFocused();
    await expect(page.locator('.economy-explanation')).toContainText('imported 20 copper for 200');
    await page.screenshot({ path: 'test-results/client/economy-lab-desktop.png', fullPage: true });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ready for the first season' })).toBeVisible();
    expect(dataRequests).toEqual([]);
    expect(errors).toEqual([]);
});

test('allocation, validation and reset affect only the intended experiment', async ({ page }) => {
    await page.goto('/dev-panel/economy-lab');
    await page.getByRole('button', { name: 'Military buildup', exact: true }).click();
    await page.getByText('Market rules and assumptions', { exact: true }).click();
    await page.getByLabel('Allocation during shortages', { exact: true }).selectOption('military');
    await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    let snapshot = await observations(page);
    expect(snapshot.state.history[0].countries.aurelia.requests[2].delivered).toBe(40);
    const production = page
        .locator('.economy-country--borealis')
        .getByLabel('Base installed capacity', { exact: true });
    await production.fill('-1');
    await expect(page.getByRole('button', { name: 'Advance one season', exact: true })).toBeDisabled();
    await expect(page.getByText('Enter a number within the limits.', { exact: true })).toBeVisible();
    await production.fill('30');
    await expect(page.getByRole('button', { name: 'Advance one season', exact: true })).toBeEnabled();
    await expect(production).toBeFocused();
    await page.getByRole('button', { name: 'Reset run', exact: true }).click();
    snapshot = await observations(page);
    expect(snapshot.state.season).toBe(0);
    expect(snapshot.settings.countries.borealis.capacity).toBe(30);
    await page.getByRole('button', { name: 'Restore baseline settings', exact: true }).click();
    await expect(production).toHaveValue('60');
    await expect(page.getByLabel('Allocation during shortages', { exact: true })).toHaveValue('proportional');
    await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    snapshot = await observations(page);
    expect(snapshot.state.history[0].accounts.consumed).toBe(100);
});

test('French mobile layout, keyboard inputs and zero-supply results remain usable', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev-panel/economy-lab?lang=fr');
    await expect(page.getByRole('heading', { name: 'Laboratoire économique', exact: true })).toBeVisible();
    for (const id of ['aurelia', 'borealis']) {
        const input = page
            .locator(`.economy-country--${id}`)
            .getByLabel('Capacité installée de base', { exact: true });
        await input.focus();
        await input.press('ControlOrMeta+a');
        await input.press('0');
    }
    await page.getByRole('button', { name: 'Simuler 20 saisons', exact: true }).click();
    const snapshot = await observations(page, 'Exporter les observations');
    expect(snapshot.state.history[0].accounts.consumed).toBe(0);
    expect(snapshot.state.season).toBe(20);
    await expect(page.getByTestId('conservation')).toContainText('Équilibré');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/economy-lab-mobile-fr.png', fullPage: true });
    await page.getByRole('combobox', { name: 'Langue', exact: true }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Economy Lab', exact: true })).toBeVisible();
    await expect(page.getByLabel('Inspect season', { exact: true })).toHaveValue('20');
    expect(errors).toEqual([]);
});

test('paired stories preserve the interactive run and explain delayed capacity in both languages', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/dev-panel/economy-lab');
    await expect(
        page.getByRole('checkbox', { name: 'Automatic private investment in Aurelia' }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    await page.getByRole('button', { name: 'Compare three stories', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Same starting conditions, different investment decisions' }),
    ).toBeVisible();
    let snapshot = await observations(page);
    expect(snapshot.version).toBe(2);
    expect(snapshot.state.season).toBe(1);
    expect(snapshot.comparison.stories).toHaveLength(3);
    const temporary = snapshot.comparison.stories[2];
    expect(temporary.runs[1].state.countries.aurelia.builtCapacity).toBeGreaterThan(0);
    expect(temporary.runs[0].state.countries.aurelia.builtCapacity).toBe(0);
    await page
        .locator('.economy-comparison')
        .screenshot({ path: 'test-results/client/economy-lab-investment-comparison.png' });
    await page.getByRole('button', { name: 'Military buildup', exact: true }).click();
    for (let i = 0; i < 3; i++)
        await page.getByRole('button', { name: 'Advance one season', exact: true }).click();
    snapshot = await observations(page);
    expect(snapshot.state.countries.aurelia.projects.length).toBeGreaterThan(0);
    const pending = snapshot.state.countries.aurelia.projects;
    await page.getByRole('button', { name: 'End military buildup', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Automatic private investment in Aurelia' }).uncheck();
    await page.getByRole('button', { name: 'Run 20 seasons', exact: true }).click();
    snapshot = await observations(page);
    expect(snapshot.state.countries.aurelia.builtCapacity).toBeCloseTo(
        pending.reduce((n, p) => n + p.capacity, 0),
    );
    expect(snapshot.state.history.at(-1).settings.investmentEnabled).toBe(false);
    expect(snapshot.state.history.at(-1).accounts.investmentSpending).toBe(0);
    // Comparison is a captured experiment, not silently recomputed on control edits.
    expect(snapshot.comparison.settings.investmentEnabled).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await expect(
        page.getByRole('heading', {
            name: 'Mêmes conditions initiales, décisions d’investissement différentes',
        }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByText('Hypothèses d’investissement', { exact: true }).click();
    const delay = page.getByLabel('Délai de construction', { exact: true });
    await delay.fill('1.5');
    await expect(page.getByRole('button', { name: 'Avancer d’une saison', exact: true })).toBeDisabled();
    await delay.fill('4');
    await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
    snapshot = await observations(page, 'Exporter les observations');
    expect(snapshot.state.countries.aurelia.projects).toEqual([]);
    expect(snapshot.state.countries.aurelia.builtCapacity).toBe(0);
    expect(errors).toEqual([]);
});
