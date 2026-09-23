import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8792'; // Hardcoded isolated PHP host only.
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
try {
    const context = await browser.newContext();
    const api = context.request;
    const token = async () => (await (await api.get(origin + '/client/session')).json()).csrfToken;
    let headers = { Accept: 'application/json', 'X-CSRF-TOKEN': await token() };
    assert.equal(
        (await api.post(origin + '/nation/experimental-ai-step', { headers, data: {} })).status(),
        401,
    );
    assert.equal(
        (
            await api.post(origin + '/login-user', {
                headers,
                data: { username: 'map-admin', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    headers = { Accept: 'application/json', 'X-CSRF-TOKEN': await token() };
    const games = await (await api.get(origin + '/client/admin/api/games')).json();
    const archive = games.games.find((game) => !game.active && game.nation_count >= 6);
    assert(archive, 'Expected archived six/ten-bot test game');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/client/admin#/overview?game=${archive.game_id}`);
    await expect(
        page.getByRole('heading', { name: 'AI Player · V1 Experimental · disposable' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'preview', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Start classic-map game', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Start a new game?' })).toBeVisible();
    await page.getByRole('button', { name: 'Watch-test preset: 6 mixed bots + protection' }).click();
    await expect(page.getByLabel('AI players', { exact: true })).toHaveValue('6');
    await expect(page.getByLabel('Protect human nations from AI attacks', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const current = await (
        await api.get(`${origin}/client/admin/api/games/${games.active_game_ids[0]}`)
    ).json();
    const bot = current.nations[0];
    assert(bot);
    assert.equal(
        (
            await api.post(`${origin}/client/admin/api/games/${games.active_game_ids[0]}/ai/step`, {
                headers: { Accept: 'application/json' },
                data: {},
            })
        ).status(),
        419,
    );
    assert.equal(
        (
            await api.post(`${origin}/client/admin/api/users/${bot.user_id}/enter`, {
                headers,
                data: { destination: 'client' },
            })
        ).status(),
        200,
    );
    headers = { Accept: 'application/json', 'X-CSRF-TOKEN': await token() };
    // Legacy-shaped payload cannot bypass the AI-control guard; no submitted game action.
    assert.equal(
        (
            await api.post(origin + '/ready-for-next-turn', {
                headers,
                data: { turn_number: current.turn_number },
            })
        ).status(),
        409,
    );
    assert.deepEqual(errors, []);
    console.log(
        'PASS real HTTP authentication/CSRF, archived AI report, setup preset/cancel and legacy manual-command guard',
    );
} finally {
    await browser.close();
}
