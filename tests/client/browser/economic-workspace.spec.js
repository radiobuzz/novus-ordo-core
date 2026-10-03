import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';
const catalogue = JSON.parse(readFileSync('database/policy-templates/economy.json', 'utf8'));

function data() {
    const d = fixtures('/client/gameplay');
    const policies = structuredClone(catalogue.policies);
    const choices = Object.fromEntries(
        policies.map((p) => [
            p.key,
            {
                option: p.options.find((o) => o.is_default).key,
                parameters: Object.fromEntries(p.parameters.map((a) => [a.key, a.default_value])),
            },
        ]),
    );
    const expected = {
        opening_treasury: '20',
        closing_treasury: '22',
        treasury_inflows: '10',
        treasury_outflows: '8',
        tax_receipts: '10',
        public_sales: '0',
        command_costs: '0',
        public_payroll_paid: '0',
        public_operations: '1',
        government_purchases: '1',
        public_development: '1',
        private_development: '1',
        support_paid: '1',
        infrastructure: { 156: { paid: '3' } },
        indicators: {
            infrastructure: 0.6,
            unrest: 0.1,
            informal: 0.1,
            civilian_income: 20,
            income_per_person: 0.0001,
        },
        fiscal: {
            borrowing: '0',
            principal_repaid: '0',
            interest_due: '1',
            arrears: '0',
            closing_debt: '4',
            credit_limit: '20',
        },
        food: {},
        industries: {
            ore: {
                owners: {
                    government: {
                        opening_capacity: '2',
                        closing_capacity: '3',
                        usable_capacity: '2',
                        sales: '4',
                        recognized_cost: '2',
                        operating_result: '2',
                        investment: '2',
                    },
                    producer: {
                        opening_capacity: '3',
                        closing_capacity: '4',
                        usable_capacity: '3',
                        sales: '6',
                        recognized_cost: '4',
                        operating_result: '2',
                        investment: '3',
                    },
                },
            },
        },
    };
    d.policies = {
        enabled: true,
        turn_id: 1,
        edit_counter: 1,
        current: choices,
        pending: {},
        catalogue: { policies },
    };
    d.economy = {
        available_cash: '20',
        committed_cash: '0',
        state: { debt: '4' },
        current: expected.indicators,
        territories: [
            {
                id: 156,
                population: 42000,
                state: { infrastructure: 0.6, unrest: 0.1, informal: 0.1 },
            },
        ],
        forecast: { expected, warnings: [] },
        last_season: null,
    };
    return d;
}

test('tabbed budget preserves edits and top actions; charts share one history read', async ({ page }) => {
    await prepareHud(page);
    const d = data(),
        errors = [];
    let historyReads = 0;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/client/gameplay*', (r) => r.fulfill({ json: d }));
    await page.route('**/nation/economic-history*', (r) => {
        historyReads++;
        const url = new URL(r.request().url());
        return r.fulfill({
            json: {
                game_id: 1,
                nation_id: 7,
                through_turn: 1,
                turn_context_revision: url.searchParams.get('turn_context_revision') ?? undefined,
                seasons: [1, 2, 3].map((season) => ({
                    season,
                    economy:
                        season === 2
                            ? null
                            : {
                                  ...d.economy.forecast.expected,
                                  closing_treasury: season === 1 ? '18' : '22',
                              },
                    resources: {
                        ore: {
                            production: { government: '1', producer: '2' },
                            civilian_requested: '3',
                            industrial_requested: '2',
                            development: { government: '.1', producer: '.2' },
                        },
                    },
                    policy_changes: season === 2 ? { income_tax: {} } : {},
                })),
            },
        });
    });
    await page.route('**/nation/policies/preview', (r) =>
        r.fulfill({
            json: {
                valid: true,
                violations: [],
                indicator_forecast: d.economy.forecast,
            },
        }),
    );
    await page.goto('/client?game_id=1#/economy');
    await expect(page.locator('.economy-workspace')).toBeVisible();
    const policy = page.locator('.economy-column').last(),
        budget = page.locator('.economy-column').first();
    const rate = policy.locator('input[type=number]').first();
    await rate.fill('27');
    await policy.getByRole('tab', { name: /^Infrastructure/ }).click();
    await policy.getByRole('tab', { name: /Taxation/ }).click();
    await expect(rate).toHaveValue('27');
    await expect(page.locator('.economy-top')).toContainText('Seasonal balance');
    await page.getByRole('button', { name: 'Review & save', exact: true }).click();
    await expect(page.locator('.economy-top .economy-review')).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(page.locator('.economy-top .economy-review')).toBeHidden();
    await expect(rate).toHaveValue('27');
    await budget.getByRole('tab', { name: 'History / Trends', exact: true }).click();
    await expect(budget.locator('.time-series-plot')).toHaveCount(2);
    const balanceChart = budget.locator('.time-series').nth(1);
    await balanceChart.locator('.time-series-plot').focus();
    await page.keyboard.press('Home');
    await expect(balanceChart.locator('.time-series-readout')).toContainText('Seasonal balance -2');
    await balanceChart.locator('details > summary').click();
    await expect(balanceChart.locator('tbody tr').nth(1)).toContainText('—');
    const incomeSeries = budget.locator('.time-series-legend button').first();
    await incomeSeries.click();
    await expect(incomeSeries).toHaveAttribute('aria-pressed', 'false');
    await incomeSeries.click();
    await budget.getByLabel('Industry', { exact: true }).selectOption('ore');
    await expect(
        budget.getByRole('heading', {
            name: 'Are we producing enough?',
            exact: true,
        }),
    ).toBeVisible();
    await budget.getByLabel('View', { exact: true }).selectOption('profitability');
    await expect(budget.getByRole('heading', { name: 'Is it profitable?', exact: true })).toBeVisible();
    await budget.locator('.time-series-plot').first().focus();
    await page.keyboard.press('Home');
    await expect(budget.locator('.time-series-readout').first()).toContainText('Season 1');
    expect(historyReads).toBe(1);
    await page.screenshot({ path: '/tmp/no7-economic-history-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .locator('.economy-workspace > [role=tablist]')
        .getByRole('tab', { name: 'Policies', exact: true })
        .click();
    await expect(rate).toHaveValue('27');
    await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeVisible();
    await rate.scrollIntoViewIfNeeded();
    await expect(rate).toBeInViewport();
    const top = await page.locator('.economy-top').boundingBox();
    const input = await rate.boundingBox();
    expect(input.y).toBeGreaterThan(top.y + top.height);
    expect(input.y + input.height).toBeLessThan(810);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/no7-economic-workspace-mobile.png' });
    expect(errors).toEqual([]);
});

test('income support previews funded purchases; private ownership disables public expansion without losing values', async ({
    page,
}) => {
    await prepareHud(page);
    const d = data(),
        errors = [];
    let submitted = null;
    page.on('pageerror', (error) => errors.push(error.message));
    const investment = structuredClone(
        d.policies.catalogue.policies.find((p) => p.key === 'agricultural_funding'),
    );
    investment.key = 'public_investment_household_goods';
    investment.labels = {
        en: 'Public expansion · Household goods',
        fr: 'Développement public · Biens de consommation',
    };
    investment.options[0].effects[0].arguments.resource = 'household_goods';
    d.policies.catalogue.policies.push(investment);
    d.policies.current[investment.key] = {
        option: 'enabled',
        parameters: { funding_ratio: '0.2' },
    };
    d.policies.current.production_investors.option = 'private';
    for (const key of d.definitions.acquisition_resources)
        d.production_planning.rows[key] = {
            kind: 'stock',
            opening: '0',
            commands: '0',
            available: '0',
            acquisition: {
                production: { government: '0', producer: '0' },
                development: { government: '0', producer: '0' },
                constraints: [],
            },
        };
    d.definitions.resources.push({
        resource_key: 'household_goods',
        labels: { en: 'Household goods', fr: 'Biens de consommation' },
        unit_labels: { en: 'units', fr: 'unités' },
    });
    const baseline = d.economy.forecast.expected;
    baseline.support_requested = baseline.support_paid = '0';
    baseline.civilian = {
        enabled: true,
        consumption: {
            household_goods: {
                requested: '2',
                fulfilled: '1',
                unmet: '1',
                private_purchase: '1',
                public_purchase: '0',
                shortage_reason: 'purchasing_power',
            },
        },
        constraints: {},
        workers_used: '1000',
        workforce: '2000',
        upkeep: {},
    };
    await page.route('**/client/gameplay*', (r) => r.fulfill({ json: d }));
    await page.route('**/nation/policies/preview', (r) => {
        const body = r.request().postDataJSON(),
            proposed = structuredClone(baseline);
        const support = body.changes.income_support ?? d.policies.current.income_support;
        const amount = support.option === 'enabled' ? support.parameters.amount : '0';
        proposed.support_requested = proposed.support_paid = amount;
        if (Number(amount) > 0)
            Object.assign(proposed.civilian.consumption.household_goods, {
                fulfilled: '2',
                unmet: '0',
                private_purchase: '2',
                shortage_reason: null,
            });
        return r.fulfill({
            json: {
                valid: true,
                violations: [],
                indicator_forecast: { expected: proposed, warnings: [] },
            },
        });
    });
    await page.route('**/nation/production-preview', (r) =>
        r.fulfill({ json: { rows: d.production_planning.rows, forecast: d.economy.forecast } }),
    );
    await page.route('**/nation/policies/pending', (r) => {
        submitted = r.request().postDataJSON();
        d.policies.pending = submitted.changes;
        return r.fulfill({ json: { pending: submitted.changes } });
    });
    await page.goto('/client?game_id=1#/economy');
    const policy = page.locator('.economy-column').last(),
        budget = page.locator('.economy-column').first();
    await policy.getByRole('tab', { name: 'Income support', exact: true }).click();
    const supportGroup = policy.getByRole('group', {
        name: 'Income support',
        exact: true,
    });
    await supportGroup.getByRole('combobox').selectOption('enabled');
    await supportGroup.getByRole('spinbutton').fill('3');
    await budget.getByRole('tab', { name: 'Civilian economy', exact: true }).click();
    await expect(budget.locator('[data-metric="civilian:support"] td').last()).toHaveText('3 / 3');
    await expect(budget.locator('[data-metric="civilian:household_goods"] td').last()).toHaveText('2 / 2');
    await expect(budget.locator('[data-metric="civilian:purchases:household_goods"] td').last()).toHaveText(
        '2',
    );
    await expect(budget.locator('[data-metric="civilian:cause:household_goods"] td').nth(1)).toHaveText(
        'Households cannot afford enough goods.',
    );
    await page.screenshot({ path: '/tmp/no7-income-support-desktop.png' });
    await page.getByRole('button', { name: 'Review & save', exact: true }).click();
    await page.getByRole('button', { name: 'Save seasonal plan', exact: true }).click();
    await expect
        .poll(() => submitted?.changes?.income_support)
        .toEqual({ option: 'enabled', parameters: { amount: '3' } });
    expect(d.policies.current.income_support.option).toBe('disabled');

    await policy.getByRole('tab', { name: /^Production/ }).click();
    const expansion = policy.getByRole('group', {
        name: 'Public expansion · Household goods',
        exact: true,
    });
    const funding = expansion.getByRole('spinbutton');
    await expect(funding).toBeDisabled();
    await expect(funding).toHaveValue('20');
    await expect(expansion).toContainText('Inactive: only private investment is permitted.');
    await page.locator('.economy-resources > summary').click();
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    const plannerFunding = page.locator('[data-public-investment="food"]');
    await expect(plannerFunding).toBeDisabled();
    await expect(page.locator('[data-production-resource="food"]')).toContainText(
        'Inactive: only private investment is permitted.',
    );
    await page.keyboard.press('Escape');
    await policy.getByRole('tab', { name: /^Institutions/ }).click();
    const ownership = policy.getByRole('combobox', {
        name: 'New productive investment',
        exact: true,
    });
    await ownership.selectOption('mixed');
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    await expect(plannerFunding).toBeEnabled();
    await page.keyboard.press('Escape');
    await policy.getByRole('tab', { name: /^Production/ }).click();
    await expect(funding).toBeEnabled();
    await expect(funding).toHaveValue('20');
    await funding.fill('101');
    await policy.getByRole('tab', { name: /^Institutions/ }).click();
    await ownership.selectOption('private');
    await policy.getByRole('tab', { name: /^Production/ }).click();
    await expect(funding).toBeDisabled();
    await expect(funding).toHaveValue('101');
    await expect(policy.getByRole('tab', { name: /^Production/ })).toHaveAccessibleName(
        /Correct the highlighted values/,
    );
    await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeDisabled();
    await policy.getByRole('tab', { name: /^Institutions/ }).click();
    await ownership.selectOption('mixed');
    await policy.getByRole('tab', { name: /^Production/ }).click();
    await funding.fill('20');
    await policy.getByRole('tab', { name: /^Institutions/ }).click();
    await ownership.selectOption('private');
    await policy.getByRole('tab', { name: /^Production/ }).click();
    await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeEnabled();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .locator('.economy-workspace > [role=tablist]')
        .getByRole('tab', { name: 'Politiques', exact: true })
        .click();
    await expect(policy).toContainText('Inactif : seuls les investissements privés sont permis.');
    const frenchExpansion = policy.getByRole('group', {
        name: 'Développement public · Biens de consommation',
        exact: true,
    });
    await frenchExpansion.locator('.economy-investment-notice').scrollIntoViewIfNeeded();
    await expect(frenchExpansion.locator('.economy-investment-notice')).toBeVisible();
    await page.screenshot({ path: '/tmp/no7-income-support-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

test('repayment requires explicit confirmation and reconciles current cash; hidden policy errors block saving', async ({
    page,
}) => {
    await prepareHud(page);
    const d = data(),
        errors = [];
    d.economy.reserve_target = '20';
    let submitted = null;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/client/gameplay*', (r) => r.fulfill({ json: d }));
    await page.route('**/nation/economic-history*', (r) =>
        r.fulfill({
            json: {
                game_id: 1,
                nation_id: 7,
                through_turn: 1,
                seasons: [],
            },
        }),
    );
    await page.route('**/nation/policies/preview', (r) =>
        r.fulfill({
            json: {
                valid: true,
                violations: [],
                indicator_forecast: d.economy.forecast,
            },
        }),
    );
    await page.route('**/nation/finance/repay', (r) => {
        submitted = r.request().postDataJSON();
        d.economy.available_cash = '18';
        d.economy.state.debt = '2';
        return r.fulfill({ json: { amount: '2', treasury: '18', debt: '2' } });
    });
    await page.goto('/client?game_id=1#/economy');
    const budget = page.locator('.economy-column').first(),
        policy = page.locator('.economy-column').last();
    await budget.getByRole('tab', { name: 'Debt & cash', exact: true }).click();
    await expect(budget.locator('.finance-controls')).toContainText('Automatic repayment reserve: 20');
    const amount = budget.getByLabel('Repayment amount (credits)', {
        exact: true,
    });
    await amount.fill('5');
    await expect(budget.getByRole('button', { name: 'Repay debt now…', exact: true })).toBeDisabled();
    await amount.fill('2');
    await budget.getByRole('button', { name: 'Repay debt now…', exact: true }).click();
    expect(submitted).toBeNull();
    await expect(budget.locator('.finance-controls')).toContainText('uncommitted treasury 18; debt 2');
    await budget.getByRole('button', { name: 'Confirm repayment', exact: true }).click();
    await expect(page.locator('[data-summary-metric="debt"] strong')).toHaveText('2');
    expect(submitted.amount).toBe('2');
    expect(submitted.client_context.nation_id).toBe(7);
    await expect(amount).toHaveValue('');
    const rate = policy.getByRole('group', { name: 'Income tax', exact: true }).getByRole('spinbutton');
    await rate.fill('101');
    await policy.getByRole('tab', { name: /^Infrastructure/ }).click();
    await expect(policy.getByRole('tab', { name: /^Taxation/ })).toHaveAccessibleName(
        /Correct the highlighted values/,
    );
    await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await expect(page.locator('.economy-top')).toContainText('Dette actuelle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

test('compact overview keeps a readable sparkline and gives policy tabs the full column height', async ({
    page,
}) => {
    await prepareHud(page);
    await page.setViewportSize({ width: 1920, height: 1000 });
    const d = data();
    d.economy.forecast.expected.fiscal.borrowing = '5';
    d.economy.forecast.expected.fiscal.principal_repaid = '1';
    d.economy.forecast.warnings = [{ type: 'infrastructure_shortfall' }];
    await page.route('**/client/gameplay*', (r) => r.fulfill({ json: d }));
    await page.route('**/nation/economic-history*', (r) =>
        r.fulfill({
            json: {
                game_id: 1,
                nation_id: 7,
                through_turn: 1,
                seasons: [1, 2, 3].map((season) => ({
                    season,
                    economy: {
                        ...d.economy.forecast.expected,
                        closing_treasury: String(18 + season * 2),
                    },
                    resources: {},
                    policy_changes: {},
                })),
            },
        }),
    );
    await page.goto('/client?game_id=1#/economy');
    const budget = page.locator('.economy-column').first(),
        policy = page.locator('.economy-column').last();
    const treasuryChange = page.locator('.economy-top [data-summary-metric="balance"]');
    await expect(treasuryChange).toContainText('Change in treasury');
    await expect(treasuryChange.locator('strong')).toHaveText('+2');
    await expect(treasuryChange.locator('strong')).toHaveAttribute('data-tone', 'ready');
    await expect(page.locator('.economy-top [data-summary-metric="seasonBalance"] strong')).toHaveText('-2');
    await budget.getByRole('tab', { name: 'Debt & cash', exact: true }).click();
    const finance = budget.locator('[data-budget-group="finance"]');
    await expect(finance.locator('tbody tr').first()).toHaveAttribute('data-metric', 'balance');
    await expect(finance.locator('[data-metric="balance"]')).toBeInViewport();
    const report = await finance.locator('table').boundingBox();
    const repayment = await finance.locator('.finance-controls').boundingBox();
    expect(repayment.y).toBeGreaterThanOrEqual(report.y + report.height);
    await page.screenshot({ path: '/tmp/no7-budget-cash-priority.png' });
    await budget.getByRole('tab', { name: 'Revenue', exact: true }).click();
    await expect(budget.getByRole('heading', { name: 'Revenue', exact: true })).toBeVisible();
    await expect(budget).not.toContainText('Something went wrong');
    await expect(page.locator('.economy-mini-trend circle')).toHaveCount(3);
    await expect(page.locator('.economy-mini-trend text')).toHaveCount(0);
    const top = await page.locator('.economy-top').boundingBox();
    expect(top.height).toBeLessThan(160);
    const plot = await page.locator('.economy-mini-trend svg').boundingBox();
    expect(plot.width).toBeGreaterThanOrEqual(200);
    expect(plot.height).toBeGreaterThanOrEqual(60);
    const column = await policy.boundingBox();
    const body = await policy.locator('[data-policy-group="taxation"]').boundingBox();
    await expect(policy.locator('.economy-policy-panels > div:not([hidden])')).toHaveCount(1);
    expect(body.y + body.height).toBeGreaterThan(column.y + column.height - 30);
    const scroller = await policy.locator('[data-policy-group="taxation"]').evaluate((node) => ({
        client: node.clientHeight,
        scroll: node.scrollHeight,
    }));
    expect(scroller.scroll).toBeLessThanOrEqual(scroller.client + 1);
    await page.screenshot({ path: '/tmp/no7-budget-polish-desktop.png' });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await expect(budget.getByRole('heading', { name: 'Recettes', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(treasuryChange).toBeInViewport();
    await expect(treasuryChange).toContainText('Variation du Trésor');
    await expect(
        page.getByRole('button', {
            name: 'Vérifier et enregistrer',
            exact: true,
        }),
    ).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('charts enlarge from double-click or a button with retained selection and no extra reads', async ({
    page,
}) => {
    await prepareHud(page);
    const d = data(),
        errors = [];
    let historyReads = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/client/gameplay*', (r) => r.fulfill({ json: d }));
    await page.route('**/nation/economic-history*', (r) => {
        historyReads++;
        return r.fulfill({
            json: {
                game_id: 1,
                nation_id: 7,
                through_turn: 1,
                seasons: [1, 2, 3].map((season) => ({
                    season,
                    economy: {
                        ...d.economy.forecast.expected,
                        treasury_inflows: String(8 + season),
                    },
                    resources: {},
                    policy_changes: {},
                })),
            },
        });
    });
    await page.goto('/client?game_id=1#/economy');
    const mini = page.locator('.economy-mini-trend');
    await expect(mini.locator('circle')).toHaveCount(3);
    const diagnostics = await page.evaluate(() => window.novusClientDiagnostics());
    const inlineWidth = (await mini.locator('svg').boundingBox()).width;
    await mini.locator('svg').dblclick();
    const dialog = page.getByRole('dialog', {
        name: 'Seasonal balance',
        exact: true,
    });
    await expect(dialog).toBeVisible();
    expect((await dialog.locator('svg').boundingBox()).width).toBeGreaterThan(inlineWidth * 3);
    await expect(dialog.locator('svg text').first()).toBeVisible();
    await dialog.locator('svg').focus();
    await page.keyboard.press('Home');
    await expect(dialog.locator('.time-series-readout')).toContainText('Season 1');
    await dialog.locator('details > summary').click();
    await expect(dialog.getByRole('table')).toBeVisible();
    await page.screenshot({ path: '/tmp/no7-expanded-chart-desktop.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    const miniButton = mini.getByRole('button', {
        name: 'Enlarge Seasonal balance',
        exact: true,
    });
    await miniButton.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.time-series-readout')).toContainText('Season 1');
    await dialog.getByRole('button', { name: 'Seasonal balance', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(miniButton).toBeFocused();
    await miniButton.click();
    await expect(dialog.getByRole('button', { name: 'Seasonal balance', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await dialog.getByRole('button', { name: 'Seasonal balance', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.novusClientDiagnostics())).toEqual(diagnostics);

    const budget = page.locator('.economy-column').first();
    await budget.getByRole('tab', { name: 'History / Trends', exact: true }).click();
    const chart = budget.locator('.time-series').first();
    await chart.locator('svg').dblclick();
    await expect(page.locator('.chart-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await chart.locator('.chart-expand-button').click();
    await expect(page.locator('.chart-dialog')).toBeInViewport();
    expect((await page.locator('.chart-dialog svg').boundingBox()).height).toBeLessThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/no7-expanded-chart-mobile.png' });
    await page.keyboard.press('Escape');
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await expect(chart.locator('.chart-expand-button')).toHaveAccessibleName(/^Agrandir /);
    await chart.locator('.chart-expand-button').click();
    await expect(
        page.locator('.chart-dialog').getByRole('button', { name: 'Fermer', exact: true }),
    ).toBeVisible();
    expect(historyReads).toBe(1);
    // Navigation disposes even an open dialog without leaving the background inert.
    await page.evaluate(() => {
        location.hash = '/world';
    });
    await expect(page.locator('.chart-dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
});
