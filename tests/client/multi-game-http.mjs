// Real HTTP + two-tab checks against the explicitly isolated fixture server only.
import { chromium, request, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const f = JSON.parse(await readFile(`${root}/multi-game.json`, 'utf8'));
const origin = 'http://127.0.0.1:8792';
const clients = [];
const makeClient = async (username) => {
    const api = await request.newContext({
        baseURL: origin,
        extraHTTPHeaders: { Accept: 'application/json' },
    });
    clients.push(api);
    let session = await (await api.get('/client/session')).json();
    if (username) {
        const login = await api.post('/login-user', {
            headers: { 'X-CSRF-TOKEN': session.csrfToken },
            data: { username, password: 'fixture-password' },
        });
        assert.equal(login.status(), 200, await login.text());
        session = await login.json();
    }
    const headers = (id) => ({ 'X-Game-Id': String(id), 'X-CSRF-TOKEN': session.csrfToken });
    const get = async (path, id) => {
        const result = await api.get(path, { headers: headers(id) });
        assert.equal(result.status(), 200, `${path}: ${await result.text()}`);
        return result.json();
    };
    return { api, headers, get };
};
let browser;
try {
    const player = await makeClient('multi-player');
    const spectator = await makeClient('multi-spectator');
    const guest = await makeClient();
    assert.equal((await guest.api.get('/games')).status(), 401);
    const listing = await player.get('/games', f.a);
    assert.deepEqual(
        listing.games.map((g) => g.game_id),
        [f.a, f.b],
    );
    assert.deepEqual(
        listing.games.map((g) => g.nation_id),
        [f.nation_a, f.nation_b],
    );
    assert.ok(listing.games.every((g) => g.setup_status === 'FinishedSetup' && g.can_spectate));
    assert.ok((await spectator.get('/games', f.a)).games.every((g) => g.nation_id === null));
    assert.equal((await player.api.get('/game')).status(), 409);
    assert.equal(
        (await player.api.get(`/game?game_id=${f.b}`, { headers: player.headers(f.a) })).status(),
        409,
    );
    assert.equal((await player.api.get('/game?game_id[]=1')).status(), 422);
    assert.equal((await player.api.get(`/game?game_id=${f.archived}`)).status(), 403);
    assert.equal((await player.api.get('/game?game_id=99999999')).status(), 404);
    for (const id of [f.a, f.b]) {
        assert.equal((await player.get('/game', id)).game_id, id);
        const owner = await player.get('/client/gameplay', id);
        assert.equal(owner.game_id, id);
        assert.equal(owner.nation.nation_id, id === f.a ? f.nation_a : f.nation_b);
        assert.equal((await player.get('/client/setup', id)).game_id, id);
        assert.equal((await spectator.get('/user/nation-setup-status', id)).nation_id, null);
        assert.equal(
            (await spectator.api.get('/client/gameplay', { headers: spectator.headers(id) })).status(),
            400,
        );
        assert.equal((await guest.get('/game', id)).game_id, id);
        const identities = await guest.get('/game/identities', id);
        assert.equal(identities.game_id, id);
        assert.ok(!JSON.stringify(identities).includes('stockpiles'));
        const map = await player.get(`/game/map?game_id=${id}`, id);
        assert.equal(map.game_id, id);
        assert.equal(map.map === null, id === f.a);
    }
    const beforeB = await player.get('/client/gameplay', f.b);
    const a = await player.get('/client/gameplay', f.a);
    const context = { game_id: f.a, user_id: f.user, nation_id: f.nation_a, turn_number: a.turn_number };
    const post = (path, id, body) => player.api.post(path, { headers: player.headers(id), data: body });
    const territoryA = (await player.get('/nation/territories/turn-infos', f.a)).data[0].territory_id;
    const territoryB = (await player.get('/nation/territories/turn-infos', f.b)).data[0].territory_id;
    assert.equal(
        (
            await player.api.get(`/territories/${territoryB}/base-info`, { headers: player.headers(f.a) })
        ).status(),
        404,
    );
    assert.equal(
        (await player.api.get(`/nations/${f.nation_b}`, { headers: player.headers(f.a) })).status(),
        422,
    );
    assert.equal(
        (
            await post('/nation/territories/deployments', f.a, {
                client_context: context,
                deployments: [{ territory_id: territoryB, division_type: 'Infantry' }],
            })
        ).status(),
        422,
    );
    assert.equal(
        (
            await post('/ready-for-next-turn', f.a, {
                client_context: { ...context, game_id: f.b },
                turn_number: a.turn_number,
            })
        ).status(),
        409,
    );
    assert.equal(
        (
            await post('/ready-for-next-turn', f.a, {
                client_context: { ...context, nation_id: f.nation_b },
                turn_number: a.turn_number,
            })
        ).status(),
        409,
    );
    const deployment = await post('/nation/territories/deployments', f.a, {
        client_context: context,
        deployments: [{ territory_id: territoryA, division_type: 'Infantry' }],
    });
    assert.equal(deployment.status(), 201, await deployment.text());
    assert.deepEqual(await player.get('/client/gameplay', f.b), beforeB);
    const ready = await post('/ready-for-next-turn', f.a, {
        client_context: context,
        turn_number: a.turn_number,
    });
    assert.equal(ready.status(), 200, await ready.text());
    assert.equal((await player.get('/game', f.a)).turn_number, a.turn_number + 1);
    assert.deepEqual(await player.get('/client/gameplay', f.b), beforeB);
    const divisionsA = (await player.get('/nation/divisions', f.a)).data;
    assert.ok(divisionsA.length);
    assert.equal(
        (
            await player.api.get(`/nation/divisions/${divisionsA[0].division_id}`, {
                headers: player.headers(f.b),
            })
        ).status(),
        404,
    );
    const cancel = await post('/nation/divisions:cancel-orders', f.b, {
        client_context: { ...context, game_id: f.b, nation_id: f.nation_b, turn_number: beforeB.turn_number },
        division_ids: [divisionsA[0].division_id],
    });
    assert.equal(cancel.status(), 422);
    assert.deepEqual(await player.get('/client/gameplay', f.b), beforeB);

    // Full creation form can establish a different nation for one account in each game.
    const joiner = await makeClient('multi-joiner');
    for (const id of [f.a, f.b]) {
        const setup = await joiner.get('/client/setup', id);
        const base = (await joiner.get('/territories/base-infos', id)).data;
        const available = new Set(setup.suitable_ids),
            byId = new Map(base.map((t) => [t.territory_id, t]));
        let home;
        for (const start of available) {
            const queue = [start],
                seen = new Set();
            while (queue.length && seen.size < setup.required_territories) {
                const next = queue.shift();
                if (seen.has(next)) continue;
                seen.add(next);
                queue.push(
                    ...byId
                        .get(next)
                        .connected_land_territory_ids.filter((n) => available.has(n) && !seen.has(n)),
                );
            }
            if (seen.size === setup.required_territories) {
                home = [...seen];
                break;
            }
        }
        assert.ok(home);
        const result = await joiner.api.post('/create-nation', {
            headers: joiner.headers(id),
            multipart: {
                nation_name: 'Two Worlds',
                leader_name: 'Joined Leader',
                territory_ids_as_json: JSON.stringify(home),
            },
        });
        assert.equal(result.status(), 201, await result.text());
        assert.equal((await joiner.get('/client/setup', id)).status, 'FinishedSetup');
    }
    assert.equal(new Set((await joiner.get('/games', f.a)).games.map((g) => g.nation_id)).size, 2);

    // Both real client instances use one login cookie, with independent game headers and maps.
    browser = await chromium.launch({
        executablePath: '/opt/google/chrome/chrome',
        headless: true,
        args: ['--no-sandbox'],
    });
    const browserContext = await browser.newContext({ storageState: await player.api.storageState() });
    const errors = [];
    const pages = await Promise.all(
        [f.a, f.b].map(async (id) => {
            const page = await browserContext.newPage();
            page.setDefaultTimeout(45000);
            page.on('pageerror', (error) => errors.push(error.message));
            const loaded = page.waitForResponse(
                (response) =>
                    new URL(response.url()).pathname === '/client/gameplay' && response.status() === 200,
            );
            await page.goto(`${origin}/client?game_id=${id}#/world`);
            const response = await loaded;
            assert.equal(response.request().headers()['x-game-id'], String(id));
            assert.equal((await response.json()).game_id, id);
            await expect(page.locator('canvas').first()).toBeVisible();
            return page;
        }),
    );
    await pages[0].reload();
    assert.equal(new URL(pages[1].url()).searchParams.get('game_id'), String(f.b));
    assert.deepEqual(errors, []);
    console.log(
        'PASS: authenticated HTTP game isolation, spectator/public reads, cross-game commands and IDs, independent Ready, multipart setup in both games, and two real client tabs.',
    );
} finally {
    await browser?.close();
    await Promise.all(clients.map((client) => client.dispose()));
}
