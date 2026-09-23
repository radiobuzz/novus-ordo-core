import test from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultRecipe,
    validateRecipe,
    parseRecipe,
    serializeRecipe,
    generateRecipe,
    cropRectangle,
} from '../../resources/js/portrait-lab/recipe.js';
import {
    faces,
    hair,
    clothes,
    palettes,
    profiles,
    hairColors,
    accessoryStyles,
} from '../../resources/js/portrait-lab/catalog.js';

test('expanded catalog adds three choices per category and versioned accessories round-trip', () => {
    assert.equal(faces.length, 6);
    assert.equal(hair.length, 7); // Six styles plus bald.
    assert.equal(clothes.length, 6);
    assert.equal(palettes.length, 7);
    assert.equal(profiles.length, 7);
    assert.equal(hairColors.length, 9);
    for (const entries of Object.values(accessoryStyles)) assert.equal(entries.length, 4);
    const legacy = defaultRecipe();
    assert.deepEqual(parseRecipe(serializeRecipe(legacy)), legacy);
    assert.equal(Object.hasOwn(parseRecipe(serializeRecipe(legacy)), 'accessoryStyles'), false);
    for (const [key, entries] of Object.entries(accessoryStyles))
        for (const entry of entries) {
            const recipe = {
                ...defaultRecipe(),
                version: 2,
                face: 'oskar-v1',
                clothing: 'diplomat-v1',
                accessories: { ...defaultRecipe().accessories, [key]: true },
                accessoryStyles: { [key]: entry.id },
            };
            assert.deepEqual(parseRecipe(serializeRecipe(recipe)), recipe);
        }
    assert.throws(() => validateRecipe({ ...legacy, accessoryStyles: { glasses: 'aviator-v1' } }));
    assert.throws(() => validateRecipe({ ...legacy, version: 2, accessoryStyles: { glasses: 'missing' } }));
    const sampled = new Set(Array.from({ length: 200 }, (_, index) => generateRecipe(`six-${index}`).face));
    assert.equal(sampled.size, 6);
});

test('resolved portrait recipes round-trip independently of future random generation', () => {
    const recipe = generateRecipe('a-stable-person', 'ren', 'forest');
    const serialized = serializeRecipe(recipe);
    assert.deepEqual(parseRecipe(serialized), recipe);
    assert.deepEqual(generateRecipe('a-stable-person', 'ren', 'forest'), recipe);
    assert.notDeepEqual(generateRecipe('a-different-person', 'ren', 'forest'), recipe);
    const restored = parseRecipe(serialized);
    restored.colors.fabric = '#000000';
    assert.equal(recipe.colors.fabric, '#405f50');
});

test('recipe validation rejects unsupported assets, versions, unsafe sources and invalid combinations', () => {
    for (const override of [
        { version: 99 },
        { library: 'missing-v2' },
        { face: 'missing-face' },
        { hair: '../file' },
        { name: 'x'.repeat(81) },
        { mode: 'remote' },
    ])
        assert.throws(() => validateRecipe({ ...defaultRecipe(), ...override }));
    assert.throws(() => parseRecipe('{broken'));
    assert.throws(() =>
        validateRecipe({
            ...defaultRecipe(),
            colors: { ...defaultRecipe().colors, fabric: 'url(https://example.com)' },
        }),
    );
    assert.throws(() =>
        validateRecipe({
            ...defaultRecipe(),
            clothing: 'workwear-v1',
            accessories: { glasses: false, mustache: false, tie: true },
        }),
    );
    assert.throws(() =>
        validateRecipe({
            ...defaultRecipe(),
            mode: 'custom',
            image: 'https://example.com/face.png',
            crop: { x: 50, y: 50, zoom: 1 },
        }),
    );
    const custom = {
        ...defaultRecipe(),
        mode: 'custom',
        image: 'data:image/png;base64,YQ==',
        crop: { x: 50, y: 50, zoom: 1 },
    };
    assert.deepEqual(parseRecipe(serializeRecipe(custom)), custom);
    for (const crop of [
        { x: -1, y: 50, zoom: 1 },
        { x: 50, y: 101, zoom: 1 },
        { x: 50, y: 50, zoom: 0 },
        { x: NaN, y: 50, zoom: 1 },
    ])
        assert.throws(() => validateRecipe({ ...custom, crop }));
});

test('weighted presets influence a population without excluding minority faces', () => {
    const counts = { 'amara-v1': 0, 'ren-v1': 0, 'luc-v1': 0 };
    for (let i = 0; i < 1000; i++) {
        const recipe = generateRecipe(`population-${i}`, 'amara', 'navy');
        counts[recipe.face]++;
        assert.equal(recipe.colors.fabric, '#344c70');
        assert.ok(!recipe.accessories.tie || ['blazer-v1', 'diplomat-v1'].includes(recipe.clothing));
    }
    assert.ok(counts['amara-v1'] > 600 && counts['amara-v1'] < 800);
    assert.ok(counts['ren-v1'] > 80 && counts['luc-v1'] > 80);
});

test('custom image crops remain inside portrait and landscape images at every extent', () => {
    for (const [width, height] of [
        [1600, 900],
        [900, 1600],
        [500, 500],
    ]) {
        for (const x of [0, 50, 100])
            for (const y of [0, 50, 100])
                for (const zoom of [1, 2, 3]) {
                    const [left, top, w, h] = cropRectangle(width, height, { x, y, zoom });
                    assert.ok(left >= 0 && top >= 0 && left + w <= width + 1e-8 && top + h <= height + 1e-8);
                    assert.ok(Math.abs(w / h - 512 / 600) < 1e-8);
                }
    }
});
