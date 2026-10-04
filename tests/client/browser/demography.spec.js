import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';

const conditions = {
    economic_strength: 0.6,
    dynamism: 0.7,
    infrastructure: 0.75,
    health: 0.65,
    education: 0.6,
    environment: 0.8,
    inequality: 0.25,
    crime: 0.1,
    unrest: 0,
    informal: 0.2,
};
async function setup(page, { empty = false, fail = false } = {}) {
    await prepareHud(page);
    // Turn 1 fixtures are sufficient for layout; turn 4 supplies meaningful seasonal deltas.
    await page.addInitScript(() =>
        localStorage.setItem(
            'no7:v1:user-1:game-1:briefing',
            JSON.stringify({ version: 1, value: { lastKey: '1:7:4' } }),
        ),
    );
    const d = fixtures('/client/gameplay', 4);
    d.demography = { population: 126000, growth_rate: 0.005 };
    d.economy = { current: { ...conditions, civilian_income: 20, income_per_person: 0.0001 } };
    const errors = [],
        reads = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of [
        '/game',
        '/game/ready-status',
        '/user/nation-setup-status',
        '/territories/turn-infos',
        '/nation/territories/turn-infos',
        '/client/gameplay',
    ]) {
        await page.route(
            (url) => url.pathname === path,
            (route) => route.fulfill({ json: path === '/client/gameplay' ? d : fixtures(path, 4) }),
        );
    }
    // Use the fixture server's routes for map/catalogue; owner and turn reads share one scope.
    await page.route('**/client/gameplay*', (route) => route.fulfill({ json: d }));
    await page.route('**/nation/economic-history*', (route) => {
        const url = new URL(route.request().url());
        reads.push(Number(url.searchParams.get('window')));
        if (fail && reads.length === 1)
            return route.fulfill({ status: 500, json: { message: 'Fixture failure' } });
        return route.fulfill({
            json: {
                game_id: 1,
                nation_id: 7,
                through_turn: Number(url.searchParams.get('turn_number')),
                turn_context_revision: url.searchParams.get('turn_context_revision') ?? undefined,
                seasons: empty
                    ? []
                    : [1, 2, 3].map((season) => ({
                          season,
                          economy: {
                              indicators: {
                                  ...conditions,
                                  health: season === 2 ? 0.6 : 0.65,
                                  crime: season === 2 ? 0.2 : 0.1,
                                  education: season === 2 ? null : 0.6,
                              },
                          },
                          policy_changes: season === 2 ? { infrastructure_investment: {} } : {},
                      })),
            },
        });
    });
    await page.goto('/client?game_id=1#/nation');
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
    return { reads, errors, data: d };
}

test('national indicators load lazily, compare recorded seasons and retain charts across tabs', async ({
    page,
}) => {
    const { reads, errors, data } = await setup(page);
    expect(reads).toEqual([]);
    await page.getByRole('tab', { name: 'Demography & Development', exact: true }).click();
    const view = page.locator('.demography-view');
    await expect(view.locator('.indicator-trends-group')).toHaveCount(3);
    await expect(view.locator('[data-indicator-key]')).toHaveCount(10);
    await expect(view.locator('[data-indicator-key="health"]')).toContainText('Seasonal change: ↑ +5 pp');
    await expect(view.locator('[data-indicator-key="crime"]')).toContainText('Lower is better');
    await expect(view.locator('[data-indicator-key="crime"] .ui-metric-detail')).toHaveAttribute(
        'data-tone',
        'ready',
    );
    await expect(view.locator('[data-indicator-key="education"]')).toContainText('Seasonal change: —');
    await expect(view.locator('[data-indicator-key="unrest"] .ui-metric-value')).toHaveText('0%');
    await expect(view).toContainText('126,000');
    await expect(view).toContainText('0.5%');
    expect(reads).toEqual([12]);
    const chart = view.locator('.time-series').first();
    await expect(chart.locator('svg text').filter({ hasText: /^100$/ })).toBeVisible();
    const dynamism = chart
        .locator('.time-series-legend')
        .getByRole('button', { name: 'Dynamism', exact: true });
    await dynamism.click();
    await expect(dynamism).toHaveAttribute('aria-pressed', 'false');
    await chart.locator('svg').evaluate((node) => {
        window.demographyPlot = node;
    });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(view).toBeHidden();
    await page.getByRole('tab', { name: 'Demography & Development', exact: true }).click();
    expect(await chart.locator('svg').evaluate((node) => node === window.demographyPlot)).toBe(true);
    await expect(dynamism).toHaveAttribute('aria-pressed', 'false');
    expect(reads).toEqual([12]);
    data.economy.current.health = 0.7;
    const period = view.getByRole('combobox', { name: 'Period' });
    await period.focus();
    await page
        .getByRole('button', { name: 'Refresh', exact: true, includeHidden: true })
        .evaluate((button) => button.click());
    await expect(view.locator('[data-indicator-key="health"] .ui-metric-value')).toHaveText('70%');
    await expect(period).toBeFocused();
    expect(await chart.locator('svg').evaluate((node) => node === window.demographyPlot)).toBe(true);
    await expect(dynamism).toHaveAttribute('aria-pressed', 'false');
    await chart.locator('svg').dblclick();
    const expanded = page.getByRole('dialog');
    await expect(expanded).toBeVisible();
    await expect(expanded.locator('svg text').filter({ hasText: /^100$/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(expanded).toBeHidden();
    expect(errors).toEqual([]);
});

test('failed history can retry without hiding current values; empty history stays unknown', async ({
    page,
}) => {
    const { reads, errors } = await setup(page, { empty: true, fail: true });
    await page.getByRole('tab', { name: 'Demography & Development', exact: true }).click();
    const view = page.locator('.demography-view');
    await expect(view).toContainText('Indicator history unavailable');
    await expect(view.locator('[data-indicator-key="health"] .ui-metric-value')).toHaveText('65%');
    await view.getByRole('button', { name: 'Retry history' }).click();
    await expect(view).toContainText('No completed seasons recorded yet.');
    await expect(view.locator('[data-indicator-key="health"]')).toContainText('Seasonal change: —');
    expect(reads).toEqual([12, 12]);
    expect(errors).toEqual([]);
});

test('French mobile indicators remain readable with click-only explanations', async ({ page }) => {
    const { errors } = await setup(page);
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Démographie et développement', exact: true }).click();
    const view = page.locator('.demography-view');
    await expect(view.locator('[data-indicator-key="crime"]')).toContainText('Plus bas est préférable');
    const metric = view.locator('[data-indicator-key="health"]');
    await expect(metric.getByRole('tooltip', { includeHidden: true })).toBeHidden();
    await metric.locator('button').click();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const overflow = await view.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
});

test('a late period response cannot replace the selected history window', async ({ page }) => {
    const { errors } = await setup(page);
    await page.getByRole('tab', { name: 'Demography & Development', exact: true }).click();
    const view = page.locator('.demography-view');
    await expect(view.locator('[data-indicator-key="health"]')).toContainText('↑ +5 pp');
    let release,
        requested = false,
        completed = false;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    await page.route('**/nation/economic-history*', async (route) => {
        const url = new URL(route.request().url());
        const slow = url.searchParams.get('window') === '24';
        if (slow) {
            requested = true;
            await gate;
        }
        await route.fulfill({
            json: {
                game_id: 1,
                nation_id: 7,
                through_turn: Number(url.searchParams.get('turn_number')),
                turn_context_revision: url.searchParams.get('turn_context_revision') ?? undefined,
                seasons: [{ season: 2, economy: { indicators: { health: slow ? 0.1 : 0.5 } } }],
            },
        });
        if (slow) completed = true;
    });
    const period = view.getByRole('combobox', { name: 'Period' });
    await period.selectOption('24');
    await expect.poll(() => requested).toBe(true);
    await period.selectOption('96');
    await expect(view.locator('[data-indicator-key="health"]')).toContainText('↑ +15 pp');
    release();
    await expect.poll(() => completed).toBe(true);
    await expect(period).toHaveValue('96');
    await expect(view.locator('[data-indicator-key="health"]')).toContainText('↑ +15 pp');
    expect(errors).toEqual([]);
});
