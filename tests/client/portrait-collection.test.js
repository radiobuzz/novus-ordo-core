import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    batchFaces,
    batchClothes,
    batchHair,
    batchGlasses,
    batchFacialHair,
    batchNeckwear,
    lensFinishes,
} from '../../resources/js/portrait-lab/collection-03.js';
import {
    allFaces,
    pools,
    placements,
    retargetFitted,
    fittedOptions,
    sexFor,
} from '../../resources/js/portrait-lab/fitting.js';
import {
    defaultFittedRecipe,
    validateRecipe,
    serializeRecipe,
    parseRecipe,
    generateFittedRecipe,
} from '../../resources/js/portrait-lab/recipe.js';

test('collection delivers the requested distinct artwork and pool counts', () => {
    assert.equal(batchFaces.length, 12);
    assert.equal(batchClothes.length, 12);
    assert.equal(batchHair.length, 6);
    for (const items of [batchGlasses, batchFacialHair, batchNeckwear]) assert.equal(items.length, 3);
    assert.equal(allFaces.length, 18);
    const assets = [
        ...batchFaces,
        ...batchClothes,
        ...batchHair,
        ...batchGlasses,
        ...batchFacialHair,
        ...batchNeckwear,
    ];
    assert.equal(new Set(assets.map((a) => a.id)).size, 39);
    for (const asset of assets) {
        const png = readFileSync(
            new URL(
                `../../resources/js/portrait-lab/assets/collection-03/${asset.atlas}.png`,
                import.meta.url,
            ),
        );
        assert.equal(png.readUInt32BE(16), 1254, asset.id);
        assert.equal(png.readUInt32BE(20), 1254, asset.id);
        assert.equal(png[25], 6, `${asset.id} must retain RGBA`);
    }
    for (const sex of ['female', 'male']) {
        assert.equal(allFaces.filter((f) => sexFor(f.id) === sex).length, 9);
        assert.equal(pools[sex].hair.length, 7);
        assert.equal(pools[sex].clothing.length, 12);
        assert.equal(pools[sex].glasses.length, 6);
        assert.equal(pools[sex].tie.length, 7);
    }
    assert.equal(pools.male.mustache.length, 7);
    assert.equal(pools.female.mustache.length, 0);
});

test('v4 lens definitions round-trip without changing v3 or dropping settings on retarget', () => {
    const original = defaultFittedRecipe();
    const snapshot = serializeRecipe(original);
    for (const finish of lensFinishes) {
        const next = validateRecipe({
            ...original,
            version: 4,
            lenses: { finish: finish.id, color: '#7799aa' },
        });
        assert.deepEqual(parseRecipe(serializeRecipe(next)), next);
        assert.deepEqual(retargetFitted(next, 'malik-v1').lenses, next.lenses);
        assert.equal(retargetFitted(next, 'malik-v1').version, 4);
    }
    assert.equal(serializeRecipe(original), snapshot);
    assert.equal(original.version, 3);
    assert.equal(Object.hasOwn(original, 'lenses'), false);
    for (const lenses of [
        undefined,
        null,
        [],
        { finish: 'future', color: '#7799aa' },
        { finish: 'mirror', color: 'red' },
        { finish: 'clear', color: '#000000', extra: true },
    ])
        assert.throws(() => validateRecipe({ ...original, version: 4, lenses }));
    assert.throws(() => validateRecipe({ ...original, lenses: { finish: 'black', color: '#000000' } }));
});

test('new garments and parts produce finite compatible registrations across both pools', () => {
    for (const face of allFaces) {
        const sex = sexFor(face.id);
        for (const garment of pools[sex].clothing) {
            let recipe = retargetFitted(defaultFittedRecipe(), face.id);
            recipe.clothing = garment.id;
            recipe = retargetFitted(recipe);
            for (const category of ['hair', 'glasses', 'mustache', 'tie'])
                for (const part of fittedOptions(recipe, category)) {
                    const next = structuredClone(recipe);
                    if (category === 'hair') next.hair = part.id;
                    else {
                        next.accessories[category] = true;
                        next.accessoryStyles[category] = part.id;
                    }
                    for (const layer of placements(validateRecipe(next))) {
                        assert.ok(layer.asset.target.every(Number.isFinite), part.id);
                        assert.ok(Object.values(layer.transform).every(Number.isFinite), part.id);
                    }
                }
        }
    }
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(generateFittedRecipe(`collection-${i}`).face);
    assert.equal(seen.size, 18);
    assert.deepEqual(
        generateFittedRecipe('again', 'all-faces', 'slate'),
        generateFittedRecipe('again', 'all-faces', 'slate'),
    );
});
