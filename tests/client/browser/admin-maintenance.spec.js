import { test, expect } from '@playwright/test';

async function setup(page) {
    const writes = [];
    await page.route('**/client/admin/api/games', (route) =>
        route.fulfill({ json: { games: [], active_game_ids: [] } }),
    );
    await page.route('**/client/admin/api/maintenance', (route) =>
        route.fulfill({
            json: {
                counts: { games: 2, map_drafts: 3 },
                token: 'a'.repeat(64),
                orphan_status_files: 1,
            },
        }),
    );
    await page.route('**/client/admin/api/maintenance/reset-worlds', async (route) => {
        writes.push(route.request().postDataJSON());
        await route.fulfill({
            json: {
                reset_complete: true,
                cleanup_failed_game_ids: [],
                status_cleanup: { removed: 1, failed: [] },
            },
        });
    });
    await page.goto('/client/admin#/overview');
    return writes;
}

test('global maintenance is available without games, confirms scope and refreshes after reset', async ({
    page,
}) => {
    const writes = await setup(page);
    await expect(page.getByRole('link', { name: 'Sign out', exact: true })).toHaveAttribute(
        'href',
        '/logout',
    );
    await page.getByRole('button', { name: 'Reset all worlds…', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('ALL 2 games');
    await expect(dialog).toContainText('3 saved maps');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Reset all worlds…', exact: true }).click();
    await page.getByRole('button', { name: 'Delete all worlds and saved maps', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('Accounts preserved');
    expect(writes).toEqual([{ token: 'a'.repeat(64), confirmation: 'RESET WORLDS' }]);
    await expect(page.getByRole('button', { name: 'Reset all worlds…', exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('orphan cleanup reports permissions failures without resetting worlds', async ({ page }) => {
    const writes = await setup(page);
    await page.route('**/client/admin/api/maintenance/clean-status-files', (route) =>
        route.fulfill({ json: { removed: 1, failed: ['game-20.json'] } }),
    );
    await page.getByRole('button', { name: 'Clean leftover turn-status files…', exact: true }).click();
    await page.getByRole('button', { name: 'Clean leftover files', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('game-20.json');
    expect(writes).toHaveLength(0);
});

test('an uncertain reset is not retried', async ({ page }) => {
    await setup(page);
    let attempts = 0;
    await page.route('**/client/admin/api/maintenance/reset-worlds', async (route) => {
        attempts++;
        await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Reset all worlds…', exact: true }).click();
    await page.getByRole('button', { name: 'Delete all worlds and saved maps', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('not automatically retried');
    expect(attempts).toBe(1);
});
