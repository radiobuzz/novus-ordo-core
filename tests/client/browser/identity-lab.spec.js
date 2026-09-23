import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createTemplate } from '../../../resources/js/identity-lab/templates.js';

const open = async (page, query = '') => {
    await page.goto(`/dev-panel/identity-lab${query}`);
    await expect(page.locator('#identity-lab-root')).toHaveAttribute('data-ready', 'true');
};
const recipe = async (page) => JSON.parse(await page.locator('.identity-recipe').textContent());
const pixels = (page) => page.locator('.identity-master').evaluate((c) => c.toDataURL());
const setColor = async (page, label, value) => {
    await page.getByLabel(label, { exact: true }).evaluate((input, color) => {
        input.value = color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
};
const importJson = (page, data) =>
    page.locator('#identity-import').setInputFiles({
        name: 'flag.json',
        mimeType: 'application/json',
        buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)),
    });

test('six distinct flag proofs, solid reference and three isolated editor tabs', async ({ page }) => {
    const requests = [];
    const errors = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '?tab=arms');
    await expect(page.getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('tab', { name: 'Flag Editor', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    await expect(page.getByRole('tab', { name: 'Emblem Editor · Later', exact: true })).toBeDisabled();
    await expect(page.getByRole('tab', { name: 'Coat of Arms Editor · Later', exact: true })).toBeDisabled();
    await expect(page.locator('.identity-sample')).toHaveCount(6);
    const samples = await page
        .locator('.identity-sample-image')
        .evaluateAll((canvases) => canvases.map((c) => c.toDataURL()));
    expect(new Set(samples).size).toBe(6);
    const solid = await page.locator('.identity-baseline').evaluate((c) => {
        const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        return new Set(
            Array.from(
                { length: p.length / 4 },
                (_, i) => `${p[i * 4]},${p[i * 4 + 1]},${p[i * 4 + 2]},${p[i * 4 + 3]}`,
            ),
        ).size;
    });
    expect(solid).toBe(1);
    expect(requests.every((url) => new URL(url).origin === 'http://127.0.0.1:8791')).toBe(true);
    expect(requests.some((url) => /armoria|\.svg|\.woff|\/game\b|\/nation\b/.test(url))).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/client/identity-lab-desktop.png', fullPage: true });
    await page
        .locator('.identity-gallery-panel')
        .screenshot({ path: 'test-results/client/identity-lab-compositions.png' });
});

test('palette, placement, layer order and undo remain editable after JSON round-trip', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Layered crosses', exact: true }).click();
    const original = await pixels(page);
    await page.getByText('Advanced · edit individual layers', { exact: true }).click();
    await page.getByLabel('Horizontal position', { exact: true }).fill('385');
    await page.getByLabel('Rotation', { exact: true }).fill('17');
    await page.getByLabel('Width', { exact: true }).fill('63');
    await setColor(page, 'Primary', '#702d45');
    await page.getByLabel('Layer colour', { exact: true }).selectOption('custom');
    await setColor(page, 'Custom colour', '#00ffff');
    await page.getByLabel('Mirror horizontally', { exact: true }).check();
    const modified = await pixels(page);
    expect(modified).not.toBe(original);
    await page.getByRole('button', { name: 'Move backward', exact: true }).click();
    const reordered = await recipe(page);
    expect(reordered.flag.layers.at(-2).x).toBe(385);
    expect(reordered.flag.layers.at(-2).geometry.width).toBe(63);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await pixels(page)).toBe(modified);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await recipe(page)).toEqual(reordered);
    const expected = await pixels(page);
    await page.getByRole('button', { name: 'Canton & star', exact: true }).click();
    await importJson(page, reordered);
    await expect(page.getByRole('status')).toHaveText('Recipe restored. You can continue editing.');
    expect(await pixels(page)).toBe(expected);
    await page.getByLabel('Show this layer', { exact: true }).uncheck();
    expect((await recipe(page)).flag.layers.at(-1).visible).toBe(false);
    expect(await pixels(page)).not.toBe(expected);
});

test('PNG is opaque 900 × 600 and matches exported editable JSON', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Diagonal & sun', exact: true }).click();
    await page.getByLabel('Design name', { exact: true }).fill('Sun study');
    const expected = await pixels(page);
    let waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const png = await waiting;
    expect(png.suggestedFilename()).toBe('Sun-study.png');
    const data = (await readFile(await png.path())).toString('base64');
    const result = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const c = document.createElement('canvas');
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const values = ctx.getImageData(0, 0, c.width, c.height).data;
        return {
            width: c.width,
            height: c.height,
            opaque: values.every((v, i) => i % 4 !== 3 || v === 255),
            pixels: c.toDataURL(),
        };
    }, data);
    expect(result).toEqual({ width: 900, height: 600, opaque: true, pixels: expected });
    waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export recipe', exact: true }).click();
    const json = JSON.parse(await readFile(await (await waiting).path(), 'utf8'));
    expect(json).toEqual(await recipe(page));
    await page.reload();
    await importJson(page, json);
    await expect(page.getByRole('status')).toHaveText('Recipe restored. You can continue editing.');
    expect(await pixels(page)).toBe(expected);
});

test('invalid imports preserve the flag and late imports cannot overwrite a newer edit', async ({ page }) => {
    await open(page);
    const original = await pixels(page);
    for (const data of [
        '{broken',
        { ...createTemplate(), rendererVersion: 'future' },
        { ...createTemplate(), kind: 'emblem' },
    ]) {
        await importJson(page, data);
        await expect(page.getByRole('status')).toHaveAttribute('data-error', 'true');
        expect(await pixels(page)).toBe(original);
    }
    await page.evaluate(() => {
        const read = File.prototype.text;
        File.prototype.text = function () {
            return new Promise((resolve) => {
                window.finishFlagImport = () => read.call(this).then(resolve);
            });
        };
    });
    await importJson(page, createTemplate('sunrise'));
    await page.getByRole('button', { name: 'Canton & star', exact: true }).click();
    const newer = await pixels(page);
    await page.evaluate(() => window.finishFlagImport());
    await expect(page.getByRole('status')).toHaveText(
        'Import cancelled because you edited or selected a newer design.',
    );
    expect(await pixels(page)).toBe(newer);
});

test('French mobile controls, text-safe names and keyboard editing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?lang=fr');
    await expect(page.getByRole('tab', { name: 'Éditeur de drapeaux', exact: true })).toBeVisible();
    await expect(
        page.getByRole('tab', { name: 'Éditeur d’armoiries · Plus tard', exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: 'test-results/client/identity-lab-mobile-fr.png', fullPage: true });
    const dangerous = createTemplate('canton');
    dangerous.name = '<img src=x onerror=alert(1)>';
    dangerous.flag.layers.at(-1).name = '<script>alert(1)</script>';
    await importJson(page, dangerous);
    await expect(page.getByRole('status')).toHaveText(
        'Recette restaurée. Vous pouvez continuer à la modifier.',
    );
    await expect(page.locator('#identity-lab-root img')).toHaveCount(0);
    const before = (await recipe(page)).flag.layers.at(-1).x;
    await page.getByText('Avancé · modifier les calques', { exact: true }).click();
    await page.getByLabel('Position horizontale', { exact: true }).focus();
    await page.keyboard.press('ArrowUp');
    expect((await recipe(page)).flag.layers.at(-1).x).toBe(before + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    await page.getByLabel('Langue', { exact: true }).selectOption('en');
    await expect(page.getByRole('tab', { name: 'Flag Editor', exact: true })).toBeVisible();
    expect((await recipe(page)).name).toBe(dangerous.name);
});

test('an in-flight PNG export keeps its original pixels and filename after newer edits', async ({ page }) => {
    await open(page);
    const original = await pixels(page);
    await page.evaluate(() => {
        const encode = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
            window.finishFlagExport = () => encode.call(this, callback, ...args);
        };
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    await page.getByLabel('Design name', { exact: true }).fill('Newer edit');
    await setColor(page, 'Primary', '#ff0000');
    await page.evaluate(() => window.finishFlagExport());
    const file = await download;
    expect(file.suggestedFilename()).toBe('Offset-cross.png');
    const base64 = (await readFile(await file.path())).toString('base64');
    const encoded = await page.evaluate(async (data) => {
        const i = new Image();
        i.src = `data:image/png;base64,${data}`;
        await i.decode();
        const c = document.createElement('canvas');
        c.width = i.width;
        c.height = i.height;
        c.getContext('2d').drawImage(i, 0, 0);
        return c.toDataURL();
    }, base64);
    expect(encoded).toBe(original);
    expect(await pixels(page)).not.toBe(original);
});

test('independent randomizers, direct dragging and one-step undo', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    });
    await open(page);
    const initial = await recipe(page);
    await page.getByRole('button', { name: 'Randomize colours', exact: true }).click();
    const colored = await recipe(page);
    expect(colored.flag).toEqual(initial.flag);
    expect(colored.palette).not.toEqual(initial.palette);
    await page.getByRole('button', { name: 'Randomize emblem', exact: true }).click();
    const emblem = await recipe(page);
    expect(emblem.palette).toEqual(colored.palette);
    expect(emblem.flag.layers.filter((l) => l.role === 'shape')).toEqual(colored.flag.layers);
    await page.getByRole('button', { name: 'Randomize shapes', exact: true }).click();
    const shaped = await recipe(page);
    expect(shaped.palette).toEqual(emblem.palette);
    expect(shaped.flag.layers.filter((l) => l.role === 'emblem')).toEqual(
        emblem.flag.layers.filter((l) => l.role === 'emblem'),
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await recipe(page)).toEqual(emblem);
    const target = emblem.flag.layers.at(-1);
    const box = await page.locator('.identity-master').boundingBox();
    const x = box.x + (target.x * box.width) / 900,
        y = box.y + (target.y * box.height) / 600;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 20, { steps: 6 });
    await page.mouse.up();
    expect((await recipe(page)).flag.layers.at(-1).x).toBeGreaterThan(target.x);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await recipe(page)).toEqual(emblem);
    await page.locator('.identity-master').focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await recipe(page)).flag.layers.at(-1).x).toBe(target.x + 10);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await recipe(page)).toEqual(emblem);
});

const importSvg = (page, svg) =>
    page
        .locator('#identity-svg-import')
        .setInputFiles({ name: 'ring.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
const ring =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(5 5)"><path fill-rule="evenodd" d="M0 0H90V90H0Z M25 25H65V65H25Z"/></g></svg>';
test('custom SVG holes survive recipe, local PNG save and reload; unsafe content is rejected', async ({
    page,
}) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await open(page);
    await page.getByRole('button', { name: 'Solid field', exact: true }).click();
    await importSvg(page, ring);
    await expect(page.getByRole('status')).toHaveText('Recipe restored. You can continue editing.');
    const imported = await recipe(page),
        expected = await pixels(page);
    expect(imported.customAssets).toHaveLength(1);
    const center = await page
        .locator('.identity-master')
        .evaluate((c) => Array.from(c.getContext('2d').getImageData(450, 300, 1, 1).data));
    expect(center).toEqual([23, 63, 79, 255]);
    for (const bad of [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><path d="M0 0H90V90Z"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image href="https://example.com/x.png"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><foreignObject/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="url(https://example.com)" d="M0 0H90V90Z"/></svg>',
    ]) {
        await importSvg(page, bad);
        await expect(page.getByRole('status')).toHaveAttribute('data-error', 'true');
        expect(await pixels(page)).toBe(expected);
    }
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    const image = await page.locator('.identity-study img').evaluate(async (img) => {
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 900;
        c.height = 600;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL();
    });
    expect(image).toBe(expected);
    await page.reload();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit study', exact: true }).click();
    expect(await recipe(page)).toEqual(imported);
    expect(await pixels(page)).toBe(expected);
    await page.getByRole('button', { name: 'Randomize colours', exact: true }).click();
    await importJson(page, imported);
    await expect(page.getByRole('status')).toHaveText('Recipe restored. You can continue editing.');
    expect(await pixels(page)).toBe(expected);
    expect(requests.some((u) => u.includes('example.com'))).toBe(false);
});

test('save snapshots stay paired during edits; failed writes preserve previous study', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    const original = await recipe(page),
        expected = await pixels(page);
    await page.evaluate(() => {
        const encode = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (cb, ...args) {
            window.finishSave = () => encode.call(this, cb, ...args);
        };
    });
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await page.getByRole('button', { name: 'Randomize colours', exact: true }).click();
    const newer = await recipe(page);
    await page.evaluate(() => window.finishSave());
    await expect(page.getByRole('status')).toHaveText(
        'The earlier version was saved. Your newer edits are still unsaved.',
    );
    expect(await recipe(page)).toEqual(newer);
    await page.reload();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit study', exact: true }).click();
    expect(await recipe(page)).toEqual(original);
    expect(await pixels(page)).toBe(expected);
    await page.getByRole('button', { name: 'Randomize colours', exact: true }).click();
    await page.evaluate(() => {
        IDBObjectStore.prototype.put = function () {
            throw new DOMException('No space', 'QuotaExceededError');
        };
    });
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.getByRole('status')).toHaveAttribute('data-error', 'true');
    await page.reload();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit study', exact: true }).click();
    expect(await recipe(page)).toEqual(original);
});

test('legacy rendering stays identical and unsupported saved recipes retain their PNG', async ({ page }) => {
    await open(page);
    const legacy = createTemplate('canton');
    legacy.schemaVersion = 1;
    legacy.rendererVersion = 'flag-canvas-v1';
    delete legacy.customAssets;
    legacy.flag.layers.forEach((l) => delete l.role);
    await page.getByRole('button', { name: 'Canton & star', exact: true }).click();
    const expected = await pixels(page);
    await importJson(page, legacy);
    await expect(page.getByRole('status')).toHaveText('Recipe restored. You can continue editing.');
    expect(await pixels(page)).toBe(expected);
    expect((await recipe(page)).schemaVersion).toBe(1);
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    await page.evaluate(
        () =>
            new Promise((resolve, reject) => {
                const open = indexedDB.open('novus.identity-lab.v1', 1);
                open.onsuccess = () => {
                    const db = open.result,
                        tx = db.transaction('studies', 'readwrite'),
                        store = tx.objectStore('studies'),
                        read = store.getAll();
                    read.onsuccess = () => {
                        const record = read.result[0];
                        record.recipe.rendererVersion = 'future';
                        store.put(record);
                    };
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = () => reject(tx.error);
                };
            }),
    );
    await page.reload();
    await expect(page.locator('.identity-study')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Edit study', exact: true })).toBeDisabled();
    await expect(page.locator('.identity-study img')).toBeVisible();
    await expect(
        page.locator('.identity-study').getByRole('button', { name: 'Export PNG', exact: true }),
    ).toBeEnabled();
});

test('seeded alternatives, bundled symbols, repeated arrangements and the eight-study limit', async ({
    page,
}) => {
    await open(page);
    await page.getByText('Generation options', { exact: true }).click();
    await page.getByLabel('Seed', { exact: true }).fill('harmony-proof');
    await page.getByLabel('Keep colours', { exact: true }).uncheck();
    await page.getByLabel('Keep emblem & placement', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Generate with this seed', exact: true }).click();
    const samples = () =>
        page.locator('.identity-sample-image').evaluateAll((cs) => cs.map((c) => c.toDataURL()));
    const first = await samples();
    expect(new Set(first).size).toBe(6);
    await page.getByText('Generation options', { exact: true }).click();
    await page.getByRole('button', { name: 'Generate with this seed', exact: true }).click();
    expect(await samples()).toEqual(first);
    await page.getByRole('button', { name: 'Variation 1', exact: true }).click();
    await page.getByText('Browse symbols & import SVG', { exact: true }).click();
    const icons = await page
        .locator('.identity-symbol-image')
        .evaluateAll((cs) => cs.map((c) => c.toDataURL()));
    expect(new Set(icons).size).toBe(14);
    await page.getByRole('button', { name: 'Anchor', exact: true }).click();
    await page.getByText('Advanced · edit individual layers', { exact: true }).click();
    await page.getByLabel('Number of symbols', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Arrange in a ring', exact: true }).click();
    expect((await recipe(page)).flag.layers.filter((l) => l.role === 'emblem')).toHaveLength(5);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await recipe(page)).flag.layers.filter((l) => l.role === 'emblem')).toHaveLength(1);
    await page.getByText('Advanced · edit individual layers', { exact: true }).click();
    await page.screenshot({ path: 'test-results/client/identity-lab-randomized.png', fullPage: true });
    for (let i = 1; i <= 8; i++) {
        await page.getByRole('button', { name: 'Save as new', exact: true }).click();
        await expect(page.locator('.identity-study')).toHaveCount(i);
    }
    await expect(page.getByRole('button', { name: 'Save as new', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Saved in this browser.');
    await expect(page.locator('.identity-study')).toHaveCount(8);
});
