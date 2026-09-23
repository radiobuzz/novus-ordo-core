import { SIZE, faces, hair, clothes, accessoryStyles, accessoryFor } from './catalog.js';
import { cropRectangle } from './recipe.js';
import { isFitted, placements, faceRigs, fittedAsset, clothingTransform, transformPoint } from './fitting.js';
import { drawLenses } from './lenses.js';

const atlasUrl = new URL('./assets/portrait-atlas-v1.png', import.meta.url).href;
const expansionUrl = new URL('./assets/portrait-expansion-01.png', import.meta.url).href;
const accessoryExpansionUrl = new URL('./assets/accessory-expansion-01.png', import.meta.url).href;
const fittedGlassesUrl = new URL('./assets/glasses-front-fit-v1.png', import.meta.url).href;
const collectionUrls = import.meta.glob('./assets/collection-03/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
});
export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('The portrait image could not be decoded.'));
        image.src = url;
    });
}
function canvas() {
    const result = document.createElement('canvas');
    [result.width, result.height] = SIZE;
    return result;
}

// Material ramps preserve the painting's light/shadow and original alpha.
// This lives in the compositor: no generated art is destructively rewritten.
function tint(surface, color, midpoint) {
    const context = surface.getContext('2d');
    const pixels = context.getImageData(0, 0, ...SIZE);
    const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
    for (let i = 0; i < pixels.data.length; i += 4) {
        if (!pixels.data[i + 3]) continue;
        const light =
            (pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722) / 255;
        for (let channel = 0; channel < 3; channel++) {
            const base = rgb[channel];
            pixels.data[i + channel] =
                light <= midpoint
                    ? (base * light) / midpoint
                    : base + (255 - base) * ((light - midpoint) / (1 - midpoint));
        }
    }
    context.putImageData(pixels, 0, 0);
}

export class PortraitRenderer {
    cache = new Map();
    async ready() {
        const [original, expansion, accessoryExpansion, fittedGlasses] = await Promise.all([
            loadImage(atlasUrl),
            loadImage(expansionUrl),
            loadImage(accessoryExpansionUrl),
            loadImage(fittedGlassesUrl),
        ]);
        this.atlases = { original, expansion, accessoryExpansion, fittedGlasses };
        const entries = Object.entries(collectionUrls);
        // Decode in bounded groups to avoid spiking memory while loading a batch.
        for (let i = 0; i < entries.length; i += 4) {
            await Promise.all(
                entries.slice(i, i + 4).map(async ([path, url]) => {
                    this.atlases[path.split('/').at(-1).replace('.png', '')] = await loadImage(url);
                }),
            );
        }
    }
    layer(asset, colors) {
        const key = JSON.stringify([asset, colors[asset.material], asset.accent ? colors.accent : null]);
        if (this.cache.has(key)) return this.cache.get(key);
        const surface = canvas();
        const context = surface.getContext('2d');
        const atlas = this.atlases[asset.atlas ?? 'original'];
        // Extend the painted neck beneath open collars; opaque clothing covers
        // the outer extension, and the original head covers its upper edge.
        if (asset.neck) context.drawImage(atlas, ...asset.neck.source, ...asset.neck.target);
        context.drawImage(atlas, ...asset.source, ...asset.target);
        const sourceMask = (path) => {
            const mask = new Path2D();
            const [sx, sy, sw, sh] = asset.source;
            const [x, y, w, h] = asset.target;
            mask.addPath(
                new Path2D(path),
                new DOMMatrix([w / sw, 0, 0, h / sh, x - (sx * w) / sw, y - (sy * h) / sh]),
            );
            return mask;
        };
        if (asset.eraseSource) {
            context.save();
            context.clip(sourceMask(asset.eraseSource));
            context.clearRect(0, 0, ...SIZE);
            context.restore();
        }
        if (asset.material) {
            const original = canvas();
            original.getContext('2d').drawImage(surface, 0, 0);
            tint(surface, colors[asset.material], asset.material === 'hair' ? 0.22 : 0.46);
            if (asset.neutral || asset.neutralSource) {
                context.save();
                context.clip(
                    asset.neutralSource ? sourceMask(asset.neutralSource) : new Path2D(asset.neutral),
                );
                context.clearRect(0, 0, ...SIZE);
                context.drawImage(original, 0, 0);
                context.restore();
            }
            if (asset.fabricSource) {
                context.save();
                const inverse = new Path2D('M 0 0 H 512 V 600 H 0 Z');
                inverse.addPath(sourceMask(asset.fabricSource));
                context.clip(inverse, 'evenodd');
                context.clearRect(0, 0, ...SIZE);
                context.drawImage(original, 0, 0);
                context.restore();
            }
            if (asset.accent) {
                tint(original, colors.accent, 0.46);
                context.save();
                context.clip(new Path2D(asset.accent));
                context.clearRect(0, 0, ...SIZE);
                context.drawImage(original, 0, 0);
                context.restore();
            }
        }
        if (this.cache.size >= 48) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, surface);
        return surface;
    }
    draw(target, recipe, { customImage, only = 'all', guides = false } = {}) {
        const context = target.getContext('2d');
        context.save();
        context.setTransform(target.width / SIZE[0], 0, 0, target.height / SIZE[1], 0, 0);
        context.clearRect(0, 0, ...SIZE);
        const gradient = context.createRadialGradient(210, 180, 10, 250, 290, 450);
        gradient.addColorStop(0, recipe.colors.background);
        gradient.addColorStop(1, '#11181e');
        context.fillStyle = gradient;
        context.fillRect(0, 0, ...SIZE);
        if (recipe.mode === 'custom') {
            if (!customImage) throw new Error('Custom image is not loaded.');
            context.drawImage(
                customImage,
                ...cropRectangle(customImage.width, customImage.height, recipe.crop),
                0,
                0,
                ...SIZE,
            );
        } else if (isFitted(recipe)) {
            for (const { category, asset, transform } of placements(recipe)) {
                if (only !== 'all' && only !== category) continue;
                context.save();
                if (category === 'clothing' && asset.headInFront && only === 'all') {
                    // Keep rear collar tips behind the jaw without painting the
                    // semi-transparent face twice or cutting the neck flat.
                    const rig = faceRigs[recipe.face],
                        [x, y] = rig.chin,
                        half = rig.jaw / 2;
                    const mask = new Path2D(`M 0 0 H 512 V 600 H 0 Z
                        M 0 0 H 512 V ${y - 85} H ${x + half}
                        Q ${x + half * 0.84} ${y - 8} ${x} ${y}
                        Q ${x - half * 0.84} ${y - 8} ${x - half} ${y - 85} H 0 Z`);
                    context.clip(mask, 'evenodd');
                }
                context.translate(transform.tx, transform.ty);
                context.scale(transform.sx, transform.sy);
                if (asset.lensPath) drawLenses(context, asset, recipe.lenses);
                context.drawImage(this.layer(asset, recipe.colors), 0, 0);
                context.restore();
            }
            if (guides) this.drawGuides(context, recipe);
        } else {
            const draw = (asset) => {
                if (asset?.source) context.drawImage(this.layer(asset, recipe.colors), 0, 0);
            };
            if (only === 'all' || only === 'face') draw(faces.find((entry) => entry.id === recipe.face));
            if (only === 'all' || only === 'clothing')
                draw(clothes.find((entry) => entry.id === recipe.clothing));
            if (only === 'all' || only === 'hair') draw(hair.find((entry) => entry.id === recipe.hair));
            if (only === 'all' || only === 'accessories') {
                for (const key of Object.keys(accessoryStyles)) {
                    if (!recipe.accessories[key]) continue;
                    const asset = accessoryFor(recipe, key);
                    draw(
                        asset.targets?.[recipe.clothing]
                            ? { ...asset, target: asset.targets[recipe.clothing] }
                            : asset,
                    );
                }
            }
        }
        context.restore();
    }
    drawGuides(context, recipe) {
        const rig = faceRigs[recipe.face];
        const collar = fittedAsset(recipe, 'clothing').collar;
        const points = [
            ['eye L', rig.eyes[0]],
            ['eye R', rig.eyes[1]],
            ['nose', rig.nose],
            ['mouth', rig.mouth],
            ['chin', rig.chin],
            ['scalp L', rig.scalp[0]],
            ['scalp R', rig.scalp[1]],
            ...(collar ? [['collar', transformPoint(collar.point, clothingTransform(recipe))]] : []),
        ];
        context.save();
        context.font = '11px sans-serif';
        context.lineWidth = 1.5;
        for (const [label, [x, y]] of points) {
            context.strokeStyle = '#ffe2a1';
            context.fillStyle = '#131a20';
            context.beginPath();
            context.arc(x, y, 3, 0, Math.PI * 2);
            context.fill();
            context.stroke();
            const width = context.measureText(label).width;
            context.fillRect(x + 6, y - 13, width + 5, 15);
            context.fillStyle = '#ffe2a1';
            context.fillText(label, x + 8, y - 2);
        }
        context.restore();
    }
    dispose() {
        this.cache.clear();
        this.atlases = null;
    }
}
