import { createTemplate, TEMPLATES } from './templates.js';
import { hitTest } from './renderer.js';
import { generatePalette, contrast } from './palettes.js';
import { SYMBOLS } from './catalog.js';
import { upgradeRecipe, validateRecipe, nextLayerId } from './recipe.js';

function random(seed) {
    let state = 2166136261;
    for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) | 0;
        return (state >>> 0) / 4294967296;
    };
}
function symbolPlacement(recipe) {
    const anchors = recipe.flag.layers.some((l) => l.name === 'Canton')
        ? [
              [185, 170],
              [450, 300],
          ]
        : [
              [450, 300],
              [225, 180],
              [675, 180],
              [225, 420],
              [675, 420],
          ];
    let best;
    for (const [x, y] of anchors) {
        const underneath = [
            [0, 0],
            [-65, -65],
            [65, -65],
            [-65, 65],
            [65, 65],
        ].map(([dx, dy]) => {
            const id = hitTest(recipe, x + dx, y + dy),
                value = recipe.flag.layers.find((l) => l.id === id)?.color ?? recipe.flag.background;
            return recipe.palette[value] ?? value;
        });
        for (const [color, hex] of Object.entries(recipe.palette)) {
            const score = Math.min(...underneath.map((background) => contrast(hex, background)));
            if (!best || score > best.score) best = { x, y, color, score };
        }
    }
    return { x: best.x, y: best.y, color: best.color, size: 175 };
}
export function addSymbol(input, symbolId, { x = 450, y = 300, size = 175, color = 'supporting' } = {}) {
    const recipe = upgradeRecipe(input);
    recipe.flag.layers.push({
        id: nextLayerId(recipe),
        name:
            SYMBOLS.find((s) => s.id === symbolId)?.name ??
            recipe.customAssets.find((s) => s.id === symbolId)?.name ??
            'Symbol',
        role: 'emblem',
        shape: 'symbol',
        color,
        visible: true,
        x,
        y,
        scale: 1,
        rotation: 0,
        flipX: false,
        geometry: { symbolId, width: size, height: size },
    });
    return validateRecipe(recipe);
}
export function randomize(input, part, seed) {
    const current = upgradeRecipe(input),
        rnd = random(seed),
        pick = (list) => list[Math.floor(rnd() * list.length)];
    if (part === 'colors') {
        current.palette = generatePalette(rnd);
        return current;
    }
    if (part === 'shapes') {
        const symbols = current.flag.layers.filter((l) => l.role === 'emblem');
        const allowed = TEMPLATES.filter((id) => !['canton', 'sunrise', 'solid'].includes(id));
        let result;
        // Keep symbol transforms and colours exactly; only replace the background/geometry.
        for (let tries = 0; tries < 20; tries++) {
            result = createTemplate(pick(allowed), current.palette);
            if (
                JSON.stringify(result.flag.layers) !==
                JSON.stringify(current.flag.layers.filter((l) => l.role === 'shape'))
            )
                break;
        }
        result.name = current.name;
        result.customAssets = current.customAssets;
        const used = new Set(symbols.map((l) => l.id));
        result.flag.layers.forEach((l, i) => {
            let n = i + 1;
            while (used.has(`layer-${n}`)) n++;
            l.id = `layer-${n}`;
            used.add(l.id);
        });
        result.flag.layers.push(...symbols);
        return validateRecipe(result);
    }
    if (part === 'emblem') {
        const existing = current.flag.layers.find((l) => l.role === 'emblem');
        current.flag.layers = current.flag.layers.filter((l) => l.role !== 'emblem');
        const available = SYMBOLS.filter((s) => s.id !== existing?.geometry.symbolId);
        const symbol = pick(available);
        const location = existing
            ? { x: existing.x, y: existing.y, size: existing.geometry.width ?? 175, color: existing.color }
            : symbolPlacement(current);
        const result = addSymbol(current, symbol.id, location);
        if (existing)
            Object.assign(result.flag.layers.at(-1), {
                scale: existing.scale,
                rotation: existing.rotation,
                flipX: existing.flipX,
                visible: existing.visible,
            });
        return result;
    }
    throw new Error('Unknown randomization part');
}
export function generateSamples(recipe, seed, locks = { palette: true, shapes: false, emblem: true }) {
    const seen = new Set();
    return Array.from({ length: 6 }, (_, i) => {
        let result;
        for (let attempt = 0; attempt < 24; attempt++) {
            const token = `${seed}:${i}:${attempt}`;
            result = upgradeRecipe(recipe);
            if (!locks.shapes) result = randomize(result, 'shapes', `${token}:shapes`);
            if (!locks.palette) result = randomize(result, 'colors', `${token}:colors`);
            if (!locks.emblem) result = randomize(result, 'emblem', `${token}:emblem`);
            const key = JSON.stringify([result.flag, result.palette]);
            if (!seen.has(key) || (locks.shapes && locks.palette && locks.emblem)) {
                seen.add(key);
                break;
            }
        }
        return result;
    });
}
