import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';

test('debt minibar separates financing, updates retained details and fits French mobile', async ({
    page,
}) => {
    let debt = '47',
        closingDebt = '50',
        warnings = [],
        enabled = true;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/client/gameplay*', (route) => {
        const data = fixtures('/client/gameplay', 1);
        if (enabled)
            data.economy = {
                available_cash: '20',
                committed_cash: '0',
                state: { debt },
                forecast: {
                    warnings,
                    expected: {
                        opening_treasury: '20',
                        closing_treasury: '20',
                        tax_receipts: '8',
                        treasury_outflows: '15',
                        command_costs: '0',
                        fiscal: {
                            borrowing: '5',
                            principal_repaid: '2',
                            closing_debt: closingDebt,
                            interest_due: '0.7',
                            credit_limit: '80',
                            credit_lock: 0,
                        },
                    },
                },
            };
        return route.fulfill({ json: data });
    });
    await prepareHud(page);
    await page.goto('/client?game_id=1');
    const summary = page.locator('.hud-debt summary');
    await expect(summary).toContainText('47 ↑');
    await expect(page.locator('[data-resource="money"] .hud-resource-reserve')).toHaveText('-3/turn');
    await expect(summary.locator('strong')).toHaveAttribute('data-tone', 'warning');
    await expect(page.locator('[data-resource="money"] + .hud-debt')).toBeVisible();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-debt dl')).toContainText('Remaining credit after season30');
    await expect(page.locator('.hud-debt dl')).toContainText('Interest due next season0.7');
    await page.keyboard.press('Escape');
    await expect(summary).toBeFocused();
    await page.evaluate(() => (window.debtNode = document.querySelector('.hud-debt')));
    async function refresh() {
        await page.getByLabel('Game menu', { exact: true }).click();
        const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/client/gameplay');
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await response;
        await expect(page.locator('.game-hud')).toHaveAttribute('data-freshness', 'ready');
        await page.keyboard.press('Escape');
    }
    closingDebt = '44';
    await refresh();
    await expect(summary).toContainText('47 ↓');
    warnings = [{ type: 'credit_low' }];
    closingDebt = '70';
    await refresh();
    await expect(summary.locator('strong')).toHaveAttribute('data-tone', 'danger');
    warnings = [];
    debt = '0';
    closingDebt = '0';
    await refresh();
    await expect(summary).toContainText('0 →');
    await expect(summary.locator('strong')).toHaveAttribute('data-tone', 'muted');
    expect(await page.evaluate(() => window.debtNode === document.querySelector('.hud-debt'))).toBe(true);
    debt = '47';
    closingDebt = '50';
    await refresh();
    await page.screenshot({ path: '/tmp/no7-debt-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await expect(summary).toContainText('Dette');
    await summary.click();
    await expect(page.locator('.hud-debt dl')).toContainText('Crédit disponible après la saison');
    const box = await page.locator('.hud-debt .ui-disclosure-content').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/no7-debt-mobile.png' });
    enabled = false;
    await page.reload();
    await expect(page.locator('[data-resource="money"]')).toBeVisible();
    await expect(page.locator('.hud-debt')).toHaveCount(0);
    expect(errors).toEqual([]);
});
