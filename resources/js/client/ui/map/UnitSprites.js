import { recolorUnitPixels, unitPalette, unitMarking } from './unitPalette.js';
const urls = import.meta.glob('../../assets/units/miniatures-v1/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
});

/** Replaceable artwork. Missing/failed sprites leave readable flat type tokens. */
export class UnitSprites {
    images = new Map();
    cache = new Map();
    constructor(scope, invalidate) {
        for (const [path, url] of Object.entries(urls)) {
            const type = path.split('/').at(-1).replace('.png', '');
            const image = new Image();
            const release = scope.own(() => {
                image.onload = null;
                image.onerror = null;
                if (!image.complete) image.src = '';
            });
            image.onload = () => {
                release();
                if (!scope.closed) {
                    this.images.set(type, image);
                    invalidate();
                }
            };
            image.onerror = release;
            image.src = url;
        }
        scope.own(() => {
            this.images.clear();
            this.cache.clear();
        });
    }
    get(type, palette) {
        const source = this.images.get(type);
        if (!source) return null;
        const colors = unitPalette(palette);
        const key = JSON.stringify([type, colors]);
        if (this.cache.has(key)) return this.cache.get(key);
        const surface = document.createElement('canvas');
        surface.width = surface.height = 160;
        const ctx = surface.getContext('2d');
        ctx.drawImage(source, 0, 0, 160, 160);
        const pixels = ctx.getImageData(0, 0, 160, 160);
        recolorUnitPixels(pixels.data, colors, ['Fighter', 'Bomber'].includes(type), (index) =>
            unitMarking(type, (index % 160) / 160, Math.floor(index / 160) / 160),
        );
        ctx.putImageData(pixels, 0, 0);
        if (this.cache.size >= 20) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, surface);
        return surface;
    }
}
