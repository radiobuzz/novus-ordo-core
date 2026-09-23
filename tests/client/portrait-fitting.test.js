import test from 'node:test';
import assert from 'node:assert/strict';
import { allFaces as faces } from '../../resources/js/portrait-lab/fitting.js';
import {
    pools,
    faceRigs,
    sexFor,
    poolFor,
    retargetFitted,
    fittedOptions,
    fitAllowed,
    placements,
    comparisonDefinitions,
} from '../../resources/js/portrait-lab/fitting.js';
import {
    defaultRecipe,
    defaultFittedRecipe,
    validateRecipe,
    generateFittedRecipe,
    parseRecipe,
    serializeRecipe,
} from '../../resources/js/portrait-lab/recipe.js';

test('pools own distinct IDs and generation only uses compatible parts', () => {
    for (const category of ['hair', 'clothing', 'glasses', 'mustache', 'tie']) {
        const female = new Set(pools.female[category].map((asset) => asset.id));
        assert.ok(pools.male[category].every((asset) => !female.has(asset.id)));
    }
    assert.equal(pools.female.mustache.length, 0);
    for (let i = 0; i < 500; i++) {
        const recipe = generateFittedRecipe(`pool-${i}`);
        const sex = sexFor(recipe.face);
        assert.ok(recipe.hair.startsWith(`${sex}:`) && recipe.clothing.startsWith(`${sex}:`));
        for (const key of ['glasses', 'mustache', 'tie'])
            assert.ok(!recipe.accessories[key] || fitAllowed(recipe, key));
        if (sex === 'female') {
            assert.equal(recipe.accessories.mustache, false);
            assert.equal(recipe.accessoryStyles.mustache, null);
        }
        assert.deepEqual(parseRecipe(serializeRecipe(recipe)), recipe);
    }
});

test('cross-pool imports are rejected; explicit retargeting creates a valid copy', () => {
    const female = defaultFittedRecipe();
    assert.throws(() => validateRecipe({ ...female, hair: 'male:swept-v1' }));
    assert.throws(() => validateRecipe({ ...female, clothing: 'male:blazer-v1' }));
    assert.throws(() =>
        validateRecipe({
            ...female,
            accessoryStyles: { ...female.accessoryStyles, glasses: 'male:round-v1' },
        }),
    );
    assert.throws(() =>
        validateRecipe({ ...female, accessories: { ...female.accessories, mustache: true } }),
    );
    const old = { ...defaultRecipe(), accessories: { glasses: true, mustache: true, tie: true } };
    const original = serializeRecipe(old);
    const fitted = validateRecipe(retargetFitted(old));
    assert.equal(fitted.accessories.mustache, false);
    assert.equal(fitted.accessories.tie, false);
    assert.equal(serializeRecipe(old), original);
    assert.equal(fitted.face, old.face);
    assert.deepEqual(fitted.colors, old.colors);
    const male = validateRecipe(retargetFitted(fitted, 'oskar-v1'));
    assert.equal(male.hair, 'male:swept-v1');
    assert.equal(male.clothing, 'male:blazer-v1');
});

test('frame lens centers follow eye landmarks with uniform scaling', () => {
    for (const face of faces)
        for (const glasses of poolFor(face.id).glasses) {
            const recipe = retargetFitted(defaultRecipe(), face.id);
            recipe.accessories.glasses = true;
            recipe.accessoryStyles.glasses = glasses.id;
            const layer = placements(validateRecipe(recipe)).find((entry) => entry.asset.id === glasses.id);
            const [sx, sy, sw, sh] = glasses.source;
            const [x, y, w, h] = layer.asset.target;
            assert.ok(Math.abs(w / sw - h / sh) < 1e-8);
            for (let i = 0; i < 2; i++) {
                const point = [
                    x + ((glasses.reference[i][0] - sx) * w) / sw,
                    y + ((glasses.reference[i][1] - sy) * h) / sh,
                ];
                assert.ok(Math.abs(point[0] - faceRigs[face.id].eyes[i][0]) < 1e-8);
                assert.ok(Math.abs(point[1] - faceRigs[face.id].eyes[i][1] - glasses.eyeOffset) < 1e-8);
            }
        }
});

test('neckwear eligibility follows the garment and comparisons never fabricate incompatible combinations', () => {
    for (const face of faces) {
        const recipe = retargetFitted(defaultRecipe(), face.id);
        assert.deepEqual(
            fittedOptions(recipe, 'tie').map((asset) => asset.sourceId),
            ['ascot-v1', 'cravat-v1'],
        );
        recipe.clothing = `${sexFor(face.id)}:diplomat-v1`;
        assert.equal(fittedOptions(recipe, 'tie').length, 7);
        for (const mode of ['faces', 'hair', 'clothing', 'glasses', 'mustache', 'tie']) {
            for (const item of comparisonDefinitions(validateRecipe(recipe), mode)) {
                validateRecipe(item.recipe);
                for (const placement of placements(item.recipe)) {
                    assert.ok(placement.asset.source.every(Number.isFinite));
                    assert.ok(placement.asset.target.every(Number.isFinite));
                    assert.ok(placement.transform.sx > 0 && placement.transform.sy > 0);
                }
            }
        }
    }
});
