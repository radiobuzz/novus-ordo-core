// Immutable v1 artwork registration. Source coordinates refer to the original atlas;
// destinations are on a 512 × 600 portrait. New art gets new IDs/revisions.
export const LIBRARY = 'clean-digital-v1';
export const SIZE = [512, 600];
export const faces = [
    {
        id: 'amara-v1',
        label: 'Amara · woman, mature',
        description: 'Dark complexion, broad cheekbones, mature face',
        source: [45, 60, 275, 390],
        target: [111, 65, 290, 411],
        neck: { source: [98, 401, 162, 29], target: [166, 423, 171, 114] },
    },
    {
        id: 'ren-v1',
        label: 'Ren · man, older',
        description: 'Warm medium complexion, older face',
        source: [405, 60, 278, 390],
        target: [110, 65, 292, 411],
        neck: { source: [460, 401, 161, 29], target: [168, 423, 169, 114] },
    },
    {
        id: 'luc-v1',
        label: 'Luc · man, young adult',
        description: 'Light olive complexion, young adult face',
        source: [765, 60, 275, 390],
        target: [111, 65, 290, 411],
        neck: { source: [821, 401, 161, 29], target: [170, 423, 170, 114] },
    },
    {
        id: 'mei-v1',
        label: 'Mei · woman, young adult',
        description: 'Light warm complexion, oval young adult face',
        atlas: 'expansion',
        source: [65, 10, 300, 448],
        target: [111, 62, 290, 406],
        neck: { source: [125, 409, 176, 28], target: [168, 424, 170, 113] },
    },
    {
        id: 'leila-v1',
        label: 'Leila · woman, mature',
        description: 'Medium brown complexion, strong cheekbones, mature face',
        atlas: 'expansion',
        source: [469, 12, 297, 447],
        target: [111, 70, 290, 414],
        neck: { source: [531, 409, 170, 28], target: [172, 437, 166, 100] },
    },
    {
        id: 'oskar-v1',
        label: 'Oskar · man, older',
        description: 'Fair ruddy complexion, broad older face',
        atlas: 'expansion',
        source: [874, 10, 317, 447],
        target: [101, 72, 310, 410],
        neck: { source: [929, 409, 193, 27], target: [155, 437, 189, 100] },
    },
];
export const hair = [
    { id: 'none', label: 'Bald' },
    {
        id: 'curls-v1',
        label: 'Short natural curls',
        source: [27, 492, 310, 273],
        target: [96, 29, 326, 287],
        material: 'hair',
    },
    {
        id: 'swept-v1',
        label: 'Swept side part',
        source: [390, 498, 308, 267],
        target: [94, 34, 326, 283],
        material: 'hair',
    },
    {
        id: 'waves-v1',
        label: 'Loose waves',
        source: [751, 491, 320, 277],
        target: [90, 26, 338, 292],
        material: 'hair',
    },
    {
        id: 'crop-v1',
        label: 'Close textured crop',
        atlas: 'expansion',
        source: [56, 510, 306, 271],
        target: [119, 52, 279, 247],
        material: 'hair',
    },
    {
        id: 'bob-v1',
        label: 'Chin-length bob',
        atlas: 'expansion',
        source: [428, 505, 384, 364],
        target: [82, 30, 351, 333],
        material: 'hair',
    },
    {
        id: 'bun-v1',
        label: 'Swept-up bun',
        atlas: 'expansion',
        source: [877, 462, 327, 427],
        target: [94, 8, 328, 365],
        material: 'hair',
    },
];
export const clothes = [
    {
        id: 'blazer-v1',
        label: 'Civilian blazer',
        role: 'Minister',
        source: [14, 938, 344, 221],
        target: [0, 337, 512, 329],
        material: 'fabric',
        // White shirt remains neutral; these are authoring masks, not UI theme colors.
        neutral: 'M 180 356 L 247 488 L 282 475 L 340 354 L 316 600 L 207 600 Z',
    },
    {
        id: 'officer-v1',
        label: 'Officer tunic',
        role: 'Admiral',
        source: [372, 932, 343, 220],
        target: [0, 335, 512, 329],
        material: 'fabric',
        accent: 'M 0 432 L 127 393 Q 137 391 140 404 L 139 410 L 0 451 Z M 512 432 L 385 393 Q 375 391 372 404 L 373 410 L 512 451 Z',
    },
    {
        id: 'workwear-v1',
        label: 'Work jacket',
        role: 'Worker',
        source: [729, 935, 343, 219],
        target: [0, 335, 512, 329],
        material: 'fabric',
    },
    {
        id: 'cardigan-v1',
        label: 'Knit cardigan',
        role: 'Citizen',
        atlas: 'expansion',
        source: [0, 904, 425, 330],
        target: [0, 340, 512, 398],
        material: 'fabric',
    },
    {
        id: 'diplomat-v1',
        label: 'Double-breasted suit',
        role: 'Diplomat',
        atlas: 'expansion',
        source: [425, 904, 408, 330],
        target: [0, 340, 512, 414],
        material: 'fabric',
        neutral: 'M 184 350 L 254 412 L 321 349 L 300 537 L 254 615 L 220 525 Z',
    },
    {
        id: 'field-v1',
        label: 'Field jacket',
        role: 'Commander',
        atlas: 'expansion',
        source: [833, 899, 420, 336],
        target: [0, 340, 512, 410],
        material: 'fabric',
    },
];
export const accessories = {
    glasses: { source: [94, 1228, 187, 77], target: [164, 210, 187, 77] },
    mustache: { source: [482, 1273, 122, 47], target: [209, 313, 94, 36], material: 'hair' },
    tie: {
        source: [871, 1228, 66, 209],
        target: [234, 451, 45, 143],
        material: 'accent',
        compatible: ['blazer-v1'],
    },
};
// Legacy boolean recipes still select the original asset. New choices are
// optional, resolved IDs; adding a style never changes that implicit default.
export const accessoryStyles = {
    glasses: [
        { id: 'round-v1', label: 'Round frames', ...accessories.glasses },
        {
            id: 'rectangular-v1',
            label: 'Rectangular frames',
            atlas: 'accessoryExpansion',
            source: [14, 146, 404, 148],
            target: [159, 211, 196, 72],
        },
        {
            id: 'aviator-v1',
            label: 'Aviator frames',
            atlas: 'accessoryExpansion',
            source: [430, 136, 391, 160],
            target: [159, 207, 196, 80],
        },
        {
            id: 'rimless-v1',
            label: 'Rimless frames',
            atlas: 'accessoryExpansion',
            source: [834, 163, 408, 120],
            target: [161, 217, 192, 57],
        },
    ],
    mustache: [
        { id: 'trimmed-v1', label: 'Trimmed mustache', ...accessories.mustache },
        {
            id: 'pencil-v1',
            label: 'Pencil mustache',
            atlas: 'accessoryExpansion',
            source: [48, 549, 336, 89],
            target: [209, 322, 96, 25],
            material: 'hair',
        },
        {
            id: 'handlebar-v1',
            label: 'Handlebar mustache',
            atlas: 'accessoryExpansion',
            source: [435, 544, 384, 121],
            target: [193, 313, 128, 40],
            material: 'hair',
        },
        {
            id: 'beard-v1',
            label: 'Short full beard',
            atlas: 'accessoryExpansion',
            source: [859, 459, 358, 317],
            target: [155, 260, 202, 179],
            material: 'hair',
        },
    ],
    tie: [
        {
            id: 'classic-v1',
            label: 'Classic necktie',
            ...accessories.tie,
            compatible: ['blazer-v1', 'diplomat-v1'],
            targets: { 'diplomat-v1': [234, 412, 45, 163] },
        },
        {
            id: 'striped-v1',
            label: 'Striped slim tie',
            atlas: 'accessoryExpansion',
            source: [143, 789, 146, 438],
            target: [233, 451, 48, 145],
            targets: { 'diplomat-v1': [233, 412, 48, 174] },
            material: 'accent',
            compatible: ['blazer-v1', 'diplomat-v1'],
        },
        {
            id: 'bow-v1',
            label: 'Bow tie',
            atlas: 'accessoryExpansion',
            source: [447, 900, 359, 201],
            target: [205, 455, 103, 58],
            targets: { 'diplomat-v1': [205, 408, 103, 58] },
            material: 'accent',
            compatible: ['blazer-v1', 'diplomat-v1'],
        },
        {
            id: 'ascot-v1',
            label: 'Silk ascot',
            atlas: 'accessoryExpansion',
            source: [927, 802, 224, 425],
            target: [210, 441, 94, 179],
            targets: { 'diplomat-v1': [210, 401, 94, 179] },
            material: 'accent',
            compatible: ['blazer-v1', 'diplomat-v1'],
        },
    ],
};
export function accessoryFor(recipe, key) {
    return (
        accessoryStyles[key].find((entry) => entry.id === recipe.accessoryStyles?.[key]) ??
        accessoryStyles[key][0]
    );
}
export function accessoryFits(recipe, key) {
    const asset = accessoryFor(recipe, key);
    return !asset.compatible || asset.compatible.includes(recipe.clothing);
}
export const palettes = [
    {
        id: 'burgundy',
        label: 'Burgundy & brass',
        fabric: '#763d51',
        accent: '#d6b675',
        background: '#35454e',
    },
    { id: 'navy', label: 'Navy & silver', fabric: '#344c70', accent: '#c1cbd2', background: '#33424e' },
    { id: 'forest', label: 'Forest & gold', fabric: '#405f50', accent: '#c8a56b', background: '#3d4844' },
    { id: 'ochre', label: 'Ochre & charcoal', fabric: '#ac7943', accent: '#45494d', background: '#465259' },
    { id: 'ivory', label: 'Ivory & bronze', fabric: '#b7aa91', accent: '#956346', background: '#494941' },
    { id: 'teal', label: 'Teal & copper', fabric: '#356568', accent: '#bc825b', background: '#304b50' },
    { id: 'plum', label: 'Plum & pearl', fabric: '#655076', accent: '#d9d0be', background: '#444050' },
];
export const hairColors = [
    { value: '#302c29', label: 'Soft black' },
    { value: '#634430', label: 'Chestnut' },
    { value: '#a9814a', label: 'Golden brown' },
    { value: '#8a4932', label: 'Auburn' },
    { value: '#96918b', label: 'Silver' },
    { value: '#d2cec3', label: 'White' },
    { value: '#181d23', label: 'Blue black' },
    { value: '#d6b97b', label: 'Sandy blond' },
    { value: '#855d45', label: 'Warm brown' },
];
// Illustrative weights only, no claims about real nations or ethnicity.
// A population profile supplies probabilities; every face remains manually selectable.
export const profiles = [
    { id: 'mixed', label: 'Even mix · all six faces', weights: [1, 1, 1, 1, 1, 1] },
    { id: 'amara', label: 'Amara-led mix · 70 / 15 / 15', weights: [70, 15, 15] },
    { id: 'ren', label: 'Ren-led mix · 15 / 70 / 15', weights: [15, 70, 15] },
    { id: 'luc', label: 'Luc-led mix · 15 / 15 / 70', weights: [15, 15, 70] },
    { id: 'mei', label: 'Mei-led mix · 70% Mei', weights: [6, 6, 6, 70, 6, 6] },
    { id: 'leila', label: 'Leila-led mix · 70% Leila', weights: [6, 6, 6, 6, 70, 6] },
    { id: 'oskar', label: 'Oskar-led mix · 70% Oskar', weights: [6, 6, 6, 6, 6, 70] },
];
