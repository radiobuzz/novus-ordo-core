import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultRecipe } from '../../../resources/js/portrait-lab/recipe.js';

const openLab = async (page) => {
    await page.goto('/dev-panel/portrait-lab');
    await expect(page.locator('#portrait-lab-root')).toHaveAttribute('data-ready', 'true');
};
const recipe = async (page) => JSON.parse(await page.locator('.portrait-recipe').textContent());
const pixels = (page, region = [0, 0, 512, 600]) =>
    page.locator('.portrait-stage canvas').evaluate((canvas, rect) => {
        const data = canvas.getContext('2d').getImageData(...rect).data;
        let hash = 2166136261;
        for (const value of data) hash = Math.imul(hash ^ value, 16777619);
        return hash;
    }, region);
const importJson = (page, data) =>
    page.getByLabel('Import a recipe', { exact: true }).setInputFiles({
        name: 'portrait.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
    });

test('original library recipes retain their pre-expansion pixels', async ({ page }) => {
    await openLab(page);
    const signatures = [];
    for (const [face, hair, clothing] of [
        ['amara-v1', 'curls-v1', 'blazer-v1'],
        ['ren-v1', 'swept-v1', 'officer-v1'],
        ['luc-v1', 'waves-v1', 'workwear-v1'],
    ]) {
        await importJson(page, {
            ...defaultRecipe(),
            face,
            hair,
            clothing,
            accessories: {
                glasses: true,
                mustache: true,
                tie: clothing === 'blazer-v1',
            },
        });
        await expect.poll(async () => (await recipe(page)).face).toBe(face);
        signatures.push(await pixels(page));
    }
    expect(signatures).toEqual([922087330, -742531128, -1411413470]);
});

test('separate pools, compatible comparisons and preview-only guides', async ({ page }) => {
    await openLab(page);
    const compare = page.getByLabel('Comparison view', { exact: true });
    const cards = page.locator('.portrait-comparison-card');
    await expect(cards).toHaveCount(9);
    await expect(page.getByLabel('Facial hair', { exact: true })).toBeHidden();
    await expect(compare.locator('option[value="mustache"]')).toHaveCount(0);
    await compare.selectOption('glasses');
    await expect(cards).toHaveCount(6);
    await cards.nth(1).click();
    await expect.poll(async () => (await recipe(page)).accessoryStyles.glasses).toBe('female:rectangular-v1');
    const definition = await recipe(page);
    const clean = await pixels(page);
    const rosterPixels = () =>
        cards
            .first()
            .locator('canvas')
            .nth(1)
            .evaluate((canvas) => canvas.toDataURL());
    const cleanRoster = await rosterPixels();
    await page.getByText('Inspect the artwork layers', { exact: true }).click();
    await page.getByLabel('Show placement guides', { exact: true }).check();
    await expect.poll(() => pixels(page)).not.toBe(clean);
    expect(await recipe(page)).toEqual(definition);
    expect(await rosterPixels()).toBe(cleanRoster);
    const nextPng = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const png = await readFile(await (await nextPng).path());
    const exportHash = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 600;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        let hash = 2166136261;
        for (const value of context.getImageData(0, 0, 512, 600).data)
            hash = Math.imul(hash ^ value, 16777619);
        return hash;
    }, png.toString('base64'));
    expect(exportHash).toBe(clean);
    await page.getByLabel('Character pool', { exact: true }).selectOption('male');
    await expect(page.getByLabel('Facial hair', { exact: true })).toBeVisible();
    await compare.selectOption('mustache');
    await expect(cards).toHaveCount(7);
    await page.getByLabel('Character pool', { exact: true }).selectOption('female');
    await expect(compare).toHaveValue('faces');
    await expect(cards).toHaveCount(9);
    expect((await recipe(page)).accessories.mustache).toBe(false);
    await page.getByLabel('Clothing', { exact: true }).selectOption('female:diplomat-v1');
    await compare.selectOption('tie');
    await expect(cards).toHaveCount(7);
    await page.getByLabel('Clothing', { exact: true }).selectOption('female:blazer-v1');
    await expect(cards).toHaveCount(2);
    await page.getByLabel('Clothing', { exact: true }).selectOption('female:officer-v1');
    await expect(cards).toHaveCount(0);
    const kept = await recipe(page);
    await importJson(page, { ...kept, hair: 'male:crop-v1' });
    await expect(page.getByRole('status')).toContainText('Unavailable hairstyle');
    expect(await recipe(page)).toEqual(kept);
    await compare.selectOption('faces');
    await page.screenshot({
        path: 'test-results/client/portrait-fitted-comparison.png',
        fullPage: true,
    });
});

test('legacy studies only adopt fitting through an explicit editable copy', async ({ page }) => {
    await openLab(page);
    const original = { ...defaultRecipe(), name: 'Legacy saved study' };
    await importJson(page, original);
    await expect.poll(async () => (await recipe(page)).version).toBe(1);
    const oldPixels = await pixels(page);
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.getByLabel('Face base', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Use fitted model', exact: true }).click();
    await expect.poll(async () => (await recipe(page)).version).toBe(3);
    await expect(page.getByLabel('Face base', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Legacy saved study', exact: true }).click();
    await expect.poll(() => pixels(page)).toBe(oldPixels);
    expect(await recipe(page)).toEqual(original);
});

test('all new assets are selectable, render distinctly and retain their style IDs', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openLab(page);
    await expect(page.getByLabel('Face base', { exact: true }).locator('option')).toHaveCount(9);
    await expect(page.getByLabel('Hairstyle', { exact: true }).locator('option')).toHaveCount(7);
    await expect(page.getByLabel('Clothing', { exact: true }).locator('option')).toHaveCount(12);
    for (const [face, hairstyle, clothing, glasses] of [
        ['mei-v1', 'bob-v1', 'diplomat-v1', 'rimless-v1'],
        ['leila-v1', 'bun-v1', 'cardigan-v1', 'aviator-v1'],
        ['oskar-v1', 'crop-v1', 'field-v1', 'rectangular-v1'],
    ]) {
        const sex = face === 'oskar-v1' ? 'male' : 'female';
        await page.getByLabel('Character pool', { exact: true }).selectOption(sex);
        await page.getByLabel('Face base', { exact: true }).selectOption(face);
        await page.getByLabel('Hairstyle', { exact: true }).selectOption(`${sex}:${hairstyle}`);
        await page.getByLabel('Clothing', { exact: true }).selectOption(`${sex}:${clothing}`);
        await page.getByLabel('Glasses style', { exact: true }).selectOption(`${sex}:${glasses}`);
        await page.getByLabel('Palette preset', { exact: true }).selectOption('teal');
        await expect
            .poll(async () => (await recipe(page)).accessoryStyles?.glasses)
            .toBe(`${sex}:${glasses}`);
        await page.locator('.portrait-stage').screenshot({
            path: `test-results/client/portrait-expansion-${face}.png`,
        });
    }
    await page.getByLabel('Clothing', { exact: true }).selectOption('male:diplomat-v1');
    for (const [label, key, values] of [
        ['Glasses style', 'glasses', ['round-v1', 'rectangular-v1', 'aviator-v1', 'rimless-v1']],
        ['Facial hair style', 'mustache', ['trimmed-v1', 'pencil-v1', 'handlebar-v1', 'beard-v1']],
        ['Neckwear style', 'tie', ['classic-v1', 'striped-v1', 'bow-v1', 'ascot-v1']],
    ]) {
        const signatures = [];
        for (const value of values) {
            await page.getByLabel(label, { exact: true }).selectOption(`male:${value}`);
            await expect.poll(async () => (await recipe(page)).accessoryStyles?.[key]).toBe(`male:${value}`);
            signatures.push(await pixels(page));
        }
        expect(new Set(signatures).size).toBe(4);
    }
    const resolved = await recipe(page);
    const before = await pixels(page);
    expect(resolved.version).toBe(3);
    await importJson(page, defaultRecipe());
    await expect.poll(async () => (await recipe(page)).face).toBe('amara-v1');
    await importJson(page, resolved);
    await expect.poll(() => pixels(page)).toBe(before);
    await page.locator('.portrait-stage').screenshot({
        path: 'test-results/client/portrait-expansion-accessories.png',
    });
    await page.screenshot({
        path: 'test-results/client/portrait-expansion-desktop.png',
        fullPage: true,
    });
    expect(errors).toEqual([]);
});

test('painted layers, palettes, compatibility, shelf persistence and exports', async ({ page }) => {
    const errors = [],
        writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (request.method() !== 'GET') writes.push(request.url());
    });
    await openLab(page);
    await expect(page.locator('.portrait-examples .portrait-example')).toHaveCount(6);
    const original = await pixels(page);
    const facePixels = await pixels(page, [205, 250, 90, 60]);
    await page.getByLabel('Palette preset', { exact: true }).selectOption('forest');
    await expect.poll(() => pixels(page)).not.toBe(original);
    expect(await pixels(page, [205, 250, 90, 60])).toBe(facePixels);
    await page.getByLabel('Palette preset', { exact: true }).selectOption('burgundy');
    await expect.poll(() => pixels(page)).toBe(original);
    await page.getByLabel('Hairstyle', { exact: true }).selectOption('female:bob-v1');
    await page.getByLabel('Glasses', { exact: true }).check();
    await page.getByLabel('Neckwear', { exact: true }).check();
    await page.getByLabel('Clothing', { exact: true }).selectOption('female:officer-v1');
    await expect(page.getByLabel('Neckwear', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Neckwear', { exact: true })).toBeHidden();
    await page.getByLabel('Character name', { exact: true }).fill('Admiral Study');
    await expect.poll(async () => (await recipe(page)).name).toBe('Admiral Study');
    const savedRecipe = await recipe(page);
    const savedPixels = await pixels(page);
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await page.getByRole('button', { name: 'Shuffle character', exact: true }).click();
    await page.reload();
    await expect(page.locator('#portrait-lab-root')).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: 'Admiral Study', exact: true }).click();
    await expect.poll(() => pixels(page)).toBe(savedPixels);
    expect(await recipe(page)).toEqual(savedRecipe);
    const recipeDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export recipe', exact: true }).click();
    const download = await recipeDownload;
    expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toEqual(savedRecipe);
    const pngDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    const png = await readFile(await (await pngDownload).path());
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await page.screenshot({
        path: 'test-results/client/portrait-lab-desktop.png',
        fullPage: true,
    });
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
});

test('invalid imports are atomic and the palette study is repeatable', async ({ page }) => {
    await openLab(page);
    const original = await pixels(page);
    await importJson(page, {
        ...defaultRecipe(),
        face: 'unavailable-future-face',
    });
    await expect(page.getByRole('status')).toContainText('Unavailable face');
    expect(await pixels(page)).toBe(original);
    await importJson(page, { ...defaultRecipe(), version: 99 });
    await expect(page.getByRole('status')).toContainText('Unsupported');
    expect(await pixels(page)).toBe(original);
    await importJson(page, {
        ...defaultRecipe(),
        name: '<img src=x onerror=alert(1)>',
    });
    await expect(page.locator('.portrait-caption')).toContainText('<img src=x onerror=alert(1)>');
    expect(await page.locator('.portrait-caption img').count()).toBe(0);
    const samples = async () =>
        page
            .locator('.portrait-examples .portrait-example canvas')
            .evaluateAll((canvases) => canvases.map((canvas) => canvas.toDataURL()));
    const before = await samples();
    await page.getByRole('button', { name: 'Generate six examples', exact: true }).click();
    expect(await samples()).toEqual(before);
    await page.getByLabel('Generation seed', { exact: true }).fill('another-population');
    await page.getByRole('button', { name: 'Generate six examples', exact: true }).click();
    expect(await samples()).not.toEqual(before);
});

test('custom artwork crops, exports and restores without exposing generated controls', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openLab(page);
    const custom = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = `hsl(${i * 45}, 60%, 55%)`;
            ctx.fillRect(i * 100, 0, 100, 500);
        }
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByLabel('Choose an image', { exact: true }).setInputFiles({
        name: 'custom.png',
        mimeType: 'image/png',
        buffer: Buffer.from(custom, 'base64'),
    });
    await expect(page.getByRole('status')).toContainText('Custom portrait ready');
    await expect(page.getByLabel('Face base', { exact: true })).toBeDisabled();
    const before = await pixels(page);
    await page.getByLabel('Crop zoom', { exact: true }).fill('2');
    await page.getByLabel('Horizontal crop', { exact: true }).fill('0');
    await expect.poll(() => pixels(page)).not.toBe(before);
    const cropped = await pixels(page);
    await page.getByLabel('Character name', { exact: true }).fill('Custom Study');
    const nextDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export recipe', exact: true }).click();
    const file = await readFile(await (await nextDownload).path(), 'utf8');
    const exported = JSON.parse(file);
    expect(exported.image).toMatch(/^data:image\//);
    expect(exported.crop).toEqual({ x: 0, y: 50, zoom: 2 });
    await page
        .getByRole('button', {
            name: 'Return to generated portrait',
            exact: true,
        })
        .click();
    await expect(page.getByLabel('Face base', { exact: true })).toBeEnabled();
    await importJson(page, exported);
    await expect.poll(() => pixels(page)).toBe(cropped);
    // Syntactically valid but undecodable embedded data must not replace this portrait.
    await importJson(page, {
        ...exported,
        image: 'data:image/png;base64,YQ==',
    });
    await expect(page.getByRole('status')).toContainText('could not be decoded');
    expect(await pixels(page)).toBe(cropped);
    expect(errors).toEqual([]);
});

test('mobile layout, keyboard controls and isolated artwork views', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLab(page);
    await page.getByText('Inspect the artwork layers', { exact: true }).click();
    const full = await pixels(page);
    await page.getByLabel('Preview layers', { exact: true }).selectOption('hair');
    await expect.poll(() => pixels(page)).not.toBe(full);
    await page.getByLabel('Preview layers', { exact: true }).selectOption('all');
    await expect.poll(() => pixels(page)).toBe(full);
    await page.getByLabel('Glasses', { exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Glasses', { exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
        path: 'test-results/client/portrait-lab-mobile.png',
        fullPage: true,
    });
    await page.getByLabel('Character name', { exact: true }).fill('É'.repeat(80));
    await expect.poll(async () => (await recipe(page)).name.length).toBe(80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('browser storage errors preserve existing studies and keep portable export available', async ({
    page,
}) => {
    await openLab(page);
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    const stored = await page.evaluate(() => localStorage.getItem('novus.portrait-lab.saved.v1'));
    await page.evaluate(() => {
        Storage.prototype.setItem = () => {
            throw new DOMException('Full', 'QuotaExceededError');
        };
    });
    await page.getByRole('button', { name: 'Save study', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Browser storage is full');
    expect(await page.evaluate(() => localStorage.getItem('novus.portrait-lab.saved.v1'))).toBe(stored);
    await page.reload();
    await page.evaluate(() => localStorage.setItem('novus.portrait-lab.saved.v1', 'corrupt shelf'));
    await page.reload();
    await expect(page.locator('#portrait-lab-root')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('status')).toContainText('Existing storage was kept');
    await expect(page.getByRole('button', { name: 'Save study', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Export recipe', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('novus.portrait-lab.saved.v1'))).toBe(
        'corrupt shelf',
    );
});
