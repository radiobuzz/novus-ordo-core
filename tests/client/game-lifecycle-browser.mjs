import { chromium, expect, request } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792'; // Guarded fixture server only.
const api = '/client/admin/api';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
const guest = await request.newContext({ baseURL: origin });
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => errors.push(e.message));
    const session = await (await page.request.get(origin + '/client/session')).json();
    assert.equal(
        (
            await page.request.post(origin + '/login-user', {
                headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
                data: { username: 'map-admin', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    const headers = {
        Accept: 'application/json',
        'X-CSRF-TOKEN': (await (await page.request.get(origin + '/client/session')).json()).csrfToken,
    };
    const read = async (path) => {
        const r = await page.request.get(origin + api + path, { headers });
        assert.equal(r.status(), 200);
        return r.json();
    };
    const write = (path, data) => page.request.post(origin + api + path, { headers, data });
    const maps = await read('/maps');
    assert(maps.maps.length, 'Expected a saved generated map fixture');
    const create = async () => {
        const r = await write('/games', { map_draft_id: maps.maps[0].id });
        assert.equal(r.status(), 201);
        return (await r.json()).game_id;
    };
    const target = await create();
    const survivor = await create();
    const start = await read(`/games/${target}`);
    assert.equal(
        (await guest.get(api + '/games', { headers: { Accept: 'application/json' } })).status(),
        401,
    );
    assert.equal(
        (
            await page.request.post(origin + api + `/games/${target}/lifecycle`, {
                headers: { Accept: 'application/json' },
                data: { action: 'delete', context_revision: start.context_revision },
            })
        ).status(),
        419,
    );
    assert.equal((await write(`/games/${target}/lifecycle`, { action: 'delete' })).status(), 422);
    await page.goto(origin + `/client/admin#/overview?game=${target}`);
    await expect(
        page.getByRole('heading', { name: `Game ${target} command centre`, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Deactivate game', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(`Deactivate game ${target}`);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await read(`/games/${target}`)).active, true);
    await page.getByRole('button', { name: 'Deactivate game', exact: true }).click();
    await page.getByRole('button', { name: `Deactivate game ${target}`, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Activate game', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Force next turn', exact: true })).toBeDisabled();
    assert.equal((await read('/games')).active_game_ids.includes(target), false);
    assert.equal((await read(`/games/${survivor}`)).active, true);
    await page.getByRole('button', { name: 'Activate game', exact: true }).click();
    await page.getByRole('button', { name: `Activate game ${target}`, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Deactivate game', exact: true })).toBeVisible();
    assert.equal((await read(`/games/${target}`)).turn_id, start.turn_id);

    // Another admin changes off/on while this confirmation is open.
    await page.getByRole('button', { name: 'Deactivate game', exact: true }).click();
    for (const action of ['deactivate', 'activate']) {
        const current = await read(`/games/${target}`);
        assert.equal(
            (
                await write(`/games/${target}/lifecycle`, {
                    action,
                    context_revision: current.context_revision,
                })
            ).status(),
            200,
        );
    }
    await page.getByRole('button', { name: `Deactivate game ${target}`, exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('Refresh to continue');
    assert.equal((await read(`/games/${target}`)).active, true);
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.locator('.admin-notice')).toHaveText('Status refreshed.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Delete game', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('This cannot be undone');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/no7-game-delete-mobile.png' });
    await page.keyboard.press('Escape');
    assert.equal((await read(`/games/${target}`)).active, true);

    // A successful delete followed by a failed list read must not repeat deletion.
    let deletes = 0;
    await page.route(`**${api}/games/${target}/lifecycle`, async (route) => {
        deletes++;
        await route.continue();
    });
    await page.route(
        `**${api}/games`,
        (route) => route.fulfill({ status: 503, json: { message: 'Fixture list unavailable' } }),
        { times: 1 },
    );
    await page.getByRole('button', { name: 'Delete game', exact: true }).click();
    await page.getByRole('button', { name: `Delete game ${target}`, exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText(
        `Game ${target} deleted. The game list could not refresh`,
    );
    await expect(page.getByRole('button', { name: 'Delete game', exact: true })).toHaveCount(0);
    assert.equal(deletes, 1);
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    const remaining = await read('/games');
    const fallback = remaining.active_game_ids[0] ?? remaining.games[0].game_id;
    await expect(
        page.getByRole('heading', { name: `Game ${fallback} command centre`, exact: true }),
    ).toBeVisible();
    await page.getByRole('combobox', { name: 'Working game', exact: true }).selectOption(String(survivor));
    await expect(
        page.getByRole('heading', { name: `Game ${survivor} command centre`, exact: true }),
    ).toBeVisible();
    assert.equal((await page.request.get(origin + api + `/games/${target}`, { headers })).status(), 404);
    assert.equal(deletes, 1);

    // Lose the response after the server commits: explicit Refresh discovers the outcome.
    let attempts = 0;
    await page.route(
        `**${api}/games/${survivor}/lifecycle`,
        async (route) => {
            attempts++;
            assert.equal((await route.fetch()).status(), 200);
            await route.abort('failed');
        },
        { times: 1 },
    );
    await page.getByRole('button', { name: 'Deactivate game', exact: true }).click();
    await page.getByRole('button', { name: `Deactivate game ${survivor}`, exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('The result is uncertain');
    assert.equal(attempts, 1);
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Activate game', exact: true })).toBeVisible();
    assert.equal(attempts, 1);

    // Exercise last-game UI without deleting any unrelated fixture games.
    await page.route(
        `**${api}/games`,
        (route) => route.fulfill({ json: { games: [], active_game_ids: [] } }),
        { times: 1 },
    );
    await page.getByRole('button', { name: 'Delete game', exact: true }).click();
    await page.getByRole('button', { name: `Delete game ${survivor}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your first world', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open map workspace', exact: true })).toBeEnabled();
    assert.equal((await page.request.get(origin + api + `/games/${survivor}`, { headers })).status(), 404);
    assert.deepEqual(errors, []);
    console.log(
        'PASS: real admin lifecycle HTTP/UI, guest/CSRF/validation rejection, cancel/Escape, stale confirmation, mobile layout, scoped deletion, accepted-but-refresh-failed, unknown outcome/no retry and empty-game recovery.',
    );
} finally {
    await guest.dispose();
    await browser.close();
}
