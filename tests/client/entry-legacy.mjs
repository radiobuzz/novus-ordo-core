import { chromium, expect, request } from '@playwright/test';
import assert from 'node:assert/strict';

const client = await request.newContext({ baseURL: 'http://127.0.0.1:8792' });
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    args: ['--no-sandbox'],
});
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:8792/');
    await expect(page).toHaveURL(/\/client\/entry(?:#\/login)?$/);
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await expect(page.getByText('Try the new home screen', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/client/stage5-default-entry.png', fullPage: true });
    await page.close();

    for (const [path, destination] of [
        ['/', '/client'],
        ['/login', '/client/entry'],
    ]) {
        const response = await client.get(path, { maxRedirects: 0 });
        assert.equal(response.status(), 302);
        assert.ok(response.headers().location.endsWith(destination));
    }

    const session = await (await client.get('/client/session')).json();
    const login = await client.post('/login-user', {
        form: { _token: session.csrfToken, username: 'entry-legacy', password: 'fixture-password' },
        maxRedirects: 0,
    });
    assert.equal(login.status(), 302);
    assert.ok(login.headers().location.endsWith('/client'));

    for (const [path, destination] of [
        ['/dashboard', '/client'],
        ['/create-nation', '/client/entry'],
        ['/dev-panel', '/client/admin'],
    ]) {
        const response = await client.get(path, { maxRedirects: 0 });
        assert.equal(response.status(), 302);
        assert.ok(response.headers().location.endsWith(destination));
    }

    for (const path of [
        '/js/jquery-3.7.1.min.js',
        '/js/dashboard.js',
        '/js/component-map-display.js',
        '/dev-panel/services',
        '/dev-panel/spa/1',
    ]) {
        assert.equal((await client.get(path, { maxRedirects: 0 })).status(), 404);
    }

    console.log(
        'PASS: default and retired entry screens redirect to the new client; old browser assets and developer endpoints are gone.',
    );
} finally {
    await browser.close();
    await client.dispose();
}
