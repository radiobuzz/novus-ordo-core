import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792'; // Isolated PHP host only.
const api = origin + '/client/admin/api';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
    headless: true,
});
const errors = [];
async function login(page, username = 'map-admin', password = 'fixture-password') {
    const session = await (await page.request.get(origin + '/client/session')).json();
    const result = await page.request.post(origin + '/login-user', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
        data: { username, password },
    });
    assert.equal(result.status(), 200);
}
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page);
    await page.goto(origin + '/client/admin');
    await expect(page.getByRole('heading', { name: /command centre/ })).toBeVisible();
    const headers = {
        Accept: 'application/json',
        'X-CSRF-TOKEN': (await (await page.request.get(origin + '/client/session')).json()).csrfToken,
    };
    const read = async (path) => {
        const result = await page.request.get(api + path, { headers });
        assert.equal(result.status(), 200, await result.text());
        return result.json();
    };
    const before = await read('/games');
    const active = before.active_game_ids[0];
    const game = await read(`/games/${active}`);
    const archive = before.games.find((entry) => !entry.active);
    if (archive) {
        await page.getByLabel('Working game', { exact: true }).selectOption(String(archive.game_id));
        await expect(
            page.getByRole('heading', { name: `Game ${archive.game_id} command centre` }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Force next turn', exact: true })).toBeDisabled();
        assert.deepEqual((await read('/games')).active_game_ids, before.active_game_ids);
        assert.equal(
            (
                await page.request.post(api + `/games/${archive.game_id}/turn`, {
                    headers,
                    data: { action: 'advance', turn_id: archive.turn_id },
                })
            ).status(),
            409,
        );
    }
    await page.getByLabel('Working game', { exact: true }).selectOption(String(active));
    await expect(page.getByRole('heading', { name: `Game ${active} command centre` })).toBeVisible();
    // Cancel/Escape must not send an operation, and focus returns to the trigger.
    await page.getByRole('button', { name: 'Force next turn', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Force next turn', exact: true })).toBeFocused();
    assert.equal((await read(`/games/${active}`)).turn_id, game.turn_id);
    await page.getByRole('button', { name: 'Force next turn', exact: true }).click();
    await page.getByRole('button', { name: `Advance game ${active}`, exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText(`turn ${game.turn_number + 1}`);
    await expect(page.getByRole('button', { name: 'Rollback last turn', exact: true })).toBeEnabled();
    assert.equal(
        (
            await page.request.post(api + `/games/${active}/turn`, {
                headers,
                data: { action: 'rollback', turn_id: game.turn_id },
            })
        ).status(),
        409,
    );
    await page.getByRole('button', { name: 'Rollback last turn', exact: true }).click();
    await page.getByRole('button', { name: `Roll back game ${active}`, exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText(`turn ${game.turn_number}`);
    await expect(page.getByRole('heading', { name: `Game ${active} command centre` })).toBeVisible();
    assert.equal((await read(`/games/${active}`)).turn_number, game.turn_number);
    await page.screenshot({ path: '/tmp/no7-admin-overview.png', fullPage: true });
    // Read-only repeated navigation cleans up map observers, listeners and request scopes.
    await page.getByRole('link', { name: 'Object inspector', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Object inspector', exact: true })).toBeVisible();
    const baseline = await page.evaluate(() => window.novusAdminDiagnostics());
    for (let i = 0; i < 5; i++) {
        await page.getByRole('link', { name: 'Overview', exact: true }).click();
        await expect(page.getByRole('heading', { name: `Game ${active} command centre` })).toBeVisible();
        await page.getByRole('link', { name: 'Object inspector', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Object inspector', exact: true })).toBeVisible();
    }
    assert.deepEqual(await page.evaluate(() => window.novusAdminDiagnostics()), baseline);
    assert.equal(
        (
            await page.request.get(api + `/games/${active}/inspect?kind=division&id=99999999`, { headers })
        ).status(),
        404,
    );
    // Global accounts, generated credentials, safe text and reset password.
    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    const username = `admin-fixture-${Date.now()}`;
    await page.getByLabel('New username', { exact: true }).fill(username);
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await expect(page.getByLabel('Generated password', { exact: true })).toBeVisible();
    const generated = await page.getByLabel('Generated password', { exact: true }).inputValue();
    assert(generated.length >= 24);
    const user = (await read('/users')).users.find((entry) => entry.username === username);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, username, generated);
    // Existing development access remains broad; saved-map operations still require an administrator.
    const ordinaryHeaders = {
        Accept: 'application/json',
        'X-CSRF-TOKEN': (await (await otherPage.request.get(origin + '/client/session')).json()).csrfToken,
    };
    assert.equal((await otherPage.request.get(api + '/games', { headers: ordinaryHeaders })).status(), 200);
    assert.equal((await otherPage.request.get(api + '/maps', { headers: ordinaryHeaders })).status(), 403);
    await page.getByLabel('Account to update', { exact: true }).selectOption(String(user.user_id));
    await page.getByLabel('New password', { exact: true }).fill('changed-fixture-password');
    await page.getByRole('button', { name: 'Set password', exact: true }).click();
    await page.getByRole('button', { name: 'Replace password', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('Password replaced');
    await expect(page.getByLabel('Generated password', { exact: true })).toHaveCount(0);
    // Map library is independent of game creation, uses the same tuned generator, and rejects dirty previews.
    await page.getByRole('link', { name: 'Map workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Map workspace', exact: true })).toBeVisible();
    await page.getByLabel('World seed', { exact: true }).fill('admin-island-fixture');
    await page.getByLabel('Land target', { exact: true }).fill('48');
    await expect(page.getByLabel('Land target slider', { exact: true })).toHaveValue('48');
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save map to library', exact: true })).toBeEnabled();
    await page.getByRole('link', { name: 'Object inspector', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Object inspector', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Map workspace', exact: true }).click();
    await expect(page.getByLabel('World seed', { exact: true })).toHaveValue('admin-island-fixture');
    await expect(page.getByRole('button', { name: 'Save map to library', exact: true })).toBeEnabled();
    await page.getByLabel('Map name', { exact: true }).fill('Admin test archipelago');
    await page.getByRole('button', { name: 'Save map to library', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('saved independently');
    await expect(page.getByRole('button', { name: 'Start game from this map', exact: true })).toBeEnabled();
    assert.deepEqual((await read('/games')).active_game_ids, before.active_game_ids);
    const saved = (await read('/maps')).maps[0];
    const snapshot = await read(`/maps/${saved.id}`);
    assert.equal(snapshot.map.settings.seed, 'admin-island-fixture');
    await page.getByLabel('World seed', { exact: true }).fill('unsaved-setting');
    await expect(page.getByRole('button', { name: 'Save map to library', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Start game from this map', exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('button', { name: `Load ${saved.name} map ${saved.id}`, exact: true }).click();
    await expect(page.getByLabel('World seed', { exact: true })).toHaveValue('admin-island-fixture');
    await expect(page.getByRole('button', { name: 'Start game from this map', exact: true })).toBeEnabled();
    await page.screenshot({ path: '/tmp/no7-admin-maps.png', fullPage: true });
    assert.equal(
        (
            await page.request.post(api + '/games', {
                headers: ordinaryHeaders,
                data: { map_draft_id: saved.id },
            })
        ).status(),
        419,
    ); // Wrong session's CSRF token.
    assert.equal(
        (
            await otherPage.request.post(api + '/games', {
                headers: ordinaryHeaders,
                data: { map_draft_id: saved.id },
            })
        ).status(),
        403,
    );
    await page.getByRole('button', { name: 'Start game from this map', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Existing games remain active');
    await page.getByRole('button', { name: 'Create and activate game', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('created and activated');
    const after = await read('/games');
    const created = after.active_game_ids.find((id) => !before.active_game_ids.includes(id));
    assert.ok(created);
    assert.ok(before.active_game_ids.every((id) => after.active_game_ids.includes(id)));
    await expect(page.getByRole('heading', { name: `Game ${created} command centre` })).toBeVisible();
    const installed = await read(`/games/${created}/map`);
    assert.deepEqual(installed.map, snapshot.map);
    assert.equal(installed.fingerprint, saved.fingerprint);
    assert.equal(
        (await page.request.post(api + '/maps', { headers, data: { name: 'Invalid', map: {} } })).status(),
        422,
    );
    const guest = await browser.newContext();
    assert.equal(
        (await guest.request.get(api + '/games', { headers: { Accept: 'application/json' } })).status(),
        401,
    );
    assert.equal(
        (
            await page.request.post(api + `/games/${created}/turn`, {
                headers: { Accept: 'application/json' },
                data: { action: 'advance', turn_id: 1 },
            })
        ).status(),
        419,
    );
    const secretResponse = await page.request.get(api + '/users', { headers });
    assert.match(secretResponse.headers()['cache-control'], /no-store/);
    assert(!(await secretResponse.text()).includes('password'));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/no7-admin-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Start classic-map game', exact: true }).click();
    await page.getByRole('button', { name: 'Create and activate game', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('created and activated');
    const classic = await read('/games');
    const classicId = classic.active_game_ids.find((id) => !after.active_game_ids.includes(id));
    assert.ok(classicId);
    assert.ok(after.active_game_ids.every((id) => classic.active_game_ids.includes(id)));
    assert.equal((await read(`/games/${classicId}/map`)).map, null);
    assert.deepEqual((await read(`/games/${created}/map`)).map, snapshot.map);
    // Session switching is explicit and replaces the session (not a scoped game read).
    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    await page.getByLabel('Find a user', { exact: true }).fill(username);
    await page.getByRole('button', { name: 'Games', exact: true }).click();
    await page.getByRole('button', { name: 'Switch session', exact: true }).click();
    await page.waitForURL(origin + '/client');
    assert.equal((await (await page.request.get(origin + '/client/session')).json()).userId, user.user_id);
    assert.deepEqual(errors, []);
    console.log(
        'PASS: admin scopes, archive read-only, turn/rollback guards, dialog focus/cancel, lifecycle cleanup, accounts/password/session flows, map generation/save/reload/exact start, CSRF/access, no-store and mobile layout (isolated database only).',
    );
} finally {
    await browser.close();
}
