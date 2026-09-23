import { test, expect } from '@playwright/test';
import {
    batchFaces,
    batchClothes,
    batchHair,
    batchFacialHair,
    batchNeckwear,
} from '../../../resources/js/portrait-lab/collection-03.js';
import { defaultFittedRecipe } from '../../../resources/js/portrait-lab/recipe.js';

const current = async (page) => JSON.parse(await page.locator('.portrait-recipe').textContent());
const open = async (page) => {
    await page.goto('/dev-panel/portrait-lab');
    await expect(page.locator('#portrait-lab-root')).toHaveAttribute('data-ready', 'true', {
        timeout: 20000,
    });
};
const importJson = (page, data) =>
    page.getByLabel('Import a recipe', { exact: true }).setInputFiles({
        name: 'study.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
    });
const png = (page) => page.locator('.portrait-stage canvas').evaluate((c) => c.toDataURL());

test('all batch faces and garments render with new hair and lens finishes', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    const studies = [];
    for (let i = 0; i < batchFaces.length; i++) {
        const face = batchFaces[i],
            sex = face.rig.sex,
            garment = batchClothes[i];
        const hair = batchHair.filter((h) => h.sex === sex)[i % 3];
        await page.getByLabel('Character pool', { exact: true }).selectOption(sex);
        await page.getByLabel('Face base', { exact: true }).selectOption(face.id);
        await page.getByLabel('Clothing', { exact: true }).selectOption(`${sex}:${garment.id}`);
        await page.getByLabel('Hairstyle', { exact: true }).selectOption(`${sex}:${hair.id}`);
        await page
            .getByLabel('Glasses style', { exact: true })
            .selectOption(
                `${sex}:${i % 2 ? 'browline-v1' : sex === 'female' ? 'cat-eye-v1' : 'wire-square-v1'}`,
            );
        await page
            .getByLabel('Lens finish', { exact: true })
            .selectOption(['tinted', 'mirror', 'black', 'clear'][i % 4]);
        await page
            .getByLabel('Palette preset', { exact: true })
            .selectOption(['slate', 'olive', 'wine'][i % 3]);
        await expect.poll(async () => (await current(page)).face).toBe(face.id);
        const definition = await current(page);
        expect(definition.lenses.finish).toBe(['tinted', 'mirror', 'black', 'clear'][i % 4]);
        studies.push({ label: face.label + ' / ' + garment.label, image: await png(page) });
    }
    expect(new Set(studies.map((s) => s.image)).size).toBe(12);
    // A review contact sheet made from actual compositor output, not substitute artwork.
    await page.evaluate((studies) => {
        const review = document.createElement('section');
        review.id = 'batch-review';
        Object.assign(review.style, {
            display: 'grid',
            gridTemplateColumns: 'repeat(4,256px)',
            gap: '12px',
            padding: '20px',
            background: '#172027',
            width: '1112px',
            color: '#e6e0d0',
        });
        for (const study of studies) {
            const card = document.createElement('div'),
                image = document.createElement('img'),
                label = document.createElement('p');
            image.src = study.image;
            image.width = 256;
            image.height = 300;
            label.textContent = study.label;
            card.append(image, label);
            review.append(card);
        }
        document.body.append(review);
    }, studies);
    await page
        .locator('#batch-review')
        .screenshot({ path: 'test-results/client/portrait-collection-03.png' });
    expect(errors).toEqual([]);
});

test('lens settings survive pool switches and restore; clear preserves v3 pixels', async ({ page }) => {
    await open(page);
    const base = { ...defaultFittedRecipe(), accessories: { glasses: true, mustache: false, tie: false } };
    await importJson(page, base);
    await expect.poll(async () => (await current(page)).version).toBe(3);
    const clear = await png(page),
        outputs = [];
    for (const finish of ['tinted', 'black', 'mirror', 'clear']) {
        await page.getByLabel('Lens finish', { exact: true }).selectOption(finish);
        await expect.poll(async () => (await current(page)).lenses?.finish).toBe(finish);
        outputs.push(await png(page));
    }
    expect(new Set(outputs).size).toBe(4);
    expect(outputs[3]).toBe(clear);
    await page.getByLabel('Lens finish', { exact: true }).selectOption('tinted');
    await page.getByLabel('Lens tint color', { exact: true }).fill('#b35680');
    await page.getByLabel('Character pool', { exact: true }).selectOption('male');
    await page.getByLabel('Clothing', { exact: true }).selectOption('male:diplomat-v1');
    const saved = await current(page),
        before = await png(page);
    expect(saved.lenses).toEqual({ finish: 'tinted', color: '#b35680' });
    await importJson(page, base);
    await expect.poll(async () => (await current(page)).version).toBe(3);
    await importJson(page, saved);
    await expect.poll(() => png(page)).toBe(before);
    await importJson(page, { ...saved, lenses: { finish: 'invalid', color: '#b35680' } });
    await expect(page.getByRole('status')).toContainText('Unavailable lens finish');
    expect(await current(page)).toEqual(saved);
    const categoryPixels = [];
    for (const [category, label] of [
        [batchFacialHair, 'Facial hair style'],
        [batchNeckwear, 'Neckwear style'],
    ]) {
        for (const asset of category) {
            await page.getByLabel(label, { exact: true }).selectOption(`male:${asset.id}`);
            await expect.poll(async () => JSON.stringify(await current(page))).toContain(asset.id);
            categoryPixels.push(await png(page));
        }
    }
    expect(new Set(categoryPixels).size).toBe(6);
    await page
        .locator('.portrait-stage')
        .screenshot({ path: 'test-results/client/portrait-collection-accessories.png' });
});

test('new tall collars do not cover the face; frame finishes stay out of the lower face', async ({
    page,
}) => {
    await open(page);
    await page.getByLabel('Face base', { exact: true }).selectOption('lin-v1');
    await page.getByLabel('Hairstyle', { exact: true }).selectOption('female:none');
    await page.getByLabel('Clothing', { exact: true }).selectOption('female:research-coat-v1');
    const mouthPixels = () =>
        page.locator('.portrait-stage canvas').evaluate((canvas) => {
            let hash = 2166136261;
            for (const value of canvas.getContext('2d').getImageData(210, 320, 90, 70).data)
                hash = Math.imul(hash ^ value, 16777619);
            return hash;
        });
    await page.getByText('Inspect the artwork layers', { exact: true }).click();
    await page.getByLabel('Preview layers', { exact: true }).selectOption('face');
    await expect
        .poll(async () => page.getByLabel('Preview layers', { exact: true }).inputValue())
        .toBe('face');
    await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const faceOnly = await mouthPixels();
    await page.getByLabel('Preview layers', { exact: true }).selectOption('all');
    await expect.poll(mouthPixels).toEqual(faceOnly);
    for (const frame of [
        'round-v1',
        'rectangular-v1',
        'aviator-v1',
        'rimless-v1',
        'browline-v1',
        'cat-eye-v1',
    ]) {
        await page.getByLabel('Glasses style', { exact: true }).selectOption(`female:${frame}`);
        const images = [];
        for (const finish of ['clear', 'tinted', 'black', 'mirror']) {
            await page.getByLabel('Lens finish', { exact: true }).selectOption(finish);
            await expect.poll(async () => (await current(page)).lenses?.finish).toBe(finish);
            images.push(await png(page));
            expect(await mouthPixels()).toEqual(faceOnly);
        }
        expect(new Set(images).size).toBe(4);
    }
});
