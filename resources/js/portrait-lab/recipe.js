import {
    LIBRARY,
    faces,
    hair,
    clothes,
    palettes,
    profiles,
    hairColors,
    accessoryStyles,
    accessoryFits,
} from './catalog.js';
import { FIT_LIBRARY, poolFor, fittedOptions, fitAllowed, retargetFitted, allFaces } from './fitting.js';
import { lensFinishes, batchPalettes, batchHairColors } from './collection-03.js';

export const fittedPalettes = [...palettes, ...batchPalettes];
export const fittedHairColors = [...hairColors, ...batchHairColors];
export const fittedProfiles = [{ id: 'all-faces', label: 'Even mix · all 18 faces' }, ...profiles];

export const MAX_RECIPE_BYTES = 4_500_000;
export const defaultRecipe = () => ({
    version: 1,
    library: LIBRARY,
    mode: 'generated',
    name: 'Amara',
    face: 'amara-v1',
    hair: 'curls-v1',
    clothing: 'blazer-v1',
    colors: { fabric: '#763d51', accent: '#d6b675', background: '#35454e', hair: '#302c29' },
    accessories: { glasses: false, mustache: false, tie: false },
});
export const defaultFittedRecipe = () => retargetFitted(defaultRecipe());

function requireValue(condition, message) {
    if (!condition) throw new Error(message);
}
function member(value, entries, label) {
    requireValue(
        entries.some((entry) => entry.id === value),
        `Unavailable ${label}: ${String(value).slice(0, 60)}. This recipe needs its original library.`,
    );
    return value;
}
export function validateRecipe(input) {
    requireValue(input && typeof input === 'object', 'Choose a portrait recipe JSON file.');
    requireValue(
        ([1, 2].includes(input.version) && input.library === LIBRARY) ||
            ([3, 4].includes(input.version) && input.library === FIT_LIBRARY),
        'Unsupported portrait recipe version or library. Your current portrait was kept.',
    );
    requireValue(['generated', 'custom'].includes(input.mode), 'Unknown portrait source.');
    requireValue(
        typeof input.name === 'string' && input.name.length <= 80,
        'Portrait name must be at most 80 characters.',
    );
    const colors = {};
    for (const key of ['fabric', 'accent', 'background', 'hair']) {
        requireValue(/^#[0-9a-f]{6}$/i.test(input.colors?.[key]), `Invalid ${key} color.`);
        colors[key] = input.colors[key].toLowerCase();
    }
    const options = {};
    for (const key of ['glasses', 'mustache', 'tie']) {
        requireValue(typeof input.accessories?.[key] === 'boolean', `Invalid ${key} option.`);
        options[key] = input.accessories[key];
    }
    const fitted = [3, 4].includes(input.version);
    const face = member(input.face, fitted ? allFaces : faces, 'face');
    const pool = fitted ? poolFor(face) : null;
    const recipe = {
        version: input.version,
        library: input.library,
        mode: input.mode,
        name: input.name,
        face,
        hair: member(input.hair, fitted ? pool.hair : hair, 'hairstyle'),
        clothing: member(input.clothing, fitted ? pool.clothing : clothes, 'garment'),
        colors,
        accessories: options,
    };
    if (input.version === 4) {
        requireValue(
            input.lenses && typeof input.lenses === 'object' && !Array.isArray(input.lenses),
            'Lens settings are required.',
        );
        requireValue(Object.keys(input.lenses).length === 2, 'Expected lens finish and color.');
        requireValue(/^#[0-9a-f]{6}$/i.test(input.lenses.color), 'Invalid lens color.');
        recipe.lenses = {
            finish: member(input.lenses.finish, lensFinishes, 'lens finish'),
            color: input.lenses.color.toLowerCase(),
        };
    } else requireValue(input.lenses === undefined, 'Lens finishes require recipe version 4.');
    if (fitted) {
        requireValue(
            input.accessoryStyles &&
                typeof input.accessoryStyles === 'object' &&
                !Array.isArray(input.accessoryStyles),
            'Fitted portraits require explicit accessory styles.',
        );
        requireValue(
            Object.keys(input.accessoryStyles).length === 3,
            'Fitted portraits require exactly three accessory categories.',
        );
        recipe.accessoryStyles = {};
        for (const key of ['glasses', 'mustache', 'tie']) {
            const value = input.accessoryStyles[key];
            requireValue(value === null || typeof value === 'string', 'Invalid fitted accessory style.');
            recipe.accessoryStyles[key] =
                value === null ? null : member(value, pool[key], `${key} in this character pool`);
            requireValue(
                !options[key] || fitAllowed(recipe, key),
                'Accessory is not compatible with this character pool or garment.',
            );
        }
    } else if (input.accessoryStyles !== undefined) {
        requireValue(input.version === 2, 'Accessory style choices require recipe version 2.');
        requireValue(
            input.accessoryStyles &&
                typeof input.accessoryStyles === 'object' &&
                !Array.isArray(input.accessoryStyles),
            'Invalid accessory styles.',
        );
        recipe.accessoryStyles = {};
        for (const [key, value] of Object.entries(input.accessoryStyles)) {
            requireValue(Object.hasOwn(accessoryStyles, key), 'Unknown accessory category.');
            recipe.accessoryStyles[key] = member(value, accessoryStyles[key], 'accessory style');
        }
    }
    for (const key of fitted ? [] : Object.keys(options))
        requireValue(
            !options[key] || accessoryFits(recipe, key),
            'This neckwear requires the civilian blazer or double-breasted suit.',
        );
    if (input.mode === 'custom') {
        requireValue(
            typeof input.image === 'string' &&
                input.image.length < MAX_RECIPE_BYTES &&
                /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.image),
            'Custom recipes require an embedded PNG, JPEG or WebP image.',
        );
        const crop = input.crop;
        requireValue(
            crop &&
                [crop.x, crop.y, crop.zoom].every(Number.isFinite) &&
                crop.x >= 0 &&
                crop.x <= 100 &&
                crop.y >= 0 &&
                crop.y <= 100 &&
                crop.zoom >= 1 &&
                crop.zoom <= 3,
            'Invalid image crop.',
        );
        recipe.image = input.image;
        recipe.crop = { x: crop.x, y: crop.y, zoom: crop.zoom };
    }
    return recipe;
}
export function parseRecipe(text) {
    requireValue(typeof text === 'string' && text.length <= MAX_RECIPE_BYTES, 'Recipe file is too large.');
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('That file is not valid JSON. Your current portrait was kept.');
    }
    return validateRecipe(data);
}
export function serializeRecipe(recipe) {
    return JSON.stringify(validateRecipe(recipe), null, 2);
}

// Generation can evolve; saved recipes always retain resolved IDs and colors.
function randomFor(seed) {
    let state = 2166136261;
    for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return () => {
        state += 0x6d2b79f5;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function generateRecipe(seed, profileId = 'mixed', paletteId = 'burgundy') {
    const random = randomFor(seed);
    const profile = profiles.find((entry) => entry.id === profileId);
    const palette = palettes.find((entry) => entry.id === paletteId);
    requireValue(profile && palette, 'Unknown population profile or palette.');
    let pick = random() * profile.weights.reduce((sum, weight) => sum + weight, 0);
    const face = faces[profile.weights.findIndex((weight) => (pick -= weight) < 0)];
    const choose = (entries) => entries[Math.floor(random() * entries.length)];
    const clothing = choose(clothes).id;
    const styles = Object.fromEntries(
        Object.entries(accessoryStyles).map(([key, entries]) => [key, choose(entries).id]),
    );
    return validateRecipe({
        ...defaultRecipe(),
        version: 2,
        name: face.label.split(' · ')[0],
        face: face.id,
        hair: choose(hair).id,
        clothing,
        accessoryStyles: styles,
        colors: {
            fabric: palette.fabric,
            accent: palette.accent,
            background: palette.background,
            hair: choose(hairColors).value,
        },
        accessories: {
            glasses: random() < 0.35,
            mustache: random() < 0.25 && !['amara-v1', 'mei-v1', 'leila-v1'].includes(face.id),
            tie: ['blazer-v1', 'diplomat-v1'].includes(clothing) && random() < 0.5,
        },
    });
}
export function generateFittedRecipe(seed, profileId = 'all-faces', paletteId = 'burgundy') {
    let next = retargetFitted(
        generateRecipe(seed, profileId === 'all-faces' ? 'mixed' : profileId, 'burgundy'),
    );
    const random = randomFor(`${seed}:fitted-v1`);
    const choose = (entries) => entries[Math.floor(random() * entries.length)];
    const palette = fittedPalettes.find((entry) => entry.id === paletteId);
    requireValue(palette, 'Unknown palette.');
    if (profileId === 'all-faces') {
        const face = choose(allFaces);
        next = retargetFitted(next, face.id);
        next.name = face.label.split(' · ')[0];
    }
    Object.assign(next.colors, {
        fabric: palette.fabric,
        accent: palette.accent,
        background: palette.background,
        hair: choose(fittedHairColors).value,
    });
    next.version = 4;
    next.lenses = { finish: choose(lensFinishes).id, color: choose(['#7298ae', '#a67945', '#8b668f']) };
    for (const key of ['hair', 'clothing']) next[key] = choose(poolFor(next.face)[key]).id;
    for (const key of ['glasses', 'mustache', 'tie']) {
        const options = fittedOptions(next, key);
        next.accessoryStyles[key] = options.length ? choose(options).id : null;
        next.accessories[key] = options.length > 0 && random() < (key === 'glasses' ? 0.4 : 0.3);
    }
    return validateRecipe(next);
}
export function cropRectangle(width, height, crop, aspect = 512 / 600) {
    const baseWidth = Math.min(width, height * aspect);
    const baseHeight = baseWidth / aspect;
    const w = baseWidth / crop.zoom;
    const h = baseHeight / crop.zoom;
    return [((width - w) * crop.x) / 100, ((height - h) * crop.y) / 100, w, h];
}
