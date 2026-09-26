import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(readFileSync(`${root}/diplomacy-fixture.json`, 'utf8'));
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
const errors = [];
try {
    const login = async (name) => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.on('pageerror', (error) => errors.push(error.message));
        const session = await (await page.request.get(origin + '/client/session')).json();
        const response = await page.request.post(origin + '/login-user', {
            headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
            data: { username: name, password: 'fixture-password' },
        });
        assert.equal(response.status(), 200);
        await page.goto(origin + '/client?game_id=' + fixture.game_id);
        await page.getByRole('button', { name: 'Continue playing' }).click();
        await page.getByLabel('Game menu', { exact: true }).click();
        await page.getByRole('link', { name: /Diplomacy/ }).click();
        await expect(page.locator('.diplomacy-workspace')).toBeVisible();
        return page;
    };
    const a = await login('diplomat-a'),
        b = await login('diplomat-b'),
        c = await login('diplomat-c');
    await a.locator('.diplomacy-nations button').filter({ hasText: 'diplomat-b' }).click();
    await b.locator('.diplomacy-nations button').filter({ hasText: 'diplomat-a' }).click();
    await expect(a.getByLabel('Message', { exact: true })).toBeVisible();
    const text = `Browser message ${Date.now()} <img src=x onerror=alert(1)>`;
    await a.getByLabel('Message', { exact: true }).fill(text);
    await a.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(a.locator('.diplomacy-messages')).toContainText(text);
    await b.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(b.locator('.diplomacy-messages')).toContainText(text);
    assert.equal(await b.locator('.diplomacy-messages img').count(), 0);
    await c.locator('.diplomacy-nations button').filter({ hasText: 'diplomat-a' }).click();
    await expect(c.locator('.diplomacy-messages')).not.toContainText(text);
    await a.locator('.diplomacy-grant summary').click();
    await a.getByLabel('Amount', { exact: true }).fill('1.2345');
    await a.getByRole('button', { name: 'Offer grant', exact: true }).click();
    await expect(a.locator('.diplomacy-messages')).toContainText('1.2345');
    await b.getByRole('button', { name: 'Refresh', exact: true }).click();
    const card = b.locator('.diplomacy-message').filter({ hasText: '1.2345' });
    await card.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(card).toContainText('Accepted');
    await expect(card.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
    await a.getByLabel('Message', { exact: true }).fill('Draft survives refresh');
    await a.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(a.getByLabel('Message', { exact: true })).toHaveValue('Draft survives refresh');
    await a.locator('.diplomacy-nations button').filter({ hasText: 'diplomat-c' }).click();
    await a.getByRole('button', { name: 'Offer alliance', exact: true }).click();
    await expect(a.locator('.diplomacy-messages')).toContainText('Alliance offer');
    await c.getByRole('button', { name: 'Refresh', exact: true }).click();
    await c
        .locator('.diplomacy-message')
        .filter({ hasText: 'Alliance offer' })
        .getByRole('button', { name: 'Accept', exact: true })
        .click();
    await expect(c.locator('.diplomacy-conversation')).toContainText('Allied');
    await c.getByRole('button', { name: 'End treaty', exact: true }).click();
    await c.getByRole('dialog').getByRole('button', { name: 'Give five turns’ notice', exact: true }).click();
    await expect(c.locator('.diplomacy-conversation')).toContainText(
        'Protection ends at the start of turn 6.',
    );
    await a.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(a.locator('.diplomacy-conversation')).toContainText(
        'Protection ends at the start of turn 6.',
    );
    await c.screenshot({ path: `${root}/diplomacy-desktop.png` });
    await a.setViewportSize({ width: 390, height: 844 });
    assert.ok(
        await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Mobile horizontal overflow',
    );
    await a.screenshot({ path: `${root}/diplomacy-mobile.png` });
    assert.deepEqual(errors, []);
    console.log(
        'PASS: real authenticated diplomacy UI, private text, safe rendering, grant offer/accept, alliance/notice, preserved drafts, mobile width.',
    );
} finally {
    await browser.close();
}
