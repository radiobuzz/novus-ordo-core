import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792'; // Explicit isolated PHP server only.
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
});
const errors = [];
async function login(page, name) {
    const session = await (await page.request.get(origin + '/client/session')).json();
    const response = await page.request.post(origin + '/login-user', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
        data: { username: name, password: 'fixture-password' },
    });
    assert.equal(response.status(), 200);
}
try {
    const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await admin.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page, 'map-admin');
    await page.goto(origin + '/client/map-generation');
    await page.getByRole('button', { name: 'Start new game with this map', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.generation-shell aside > button').disabled);
    await page.getByLabel('World seed', { exact: true }).fill('beta-browser-world');
    assert.equal(
        await page.getByRole('button', { name: 'Start new game with this map', exact: true }).isDisabled(),
        true,
    );
    await page.getByLabel('Preset name', { exact: true }).fill('Beta coast');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('button', { name: 'Generate landscape', exact: true }).click();
    await page.waitForFunction(() =>
        document.querySelector('.generation-summary').textContent.includes('beta-browser-world'),
    );
    await page.reload();
    assert.equal(await page.getByLabel('World seed', { exact: true }).inputValue(), 'beta-browser-world');
    await page.waitForFunction(() => !document.querySelector('.generation-shell aside > button').disabled);
    const before = (await (await page.request.get(origin + '/games')).json()).games[0];
    const noCsrf = await page.request.post(origin + '/client/map-generation', {
        headers: { Accept: 'application/json' },
        data: { map: {} },
    });
    assert.equal(noCsrf.status(), 419);
    let payload;
    page.on('request', (request) => {
        if (request.method() === 'POST' && request.url() === origin + '/client/map-generation')
            payload = request.postDataJSON();
    });
    page.once('dialog', (dialog) => dialog.accept());
    const creation = page.waitForResponse(
        (r) => r.url() === origin + '/client/map-generation' && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Start new game with this map', exact: true }).click();
    const created = await creation;
    if (created.status() !== 201)
        throw new Error(`Creation returned ${created.status()}: ${await created.text()}`);
    await page.waitForURL((url) => url.pathname === '/client' && url.searchParams.has('game_id'));
    const newGameId = Number(new URL(page.url()).searchParams.get('game_id'));
    assert.ok(newGameId > 0);
    await page.locator('.map-beta-badge').waitFor();
    const game = await (await page.request.get(origin + '/game?game_id=' + newGameId)).json();
    const map = await (await page.request.get(origin + '/game/map?game_id=' + game.game_id)).json();
    assert.notEqual(game.game_id, before.game_id);
    assert.deepEqual(map.map, payload.map);
    assert.equal(map.map.settings.seed, 'beta-browser-world');
    const wrongMap = await page.request.get(origin + '/game/map?game_id=' + before.game_id, {
        headers: { Accept: 'application/json', 'X-Game-Id': String(newGameId) },
    });
    assert.equal(wrongMap.status(), 409);
    const session = await (await page.request.get(origin + '/client/session')).json();
    const replay = await page.request.post(origin + '/client/map-generation', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
        data: payload,
    });
    assert.equal(replay.status(), 201);
    assert.notEqual((await replay.json()).game_id, newGameId);
    assert.ok(
        (await (await page.request.get(origin + '/games')).json()).games.some((g) => g.game_id === newGameId),
    );
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    const row = page.locator('.territory-row').first();
    const territoryId = await row.getAttribute('data-territory-id');
    await row.click();
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    await page.locator('.inspector-panel h3').waitFor();
    const canvas = page.locator('.world-canvas');
    await canvas.click({
        position: { x: (await canvas.boundingBox()).width / 2, y: (await canvas.boundingBox()).height / 2 },
    });
    assert(page.url().includes('territory=' + territoryId));
    await page.screenshot({ path: '/tmp/no7-map-beta-world.png' });
    await page.reload();
    await page.locator('.map-beta-badge').waitFor();
    const reloaded = await (await page.request.get(origin + '/game/map?game_id=' + game.game_id)).json();
    assert.equal(reloaded.fingerprint, map.fingerprint);

    const player = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const setup = await player.newPage();
    setup.on('pageerror', (e) => errors.push(e.message));
    await login(setup, 'map-player');
    assert.equal((await setup.request.get(origin + '/client/map-generation')).status(), 403);
    const playerSession = await (await setup.request.get(origin + '/client/session')).json();
    assert.equal(
        (
            await setup.request.post(origin + '/client/map-generation', {
                headers: { Accept: 'application/json', 'X-CSRF-TOKEN': playerSession.csrfToken },
                data: payload,
            })
        ).status(),
        403,
    );
    await setup.goto(origin + '/client/entry?game_id=' + newGameId);
    await setup.getByRole('heading', { name: 'Give your nation a name' }).waitFor();
    await setup.getByLabel('Nation name', { exact: true }).fill('Map Beta Nation');
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await setup.getByLabel('Leader name', { exact: true }).fill('Map Beta Leader');
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await setup.locator('.homeland-territory').first().waitFor();
    await setup.locator('.map-notice').waitFor({ state: 'hidden' });
    const initialZoom = await setup.locator('.zoom-value').textContent();
    await setup.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await setup.waitForFunction(
        (value) => document.querySelector('.zoom-value').textContent !== value,
        initialZoom,
    );
    await setup.getByRole('button', { name: 'Fit world', exact: true }).click();
    const { data: territories } = await (
        await setup.request.get(origin + '/territories/base-infos?game_id=' + newGameId)
    ).json();
    const eligible = await setup
        .locator('.homeland-territory')
        .evaluateAll((rows) => rows.map((row) => Number(row.dataset.id)));
    const selected = [eligible[0]];
    for (let cursor = 0; cursor < selected.length && selected.length < 5; cursor++) {
        for (const id of territories.find((t) => t.territory_id === selected[cursor])
            .connected_land_territory_ids)
            if (eligible.includes(id) && !selected.includes(id) && selected.length < 5) selected.push(id);
    }
    assert.equal(selected.length, 5);
    for (const id of selected) await setup.locator(`[data-id="${id}"]`).click();
    await setup.screenshot({ path: '/tmp/no7-map-beta-homeland.png' });
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await setup.getByRole('button', { name: 'Found your nation', exact: true }).click();
    await setup.getByRole('heading', { name: 'A nation is born' }).waitFor();
    await setup.goto(origin + '/client?game_id=' + newGameId);
    await setup.locator('.map-beta-badge').waitFor();
    await setup.getByRole('button', { name: 'Continue playing', exact: true }).click();
    await setup.getByRole('button', { name: 'Find territory', exact: true }).click();
    await setup.locator(`[data-territory-id="${selected[0]}"]`).click();
    await setup.locator('.inspector-panel').getByText('Owner information', { exact: true }).waitFor();
    await setup.screenshot({ path: '/tmp/no7-map-beta-owned.png' });
    assert.deepEqual(errors, []);
    console.log(
        'PASS: real generator, presets, dirty-preview guard, CSRF/admin guards, exact saved map, independent creation and conflicting-game rejection, new-interface picking/reload, homeland selection, nation creation and live ownership.',
    );
} finally {
    await browser.close();
}
