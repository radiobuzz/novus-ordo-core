import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(readFileSync(`${root}/economy-fixture.json`));
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
});
try {
    const page = await browser.newPage();
    let session = await (await page.request.get(origin + '/client/session')).json();
    assert.equal(
        (
            await page.request.post(origin + '/login-user', {
                headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
                data: { username: fixture.user, password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    await page.goto(origin + '/client/admin');
    await expect(page.getByRole('button', { name: 'Reset all worlds…', exact: true })).toBeVisible();
    // Real CSRF validation still guards reset even for an administrator.
    assert.equal(
        (
            await page.request.post(origin + '/client/admin/api/maintenance/reset-worlds', {
                headers: { Accept: 'application/json' },
                data: { token: 'a'.repeat(64), confirmation: 'RESET WORLDS' },
            })
        ).status(),
        419,
    );
    await page.getByRole('button', { name: 'Reset all worlds…', exact: true }).click();
    await page.getByRole('button', { name: 'Delete all worlds and saved maps', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('Accounts preserved');
    await page.getByRole('link', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/client\/entry/);
    session = await (await page.request.get(origin + '/client/session')).json();
    assert.equal(session.userId, null);
    assert.equal(
        (
            await page.request.get(origin + '/client/admin/api/maintenance', {
                headers: { Accept: 'application/json' },
            })
        ).status(),
        401,
    );
    assert.equal(
        (
            await page.request.post(origin + '/login-user', {
                headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
                data: { username: 'maintenance-member', password: 'fixture-password' },
            })
        ).status(),
        200,
    );
    session = await (await page.request.get(origin + '/client/session')).json();
    assert.equal(
        (
            await page.request.get(origin + '/client/admin/api/maintenance', {
                headers: { Accept: 'application/json' },
            })
        ).status(),
        403,
    );
    for (const path of ['reset-worlds', 'clean-status-files']) {
        assert.equal(
            (
                await page.request.post(origin + '/client/admin/api/maintenance/' + path, {
                    headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
                    data: { token: 'a'.repeat(64), confirmation: 'RESET WORLDS' },
                })
            ).status(),
            403,
        );
    }
    console.log(
        'PASS: real admin reset, CSRF rejection, logout redirect, cleared session, unauthenticated and non-admin maintenance rejection.',
    );
} finally {
    await browser.close();
}
