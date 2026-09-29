import { mapText as t } from './mapStrings.js';
import { GeographicRenderer as MapRenderer } from '../../../map/geographic-renderer.js';
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
            text: t('Select a region to inspect its land cells.'),
        });
        this.shoreSelect = el('select', { 'aria-label': 'Shore edge', hidden: true });
        this.shoreDetail = el('p', { class: 'geography-detail' });
        scope.listen(this.shoreSelect, 'change', () => this.inspectShore());
        const fit = button(t('Fit world')),
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
                el('label', {}, borders, t('Region boundaries')),
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
                    this.state.selectedCellId = cell.id;
                    this.renderer.invalidate();
                    const features = (this.state.model.atlas?.featuresByCell.get(cell.id) ?? []).map(
                        (id) => this.state.model.atlas.featureById.get(id).name,
                    );
                    const shores =
                        this.state.model.atlas?.coasts.shores.filter((s) => s.landId === cell.id) ?? [];
                    this.shoreSelect.replaceChildren(
                        ...shores.map((s) =>
                            el('option', { value: s.id, text: `${s.waterType} · ${s.waterId}` }),
                        ),
                    );
                    this.shoreSelect.hidden = !shores.length;
                    this.inspectShore();
                    const resources = Object.entries(cell.resourcePotential ?? {}).map(
                        ([key, p]) =>
                            `${key}: density ${p.density.toFixed(3)} · potential ${p.capacity.toFixed(3)}/season`,
                    );
                    this.detail.textContent = `${region.name} · ${land} of ${this.state.model.cellCount} cells are land · ${cell.biome ?? cell.terrain}\nElevation: ${cell.elevation.toFixed(1)} m\nTemperature index: ${cell.temperature.toFixed(3)} · moisture: ${cell.moisture.toFixed(3)}\nRainfall index: ${cell.rainfall.toFixed(3)}\nWater depth: ${(cell.waterDepth ?? Math.max(0, -cell.baseElevation)).toFixed(1)} m\n${features.join(' · ')}\n${resources.join('\n')}`;
                },
            },
        );
        scope.own(() => this.renderer?.destroy());
    }
    inspectShore() {
        const s = this.state?.model.atlas?.coasts.shoreById.get(this.shoreSelect.value);
        this.shoreDetail.textContent = s
            ? `Shore access: ${['Favourable', 'Limited', 'Difficult', 'Unsuitable'][s.accessGrade]}\nExposure: ${s.exposure.toFixed(3)}${s.truncated ? ' (map boundary limits estimate)' : ''}\nRise: ${s.shoreRise?.toFixed(1) ?? 'unknown'} · inland rise: ${s.inlandRise?.toFixed(1) ?? 'unknown'}\n${s.reasons.join(' · ')}`
            : '';
    }
    show(model, preserveView = false) {
        const previousCamera = preserveView ? this.camera.snapshot() : null;
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
                names: true,
            },
        };
        this.camera = new Camera(model.width, model.height);
        this.renderer = new MapRenderer(this.canvas, this.camera, () => this.state);
        this.camera.fit();
        if (previousCamera) this.camera.restore(previousCamera);
        this.renderer.invalidate();
        this.shoreSelect.replaceChildren();
        this.shoreSelect.hidden = true;
        this.shoreDetail.textContent = '';
        this.detail.textContent = t('Select a region to inspect its land cells.');
    }
}
