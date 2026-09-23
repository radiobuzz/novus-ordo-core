import { test, expect } from '@playwright/test';
import { baseTerritories, fixtures } from '../fixtures.js';
async function setup(page) {
    let authenticated = false;
    await page.route('**/client/session', (route) =>
        route.fulfill({
            json: {
                userId: authenticated ? 1 : null,
                csrfToken: authenticated ? 'new-token' : 'guest-token',
            },
        }),
    );
    await page.route('**/login-user', (route) => {
        authenticated = true;
        return route.fulfill({ json: { userId: 1, csrfToken: 'new-token' } });
    });
    await page.route('**/client/setup', (route) =>
        route.fulfill({
            json: {
                user_id: 1,
                game_id: 1,
                status: 'NotCreated',
                pending_name: null,
                pending_nation_id: null,
                nation_colors: {
                    ...fixtures('/game').nation_colors,
                    colors: [
                        ...fixtures('/game').nation_colors.colors,
                        { id: 25, name: 'Black', name_fr: 'Noir', hex: '#17191c', primary_allowed: false },
                    ],
                },
                required_territories: 3,
                suitable_ids: [156, 157, 158],
                territories: [],
            },
        }),
    );
    await page.route('**/territories/base-infos', (route) =>
        route.fulfill({
            json: {
                data: baseTerritories.map((t) => ({
                    ...t,
                    connected_land_territory_ids: [156, 157, 158].filter((id) => id !== t.territory_id),
                })),
            },
        }),
    );
    await page.goto('/client/entry?game_id=1');
}
async function login(page) {
    await page.getByLabel('Username', { exact: true }).fill('fixture-player');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Enter the world', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Give your nation a name' })).toBeVisible();
}
test('numbered slideshow holds each image, holds the last longer, fades to black and loops', async ({
    page,
}) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await setup(page);
    const background = page.locator('.atmosphere');
    await expect
        .poll(() =>
            page
                .locator('.atmosphere-image')
                .evaluateAll(
                    (images) =>
                        images.length === 6 &&
                        images.every((image) => image.complete && image.naturalWidth > 0),
                ),
        )
        .toBe(true);
    await page.getByLabel('Username', { exact: true }).fill('unchanged');
    await page.clock.runFor(0);
    await expect(background).toHaveAttribute('data-slide', '1');
    await expect(background).toHaveAttribute('data-phase', 'fading-in');
    await page.clock.runFor(2200);
    for (let slide = 1; slide <= 6; slide++) {
        await expect(background).toHaveAttribute('data-slide', String(slide));
        await expect(background).toHaveAttribute('data-phase', 'holding');
        await page.clock.runFor((slide === 6 ? 10000 : 5000) - 1);
        await expect(background).toHaveAttribute('data-phase', 'holding');
        await page.clock.runFor(1);
        await expect(background).toHaveAttribute('data-phase', slide === 6 ? 'fading-out' : 'fading-in');
        await page.clock.runFor(2200);
    }
    await expect(background).toHaveAttribute('data-phase', 'black');
    await expect(page.locator('.atmosphere-image.is-visible')).toHaveCount(0);
    await page.clock.runFor(100);
    await expect(background).toHaveAttribute('data-slide', '1');
    await expect(background).toHaveAttribute('data-phase', 'fading-in');
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue('unchanged');
    await login(page);
    await expect(page.locator('.atmosphere-image')).toHaveCount(1);
    await expect(page.locator('.atmosphere-image')).toHaveAttribute('src', /hires\.png$/);
    await page.clock.runFor(60000);
    await expect(background).toHaveAttribute('data-phase', 'holding');
});

test('reduced motion keeps a still image and broken slideshow images fall back safely', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await expect(page.locator('.atmosphere')).toHaveAttribute('data-phase', 'holding');
    await expect(page.locator('.atmosphere-image.is-visible')).toHaveCount(1);
    await page.clock.install();
    await page.clock.runFor(60000);
    await expect(page.locator('.atmosphere')).toHaveAttribute('data-slide', '1');
    await page.route(/\/res\/bundled\/entry\/[1-6]\.png$/, (route) => route.abort());
    await page.reload();
    await expect(page.locator('.atmosphere')).toHaveAttribute('data-phase', 'fallback');
    await expect(page.locator('.atmosphere-image.is-visible')).toHaveAttribute('src', /hires\.png$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('cinematic entry, locale persistence, wizard draft/uploads, full submission, silent wizard', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('.atmosphere-image').first()).toHaveJSProperty('complete', true);
    await expect
        .poll(() =>
            page
                .locator('.atmosphere-image')
                .first()
                .evaluate((node) => getComputedStyle(node).opacity),
        )
        .toBe('1');
    await page.screenshot({ path: 'test-results/client/entry-login.png' });
    await page.getByLabel('Username', { exact: true }).fill('preserved');
    await page.locator('.language-selector').selectOption('fr');
    await expect(page.getByLabel('Nom d’utilisateur', { exact: true })).toHaveValue('preserved');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
    await page.getByRole('combobox').selectOption('en');
    await login(page);
    await expect(page.locator('.music-controls')).toBeHidden();
    await expect(
        page.getByRole('group', { name: 'Primary colour', exact: true }).getByRole('radio'),
    ).toHaveCount(24);
    await page
        .getByRole('group', { name: 'Secondary colour', exact: true })
        .getByRole('radio', { name: 'Black', exact: true })
        .check();
    await page.getByLabel('Nation name', { exact: true }).fill('Aurelia');
    await page.locator('input[type=file]').setInputFiles({
        name: 'flag.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=',
            'base64',
        ),
    });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Leader name', { exact: true }).fill('Aster');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByLabel('Nation name', { exact: true })).toHaveValue('Aurelia');
    await expect(page.locator('.file-name')).toHaveText('flag.png');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel('Leader name', { exact: true })).toHaveValue('Aster');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    for (const id of [156, 157, 158]) await page.locator(`[data-id="${id}"]`).click();
    await page.screenshot({ path: 'test-results/client/entry-homeland.png' });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    let submissions = 0;
    await page.route('**/create-nation', (route) => {
        submissions++;
        expect(route.request().headers()['x-csrf-token']).toBe('new-token');
        expect(route.request().postData()).toContain('Aurelia');
        expect(route.request().postData()).toContain('name="secondary_color_id"\r\n\r\n25');
        return route.fulfill({ status: 201, json: { status: 'FinishedSetup' } });
    });
    await page.getByRole('button', { name: 'Found your nation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'A nation is born' })).toBeVisible();
    expect(submissions).toBe(1);
    expect(errors).toEqual([]);
});
test('mobile French wizard, validation/deep-link guards and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await login(page);
    await page.evaluate(() => {
        location.hash = '#/nation/review';
    });
    await expect(page.getByRole('heading', { name: 'Give your nation a name' })).toBeVisible();
    await page.getByRole('combobox').selectOption('fr');
    await page.getByLabel('Nom de la nation', { exact: true }).fill('République de la lumière');
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    await page.getByLabel('Nom du dirigeant', { exact: true }).fill('Camille');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/client/entry-mobile-fr.png' });
});
test('world locale changes preserve inspector expansion and selection', async ({ page }) => {
    await page.addInitScript(() =>
        localStorage.setItem(
            'no7:v1:user-1:game-1:briefing',
            JSON.stringify({ version: 1, value: { lastKey: '1:7:1' } }),
        ),
    );
    await page.goto('/client?game_id=1');
    await page.getByRole('button', { name: 'Find territory', exact: true }).click();
    await page.getByRole('searchbox').fill('Aster Reach');
    await page.getByRole('button', { name: /Aster Reach/ }).click();
    await page.locator('.inspector-panel .territory-connections summary').click();
    await page.locator('.game-menu > summary').click();
    await page.locator('.language-selector').selectOption('fr');
    await expect(page.locator('.inspector-panel .territory-connections')).toHaveAttribute('open', '');
    await expect(page.locator('.inspector-panel')).toContainText('Informations du propriétaire');
    await expect(page.getByRole('searchbox')).toHaveValue('Aster Reach');
});

test('expired session reauthenticates in place and restores the same-user draft', async ({ page }) => {
    await setup(page);
    await login(page);
    await page.getByLabel('Nation name', { exact: true }).fill('Preserved Republic');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Leader name', { exact: true }).fill('Preserved Leader');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    for (const id of [156, 157, 158]) await page.locator(`[data-id="${id}"]`).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.route('**/create-nation', (route) => route.fulfill({ status: 419, json: {} }));
    await page.getByRole('button', { name: 'Found your nation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill('fixture-player');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Enter the world', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The foundations are yours' })).toBeVisible();
    await expect(page.locator('.review-section')).toContainText([
        'Preserved Republic',
        'Preserved Leader',
        'Aster Reach',
    ]);
    await expect(page.locator('.music-controls')).toBeHidden();
});
