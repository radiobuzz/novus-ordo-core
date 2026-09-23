import { VERSION, RENDERER, LIBRARY, SIZE, PALETTE, validateRecipe } from './recipe.js';

// Original geometry, informed by common flag construction and Carter's article.
export const PROOF_TEMPLATES = Object.freeze(['triband', 'nordic', 'union', 'canton', 'sunrise', 'pall']);
export const TEMPLATES = Object.freeze([
    ...PROOF_TEMPLATES,
    'solid',
    'vertical',
    'horizontal',
    'vertical-triband',
    'diagonal',
    'diagonal-band',
    'saltire',
    'quarters',
    'stripes',
]);
export const PALETTES = Object.freeze([
    { id: 'maritime', ...PALETTE },
    { id: 'republic', primary: '#862e3e', secondary: '#e7c36a', supporting: '#f7f0dc' },
    { id: 'forest', primary: '#235343', secondary: '#e5b961', supporting: '#f2eddb' },
    { id: 'cobalt', primary: '#243f87', secondary: '#db4b45', supporting: '#f5eee2' },
]);
const shape = (name, kind, color, x, y, geometry, rotation = 0) => ({
    id: '',
    role: ['Sun', 'Canton star'].includes(name) ? 'emblem' : 'shape',
    name,
    shape: kind,
    color,
    visible: true,
    x,
    y,
    scale: 1,
    rotation,
    flipX: false,
    geometry,
});
const rect = (name, color, x, y, width, height, rotation = 0) =>
    shape(name, 'rect', color, x, y, { width, height }, rotation);
const polygon = (name, color, x, y, points) => shape(name, 'polygon', color, x, y, { points });
function star(name, color, x, y, radius, tips = 5, inner = 0.42) {
    const points = Array.from({ length: tips * 2 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / tips;
        const r = radius * (i % 2 ? inner : 1);
        return [Math.cos(angle) * r, Math.sin(angle) * r];
    });
    return polygon(name, color, x, y, points);
}
const diagonalAngle = (Math.atan2(600, 900) * 180) / Math.PI;
export function createTemplate(id = 'triband', palette = PALETTE) {
    if (!TEMPLATES.includes(id)) throw new Error('Unknown flag template');
    let layers;
    switch (id) {
        case 'solid':
            layers = [];
            break;
        case 'vertical':
            layers = [rect('Second field', 'secondary', 675, 300, 450, 600)];
            break;
        case 'horizontal':
            layers = [rect('Lower field', 'secondary', 450, 450, 900, 300)];
            break;
        case 'vertical-triband':
            layers = [
                rect('Middle band', 'supporting', 450, 300, 300, 600),
                rect('Second field', 'secondary', 750, 300, 300, 600),
            ];
            break;
        case 'diagonal':
            layers = [
                polygon('Lower diagonal field', 'secondary', 0, 0, [
                    [0, 600],
                    [900, 0],
                    [900, 600],
                ]),
            ];
            break;
        case 'diagonal-band':
            layers = [
                rect('Diagonal border', 'supporting', 450, 300, 1300, 200, -diagonalAngle),
                rect('Diagonal band', 'secondary', 450, 300, 1300, 130, -diagonalAngle),
            ];
            break;
        case 'saltire':
            layers = [
                rect('Descending diagonal', 'secondary', 450, 300, 1300, 100, diagonalAngle),
                rect('Ascending diagonal', 'secondary', 450, 300, 1300, 100, -diagonalAngle),
            ];
            break;
        case 'quarters':
            layers = [
                rect('First quarter', 'secondary', 225, 150, 450, 300),
                rect('Last quarter', 'secondary', 675, 450, 450, 300),
            ];
            break;
        case 'stripes':
            layers = [0, 1, 2].map((i) => rect(`Stripe ${i + 1}`, 'secondary', 450, 150 + i * 180, 900, 90));
            break;
        case 'triband':
            layers = [
                rect('Lower field', 'secondary', 450, 450, 900, 300),
                rect('Middle band', 'supporting', 450, 300, 900, 140),
            ];
            break;
        case 'nordic':
            layers = [
                rect('Horizontal border', 'supporting', 450, 300, 900, 130),
                rect('Vertical border', 'supporting', 320, 300, 130, 600),
                rect('Horizontal cross', 'secondary', 450, 300, 900, 76),
                rect('Vertical cross', 'secondary', 320, 300, 76, 600),
            ];
            break;
        case 'union':
            layers = [
                rect('Descending diagonal border', 'supporting', 450, 300, 1300, 104, diagonalAngle),
                rect('Ascending diagonal border', 'supporting', 450, 300, 1300, 104, -diagonalAngle),
                rect('Descending diagonal', 'secondary', 450, 290, 1300, 38, diagonalAngle),
                rect('Ascending diagonal', 'secondary', 450, 310, 1300, 38, -diagonalAngle),
                rect('Horizontal border', 'supporting', 450, 300, 900, 150),
                rect('Vertical border', 'supporting', 450, 300, 150, 600),
                rect('Horizontal cross', 'secondary', 450, 300, 900, 88),
                rect('Vertical cross', 'secondary', 450, 300, 88, 600),
            ];
            break;
        case 'canton':
            layers = [
                ...[0, 1, 2].map((i) => rect(`Stripe ${i + 1}`, 'supporting', 450, 150 + i * 180, 900, 70)),
                rect('Canton', 'secondary', 185, 170, 370, 340),
                star('Canton star', 'primary', 185, 170, 108),
            ];
            break;
        case 'sunrise':
            layers = [
                polygon('Lower diagonal field', 'secondary', 0, 0, [
                    [0, 600],
                    [900, 0],
                    [900, 600],
                ]),
                rect('Diagonal border', 'supporting', 450, 300, 1300, 45, -diagonalAngle),
                star('Sun', 'supporting', 225, 180, 95, 12, 0.73),
            ];
            break;
        case 'pall':
            layers = [
                polygon('Upper field', 'secondary', 0, 0, [
                    [0, 0],
                    [900, 0],
                    [900, 300],
                    [355, 300],
                ]),
            ];
            // Three joined bands form the Y, with a narrow colour inside its border.
            for (const [color, width] of [
                ['supporting', 125],
                ['primary', 70],
            ]) {
                for (const [name, x1, y1, x2, y2] of [
                    ['Upper branch', -100, -80, 370, 300],
                    ['Lower branch', -100, 680, 370, 300],
                    ['Fly band', 350, 300, 980, 300],
                ]) {
                    layers.push(
                        rect(
                            name + (color === 'supporting' ? ' border' : ''),
                            color,
                            (x1 + x2) / 2,
                            (y1 + y2) / 2,
                            Math.hypot(x2 - x1, y2 - y1) + width * 0.3,
                            width,
                            (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
                        ),
                    );
                }
            }
            break;
    }
    return validateRecipe({
        schemaVersion: VERSION,
        kind: 'flag',
        rendererVersion: RENDERER,
        assetLibrary: LIBRARY,
        name: id,
        customAssets: [],
        palette: { primary: palette.primary, secondary: palette.secondary, supporting: palette.supporting },
        flag: {
            width: SIZE[0],
            height: SIZE[1],
            background: 'primary',
            layers: layers.map((layer, i) => ({ ...layer, id: `layer-${i + 1}` })),
        },
    });
}
