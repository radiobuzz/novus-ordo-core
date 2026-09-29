import { test, expect } from '@playwright/test';
import { fixtures } from '../fixtures.js';

async function setup(page, { reduced = false, previousOwner = 8, otherChange = true } = {}) {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = { turn: 2, fail: false, delay: null };
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        const historical = path === '/territories/turn-infos' && url.searchParams.get('turn_number') === '1';
        if (historical && state.delay) await state.delay;
        if (historical && state.fail)
            return route.fulfill({ status: 500, json: { message: 'Fixture history unavailable' } });
        const result = fixtures(path, historical ? 1 : state.turn);
        if (!result) return route.continue();
        if (path === '/game/news')
            result.push({
                content: 'Another conquest.',
                context: {
                    type: 'battle',
                    battle_id: 3,
                    attacker_nation_id: 8,
                    defender_nation_id: null,
                    territory_id: 175,
                    outcome: 'conquered',
                },
            });
        if (historical) {
            result.data.find((t) => t.territory_id === 156).owner_nation_id = previousOwner;
            if (otherChange) result.data.find((t) => t.territory_id === 175).owner_nation_id = 8;
        }
        return route.fulfill({ json: result });
    });
    await page.goto('/client?game_id=1');
    await expect(page.locator('.briefing-reports .report-event')).toHaveCount(3);
    return state;
}

test('conquest comparison fades and leaves the live generated map intact', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await setup(page);
    const opener = page.locator('.briefing-reports').getByRole('button', { name: 'View on map' });
    await expect(opener).toHaveCount(1);
    await expect(page.locator('.briefing-reports .report-event button')).toHaveCount(0);
    await expect(
        page.locator('.briefing-reports .ui-panel-heading').getByRole('button', { name: 'View on map' }),
    ).toHaveCount(1);
    await expect(page.locator('.world-workspace .map-notice')).toBeHidden();
    await page.evaluate(() => {
        window.liveCanvas = document.querySelector('.world-workspace .world-canvas');
        window.livePixels = liveCanvas.toDataURL();
        window.liveMinimap = document.querySelector('.minimap-canvas');
        window.baselineResources = novusClientDiagnostics();
    });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Ownership change' });
    await expect(dialog.locator('.ownership-phase')).toContainText('Before · Turn 1');
    await expect(dialog).toContainText('Territories changing owner: 2');
    const base = dialog.locator('canvas').first();
    const overlay = dialog.locator('.ownership-map-after');
    await expect(base).toBeVisible();
    await expect
        .poll(() =>
            dialog.locator('.ownership-map').evaluate((element) => {
                const canvases = [...element.querySelectorAll('canvas')];
                const [before, after] = canvases.map(
                    (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data,
                );
                const width = canvases[0].width;
                let left = 0,
                    right = 0;
                for (let i = 0; i < before.length; i += 4) {
                    if (
                        Math.abs(before[i] - after[i]) +
                            Math.abs(before[i + 1] - after[i + 1]) +
                            Math.abs(before[i + 2] - after[i + 2]) <
                        30
                    )
                        continue;
                    const x = (i / 4) % width;
                    if (x < width * 0.4) left++;
                    if (x > width * 0.6) right++;
                }
                return left > 10 && right > 10;
            }),
        )
        .toBe(true);
    await expect(dialog.locator('.ownership-phase')).toContainText('After · Turn 2', { timeout: 6000 });
    const hatching = dialog.locator('.ownership-map-highlight');
    await expect.poll(() => hatching.evaluate((canvas) => canvas.getAnimations().length)).toBe(1);
    await hatching.evaluate((canvas) => {
        const animation = canvas.getAnimations()[0];
        animation.pause();
        animation.currentTime = 100;
    });
    await expect(hatching).toHaveCSS('opacity', '1');
    const catalogue = fixtures('/game').nation_colors;
    const assignment = catalogue.assignments.find((item) => item.nation_id === 7);
    const hex = catalogue.colors.find((color) => color.id === assignment.primary_color_id).hex;
    const rgb = hex
        .slice(1)
        .match(/../g)
        .map((channel) => parseInt(channel, 16));
    expect(
        await hatching.evaluate((canvas, rgb) => {
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let colored = 0,
                painted = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i + 3]) painted++;
                if (pixels[i + 3] > 200 && rgb.every((channel, j) => Math.abs(channel - pixels[i + j]) < 3))
                    colored++;
            }
            return colored > 3 && painted < canvas.width * canvas.height * 0.05;
        }, rgb),
    ).toBe(true);
    await page.screenshot({ path: 'test-results/client/ownership-stripes-generated.png' });
    await hatching.evaluate((canvas) => canvas.getAnimations()[0].play());
    await expect(hatching).toHaveCSS('opacity', '0', { timeout: 2500 });

    await expect.poll(() => overlay.evaluate((c) => getComputedStyle(c).opacity)).toBe('1');
    await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
    await dialog.getByRole('button', { name: 'Before · Turn 1' }).click();
    await expect.poll(() => overlay.evaluate((c) => getComputedStyle(c).opacity)).toBe('0');
    const initialZoom = await dialog.locator('.zoom-value').textContent();
    await dialog.getByRole('button', { name: 'Zoom in' }).click();
    // Both ownership canvases keep exactly the same view after camera interaction.
    await expect(dialog.locator('.zoom-value')).not.toHaveText(initialZoom);
    await dialog.getByRole('button', { name: 'Fit world' }).click();
    await expect(dialog.locator('.zoom-value')).toHaveText(initialZoom);
    await page.screenshot({ path: 'test-results/client/ownership-generated.png' });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(
        await page.evaluate(
            () =>
                liveCanvas === document.querySelector('.world-workspace .world-canvas') &&
                liveMinimap === document.querySelector('.minimap-canvas') &&
                livePixels === liveCanvas.toDataURL(),
        ),
    ).toBe(true);
    await expect
        .poll(() => page.evaluate(() => novusClientDiagnostics().scopes))
        .toBe(await page.evaluate(() => baselineResources.scopes));
    expect(errors).toEqual([]);
});

test('manual reduced-motion comparison, unavailable history retry, Reports and mobile French', async ({
    page,
}) => {
    const state = await setup(page, { reduced: true, previousOwner: null });
    state.fail = true;
    await page.getByRole('button', { name: 'View on map' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ownership change' });
    await expect(dialog).toContainText('could not be loaded');
    await expect(dialog.locator('canvas')).toHaveCount(0);
    state.fail = false;
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(dialog).toContainText('Territories changing owner: 2');
    await expect(dialog.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(dialog.locator('.ownership-phase')).toContainText('Before · Turn 1');
    await dialog.getByRole('button', { name: 'After · Turn 2' }).click();
    await expect(dialog.locator('.ownership-map-after')).toHaveCSS('transition-duration', '0s');
    await expect(dialog.locator('.ownership-map-highlight')).toHaveCSS('opacity', '1');
    expect(
        await dialog.locator('.ownership-map-highlight').evaluate((canvas) => canvas.getAnimations().length),
    ).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue playing' }).click();
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('button', { name: 'View on map' })).toHaveCount(1);
    await expect(page.locator('.report-event button')).toHaveCount(0);
    await page.getByRole('spinbutton', { name: 'Battle report turn', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Load battle turn' }).click();
    await page.getByRole('button', { name: 'View on map' }).click();
    await expect(dialog.locator('.ownership-phase')).toContainText('Before · Turn 1');
    await expect(dialog.getByRole('button', { name: 'After · Turn 2' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.getByLabel('Language', { exact: true }).selectOption('fr');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Voir sur la carte' }).click();
    const french = page.getByRole('dialog', { name: 'Changement de propriétaire' });
    await expect(french.locator('.ownership-phase')).toContainText('Avant · Tour 1');
    expect(await french.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/ownership-mobile-fr.png' });
    await french.getByRole('button', { name: 'Terminé' }).click();
});

test('same owner is explained, and advancing the turn closes an open comparison', async ({ page }) => {
    const state = await setup(page, { previousOwner: 7, otherChange: false });
    await page.getByRole('button', { name: 'View on map' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ownership change' });
    await expect(dialog).toContainText('No territories changed owner');
    await expect(dialog.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    state.turn = 3;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(dialog).toHaveCount(0);
});

test('closing while history loads discards the late view and repeated reopening cleans up', async ({
    page,
}) => {
    const state = await setup(page);
    let finish;
    state.delay = new Promise((resolve) => {
        finish = resolve;
    });
    const opener = page.getByRole('button', { name: 'View on map' });
    const baseline = await page.evaluate(() => novusClientDiagnostics().scopes);
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Ownership change' });
    await expect(dialog).toContainText('Loading ownership snapshots');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    finish();
    await expect(dialog).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
        await opener.click();
        await expect(dialog.locator('.ownership-phase')).toContainText('Before · Turn 1');
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
    }
    await expect.poll(() => page.evaluate(() => novusClientDiagnostics().scopes)).toBe(baseline);
});

test('changes elsewhere still play when the headline territory ended unchanged', async ({ page }) => {
    await setup(page, { previousOwner: 7 });
    await page.getByRole('button', { name: 'View on map' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ownership change' });
    await expect(dialog).toContainText('Territories changing owner: 1');
    await expect(dialog.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    await expect(dialog.locator('.ownership-phase')).toContainText('After · Turn 2', { timeout: 6000 });
});
