import { MapRenderer } from '../../../map/renderer.js';
import { Camera } from './Camera.js';
import { MapInteractions } from './MapInteractions.js';
import { el, button } from '../dom.js';

/** Reusable sampled-geography preview. No API, game creation or persistence knowledge. */
export class GeographyPreview {
    constructor(scope) {
        // Keep keyboard/pointer gestures harmless before a first landscape is loaded.
        this.camera = new Camera(1, 1);
        this.canvas = el('canvas', {
            tabindex: 0,
            class: 'geography-canvas',
            'aria-label': 'Landscape preview. Drag to pan; use zoom controls or keyboard.',
        });
        this.detail = el('p', {
            class: 'geography-detail',
            text: 'Select a region to inspect its land cells.',
        });
        const fit = button('Fit world'),
            plus = button('+'),
            minus = button('−');
        plus.setAttribute('aria-label', 'Zoom in');
        minus.setAttribute('aria-label', 'Zoom out');
        const borders = el('input', { type: 'checkbox' });
        this.element = el(
            'div',
            { class: 'geography-preview' },
            this.canvas,
            el(
                'div',
                { class: 'geography-actions' },
                minus,
                plus,
                fit,
                el('label', {}, borders, ' Region boundaries'),
            ),
            this.detail,
        );
        this.borders = borders;
        scope.listen(fit, 'click', () => {
            this.camera?.fit();
            this.renderer?.invalidate();
        });
        scope.listen(plus, 'click', () => {
            this.camera?.zoomAt(1.35);
            this.renderer?.invalidate();
        });
        scope.listen(minus, 'click', () => {
            this.camera?.zoomAt(1 / 1.35);
            this.renderer?.invalidate();
        });
        scope.listen(borders, 'change', () => {
            if (this.state) this.state.layers.borders = borders.checked;
            this.renderer?.invalidate();
        });
        const camera = new Proxy(
            {},
            {
                get: (_, key) =>
                    typeof this.camera?.[key] === 'function'
                        ? this.camera[key].bind(this.camera)
                        : this.camera?.[key],
            },
        );
        new MapInteractions(
            this.canvas,
            camera,
            { invalidate: () => this.renderer?.invalidate() },
            { atScreen: (_, x, y) => this.renderer?.cellAtScreen(x, y) },
            scope,
            {
                select: (cell) => {
                    if (!cell) return;
                    const region = this.state.model.regionById.get(cell.regionId);
                    const land = region.cellIds.filter(
                        (id) => !['ocean', 'lake'].includes(this.state.model.cellById.get(id).terrain),
                    ).length;
                    this.detail.textContent = `${region.name} · ${land} of 19 cells are land · ${cell.terrain}`;
                },
            },
        );
        scope.own(() => this.renderer?.destroy());
    }
    show(model) {
        this.renderer?.destroy();
        this.state = {
            model,
            view: 'terrain',
            layers: {
                terrain: true,
                tiles: true,
                transitions: true,
                relief: true,
                rivers: true,
                borders: this.borders.checked,
                names: false,
            },
        };
        this.camera = new Camera(model.width, model.height);
        this.renderer = new MapRenderer(this.canvas, this.camera, () => this.state);
        this.camera.fit();
        this.renderer.invalidate();
        this.detail.textContent = 'Select a region to inspect its land cells.';
    }
}
