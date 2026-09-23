import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';
import { prepareHud } from './hud-helpers.js';

for (const bots of [true, false]) {
    test(`Ready stays enabled during ${bots ? 'a slow bot and its reconciliation' : 'another human readiness refresh'}`, async ({
        page,
    }) => {
        await prepareHud(page);
        let releaseBot, releaseRead;
        const botHold = new Promise((resolve) => {
            releaseBot = resolve;
        });
        const readHold = new Promise((resolve) => {
            releaseRead = resolve;
        });
        let botWrites = 0,
            ownWrites = 0,
            heldReads = 0,
            holdReads = false,
            otherReady = false;
        await page.route('**/client/gameplay', async (route) => {
            if (holdReads) {
                heldReads++;
                await readHold;
            }
            const data = fixtures('/client/gameplay');
            if (bots)
                data.automation = {
                    game_id: 1,
                    turn_id: 1,
                    generation: '00000000-0000-4000-8000-000000000001',
                    enabled: true,
                    next_enabled: true,
                    next_nation_id: otherReady ? null : 8,
                    players: [{ nation_id: 8, name: 'Bot 8', ready: otherReady }],
                };
            await route.fulfill({ json: data });
        });
        await page.route('**/game/ready-status', (route) =>
            route.fulfill({
                json: {
                    ...fixtures('/game/ready-status'),
                    ready_for_next_turn_nation_ids: [...(otherReady ? [8] : []), ...(ownWrites ? [7] : [])],
                },
            }),
        );
        await page.route('**/nation/experimental-ai-step', async (route) => {
            botWrites++;
            await botHold;
            otherReady = true;
            await route.fulfill({ json: { status: 'played' } });
        });
        await page.route('**/ready-for-next-turn', (route) => {
            ownWrites++;
            return route.fulfill({ json: {} });
        });
        try {
            await page.goto('/client?game_id=1');
            const ready = page.getByRole('button', { name: 'Ready', exact: true });
            await expect(ready).toBeEnabled();
            await ready.evaluate((button) => {
                window.readyDisabledEvents = [];
                window.readyCanvas = document.querySelector('.world-canvas');
                window.readyObserver = new MutationObserver((records) => {
                    for (const record of records)
                        if (record.attributeName === 'disabled')
                            window.readyDisabledEvents.push(button.disabled);
                });
                window.readyObserver.observe(button, { attributes: true });
            });
            if (bots) {
                await expect.poll(() => botWrites).toBe(1);
                await expect(ready).toBeEnabled();
                await expect(ready).not.toHaveAttribute('aria-busy', 'true');
                holdReads = true;
                releaseBot();
            } else {
                otherReady = true;
                holdReads = true;
                await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            }
            await expect.poll(() => heldReads).toBeGreaterThan(0);
            await expect(ready).toBeEnabled();
            expect(await page.evaluate(() => window.readyDisabledEvents)).toEqual([]);
            await page.evaluate(() => window.readyObserver.disconnect());
            // Clicking during the background read supersedes only that read, not our command.
            await ready.click();
            await expect.poll(() => ownWrites).toBe(1);
            holdReads = false;
            releaseRead();
            await expect(page.getByRole('button', { name: 'Ready ✓', exact: true })).toBeDisabled();
            expect(
                await page.evaluate(() => window.readyCanvas === document.querySelector('.world-canvas')),
            ).toBe(true);
            expect(botWrites).toBe(bots ? 1 : 0);
            expect(ownWrites).toBe(1);
        } finally {
            releaseBot();
            releaseRead();
        }
    });
}

test('sequential bot ticks, spectator Ready, no modal interruption and unchanged canvas', async ({
    page,
}) => {
    await prepareHud(page);
    let turn = 1,
        completed = [],
        writes = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of [
        '/game',
        '/game/ready-status',
        '/client/gameplay',
        '/game/territories/turn-infos',
        '/nation/territories/turn-infos',
        '/game/identities',
    ]) {
        await page.route(`**${path}`, (route) => {
            const data = fixtures(path, turn);
            if (path === '/client/gameplay')
                data.automation = {
                    game_id: 1,
                    turn_id: turn,
                    turn_number: turn,
                    generation: '00000000-0000-4000-8000-000000000001',
                    enabled: true,
                    paused: false,
                    protect_humans: true,
                    next_enabled: true,
                    next_nation_id: [8, 9].find((id) => !completed.includes(id)) ?? null,
                    players: [8, 9].map((id) => ({
                        nation_id: id,
                        name: `Bot ${id}`,
                        ready: completed.includes(id),
                    })),
                };
            if (path === '/game/ready-status') data.ready_for_next_turn_nation_ids = completed;
            return route.fulfill({ json: data });
        });
    }
    await page.route('**/nation/experimental-ai-step', (route) => {
        const body = route.request().postDataJSON();
        writes.push(body.nation_id);
        completed.push(body.nation_id);
        return route.fulfill({ json: { status: 'played' } });
    });
    await page.route('**/ready-for-next-turn', (route) => {
        writes.push('ready');
        turn++;
        completed = [];
        return route.fulfill({ json: {} });
    });
    await page.goto('/client?game_id=1');
    await expect(page.locator('.world-canvas')).toBeVisible();
    await page.evaluate(() => {
        window.firstAICanvas = document.querySelector('.world-canvas');
    });
    await page.locator('.hud-automation summary').click();
    await page.getByLabel('Delay before Ready').selectOption('3');
    await page.getByRole('button', { name: 'Enable Auto-ready', exact: true }).click();
    await expect.poll(() => writes.slice(0, 3), { timeout: 20000 }).toEqual([8, 9, 'ready']);
    await expect(page.locator('.turn-briefing')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => firstAICanvas === document.querySelector('.world-canvas'))).toBe(true);
    expect(errors).toEqual([]);
});

test('watch controls fit mobile and translate to French', async ({ page }) => {
    await prepareHud(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/client?game_id=1');
    await page.locator('.game-menu summary').click();
    await page.locator('.language-selector').selectOption('fr');
    await page.keyboard.press('Escape');
    await page.locator('.hud-automation summary').click();
    await expect(page.getByRole('button', { name: 'Activer Prêt auto', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('only one tab owns the Auto-ready countdown for a nation', async ({ page, context }) => {
    await prepareHud(page);
    await page.goto('/client?game_id=1');
    await page.locator('.hud-automation summary').click();
    await page.getByLabel('Delay before Ready').selectOption('60');
    await page.getByRole('button', { name: 'Enable Auto-ready', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause Auto-ready', exact: true })).toBeVisible();
    const second = await context.newPage();
    await prepareHud(second);
    await second.goto('/client?game_id=1');
    await second.locator('.hud-automation summary').click();
    await second.getByRole('button', { name: 'Enable Auto-ready', exact: true }).click();
    await expect(second.locator('.hud-automation')).toContainText(
        'Auto-ready is already active in another tab',
    );
    await page.close();
    await second.getByRole('button', { name: 'Enable Auto-ready', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Pause Auto-ready', exact: true })).toBeVisible();
    await second.close();
});
