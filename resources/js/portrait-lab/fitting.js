import { faces, hair, clothes, accessoryStyles } from './catalog.js';
import {
    batchFaces,
    batchHair,
    batchClothes,
    batchGlasses,
    batchFacialHair,
    batchNeckwear,
} from './collection-03.js';
import { originalLensPaths } from './lenses.js';

export const allFaces = [...faces, ...batchFaces];

export const FIT_LIBRARY = 'clean-digital-fit-v1';
// Canonical 512 × 600 coordinates, measured once per face. These are visual
// attachment landmarks, not inferred ethnicity/sex or authoritative game data.
export const faceRigs = {
    ...Object.fromEntries(batchFaces.map((face) => [face.id, face.rig])),
    'amara-v1': {
        sex: 'female',
        eyes: [
            [204, 231],
            [305, 231],
        ],
        nose: [256, 302],
        mouth: [256, 339],
        chin: [256, 405],
        jaw: 205,
        scalp: [
            [151, 168],
            [361, 168],
        ],
        shoulders: 486,
    },
    'mei-v1': {
        sex: 'female',
        eyes: [
            [205, 231],
            [304, 231],
        ],
        nose: [256, 305],
        mouth: [256, 334],
        chin: [256, 400],
        jaw: 200,
        scalp: [
            [149, 154],
            [363, 154],
        ],
        shoulders: 480,
    },
    'leila-v1': {
        sex: 'female',
        eyes: [
            [205, 234],
            [307, 234],
        ],
        nose: [256, 309],
        mouth: [256, 340],
        chin: [256, 414],
        jaw: 211,
        scalp: [
            [147, 162],
            [365, 162],
        ],
        shoulders: 490,
    },
    'ren-v1': {
        sex: 'male',
        eyes: [
            [205, 230],
            [306, 230],
        ],
        nose: [256, 301],
        mouth: [256, 335],
        chin: [256, 405],
        jaw: 215,
        scalp: [
            [145, 166],
            [367, 166],
        ],
        shoulders: 512,
    },
    'luc-v1': {
        sex: 'male',
        eyes: [
            [204, 231],
            [308, 231],
        ],
        nose: [256, 302],
        mouth: [256, 337],
        chin: [256, 410],
        jaw: 213,
        scalp: [
            [148, 166],
            [366, 166],
        ],
        shoulders: 506,
    },
    'oskar-v1': {
        sex: 'male',
        eyes: [
            [204, 232],
            [310, 232],
        ],
        nose: [259, 313],
        mouth: [258, 340],
        chin: [258, 424],
        jaw: 232,
        scalp: [
            [139, 164],
            [375, 164],
        ],
        shoulders: 520,
    },
};

const frameRepairs = {
    'round-v1': {
        source: [25, 302, 574, 234],
        eyes: [
            [166, 420],
            [465, 420],
        ],
    },
    'rectangular-v1': {
        source: [643, 330, 594, 193],
        eyes: [
            [785, 431],
            [1090, 431],
        ],
    },
    'aviator-v1': {
        source: [18, 765, 596, 231],
        eyes: [
            [168, 879],
            [463, 879],
        ],
    },
    'rimless-v1': {
        source: [642, 815, 596, 155],
        eyes: [
            [787, 895],
            [1091, 895],
        ],
    },
};
// Attachment references belong to the garment, never the face. An open blazer
// supports a tucked ascot; ties/bows require the buttoned formal shirt.
const collars = {
    'blazer-v1': { point: [257, 492], span: 44, types: ['ascot-v1', 'cravat-v1'] },
    'diplomat-v1': {
        point: [251, 430],
        span: 44,
        types: ['classic-v1', 'striped-v1', 'bow-v1', 'ascot-v1', 'knit-tie-v1', 'cravat-v1', 'ribbon-v1'],
    },
};
const hairReferences = {
    'curls-v1': [
        [149, 162],
        [363, 162],
    ],
    'bob-v1': [
        [149, 147],
        [363, 147],
    ],
    'bun-v1': [
        [149, 162],
        [363, 162],
    ],
    'swept-v1': [
        [149, 149],
        [363, 149],
    ],
    'waves-v1': [
        [149, 153],
        [363, 153],
    ],
    'crop-v1': [
        [149, 164],
        [363, 164],
    ],
};
function bind(sex, asset, extra = {}) {
    return { ...asset, ...extra, id: `${sex}:${asset.id}`, sourceId: asset.id, sex };
}
// Each sex owns distinct IDs and attachment settings, even where a painted
// source is reused. No cross-pool IDs are permitted in fitted definitions.
export const pools = Object.fromEntries(
    ['female', 'male'].map((sex) => [
        sex,
        {
            hair: hair
                .filter((asset) =>
                    (sex === 'female'
                        ? ['none', 'curls-v1', 'bob-v1', 'bun-v1']
                        : ['none', 'swept-v1', 'waves-v1', 'crop-v1']
                    ).includes(asset.id),
                )
                .map((asset) => bind(sex, asset, { reference: hairReferences[asset.id] })),
            clothing: clothes.map((asset) => bind(sex, asset, { collar: collars[asset.id] })),
            glasses: accessoryStyles.glasses.map((asset) =>
                bind(sex, asset, {
                    atlas: 'fittedGlasses',
                    source: frameRepairs[asset.id].source,
                    reference: frameRepairs[asset.id].eyes,
                    lensPath: originalLensPaths[asset.id],
                    // Independent pool calibration. Lens centers ultimately follow each face.
                    eyeOffset: sex === 'female' ? -1 : 0,
                }),
            ),
            mustache: sex === 'female' ? [] : accessoryStyles.mustache.map((asset) => bind(sex, asset)),
            tie: accessoryStyles.tie.map((asset) =>
                bind(sex, asset, { neckScale: sex === 'female' ? 0.92 : 1 }),
            ),
        },
    ]),
);

for (const sex of ['female', 'male']) {
    for (const [category, assets] of Object.entries({
        hair: batchHair,
        clothing: batchClothes,
        glasses: batchGlasses,
        mustache: batchFacialHair,
        tie: batchNeckwear,
    })) {
        pools[sex][category].push(
            ...assets
                .filter((asset) => asset.sex === sex || asset.sex === 'both')
                .map((asset) =>
                    bind(sex, asset, category === 'tie' ? { neckScale: sex === 'female' ? 0.92 : 1 } : {}),
                ),
        );
    }
}

export const isFitted = (recipe) => [3, 4].includes(recipe.version) && recipe.library === FIT_LIBRARY;
export const sexFor = (faceId) => faceRigs[faceId].sex;
export const poolFor = (faceId) => pools[sexFor(faceId)];
export function fittedAsset(recipe, category) {
    const id =
        category === 'hair' || category === 'clothing'
            ? recipe[category]
            : recipe.accessoryStyles?.[category];
    return poolFor(recipe.face)[category].find((asset) => asset.id === id);
}
export function fittedOptions(recipe, category) {
    const entries = poolFor(recipe.face)[category];
    if (category !== 'tie') return entries;
    const collar = fittedAsset(recipe, 'clothing')?.collar;
    return entries.filter((asset) => collar?.types.includes(asset.sourceId));
}
export function fitAllowed(recipe, category) {
    return fittedOptions(recipe, category).some((asset) => asset.id === recipe.accessoryStyles?.[category]);
}
const originalId = (id) => id?.split(':').at(-1);
// Explicit face/pool changes and migration are the only places that choose
// replacements. Import validation never silently substitutes a different part.
export function retargetFitted(input, faceId = input.face) {
    const next = structuredClone(input);
    next.face = faceId;
    next.version = input.version === 4 ? 4 : 3;
    next.library = FIT_LIBRARY;
    const pool = poolFor(faceId);
    for (const key of ['hair', 'clothing']) {
        const sourceId = originalId(next[key]);
        const fallback = key === 'hair' ? pool.hair[1] : pool.clothing[0];
        next[key] = (pool[key].find((asset) => asset.sourceId === sourceId) ?? fallback).id;
    }
    const styles = {};
    for (const key of ['glasses', 'mustache', 'tie']) {
        const sourceId = originalId(next.accessoryStyles?.[key]) ?? accessoryStyles[key][0].id;
        const options = fittedOptions(next, key);
        const match = options.find((asset) => asset.sourceId === sourceId);
        styles[key] = (match ?? options[0])?.id ?? null;
        if (!options.length || (!match && key === 'tie')) next.accessories[key] = false;
    }
    next.accessoryStyles = styles;
    return next;
}

function pairTransform(from, to) {
    const sx = (to[1][0] - to[0][0]) / (from[1][0] - from[0][0]);
    return {
        sx,
        sy: sx,
        tx: to[0][0] - from[0][0] * sx,
        ty: (to[0][1] + to[1][1]) / 2 - ((from[0][1] + from[1][1]) / 2) * sx,
    };
}
export function transformPoint([x, y], { sx, sy, tx, ty }) {
    return [x * sx + tx, y * sy + ty];
}
const identity = { sx: 1, sy: 1, tx: 0, ty: 0 };
export function clothingTransform(recipe) {
    const sx = faceRigs[recipe.face].shoulders / 512;
    return { sx, sy: 1, tx: 256 * (1 - sx), ty: 0 };
}
export function placements(recipe) {
    const rig = faceRigs[recipe.face];
    const result = [
        { category: 'face', asset: allFaces.find((face) => face.id === recipe.face), transform: identity },
    ];
    result.push({
        category: 'clothing',
        asset: fittedAsset(recipe, 'clothing'),
        transform: clothingTransform(recipe),
    });
    const hairstyle = fittedAsset(recipe, 'hair');
    if (hairstyle.source)
        result.push({
            category: 'hair',
            asset: hairstyle,
            transform: pairTransform(hairstyle.reference, rig.scalp),
        });
    for (const key of ['glasses', 'mustache', 'tie']) {
        if (!recipe.accessories[key]) continue;
        const asset = fittedAsset(recipe, key);
        if (!asset || !fitAllowed(recipe, key)) throw new Error('Incompatible fitted accessory.');
        if (key === 'glasses') {
            const transform = pairTransform(
                asset.reference,
                rig.eyes.map(([x, y]) => [x, y + (asset.eyeOffset ?? 0)]),
            );
            // The frame's local reference is in source pixels, so first place its
            // source rectangle at the same coordinates on the canonical layer.
            // Resolve directly instead: no clipping at the 512px layer boundary.
            const [x, y, w, h] = asset.source;
            const [left, top] = transformPoint([x, y], transform);
            result.push({
                category: 'accessories',
                asset: { ...asset, target: [left, top, w * transform.sx, h * transform.sy] },
                transform: identity,
            });
        } else if (key === 'mustache') {
            let transform;
            if (asset.anchor === 'chin') {
                const sx = rig.jaw / 210;
                transform = { sx, sy: sx, tx: rig.chin[0] - 256 * sx, ty: rig.chin[1] - 400 * sx };
            } else if (asset.sourceId === 'beard-v1') {
                const sx = rig.jaw / 202;
                const sy = (rig.chin[1] + 8 - rig.mouth[1]) / (433 - 351);
                transform = { sx, sy, tx: rig.mouth[0] - 256 * sx, ty: rig.mouth[1] - 351 * sy };
            } else {
                const sx = (rig.eyes[1][0] - rig.eyes[0][0]) / 102;
                const anchor =
                    {
                        'trimmed-v1': [256, 328],
                        'pencil-v1': [257, 334],
                        'handlebar-v1': [257, 333],
                    }[asset.sourceId] ?? asset.anchorPoint;
                transform = {
                    sx,
                    sy: sx,
                    tx: rig.nose[0] - anchor[0] * sx,
                    ty: (rig.nose[1] + rig.mouth[1]) / 2 - anchor[1] * sx,
                };
            }
            result.push({ category: 'accessories', asset, transform });
        } else {
            const collar = fittedAsset(recipe, 'clothing').collar;
            const anchor = transformPoint(collar.point, clothingTransform(recipe));
            const factors =
                {
                    'classic-v1': [0.92, 3.17, 0.12],
                    'striped-v1': [0.85, 3.0, 0.13],
                    'bow-v1': [1.85, 0.56, 0.5],
                    'ascot-v1': [1.6, 1.9, 0.27],
                }[asset.sourceId] ?? asset.factors;
            const w = collar.span * factors[0] * asset.neckScale;
            const h = w * factors[1];
            result.push({
                category: 'accessories',
                asset: { ...asset, target: [anchor[0] - w / 2, anchor[1] - h * factors[2], w, h] },
                transform: identity,
            });
        }
    }
    return result;
}

export function comparisonDefinitions(recipe, mode) {
    if (!isFitted(recipe) || recipe.mode === 'custom') return [];
    if (mode === 'faces')
        return allFaces
            .filter((face) => sexFor(face.id) === sexFor(recipe.face))
            .map((face) => ({ label: face.label, recipe: retargetFitted(recipe, face.id) }));
    const options = fittedOptions(recipe, mode);
    return options.map((asset) => {
        let next = structuredClone(recipe);
        if (mode === 'hair' || mode === 'clothing') {
            next[mode] = asset.id;
            next = retargetFitted(next);
        } else {
            next.accessoryStyles[mode] = asset.id;
            next.accessories[mode] = true;
        }
        return { label: asset.label, recipe: next };
    });
}
