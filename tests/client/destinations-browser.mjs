import { chromium, expect, request } from '@playwright/test';
import assert from 'node:assert/strict';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/client/entry`);
    const nav = () => page.getByRole('navigation', { name: 'Destinations', exact: true });
    await expect(nav().getByRole('link', { name: 'Games', exact: true })).toBeVisible();
    await page.getByText('First installation', { exact: true }).click();
    await expect(page.getByText('php artisan app:provision-admin ADMIN_NAME', { exact: true })).toBeVisible();
    await nav().getByRole('link', { name: 'Administration', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill('multi-player');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Enter the world', exact: true }).click();
    // Existing development administration allows a signed-in non-admin.
    await expect(page).toHaveURL(/\/client\/admin/);
    await expect(page.getByRole('heading', { name: /command centre/ })).toBeVisible();
    await expect(nav().getByRole('link', { name: 'Administration' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Object inspector', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Object inspector', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Generated JavaScript services' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    await expect(page.getByRole('button', { name: 'API test page' })).toHaveCount(0);
    await nav().getByRole('link', { name: 'Games', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
    await expect(nav().getByRole('link', { name: 'Games', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
    );
    await nav().getByRole('link', { name: 'Tools & experiments', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tools & experiments', exact: true })).toBeVisible();
    for (const name of ['Map Lab', 'Portrait Lab', 'UI gallery']) {
        const card = page
            .getByRole('article')
            .filter({ has: page.getByRole('heading', { name, exact: true }) });
        const url = await card.getByRole('link', { name: 'Open', exact: true }).getAttribute('href');
        const response = await page.request.get(url);
        assert.equal(response.status(), 200);
        assert.match(await response.text(), /(?:map-lab-root|portrait-lab-root|ui-foundations-root)/);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('combobox').selectOption('fr');
    await expect(page.getByRole('heading', { name: 'Outils et expériences', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/no7-stage3-tools.png', fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    const guest = await browser.newContext();
    const tools = await guest.newPage();
    const gameReads = [];
    tools.on('request', (req) => {
        if (/\/(games|game|client\/gameplay)(\?|$)/.test(new URL(req.url()).pathname))
            gameReads.push(req.url());
    });
    await tools.goto(`${origin}/client/tools`);
    await expect(tools.getByRole('heading', { name: 'Tools & experiments', exact: true })).toBeVisible();
    assert.equal(gameReads.length, 0);
    await tools
        .getByRole('article')
        .filter({ has: tools.getByRole('heading', { name: 'UI gallery', exact: true }) })
        .getByRole('link', { name: 'Open', exact: true })
        .click();
    await expect(tools.getByRole('link', { name: 'Tools & experiments', exact: true })).toBeVisible();
    await tools.getByRole('link', { name: 'Tools & experiments', exact: true }).click();
    await expect(tools.getByRole('heading', { name: 'Tools & experiments', exact: true })).toBeVisible();
    await guest.close();
    console.log(
        'PASS: login destination, existing non-admin access, Games/Admin/Tools navigation, lab routes, guest tools, no game reads, minimal install hint, French/mobile layout.',
    );
} finally {
    await browser.close();
}
