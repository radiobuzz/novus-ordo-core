import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';

test('world rankings use readable current charts and lazy turn history', async ({ page }) => {
    const turn = 4;
    const game = fixtures('/game', turn);
    const gameplay = fixtures('/client/gameplay', turn);
    const identities = fixtures('/game/identities', turn);
    const current = fixtures('/game/rankings', turn);
    let historyReads = 0,
        currentReads = 0;
    await page.route('**/game', (route) => route.fulfill({ json: game }));
    await page.route('**/client/gameplay', (route) => route.fulfill({ json: gameplay }));
    await page.route('**/game/ready-status', (route) =>
        route.fulfill({ json: fixtures('/game/ready-status', turn) }),
    );
    await page.route('**/game/identities', (route) => route.fulfill({ json: identities }));
    await page.route('**/game/rankings', (route) => {
        currentReads++;
        return route.fulfill({ json: current });
    });
    await page.route('**/game/victory-status', (route) =>
        route.fulfill({ json: fixtures('/game/victory-status', turn) }),
    );
    await page.route('**/territories/turn-infos?*', (route) =>
        route.fulfill({ json: { data: fixtures('/territories/turn-infos', turn).data } }),
    );
    await page.route('**/nation/territories/turn-infos?*', (route) =>
        route.fulfill({ json: fixtures('/nation/territories/turn-infos', turn) }),
    );
    await page.route('**/game/ranking-history?*', (route) => {
        historyReads++;
        const url = new URL(route.request().url());
        expect(url.searchParams.get('game_id')).toBe('1');
        expect(url.searchParams.get('turn_number')).toBe('4');
        return route.fulfill({
            json: {
                game_id: 1,
                through_turn: 4,
                rankings: [
                    {
                        key: 'population',
                        title: 'Population',
                        data_unit: 'WholeNumber',
                        series: [
                            {
                                nation_id: 7,
                                points: [
                                    { turn_number: 1, rank: 1, value: 100000 },
                                    { turn_number: 2, rank: 1, value: 112000 },
                                    { turn_number: 4, rank: 1, value: 126000 },
                                ],
                            },
                            {
                                nation_id: 8,
                                points: [
                                    { turn_number: 2, rank: 2, value: 30000 },
                                    { turn_number: 3, rank: 2, value: 36000 },
                                    { turn_number: 4, rank: 2, value: 42000 },
                                ],
                            },
                        ],
                    },
                    {
                        key: 'army_size',
                        title: 'Army size (number of divisions)',
                        data_unit: 'ApproximateNumber',
                        series: [
                            {
                                nation_id: 8,
                                points: [
                                    { turn_number: 2, rank: 1, value: 10 },
                                    { turn_number: 3, rank: 1, value: 10 },
                                    { turn_number: 4, rank: 1, value: 10 },
                                ],
                            },
                            {
                                nation_id: 7,
                                points: [
                                    { turn_number: 1, rank: 1, value: 5 },
                                    { turn_number: 2, rank: 2, value: 5 },
                                    { turn_number: 3, rank: 2, value: 5 },
                                    { turn_number: 4, rank: 2, value: 5 },
                                ],
                            },
                        ],
                    },
                ],
            },
        });
    });

    await page.goto('/client?game_id=1#/reports');
    const continuePlaying = page.getByRole('button', { name: 'Continue playing' });
    await expect(continuePlaying).toBeVisible();
    await continuePlaying.click();
    const rankings = page.getByRole('heading', { name: 'World rankings' }).locator('..').locator('..');
    await expect(rankings.locator('.ranking-current-chart')).toHaveCount(2);
    await expect(rankings.locator('.ranking-bar').first()).toContainText('#1');
    await expect(rankings.locator('.ranking-bar').first()).toContainText('The Aurelian Union');
    const diagnostics = await page.evaluate(() => window.novusClientDiagnostics());
    expect(historyReads).toBe(0);

    const historyTab = page.getByRole('tab', { name: 'History' });
    await historyTab.click();
    await expect.poll(() => historyReads).toBe(1);
    await expect(rankings.locator('.ranking-series-line')).toHaveCount(2);
    const firstPath = await rankings.locator('.ranking-series-line').first().getAttribute('d');
    expect(firstPath.match(/M/g)).toHaveLength(2);
    await rankings.getByText('View exact historical data').click();
    await expect(rankings.getByRole('table', { name: 'Population exact history' })).toBeVisible();
    await expect(rankings.getByRole('cell', { name: '126,000 · rank 1' })).toBeVisible();
    const northern = rankings.getByRole('checkbox', { name: 'The Northern Compact' });
    await northern.focus();
    const readsBeforeRefresh = currentReads;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => currentReads).toBeGreaterThan(readsBeforeRefresh);
    await expect(northern).toBeFocused();
    await expect(rankings.locator('.ranking-history-data')).toHaveAttribute('open', '');
    expect(historyReads).toBe(1);
    await page.screenshot({ path: '/tmp/no7-rankings-history-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Army size (number of divisions)' }).click();
    await expect(rankings.getByText('≈ 10 · rank 1').first()).toBeAttached();
    expect(historyReads).toBe(1);
    expect(await page.evaluate(() => window.novusClientDiagnostics())).toEqual(diagnostics);

    await historyTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Current' })).toHaveAttribute('aria-selected', 'true');
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/no7-rankings-current-mobile.png', fullPage: true });
    await page.getByRole('tab', { name: 'History' }).click();
    await page.screenshot({ path: '/tmp/no7-rankings-history-mobile.png', fullPage: true });
});
