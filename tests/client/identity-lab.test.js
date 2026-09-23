import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplate, TEMPLATES, PALETTES } from '../../resources/js/identity-lab/templates.js';
import {
    parseRecipe,
    serializeRecipe,
    validateRecipe,
    resolveColor,
    MAX_RECIPE_BYTES,
} from '../../resources/js/identity-lab/recipe.js';

test('every proof composition resolves and round-trips independently of its template', () => {
    for (const palette of PALETTES)
        for (const id of TEMPLATES) {
            const original = createTemplate(id, palette);
            const restored = parseRecipe(serializeRecipe(original));
            assert.deepEqual(restored, original);
            assert.equal(restored.flag.width / restored.flag.height, 1.5);
            assert.equal(restored.kind, 'flag');
            assert.equal(restored.flag.layers.length > 0, id !== 'solid');
            assert.ok(!Object.hasOwn(restored, 'emblem'));
            if (id === 'solid') continue;
            original.flag.layers[0].x = -333;
            assert.notEqual(restored.flag.layers[0].x, original.flag.layers[0].x);
        }
});
test('saved recipes store resolved geometry, palette roles and literal overrides', () => {
    const recipe = createTemplate('union');
    recipe.flag.layers[2].x = 419;
    recipe.flag.layers[2].rotation = 28;
    recipe.flag.layers[2].color = '#AABBCC';
    const resolved = parseRecipe(serializeRecipe(recipe));
    resolved.palette.secondary = '#001122';
    assert.equal(resolveColor(resolved.flag.layers[2].color, resolved.palette), '#aabbcc');
    assert.equal(resolveColor('secondary', resolved.palette), '#001122');
    assert.equal(resolved.flag.layers[2].x, 419);
    assert.equal(resolved.flag.layers[2].rotation, 28);
    assert.deepEqual(createTemplate('union'), createTemplate('union'));
});
test('imports reject incompatible versions, foreign kinds, URLs and unbounded geometry', () => {
    const mutations = [
        (r) => r.schemaVersion++,
        (r) => (r.rendererVersion = 'future'),
        (r) => (r.assetLibrary = 'external'),
        (r) => (r.kind = 'emblem'),
        (r) => (r.flag.width = 1000),
        (r) => (r.flag.background = 'transparent'),
        (r) => (r.palette.primary = 'url(https://example.com)'),
        (r) => (r.extra = 'unknown'),
        (r) => (r.flag.layers[0].shape = 'svg'),
        (r) => (r.flag.layers[0].geometry.svg = '<script/>'),
        (r) => (r.flag.layers[0].scale = Infinity),
        (r) => (r.flag.layers[0].scale = 0),
        (r) => (r.flag.layers[0].x = NaN),
        (r) => (r.flag.layers[0].y = 1201),
        (r) => (r.flag.layers[0].visible = 'false'),
        (r) => (r.flag.layers[0].flipX = 0),
        (r) => (r.flag.layers[0].color = '#fff'),
        (r) => (r.flag.layers[1].id = r.flag.layers[0].id),
        (r) => (r.flag.layers = Array(65).fill(r.flag.layers[0])),
        (r) => (r.flag.layers[0].geometry.width = -1),
    ];
    for (const mutate of mutations) {
        const r = createTemplate();
        mutate(r);
        assert.throws(() => validateRecipe(r));
    }
    assert.throws(() => parseRecipe('{broken'));
    assert.throws(() => parseRecipe(' '.repeat(MAX_RECIPE_BYTES + 1)), /tooLarge/);
    assert.throws(() => parseRecipe('é'.repeat(MAX_RECIPE_BYTES / 2 + 1)), /tooLarge/);
});
test('symbol geometry and labels are bounded; plain text labels are preserved safely', () => {
    const r = createTemplate('canton');
    r.name = '<img src=x onerror=alert(1)>';
    const polygon = r.flag.layers.at(-1);
    assert.equal(validateRecipe(r).name, r.name);
    polygon.geometry.points[0][0] = 1801;
    assert.throws(() => validateRecipe(r));
    polygon.geometry.points = [
        [0, 0],
        [1, 2],
    ];
    assert.throws(() => validateRecipe(r));
});
test('a solid flag and reordered/hidden layers are legitimate resolved recipes', () => {
    const r = createTemplate('sunrise');
    r.flag.layers.reverse();
    r.flag.layers[0].visible = false;
    assert.deepEqual(parseRecipe(serializeRecipe(r)), r);
    r.flag.layers = [];
    assert.deepEqual(validateRecipe(r), r);
});

import { randomize, generateSamples, addSymbol } from '../../resources/js/identity-lab/generator.js';
import { HARMONIES, generatePalette, contrast } from '../../resources/js/identity-lab/palettes.js';
import { upgradeRecipe } from '../../resources/js/identity-lab/recipe.js';
test('each randomizer changes only its requested part and generation honours locks', () => {
    const original = addSymbol(createTemplate('nordic'), 'anchor', { x: 240, y: 180, color: 'secondary' });
    original.flag.layers.at(-1).rotation = 23;
    const shapes = randomize(original, 'shapes', 'alpha');
    assert.deepEqual(shapes.palette, original.palette);
    assert.deepEqual(
        shapes.flag.layers.filter((l) => l.role === 'emblem'),
        original.flag.layers.filter((l) => l.role === 'emblem'),
    );
    const colors = randomize(original, 'colors', 'alpha');
    assert.deepEqual(colors.flag, original.flag);
    assert.notDeepEqual(colors.palette, original.palette);
    const emblem = randomize(original, 'emblem', 'alpha');
    assert.deepEqual(emblem.palette, original.palette);
    assert.deepEqual(
        emblem.flag.layers.filter((l) => l.role === 'shape'),
        original.flag.layers.filter((l) => l.role === 'shape'),
    );
    assert.notEqual(emblem.flag.layers.at(-1).geometry.symbolId, 'anchor');
    assert.equal(emblem.flag.layers.at(-1).rotation, 23);
    assert.deepEqual(randomize(original, 'colors', 'alpha'), colors);
    assert.deepEqual(generateSamples(original, 'a'), generateSamples(original, 'a'));
    for (const sample of generateSamples(original, 'a', { palette: true, shapes: true, emblem: true }))
        assert.deepEqual(sample, original);
    for (const sample of generateSamples(original, 'b')) {
        assert.deepEqual(sample.palette, original.palette);
        assert.deepEqual(
            sample.flag.layers.filter((l) => l.role === 'emblem'),
            original.flag.layers.filter((l) => l.role === 'emblem'),
        );
    }
});
test('colour harmonies produce broad deterministic variety with light/dark separation', () => {
    let state = 123456;
    const rnd = () => {
        state = (Math.imul(state, 1664525) + 1013904223) | 0;
        return (state >>> 0) / 4294967296;
    };
    const unique = new Set();
    for (const harmony of HARMONIES)
        for (let i = 0; i < 250; i++) {
            const p = generatePalette(rnd, harmony);
            unique.add(JSON.stringify(p));
            for (const v of Object.values(p)) assert.match(v, /^#[a-f0-9]{6}$/);
            assert.ok(contrast(p.primary, p.secondary) >= 3);
            assert.ok(contrast(p.primary, p.supporting) >= 3);
        }
    assert.equal(unique.size, 1000);
});
test('legacy proof recipes stay version 1 until explicitly copied into the extended format', () => {
    const legacy = createTemplate('canton');
    legacy.schemaVersion = 1;
    legacy.rendererVersion = 'flag-canvas-v1';
    delete legacy.customAssets;
    legacy.flag.layers.forEach((l) => delete l.role);
    assert.deepEqual(parseRecipe(serializeRecipe(legacy)), legacy);
    const upgraded = upgradeRecipe(legacy);
    assert.equal(upgraded.schemaVersion, 2);
    assert.equal(upgraded.flag.layers.at(-1).role, 'emblem');
    assert.equal(legacy.schemaVersion, 1);
});
