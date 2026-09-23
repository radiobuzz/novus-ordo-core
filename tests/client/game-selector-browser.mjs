// Mutations and auth are confined to the explicitly isolated two-game fixture.
import { chromium, request, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const f = JSON.parse(await readFile(`${root}/multi-game.json`, 'utf8'));
const origin = 'http://127.0.0.1:8792';
const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Accept: 'application/json' } });
const session = await (await api.get('/client/session')).json();
const login = await api.post('/login-user', {
    headers: { 'X-CSRF-TOKEN': session.csrfToken },
    data: { username: 'multi-player', password: 'fixture-password' },
});
assert.equal(login.status(), 200);
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
try {
    const context = await browser.newContext({
        storageState: await api.storageState(),
        viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error('PAGE ERROR', error.message);
    });
    page.on('dialog', async (dialog) => {
        console.log('DIALOG', dialog.message());
        await dialog.accept().catch(() => {});
    });
    const card = (id) => page.locator(`[data-game-id="${id}"]`);
    const dismissNews = async () => {
        const continueButton = page.getByRole('button', { name: 'Continue playing', exact: true });
        if (await continueButton.isVisible()) await continueButton.click();
    };
    const world = async (id) => {
        await expect(page.locator('canvas.world-canvas')).toBeVisible({ timeout: 25000 });
        await expect(page.locator('.header-context')).toContainText(`Game ${id}`);
        await dismissNews();
    };
    const openGames = async (target) => {
        await target.getByLabel('Game menu', { exact: true }).click();
        await target.getByRole('button', { name: 'Games', exact: true }).click();
    };
    await page.goto(`${origin}/client`);
    await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
    await expect(card(f.a).getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    await expect(card(f.b)).toBeVisible();
    const selectorCounts = await page.evaluate(() => window.novusClientDiagnostics());
    // Switching is in-page: this marker survives both instances.
    await page.evaluate(() => (window.stage2Marker = 'same-document'));
    await card(f.a).getByRole('link', { name: 'Play', exact: true }).click();
    await world(f.a);
    await page.getByRole('button', { name: 'Rotate map right 15°', exact: true }).click();
    await expect(page.locator('.map-orientation-value')).toHaveText('15°');
    const rotationA = await page.locator('.map-orientation-value').textContent();
    await openGames(page);
    await expect(card(f.b)).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.novusClientDiagnostics()), selectorCounts);
    await card(f.b).getByRole('link', { name: 'Play', exact: true }).click();
    await world(f.b);
    assert.notEqual(await page.locator('.map-orientation-value').textContent(), rotationA);
    await openGames(page);
    await expect(card(f.a)).toBeVisible();
    await card(f.a).getByRole('link', { name: 'Play', exact: true }).click();
    await world(f.a);
    await expect(page.locator('.map-orientation-value')).toHaveText(rotationA);
    assert.equal(await page.evaluate(() => window.stage2Marker), 'same-document');
    // Back returns to the selector; Forward restores the correct game.
    await page.goBack();
    await expect(card(f.a)).toBeVisible();
    await page.goForward();
    await world(f.a);
    // Public-only spectator mode works even for this game's owner.
    await openGames(page);
    await expect(card(f.a)).toBeVisible();
    const privateReads = [];
    const record = (req) => {
        if (new URL(req.url()).pathname === '/client/gameplay') privateReads.push(req.url());
    };
    page.on('request', record);
    await card(f.a).getByRole('link', { name: 'Spectate', exact: true }).click();
    await world(f.a);
    await expect(page.getByRole('button', { name: 'Ready', exact: true })).toBeDisabled();
    assert.equal(privateReads.length, 0);
    page.off('request', record);
    // A second tab has its own explicit game transport.
    const second = await context.newPage();
    const response = second.waitForResponse((r) => new URL(r.url()).pathname === '/game');
    await second.goto(`${origin}/client?game_id=${f.b}`);
    assert.equal((await (await response).json()).game_id, f.b);
    await expect(second.locator('canvas.world-canvas')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.header-context')).toContainText(`Game ${f.a}`);
    await second.close();
    // A pending mutation cannot be abandoned by the switcher or browser Back.
    const guard = await context.newPage();
    const dialogs = [];
    let allowLeave = false;
    guard.on('dialog', async (dialog) => {
        dialogs.push(dialog.message());
        if (dialog.type() === 'alert' || allowLeave) await dialog.accept().catch(() => {});
        else await dialog.dismiss().catch(() => {});
    });
    await guard.goto(`${origin}/client`);
    await guard.locator(`[data-game-id="${f.a}"]`).getByRole('link', { name: 'Play', exact: true }).click();
    await expect(guard.locator('.world-canvas')).toBeVisible();
    const news = guard.getByRole('button', { name: 'Continue playing', exact: true });
    if (await news.isVisible()) await news.click();
    let release;
    let received;
    const sending = new Promise((resolve) => {
        received = resolve;
    });
    const held = new Promise((resolve) => {
        release = resolve;
    });
    await guard.route('**/ready-for-next-turn', async (route) => {
        received();
        await held;
        await route.fulfill({ status: 422, json: { message: 'Fixture rejection; no command was sent.' } });
    });
    await guard.getByRole('button', { name: 'Ready', exact: true }).click();
    await sending;
    await openGames(guard);
    assert.ok(dialogs.at(-1).includes('pending'));
    assert.equal(new URL(guard.url()).searchParams.get('game_id'), String(f.a));
    await guard.goBack();
    await expect.poll(() => new URL(guard.url()).searchParams.get('game_id')).toBe(String(f.a));
    assert.ok(dialogs.at(-1).includes('pending'));
    release();
    await expect(guard.getByRole('button', { name: 'Ready', exact: true })).toBeEnabled();
    await guard.locator('[data-mode="military"]').click();
    await guard.locator('[data-tool="deploy"]').click();
    await guard.getByText('Place using a list', { exact: true }).click();
    const destination = guard.getByLabel('Destination territory', { exact: true });
    const territory = await destination
        .locator('option')
        .evaluateAll((options) => options.find((o) => o.value)?.value);
    await destination.selectOption(territory);
    await guard.getByLabel('Quantity (up to 100 per request)', { exact: true }).fill('1');
    await guard.getByRole('button', { name: 'Add to preview', exact: true }).click();
    await openGames(guard);
    assert.ok(dialogs.at(-1).includes('Unsubmitted'));
    await expect(guard.locator('.world-canvas')).toBeVisible();
    allowLeave = true;
    await openGames(guard);
    await expect(guard.locator(`[data-game-id="${f.b}"]`)).toBeVisible();
    await guard.close();
    // A late response from A cannot publish into B after A is disposed.
    const late = await context.newPage();
    let finishRead, readStarted;
    const readWait = new Promise((resolve) => {
        finishRead = resolve;
    });
    const started = new Promise((resolve) => {
        readStarted = resolve;
    });
    await late.route('**/client/gameplay', async (route) => {
        if (route.request().headers()['x-game-id'] !== String(f.a)) return route.continue();
        const response = await route.fetch();
        readStarted();
        await readWait;
        await route.fulfill({ response }).catch(() => {});
    });
    await late.goto(`${origin}/client?game_id=${f.a}`);
    await started;
    await openGames(late);
    await expect(late.locator(`[data-game-id="${f.b}"]`)).toBeVisible();
    await late.locator(`[data-game-id="${f.b}"]`).getByRole('link', { name: 'Play', exact: true }).click();
    await expect(late.locator('.world-canvas')).toBeVisible();
    finishRead();
    await expect(late.locator('.header-context')).toContainText(`Game ${f.b}`);
    await late.close();
    // Narrow selector, localized labels, accessible keyboard navigation.
    await openGames(page);
    await expect(card(f.a)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('heading', { name: 'Games', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeFocused();
    await page.getByRole('combobox').selectOption('fr');
    await expect(page.getByRole('heading', { name: 'Parties', exact: true })).toBeVisible();
    await page.getByRole('combobox').selectOption('en');
    await page.screenshot({ path: '/tmp/no7-stage2-selector.png', fullPage: true });
    await page.route('**/games', (route) => route.fulfill({ json: { games: [] } }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByText('There are no active games yet.')).toBeVisible();
    await page.unroute('**/games');
    await page.route('**/games', (route) =>
        route.fulfill({ status: 503, json: { message: 'Fixture unavailable' } }),
    );
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.unroute('**/games');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(card(f.a)).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
    // Actual login without a selection goes to the directory; joining pins setup to that game.
    const newcomer = await browser.newContext();
    const entry = await newcomer.newPage();
    await entry.goto(`${origin}/client/entry`);
    await entry.getByLabel('Username', { exact: true }).fill('multi-joiner');
    await entry.getByLabel('Password', { exact: true }).fill('fixture-password');
    await entry.getByRole('button', { name: 'Enter the world', exact: true }).click();
    await expect(entry.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
    const setupResponse = entry.waitForResponse((r) => new URL(r.url()).pathname === '/client/setup');
    await entry
        .locator(`[data-game-id="${f.b}"]`)
        .getByRole('link', { name: 'Join as player', exact: true })
        .click();
    assert.equal((await (await setupResponse).json()).game_id, f.b);
    await expect(entry.getByRole('heading', { name: 'Give your nation a name', exact: true })).toBeVisible();
    await entry.getByRole('link', { name: 'Games', exact: true }).click();
    await expect(entry.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
    await newcomer.close();
    console.log(
        'PASS: directory, in-page switching, cleanup counts, per-game camera, history, owner spectating, two tabs, pending/dirty guards, late responses, login/setup and narrow layout.',
    );
} finally {
    await browser.close();
    await api.dispose();
}
