import { symbolById } from './catalog.js';

// Resolved flag data. No DOM, templates, network, or game-state dependency.
export const VERSION = 2;
export const RENDERER = 'flag-canvas-v2';
export const LIBRARY = 'flag-geometry-v1';
export const SIZE = Object.freeze([900, 600]);
export const MAX_RECIPE_BYTES = 500_000;
export const MAX_LAYERS = 64;
export const PALETTE = Object.freeze({ primary: '#173f4f', secondary: '#e5b85c', supporting: '#f4eee0' });
export const SHAPES = Object.freeze(['rect', 'ellipse', 'polygon', 'crescent', 'symbol']);
const slots = Object.keys(PALETTE);
const hex = /^#[0-9a-f]{6}$/i;

export class RecipeError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RecipeError';
        this.code = code;
    }
}
function require(condition, code = 'invalidRecipe') {
    if (!condition) throw new RecipeError(code);
}
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, keys) {
    require(object(value));
    require(Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)));
}
function number(value, min, max) {
    require(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
    return value;
}
function label(value, max = 80) {
    require(typeof value === 'string' && value.length <= max);
    return value;
}
function color(value, allowSlot = true) {
    require(typeof value === 'string' && ((allowSlot && slots.includes(value)) || hex.test(value)));
    return value.toLowerCase();
}
export function validateRecipe(input) {
    require(object(input));
    const legacy = input.schemaVersion === 1 && input.rendererVersion === 'flag-canvas-v1';
    require((legacy || (input.schemaVersion === VERSION && input.rendererVersion === RENDERER)) &&
        input.assetLibrary === LIBRARY, 'unsupportedVersion');
    exact(input, [
        'schemaVersion',
        'kind',
        'rendererVersion',
        'assetLibrary',
        'name',
        'palette',
        'flag',
        ...(legacy ? [] : ['customAssets']),
    ]);
    const customAssets = legacy ? [] : validateAssets(input.customAssets);
    require(input.kind === 'flag');
    exact(input.palette, slots);
    const palette = Object.fromEntries(slots.map((k) => [k, color(input.palette[k], false)]));
    exact(input.flag, ['width', 'height', 'background', 'layers']);
    require(input.flag.width === SIZE[0] && input.flag.height === SIZE[1]);
    require(Array.isArray(input.flag.layers) && input.flag.layers.length <= MAX_LAYERS);
    const ids = new Set();
    const layers = input.flag.layers.map((layer) => {
        exact(layer, [
            'id',
            'name',
            'shape',
            'color',
            'visible',
            'x',
            'y',
            'scale',
            'rotation',
            'flipX',
            'geometry',
            ...(legacy ? [] : ['role']),
        ]);
        require(
            typeof layer.id === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(layer.id) && !ids.has(layer.id),
        );
        ids.add(layer.id);
        if (!legacy) require(['shape', 'emblem'].includes(layer.role));
        require(SHAPES.includes(layer.shape) && (!legacy || layer.shape !== 'symbol'));
        require(typeof layer.visible === 'boolean' && typeof layer.flipX === 'boolean');
        let geometry;
        if (layer.shape === 'polygon') {
            exact(layer.geometry, ['points']);
            require(
                Array.isArray(layer.geometry.points) &&
                    layer.geometry.points.length >= 3 &&
                    layer.geometry.points.length <= 64,
            );
            geometry = {
                points: layer.geometry.points.map((point) => {
                    require(Array.isArray(point) && point.length === 2);
                    return point.map((v) => number(v, -1800, 1800));
                }),
            };
        } else {
            exact(
                layer.geometry,
                layer.shape === 'symbol' ? ['width', 'height', 'symbolId'] : ['width', 'height'],
            );
            geometry = {
                width: number(layer.geometry.width, 1, 2400),
                height: number(layer.geometry.height, 1, 2400),
            };
            if (layer.shape === 'symbol') {
                require(
                    typeof layer.geometry.symbolId === 'string' &&
                        Boolean(
                            symbolById(layer.geometry.symbolId) ||
                                customAssets.find((a) => a.id === layer.geometry.symbolId),
                        ),
                );
                geometry.symbolId = layer.geometry.symbolId;
            }
        }
        return {
            id: layer.id,
            ...(legacy ? {} : { role: layer.role }),
            name: label(layer.name),
            shape: layer.shape,
            color: color(layer.color),
            visible: layer.visible,
            x: number(layer.x, -900, 1800),
            y: number(layer.y, -600, 1200),
            scale: number(layer.scale, 0.05, 4),
            rotation: number(layer.rotation, -180, 180),
            flipX: layer.flipX,
            geometry,
        };
    });
    return {
        schemaVersion: input.schemaVersion,
        kind: 'flag',
        rendererVersion: input.rendererVersion,
        assetLibrary: LIBRARY,
        ...(legacy ? {} : { customAssets }),
        name: label(input.name),
        palette,
        flag: { width: SIZE[0], height: SIZE[1], background: color(input.flag.background), layers },
    };
}
export function serializeRecipe(recipe) {
    const clean = validateRecipe(recipe);
    const pretty = JSON.stringify(clean, null, 2);
    if (new TextEncoder().encode(pretty).byteLength <= MAX_RECIPE_BYTES) return pretty;
    const compact = JSON.stringify(clean);
    require(new TextEncoder().encode(compact).byteLength <= MAX_RECIPE_BYTES, 'tooLarge');
    return compact;
}
export function parseRecipe(source) {
    require(typeof source === 'string' &&
        new TextEncoder().encode(source).byteLength <= MAX_RECIPE_BYTES, 'tooLarge');
    let value;
    try {
        value = JSON.parse(source);
    } catch {
        throw new RecipeError('invalidRecipe');
    }
    return validateRecipe(value);
}
export function resolveColor(value, palette) {
    return palette[value] ?? value;
}

export function validateAssets(assets) {
    require(Array.isArray(assets) && assets.length <= 8);
    const ids = new Set();
    return assets.map((asset) => {
        exact(asset, ['id', 'name', 'viewBox', 'paths']);
        require(
            typeof asset.id === 'string' && /^custom-[a-z0-9-]{1,40}$/.test(asset.id) && !ids.has(asset.id),
        );
        ids.add(asset.id);
        require(Array.isArray(asset.viewBox) && asset.viewBox.length === 4);
        const viewBox = asset.viewBox.map((v, i) => number(v, i < 2 ? -10000 : 0.01, 10000));
        require(Array.isArray(asset.paths) && asset.paths.length > 0 && asset.paths.length <= 100);
        let totalLength = 0;
        const paths = asset.paths.map((p) => {
            exact(p, ['d', 'matrix', 'fill', 'stroke', 'strokeWidth', 'fillRule', 'opacity']);
            require(
                typeof p.d === 'string' &&
                    /^[Mm]/.test(p.d) &&
                    /^[MmLlHhVvCcSsQqTtAaZzEe0-9.,+\-\s]+$/.test(p.d),
            );
            totalLength += p.d.length;
            require(totalLength <= 50000);
            for (const token of p.d.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) ?? [])
                number(Number(token), -100000, 100000);
            require(Array.isArray(p.matrix) && p.matrix.length === 6);
            require(typeof p.fill === 'boolean' && typeof p.stroke === 'boolean');
            require(['nonzero', 'evenodd'].includes(p.fillRule));
            return {
                d: p.d,
                matrix: p.matrix.map((v) => number(v, -10000, 10000)),
                fill: p.fill,
                stroke: p.stroke,
                strokeWidth: number(p.strokeWidth, 0, 1000),
                fillRule: p.fillRule,
                opacity: number(p.opacity, 0, 1),
            };
        });
        return { id: asset.id, name: label(asset.name), viewBox, paths };
    });
}
export function upgradeRecipe(recipe) {
    const copy = validateRecipe(recipe);
    return validateRecipe({
        ...copy,
        schemaVersion: VERSION,
        rendererVersion: RENDERER,
        customAssets: copy.customAssets ?? [],
        flag: {
            ...copy.flag,
            layers: copy.flag.layers.map((l) => ({
                ...l,
                role: l.role ?? (['Sun', 'Canton star'].includes(l.name) ? 'emblem' : 'shape'),
            })),
        },
    });
}
export function nextLayerId(recipe) {
    let i = 1;
    while (recipe.flag.layers.some((l) => l.id === `layer-${i}`)) i++;
    return `layer-${i}`;
}
