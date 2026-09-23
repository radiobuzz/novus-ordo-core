/** Shared canvas renderer, owned by its viewport scope. */
export class CanvasRenderer {
    #frame = null;
    constructor(canvas, camera, context, scope, onChange) {
        Object.assign(this, { canvas, camera, context, scope, onChange });
        this.images = {};
        this.ctx = canvas.getContext('2d');
        if (!this.ctx) throw new Error('Your browser could not create a map canvas. Use the territory list.');
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 3);
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            camera.resize(rect.width, rect.height);
            this.invalidate();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        scope.own(() => observer.disconnect());
        scope.listen(window, 'resize', resize);
        // Theme switches affect CSS and canvas through the same semantic tokens.
        const theme = new MutationObserver(() => this.invalidate());
        theme.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style', 'data-theme'],
        });
        scope.own(() => theme.disconnect());
        scope.own(() => {
            if (this.#frame !== null) cancelAnimationFrame(this.#frame);
        });
        resize();
    }
    async loadImages(urls) {
        const results = await Promise.all(
            Object.entries(urls).map(
                ([key, url]) =>
                    new Promise((resolve) => {
                        const image = new Image();
                        let complete = false;
                        const finish = (ok) => {
                            if (complete) return;
                            complete = true;
                            release();
                            if (ok && !this.scope.closed) this.images[key] = image;
                            resolve(ok);
                            this.invalidate();
                        };
                        const timeout = setTimeout(() => finish(false), 12000);
                        const release = this.scope.own(() => {
                            clearTimeout(timeout);
                            image.onload = null;
                            image.onerror = null;
                            if (!complete) {
                                complete = true;
                                image.src = '';
                                resolve(false);
                            }
                        });
                        image.onload = () => finish(true);
                        image.onerror = () => finish(false);
                        image.src = url;
                    }),
            ),
        );
        return results.every(Boolean);
    }
    invalidate() {
        if (this.scope.closed || this.#frame !== null) return;
        this.#frame = requestAnimationFrame(() => {
            this.#frame = null;
            if (!this.scope.closed) this.draw();
        });
    }
    draw() {
        const { ctx, canvas, camera } = this;
        const css = getComputedStyle(canvas);
        const color = (key) => css.getPropertyValue(`--map-${key}`).trim();
        const palette = Object.fromEntries(
            ['ocean', 'land', 'own', 'foreign', 'border', 'selection', 'text'].map((key) => [
                key,
                color(key),
            ]),
        );
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = palette.ocean;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const rx = canvas.width / camera.width,
            ry = canvas.height / camera.height;
        camera.applyTransform(ctx, rx, ry);
        const context = { ...this.context, ctx, camera, images: this.images, palette };
        for (const layer of this.context.layers) {
            if (layer.id === 'borders')
                for (const underlay of this.context.underlays ?? []) {
                    ctx.save();
                    underlay(ctx, this);
                    ctx.restore();
                }
            if (layer.visible) {
                ctx.save();
                layer.draw(context);
                ctx.restore();
            }
        }
        for (const overlay of this.context.overlays ?? []) {
            ctx.save();
            overlay(ctx, this);
            ctx.restore();
        }
        this.onChange?.();
    }
}
