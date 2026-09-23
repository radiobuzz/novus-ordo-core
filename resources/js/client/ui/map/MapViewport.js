import { el, button } from '../dom.js';
import { Camera } from './Camera.js';
import { MapPicker } from './MapPicker.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { MapInteractions } from './MapInteractions.js';
import { HexMapPicker, HexMapRenderer } from './HexMap.js';

/** Caller supplies layers, data, and the meaning of selection. */
export class MapViewport {
    static connect({ canvas, camera, context, scope, onChange, onSelect, tool }) {
        const Renderer = context.definition.model ? HexMapRenderer : CanvasRenderer;
        const renderer = new Renderer(canvas, camera, context, scope, onChange);
        new MapInteractions(canvas, camera, renderer, context.picker, scope, tool ?? { select: onSelect });
        return renderer;
    }
    constructor({
        scope,
        i18n,
        definition,
        territories,
        layers,
        images,
        onSelect,
        savedCamera,
        context = {},
    }) {
        this.camera = new Camera(definition.width, definition.height);
        this.picker = definition.model
            ? new HexMapPicker(territories, definition)
            : new MapPicker(territories, definition);
        this.canvas = el('canvas', { class: 'world-canvas', tabindex: 0 });
        i18n.bind(scope, this.canvas, 'map.label', {}, 'aria-label');
        const zoom = el('span', { class: 'zoom-value' });
        const plus = button('+'),
            minus = button('−'),
            fit = i18n.bind(scope, button(''), 'map.fit');
        i18n.bind(scope, plus, 'map.zoomIn', {}, 'aria-label');
        i18n.bind(scope, minus, 'map.zoomOut', {}, 'aria-label');
        const notice = i18n.bind(scope, el('p', { class: 'map-notice', role: 'status' }), 'map.loading');
        this.element = el(
            'section',
            { class: 'map-viewport' },
            this.canvas,
            el('div', { class: 'map-controls' }, minus, zoom, plus, fit),
            notice,
        );
        this.context = { ...context, definition, territories, layers, picker: this.picker };
        try {
            this.renderer = MapViewport.connect({
                canvas: this.canvas,
                camera: this.camera,
                context: this.context,
                scope,
                onChange: () => {
                    zoom.textContent = `${Math.round(this.camera.zoom * 100)}%`;
                },
                onSelect,
            });
            this.camera.restore(savedCamera);
            // This component may be constructed before its caller mounts it.
            // Fit/restore again with real bounds, not the camera's 1px defaults.
            scope.timeout(() => {
                const bounds = this.canvas.getBoundingClientRect();
                if (!bounds.width || !bounds.height) return;
                this.camera.resize(bounds.width, bounds.height);
                this.camera.restore(savedCamera);
                this.invalidate();
            }, 0);
            scope.listen(plus, 'click', () => {
                this.camera.zoomAt(1.35);
                this.invalidate();
            });
            scope.listen(minus, 'click', () => {
                this.camera.zoomAt(1 / 1.35);
                this.invalidate();
            });
            scope.listen(fit, 'click', () => {
                this.camera.fit();
                this.invalidate();
            });
            void this.renderer.loadImages(images).then((ok) => {
                if (scope.closed) return;
                notice.hidden = ok;
                if (!ok) i18n.bind(scope, notice, 'map.failed');
            });
        } catch {
            i18n.bind(scope, notice, 'map.failed');
        }
    }
    invalidate() {
        this.renderer?.invalidate();
    }
}
