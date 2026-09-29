import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(readFileSync(`${root}/resource-fixture.json`));
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
});
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', async (r) => {
        if (r.status() >= 400 && r.url().includes(origin))
            console.error(r.status(), r.url(), (await r.text().catch(() => '')).slice(0, 350));
    });
    const session = await (await page.request.get(origin + '/client/session')).json();
    const login = await page.request.post(origin + '/login-user', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
        data: { username: fixture.user, password: 'fixture-password' },
    });
    assert.equal(login.status(), 200, await login.text());
    await page.goto(`${origin}/client?game_id=${fixture.game_id}#/economy`);
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    await expect(page.locator('[data-resource="test_good"]')).toBeVisible();
    await page.locator('.economy-resources > summary').click();
    await page.getByRole('button', { name: 'Open acquisition planner', exact: true }).click();
    const row = page.locator('[data-production-resource="test_good"]');
    await expect(row).toBeVisible();
    const input = row.getByLabel('Requested quantity', { exact: true });
    await input.fill('0.234567');
    const apply = page.getByRole('button', { name: 'Save seasonal plan', exact: true });
    await expect(apply).toBeEnabled();
    await input.evaluate((n) => {
        n.dataset.identity = 'preserved';
        n.focus();
    });
    await page
        .getByRole('dialog', { name: 'Government acquisitions', exact: true })
        .getByRole('button', { name: 'Refresh', exact: true })
        .click();
    await expect(input).toHaveValue('0.234567');
    assert.equal(await input.getAttribute('data-identity'), 'preserved');
    await expect(apply).toBeEnabled();
    const sent = page.waitForResponse(
        (r) => r.url().endsWith('/nation/production-plan') && r.request().method() === 'POST',
    );
    await apply.click();
    const response = await sent;
    assert.equal(response.status(), 200, await response.text().catch(() => ''));
    await expect(input).toHaveValue('0.234567');
    const submitted = response.request().postDataJSON();
    const bad = {
        ...submitted,
        client_context: { ...submitted.client_context, resource_edit_counter: 999999 },
    };
    const currentSession = await (await page.request.get(origin + '/client/session')).json();
    const stale = await page.request.post(origin + '/nation/production-plan', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': currentSession.csrfToken },
        data: bad,
    });
    assert.equal(stale.status(), 409, await stale.text());
    await input.fill('0.0000001');
    await expect(apply).toBeDisabled();
    await input.fill('0.1');
    await expect(apply).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(input).toBeVisible();
    await page.screenshot({ path: `${root}/resource-mobile.png` });
    await page
        .getByRole('dialog', { name: 'Government acquisitions', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.locator('.game-menu > summary').click();
    await page.getByRole('button', { name: 'Ouvrir le planificateur d’acquisitions', exact: true }).click();
    await expect(row).toContainText('Bien de test');
    await expect(row.getByLabel('Quantité demandée', { exact: true })).toBeVisible();
    assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'French horizontal overflow',
    );
    assert.deepEqual(errors, []);
    console.log(
        'Resource browser: dynamic good, authoritative preview, exact submission, draft identity, invalid input, narrow layout passed.',
    );
} finally {
    await browser.close();
}
