import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const origin = 'http://127.0.0.1:8792'; // Fixed isolated server, never the active host.
try {
    await page.goto(origin + '/client/entry?game_id=1');
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    await page.getByRole('combobox').selectOption('fr');
    await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('entry-player');
    await page.getByLabel('Mot de passe', { exact: true }).fill('incorrect-fixture-password');
    await page.getByRole('button', { name: 'Entrer dans le monde', exact: true }).click();
    await page.getByText('Le nom d’utilisateur ou le mot de passe n’a pas été reconnu.').waitFor();
    await page.getByRole('combobox').selectOption('en');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Enter the world', exact: true }).click();
    await page.getByRole('heading', { name: 'Give your nation a name' }).waitFor();
    const options = await (await page.request.get(origin + '/client/setup')).json();
    const { data: territories } = await (await page.request.get(origin + '/territories/base-infos')).json();
    let selected = [];
    for (const start of options.suitable_ids) {
        const candidates = [start];
        for (
            let cursor = 0;
            cursor < candidates.length && candidates.length < options.required_territories;
            cursor++
        ) {
            const t = territories.find((t) => t.territory_id === candidates[cursor]);
            for (const id of t.connected_land_territory_ids)
                if (
                    options.suitable_ids.includes(id) &&
                    !candidates.includes(id) &&
                    candidates.length < options.required_territories
                )
                    candidates.push(id);
        }
        if (candidates.length === options.required_territories) {
            selected = candidates;
            break;
        }
    }
    assert.equal(selected.length, options.required_territories);
    const session = await (await page.request.get(origin + '/client/session')).json();
    const noCsrf = await page.request.post(origin + '/create-nation', {
        headers: { Accept: 'application/json' },
        data: {},
    });
    assert.equal(noCsrf.status(), 419, 'real CSRF protection');
    const invalid = await page.request.post(origin + '/create-nation', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken, 'X-Client-Locale': 'fr' },
        data: { nation_name: 'x', leader_name: '', territory_ids_as_json: '[]' },
    });
    assert.equal(invalid.status(), 422);
    assert.ok((await invalid.json()).errors.nation_name);
    await page.getByLabel('Nation name', { exact: true }).fill('Integration Aurelia');
    await page.getByLabel('Formal name', { exact: true }).fill('The Integration Republic');
    const image = await page.screenshot({ clip: { x: 0, y: 0, width: 100, height: 100 } });
    await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'fixture-flag.png', mimeType: 'image/png', buffer: image });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Leader name', { exact: true }).fill('Integration Leader');
    await page.getByLabel('Title', { exact: true }).fill('President');
    await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'fixture-portrait.png', mimeType: 'image/png', buffer: image });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    for (const id of selected) await page.locator(`[data-id="${id}"]`).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.screenshot({ path: 'test-results/client/entry-real-review.png' });
    const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith('/create-nation') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Found your nation', exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 201, `creation returned ${response.status()}`);
    await page.getByRole('heading', { name: 'A nation is born' }).waitFor();
    const final = await (await page.request.get(origin + '/client/setup')).json();
    assert.equal(final.status, 'FinishedSetup');
    const duplicate = await page.request.post(origin + '/create-nation', {
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': session.csrfToken },
        multipart: {
            nation_name: 'Integration Aurelia',
            leader_name: 'Integration Leader',
            territory_ids_as_json: JSON.stringify(selected),
        },
    });
    assert.ok([409, 422].includes(duplicate.status()));
    await page.reload();
    await page.getByRole('heading', { name: 'Your nation awaits' }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
        'PASS: real isolated HTTP login, localized rejected credentials, CSRF, field validation, multipart flag/portrait creation, connected territories, duplicate rejection and completed-state recovery.',
    );
} finally {
    await browser.close();
}
