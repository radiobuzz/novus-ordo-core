import './map-layers.scss';
import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { RangeField } from '../../ui/RangeField.js';
import { MapRenderer } from '../../../map/renderer.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { Camera } from '../../ui/map/Camera.js';
import { MapInteractions } from '../../ui/map/MapInteractions.js';
import { GeographicRenderer } from '../../../map/geographic-renderer.js';
import { traceHex, neighborCoordinates, axialKey } from '../../../map/hex.js';
import { restoreMap } from '../../../map/snapshot.js';
import { defaultProfiles } from '../../../map/resources.js';
import { defenseGradientCss } from '../../ui/map/defenseHeatmap.js';
import { groups, catalogue, decorations, available, resourceLayers } from './catalogue.js';
import { layerDisplay } from '../../ui/map/analysis/display.js';
import { makeSamples, valuesFor, analysisStyle } from './data.js';

class LabRenderer extends GeographicRenderer {
    constructor(lab) {
        super(
            lab.canvas,
            lab.camera,
            () => lab.mapState,
            () => lab.updateDetailStatus(),
        );
        this.lab = lab;
    }
    drawFeatures(ctx, state, cells) {
        super.drawFeatures(ctx, state, cells);
        if (!state.layers.names) this.drawRegionNames(ctx, state);
    }
    drawRegionNames(ctx, state) {
        if (!this.lab.appearance.territoryNames) return;
        ctx.save();
        ctx.globalAlpha = this.lab.appearance.namesOpacity;
        const regions = state.model.regions.filter(
            (r) =>
                this.lab.appearance.ocean ||
                r.cellIds.some((id) => state.model.cellById.get(id).terrain !== 'ocean'),
        );
        MapRenderer.prototype.drawRegionNames.call(this, ctx, {
            ...state,
            model: { ...state.model, regions },
        });
        ctx.restore();
    }
    drawMicroGrid(ctx, state, cells) {
        ctx.save();
        ctx.globalAlpha = this.lab.appearance.microGridOpacity;
        super.drawMicroGrid(
            ctx,
            state,
            cells.filter((c) => this.lab.appearance.ocean || c.terrain !== 'ocean'),
            false,
        );
        ctx.restore();
    }
    drawRegionBorders(ctx, state, cells) {
        ctx.save();
        ctx.globalAlpha = this.lab.appearance.bordersOpacity;
        super.drawRegionBorders(
            ctx,
            state,
            cells.filter((c) => this.lab.appearance.ocean || c.terrain !== 'ocean'),
            false,
        );
        ctx.restore();
    }
    drawWater(ctx, state, blended) {
        // Coastlines are rendered separately so river opacity never controls shores.
        ctx.save();
        ctx.globalAlpha = this.lab.appearance.riversOpacity;
        super.drawWater(ctx, { ...state, layers: { ...state.layers, terrain: false } }, blended);
        ctx.restore();
    }
    drawUnderlay(ctx, state) {
        super.drawUnderlay(ctx, state);
        const { lab } = this;
        const cells = this.visibleCells(state.model);
        // Ocean off is a true display switch: conceal the fill even after detailed terrain drawing.
        if (!lab.appearance.ocean || !lab.appearance.landscape) {
            ctx.save();
            for (const cell of cells) {
                if (cell.terrain !== 'ocean' && !(cell.terrain === 'lake' && !lab.appearance.landscape))
                    continue;
                ctx.beginPath();
                traceHex(ctx, cell.x, cell.y, state.model.cellSize * 1.015);
                ctx.fillStyle =
                    cell.terrain === 'ocean' && !lab.appearance.ocean ? '#101f2a' : cell.terrainColor;
                ctx.fill();
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = state.model.cellSize * 0.08;
                ctx.stroke();
            }
            ctx.restore();
        }
        if (['none', 'shore'].includes(lab.active.scale)) return;
        ctx.save();
        ctx.globalAlpha = lab.opacity;
        for (const cell of cells) {
            const value = lab.values.get(cell.id),
                colour = lab.style.colour(value);
            if (!colour && (lab.active.source !== 'sample' || ['ocean', 'lake'].includes(cell.terrain)))
                continue;
            ctx.beginPath();
            traceHex(ctx, cell.x, cell.y, state.model.cellSize);
            ctx.fillStyle = colour ?? '#424b50';
            ctx.fill();
            if (!colour) {
                ctx.save();
                ctx.clip();
                ctx.strokeStyle = '#879096';
                ctx.lineWidth = 1 / this.camera.zoom;
                ctx.beginPath();
                ctx.moveTo(cell.x - state.model.cellSize, cell.y + state.model.cellSize);
                ctx.lineTo(cell.x + state.model.cellSize, cell.y - state.model.cellSize);
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.restore();
    }
    drawWorldOverlays(ctx, state) {
        const { lab } = this;
        ctx.save();
        ctx.globalAlpha = lab.opacity;
        super.drawWorldOverlays(ctx, lab.active.id === 'coast' ? { ...state, view: 'coast' } : state);
        ctx.restore();
        if (lab.appearance.coastlines && !['coast', 'exposure'].includes(lab.active.id)) {
            ctx.save();
            ctx.globalAlpha = lab.appearance.coastlinesOpacity;
            ctx.strokeStyle = '#c1d7d5';
            ctx.lineWidth = 1.3 / this.camera.zoom;
            ctx.beginPath();
            for (const shore of state.model.atlas.coasts.shores) {
                ctx.moveTo(shore.edge[0].x, shore.edge[0].y);
                ctx.lineTo(shore.edge[1].x, shore.edge[1].y);
            }
            ctx.stroke();
            ctx.restore();
        }
        if (lab.appearance.nationalBorders && lab.context.value === 'governing') {
            ctx.save();
            ctx.globalAlpha = lab.appearance.nationalBordersOpacity;
            ctx.strokeStyle = '#f1d38d';
            ctx.lineWidth = 2 / this.camera.zoom;
            ctx.stroke(lab.nationalBorderPath);
            ctx.restore();
        }
        if (lab.active.id === 'exposure') {
            ctx.save();
            ctx.globalAlpha = lab.opacity;
            ctx.lineWidth = 3 / this.camera.zoom;
            for (const shore of state.model.atlas.coasts.shores) {
                ctx.strokeStyle = lab.style.colour(shore.exposure);
                ctx.beginPath();
                ctx.moveTo(shore.edge[0].x, shore.edge[0].y);
                ctx.lineTo(shore.edge[1].x, shore.edge[1].y);
                ctx.stroke();
            }
            ctx.restore();
        }
    }
    drawScreenOverlays(ctx, state, camera) {
        super.drawScreenOverlays(ctx, state, camera);
        const { lab } = this;
        if (lab.context.value !== 'governing') return;
        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [index, region] of state.model.regions.entries()) {
            const sample = lab.samples.get(region.id);
            if (!sample.own || !sample.land || index % 11 !== 0) continue;
            const p = camera.worldToScreen(region.x, region.y);
            if (lab.decorations.get('units').checked) {
                ctx.globalAlpha = lab.appearance.unitsOpacity;
                ctx.fillStyle = '#15282b';
                ctx.fillRect(p.x - 12, p.y - 9, 24, 18);
                ctx.strokeStyle = '#e5d19b';
                ctx.strokeRect(p.x - 12, p.y - 9, 24, 18);
                ctx.fillStyle = '#e5d19b';
                ctx.fillText(String(sample.forces), p.x, p.y);
            }
            if (lab.decorations.get('battles').checked && index % 3 === 0) {
                ctx.globalAlpha = lab.appearance.battlesOpacity;
                ctx.fillStyle = '#e79c89';
                ctx.fillText('×', p.x + 18, p.y - 14);
            }
        }
        ctx.restore();
    }
}

export class MapLayersLab extends Component {
    constructor(locale = 'en', { onClose, onLocale } = {}) {
        super({ featureId: 'map-layers-lab' });
        this.locale = locale;
        this.onClose = onClose;
        this.onLocale = onLocale;
        this.labels = [];
        this.active = catalogue[0];
        this.opacity = 0.72;
        this.category = 'land';
        this.rows = new Map();
        this.tabs = new Map();
        this.panels = new Map();
        this.decorations = new Map();
        this.appearance = {
            ocean: true,
            landscape: true,
            detail: true,
            detailThreshold: 96,
            coastlines: true,
            coastlinesOpacity: 0.85,
            nationalBorders: true,
            nationalBordersOpacity: 1,
            bordersOpacity: 0.5,
            microGridOpacity: 0.5,
            riversOpacity: 1,
            namesOpacity: 1,
            unitsOpacity: 1,
            battlesOpacity: 1,
            territoryNames: false,
            nameSize: 12,
            nameSpacing: 8,
        };
        this.nameTypes = Object.fromEntries(
            ['ocean', 'continent', 'island', 'lake', 'bay', 'river', 'mountain'].map((k) => [k, true]),
        );
    }
    t(en, fr) {
        return this.locale === 'fr' ? fr : en;
    }
    label(node, en, fr, attr = null) {
        this.labels.push({ node, en, fr, attr });
        if (attr) node.setAttribute(attr, this.t(en, fr));
        else node.textContent = this.t(en, fr);
        return node;
    }
    button(en, fr, icon, action, className = '') {
        const b = new Button({ label: this.t(en, fr), icon, variant: 'quiet', className });
        this.label(b.element, en, fr);
        this.label(b.element, en, fr, 'aria-label');
        this.label(b.element, en, fr, 'title');
        this.scope.listen(b.element, 'click', action);
        return b.element;
    }
    async render() {
        this.element.classList.add('map-layers-lab');
        this.context = el(
            'select',
            {},
            this.label(el('option', { value: 'founding' }), 'Choosing a homeland', 'Choisir une patrie'),
            this.label(
                el('option', { value: 'governing' }),
                'Governing — sample nation',
                'Gouverner — nation fictive',
            ),
        );
        const contextField = new FieldShell({ control: this.context, label: '' });
        this.label(contextField.label, 'Viewing context', 'Contexte de consultation');
        this.scope.listen(this.context, 'change', () => {
            if (!available(this.active, this.context.value)) this.active = catalogue[0];
            this.update();
        });
        this.canvas = el('canvas', { tabindex: 0 });
        this.label(
            this.canvas,
            'Layer experiment map. Drag to pan, plus and minus to zoom.',
            'Carte expérimentale. Faites glisser pour déplacer, plus et moins pour zoomer.',
            'aria-label',
        );
        this.camera = new Camera(1, 1);
        this.mapState = null;
        this.ready = this.label(
            el('p', { class: 'll-loading', role: 'note' }),
            'Generating a local sample map…',
            'Génération d’une carte locale…',
        );
        this.stage = el('div', { class: 'll-stage' }, this.canvas, this.ready);
        this.legendTitle = el('strong');
        this.legendSource = el('small');
        this.gradient = el('i', { class: 'll-gradient', 'aria-hidden': 'true' });
        this.legendScale = el('span');
        this.legendHelp = el('p', { class: 'll-legend-help', hidden: true });
        this.legendEntries = el('div', { class: 'll-legend-entries', tabindex: 0 });
        this.label(this.legendEntries, 'Legend entries', 'Entrées de la légende', 'aria-label');
        this.legend = el(
            'div',
            { class: 'll-legend', 'aria-live': 'polite', tabindex: 0 },
            this.legendTitle,
            this.legendSource,
            this.gradient,
            this.legendScale,
            this.legendHelp,
            this.legendEntries,
        );
        this.stage.append(this.legend);
        this.drawerTitle = el('strong');
        this.close = this.button(
            'Close layers',
            'Fermer les couches',
            'close',
            () => this.closeDrawer(),
            'll-icon-only',
        );
        this.drawer = el(
            'section',
            { class: 'll-drawer', id: `${this.id}-drawer` },
            el('header', {}, this.drawerTitle, this.close),
        );
        this.drawer.setAttribute('aria-label', this.t('Map layers', 'Couches de la carte'));
        this.label(this.drawer, 'Map layers', 'Couches de la carte', 'aria-label');
        this.tabbar = el('div', { class: 'll-categories', role: 'tablist' });
        this.label(this.tabbar, 'Layer categories', 'Catégories de couches', 'aria-label');
        for (const [id, icon, en, fr] of groups) {
            const panel = el('div', {
                class: 'll-options',
                id: `${this.id}-${id}`,
                role: 'tabpanel',
                hidden: id !== this.category,
            });
            const tab = this.button(en, fr, icon, () => this.openCategory(id), 'll-category');
            tab.id = `${this.id}-tab-${id}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', panel.id);
            tab.setAttribute('aria-selected', String(id === this.category));
            tab.tabIndex = id === this.category ? 0 : -1;
            this.label(tab, en, fr, 'aria-label');
            panel.setAttribute('aria-labelledby', tab.id);
            const tooltip = this.label(el('span', { class: 'll-tab-label', 'aria-hidden': 'true' }), en, fr);
            this.tabbar.append(el('div', { class: 'll-tab-wrap' }, tab, tooltip));
            this.tabs.set(id, tab);
            this.panels.set(id, panel);
            this.drawer.append(panel);
            this.scope.listen(tab, 'keydown', (e) => {
                const i = groups.findIndex(([key]) => key === id);
                let next;
                if (e.key === 'ArrowRight') next = (i + 1) % groups.length;
                if (e.key === 'ArrowLeft') next = (i + groups.length - 1) % groups.length;
                if (e.key === 'Home') next = 0;
                if (e.key === 'End') next = groups.length - 1;
                if (next === undefined) return;
                e.preventDefault();
                this.openCategory(groups[next][0]);
                this.tabs.get(groups[next][0]).focus();
            });
        }
        for (const layer of catalogue) {
            const input = el('input', {
                type: 'radio',
                name: `${this.id}-analysis`,
                value: layer.id,
                checked: layer.id === this.active.id,
            });
            const text = this.label(el('span'), layer.en, layer.fr);
            this.label(input, layer.en, layer.fr, 'aria-label');
            const note = el('small', { id: `${this.id}-note-${layer.id}` });
            input.setAttribute('aria-describedby', note.id);
            const row = el('label', { class: 'll-choice' }, input, text, note);
            this.panels.get(layer.group).append(row);
            this.rows.set(layer.id, { input, note });
            this.scope.listen(input, 'change', () => {
                this.active = layer;
                this.update();
            });
        }
        this.buildAppearance();
        this.resource = el('select');
        this.resourceField = new FieldShell({ control: this.resource, label: '' });
        this.label(this.resourceField.label, 'Resource', 'Ressource');
        this.scope.listen(this.resource, 'change', () => this.update());
        this.includeWater = el('input', { type: 'checkbox' });
        this.includeWaterField = el(
            'label',
            { class: 'll-choice' },
            this.includeWater,
            this.label(el('span'), 'Include water in analysis', 'Inclure l’eau dans l’analyse'),
        );
        this.scope.listen(this.includeWater, 'change', () => this.update());
        this.resourceFooter = el('footer', {}, this.resourceField.element, this.includeWaterField);
        this.drawer.append(this.resourceFooter);
        this.clear = this.button(
            'Clear analysis',
            'Effacer l’analyse',
            'eraser',
            () => {
                this.active = catalogue[0];
                this.update();
            },
            'll-clear ll-icon-only',
        );
        const fit = this.button(
            'Fit world',
            'Cadrer le monde',
            'fit',
            () => {
                this.camera.fit();
                this.renderer?.invalidate();
            },
            'll-fit',
        );
        const minus = this.button('−', '−', null, () => {
            this.camera.zoomAt(1 / 1.4);
            this.renderer?.invalidate();
        });
        const plus = this.button('+', '+', null, () => {
            this.camera.zoomAt(1.4);
            this.renderer?.invalidate();
        });
        this.label(minus, 'Zoom out', 'Réduire', 'aria-label');
        this.label(plus, 'Zoom in', 'Agrandir', 'aria-label');
        this.dock = el(
            'div',
            { class: 'll-dock' },
            el('div', { class: 'll-navigation' }, minus, plus, fit),
            this.tabbar,
            this.clear,
        );
        this.stage.append(this.drawer, this.dock);
        const observer = new ResizeObserver(() => {
            this.stage.style.setProperty('--ll-dock-offset', `${this.dock.offsetHeight + 24}px`);
            this.stage.style.setProperty('--ll-legend-offset', `${this.legend.offsetHeight + 24}px`);
        });
        observer.observe(this.dock);
        observer.observe(this.legend);
        this.scope.own(() => observer.disconnect());
        this.detail = this.label(
            el('p', { class: 'll-detail' }),
            'Select a microcell to inspect the active layer.',
            'Sélectionnez une microcellule pour examiner la couche active.',
        );
        this.element.append(
            el(
                'header',
                { class: 'll-header' },
                contextField.element,
                (this.labLanguage = el(
                    'select',
                    { 'aria-label': 'Lab language' },
                    el('option', { value: 'en', text: 'EN' }),
                    el('option', { value: 'fr', text: 'FR' }),
                )),
                this.button(
                    'Close map layers experiment',
                    'Fermer l’expérience des couches',
                    'close',
                    () => this.onClose?.(),
                    'll-icon-only ll-exit',
                ),
                this.label(
                    el('p'),
                    'Generated geography · Sample economy and forces · No game changes',
                    'Géographie générée · Économie et armées fictives · Aucune partie modifiée',
                ),
            ),
            this.stage,
            this.detail,
        );
        this.labLanguage.value = this.locale;
        this.scope.listen(this.labLanguage, 'change', () => this.onLocale?.(this.labLanguage.value));
        this.scope.listen(this.element, 'keydown', (e) => {
            if (e.key === 'Escape' && !this.drawer.hidden) {
                e.preventDefault();
                e.stopPropagation();
                this.closeDrawer();
            }
        });
        this.scope.listen(this.canvas, 'pointerdown', () => {
            this.drawer.hidden = true;
            this.updateTabs();
        });
        this.scope.own(() => this.renderer?.destroy());
        this.update();
        const worker = new Worker(new URL('../../../map/generation-worker.js', import.meta.url), {
            type: 'module',
        });
        this.scope.own(() => worker.terminate());
        worker.onmessage = ({ data }) => {
            if (this.scope.closed) return;
            worker.terminate();
            if (data.error) {
                this.ready.textContent = data.error;
                return;
            }
            const model = restoreMap(data.snapshot);
            this.samples = makeSamples(model);
            this.nationalBorderPath = new Path2D();
            const edgeCorners = [
                [0, 1],
                [5, 0],
                [4, 5],
                [3, 4],
                [2, 3],
                [1, 2],
            ];
            for (const cell of model.cells) {
                if (['ocean', 'lake'].includes(cell.terrain)) continue;
                neighborCoordinates(cell.q, cell.r).forEach((n, i) => {
                    const other = model.cellById.get(axialKey(n.q, n.r));
                    if (
                        !other ||
                        ['ocean', 'lake'].includes(other.terrain) ||
                        this.samples.get(cell.regionId).own === this.samples.get(other.regionId).own
                    )
                        return;
                    const points = edgeCorners[i].map((j) => {
                        const angle = ((60 * j - 30) * Math.PI) / 180;
                        return [
                            cell.x + model.cellSize * Math.cos(angle),
                            cell.y + model.cellSize * Math.sin(angle),
                        ];
                    });
                    this.nationalBorderPath.moveTo(...points[0]);
                    this.nationalBorderPath.lineTo(...points[1]);
                });
            }
            this.camera = new Camera(model.width, model.height);
            this.mapState = {
                model,
                view: 'terrain',
                layers: { terrain: true, tiles: true, transitions: true, relief: true },
            };
            this.renderer = new LabRenderer(this);
            this.camera.fit();
            for (const p of model.resourceProfiles)
                this.resource.append(
                    this.label(el('option', { value: p.key }), p.labels.en, p.labels.fr ?? p.labels.en),
                );
            this.resource.value = 'ore';
            new MapInteractions(
                this.canvas,
                this.camera,
                this.renderer,
                { atScreen: (_, x, y) => this.renderer.cellAtScreen(x, y) },
                this.scope,
                {
                    select: (cell) => {
                        this.selectedCell = cell;
                        this.inspect();
                        this.renderer.invalidate();
                    },
                },
            );
            this.ready.hidden = true;
            this.element.dataset.ready = 'true';
            this.update();
        };
        worker.onerror = () => {
            if (!this.scope.closed)
                this.ready.textContent = this.t(
                    'Could not generate the local sample. Reopen the experiment to retry.',
                    'La génération a échoué. Rouvrez l’expérience pour réessayer.',
                );
            worker.terminate();
        };
        worker.postMessage({
            settings: { seed: 'layer-menu-1', regionColumns: 22, regionRows: 16 },
            cellCount: 7,
            profiles: defaultProfiles(),
        });
    }
    rangeControl(parent, en, fr, value, min, max, change, unit = '%') {
        const field = new RangeField({
            scope: this.scope,
            label: this.t(en, fr),
            value,
            min,
            max,
            unit,
            onChange: (value) => {
                if (Number.isFinite(value) && value >= min && value <= max) change(value);
            },
        });
        this.label(field.shell.label, en, fr);
        this.label(field.range, `${en} slider`, `${fr} — curseur`, 'aria-label');
        parent.append(field.element);
        return field;
    }
    checkbox(parent, en, fr, checked, change) {
        const input = el('input', { type: 'checkbox', checked });
        this.label(input, en, fr, 'aria-label');
        parent.append(el('label', { class: 'll-choice' }, input, this.label(el('span'), en, fr)));
        this.scope.listen(input, 'change', () => change(input.checked));
        return input;
    }
    buildAppearance() {
        const panel = this.panels.get('display');
        const section = (en, fr, open = false) => {
            const node = el('details', { open }, this.label(el('summary'), en, fr));
            panel.append(node);
            return node;
        };
        this.rangeControl(panel, 'Analysis opacity', 'Opacité de l’analyse', 72, 0, 100, (v) => {
            this.opacity = v / 100;
            this.renderer?.invalidate();
        });
        const base = section('Base map', 'Fond de carte', true);
        for (const [key, en, fr] of [
            ['ocean', 'Ocean', 'Océan'],
            ['landscape', 'Natural terrain artwork', 'Paysage naturel'],
            ['detail', 'Landscape details', 'Détails du paysage'],
        ])
            this.checkbox(base, en, fr, this.appearance[key], (v) => {
                this.appearance[key] = v;
                this.update();
            });
        this.rangeControl(
            base,
            'Detail zoom threshold',
            'Seuil de zoom des détails',
            96,
            8,
            192,
            (v) => {
                this.appearance.detailThreshold = v;
                this.updateDecorations();
            },
            ' px',
        );
        base.append(
            this.label(
                el('small'),
                'Lower = details appear farther out. Try 8–16 for the whole sample world; initial drawing takes time.',
                'Plus bas = détails visibles de plus loin. Essayez 8–16 pour le monde entier ; le rendu initial prend du temps.',
            ),
        );
        this.detailStatus = el('small', { class: 'll-detail-status' });
        base.append(this.detailStatus);
        const lines = section('Lines & markers', 'Lignes et symboles');
        for (const [key, en, fr] of [
            ['coastlines', 'Coastlines', 'Littoraux'],
            ['nationalBorders', 'National borders (sample)', 'Frontières nationales (exemple)'],
            ...decorations.filter(([key]) => key !== 'names'),
        ]) {
            const row = el('div', { class: 'll-appearance-row' });
            lines.append(row);
            const isDecoration = decorations.some(([id]) => id === key);
            const checked = isDecoration ? ['borders', 'rivers'].includes(key) : this.appearance[key];
            const input = this.checkbox(row, en, fr, checked, (v) => {
                if (!isDecoration) this.appearance[key] = v;
                this.updateDecorations();
            });
            if (isDecoration) this.decorations.set(key, input);
            if (key === 'nationalBorders') this.nationalBordersInput = input;
            this.rangeControl(
                row,
                `${en} opacity`,
                `Opacité : ${fr}`,
                this.appearance[`${key}Opacity`] * 100,
                0,
                100,
                (v) => {
                    this.appearance[`${key}Opacity`] = v / 100;
                    this.updateDecorations();
                },
            );
        }
        const names = section('Names', 'Noms');
        const nameInput = this.checkbox(names, 'Geographic names', 'Noms géographiques', true, () =>
            this.updateDecorations(),
        );
        this.decorations.set('names', nameInput);
        for (const [key, en, fr] of [
            ['ocean', 'Oceans & seas', 'Océans et mers'],
            ['continent', 'Continents', 'Continents'],
            ['island', 'Islands', 'Îles'],
            ['lake', 'Lakes', 'Lacs'],
            ['bay', 'Bays', 'Baies'],
            ['river', 'River names', 'Noms des rivières'],
            ['mountain', 'Mountain ranges', 'Chaînes de montagnes'],
        ])
            this.checkbox(names, en, fr, true, (v) => {
                this.nameTypes[key] = v;
                this.updateDecorations();
            });
        this.checkbox(names, 'Territory names', 'Noms des territoires', false, (v) => {
            this.appearance.territoryNames = v;
            this.updateDecorations();
        });
        this.rangeControl(names, 'Name opacity', 'Opacité des noms', 100, 0, 100, (v) => {
            this.appearance.namesOpacity = v / 100;
            this.updateDecorations();
        });
        this.rangeControl(
            names,
            'Geographic label size',
            'Taille des noms géographiques',
            12,
            9,
            20,
            (v) => {
                this.appearance.nameSize = v;
                this.updateDecorations();
            },
            ' px',
        );
        this.rangeControl(
            names,
            'Geographic label spacing',
            'Espacement des noms géographiques',
            8,
            4,
            32,
            (v) => {
                this.appearance.nameSpacing = v;
                this.updateDecorations();
            },
            ' px',
        );
    }
    categoryLabel(value) {
        const labels = {
            desert: ['Desert', 'Désert'],
            drylands: ['Semi-arid grass / scrub', 'Prairie semi-aride / broussailles'],
            forest: ['Forest', 'Forêt'],
            grassland: ['Grassland', 'Prairie'],
            tundra: ['Tundra', 'Toundra'],
            snow: ['Snow / ice cap', 'Neige / calotte glaciaire'],
            ocean: ['Ocean', 'Océan'],
            lake: ['Lake', 'Lac'],
            'Snow / ice': ['Snow / ice', 'Neige / glace'],
            'No snow / ice': ['No snow / ice', 'Sans neige / glace'],
            Forest: ['Forest', 'Forêt'],
            'Other land': ['Other land', 'Autres terres'],
            'Detected bay': ['Detected bay', 'Baie détectée'],
            'Your nation (sample)': ['Your nation (sample)', 'Votre nation (exemple)'],
            'Other nation (sample)': ['Other nation (sample)', 'Autre nation (exemple)'],
        };
        if (this.active.id === 'basin') return `${this.t('Outlet', 'Exutoire')} (${value})`;
        return labels[value] ? this.t(...labels[value]) : String(value);
    }
    display() {
        const resource = this.mapState?.model.resourceProfiles.find((p) => p.key === this.resource.value);
        return layerDisplay(this.active, this.locale, resource);
    }
    updateLegend() {
        const layer = this.active,
            style = this.style;
        this.legend.classList.toggle(
            'll-legend--many-categories',
            layer.scale === 'category' && style.categories.length > 4,
        );
        this.legendEntries.replaceChildren();
        this.legendHelp.hidden = layer.id !== 'basin';
        this.legendHelp.textContent =
            layer.id === 'basin'
                ? this.t(
                      'Each colour groups land draining to the same outlet. Labels identify outlet coordinates; colours do not measure water quantity.',
                      'Chaque couleur regroupe les terres drainées vers le même exutoire. Les libellés indiquent ses coordonnées ; les couleurs ne mesurent pas la quantité d’eau.',
                  )
                : '';
        const swatch = (text, colour, hatch = false) => {
            const chip = el('i', {
                'aria-hidden': 'true',
                class: hatch ? 'll-swatch ll-hatched' : 'll-swatch',
            });
            chip.style.backgroundColor = colour;
            this.legendEntries.append(el('div', { class: 'll-legend-entry' }, chip, el('span', { text })));
        };
        const numeric = ['adaptive', 'index', 'percent'].includes(layer.scale) || layer.id === 'exposure';
        this.gradient.hidden = !numeric;
        this.gradient.style.background =
            layer.id === 'defense'
                ? defenseGradientCss
                : `linear-gradient(90deg, ${style.colours.join(',')})`;
        if (numeric) {
            const fixed = layer.scale === 'percent' || layer.scale === 'index' || layer.id === 'exposure';
            const maximum = layer.id === 'exposure' ? 1 : style.maximum;
            const middle = fixed
                ? 0.5
                : style.lower < 0
                  ? (style.lower + maximum) / 2
                  : (maximum * (Math.sqrt(5) - 1)) / 4;
            const display = this.display();
            this.legendScale.replaceChildren(
                ...[style.lower, middle, maximum].map((v, i) =>
                    el('span', {
                        text: display.format(v, { tick: true, above: i === 2 && !fixed && maximum > 0 }),
                    }),
                ),
            );
            this.legendScale.className = 'll-ticks';
            swatch(display.description, 'transparent');
            if (!fixed)
                swatch(
                    this.t(
                        'Adaptive colours · + = above colour scale',
                        'Couleurs adaptées · + = au-delà de l’échelle',
                    ),
                    'transparent',
                );
        } else {
            this.legendScale.className = '';
            this.legendScale.textContent =
                layer.id === 'terrain'
                    ? this.t('Natural terrain colours; no analysis', 'Couleurs naturelles ; aucune analyse')
                    : '';
            if (layer.id === 'coast') {
                ['#65d6bc', '#b7d77a', '#edb65d', '#e77c77'].forEach((c, i) =>
                    swatch(
                        this.t(
                            ['Favourable', 'Limited', 'Difficult', 'Unsuitable'][i],
                            ['Favorable', 'Limité', 'Difficile', 'Inadapté'][i],
                        ),
                        c,
                    ),
                );
            } else if (layer.scale === 'category') {
                this.legendScale.textContent = `${style.categories.length} ${layer.id === 'basin' ? this.t('outlet catchments', 'bassins par exutoire') : this.t('categories', 'catégories')}`;
                for (const value of style.categories) swatch(this.categoryLabel(value), style.colour(value));
                if (!style.categories.length)
                    swatch(this.t('No matching features', 'Aucune entité correspondante'), 'transparent');
            }
        }
        if (layer.source === 'sample' && layer.id !== 'ownership')
            swatch(this.t('Unknown foreign values', 'Valeurs étrangères inconnues'), '#424b50', true);
        if (layer.id !== 'terrain')
            swatch(
                this.t('Uncoloured: excluded / not applicable', 'Sans couleur : exclu / sans objet'),
                '#101f2a',
            );
        if (!this.appearance.ocean) swatch(this.t('Ocean hidden', 'Océan masqué'), '#101f2a');
    }
    updateDetailStatus() {
        if (!this.detailStatus || !this.renderer) return;
        const status = this.renderer.getState().detailStatus;
        const diagnostics = this.renderer.terrainV2.diagnostics();
        const messages = {
            disabled: this.t('Landscape or detail is off.', 'Paysage ou détails désactivés.'),
            analysis: this.t('This view uses simplified terrain.', 'Cette vue utilise le terrain simplifié.'),
            zoom: this.t('Zoom in or lower the threshold.', 'Zoomez ou abaissez le seuil.'),
            budget: this.t(
                'Too much terrain in view: zoom in to fit the rendering budget.',
                'Trop de terrain visible : zoomez pour respecter le budget de rendu.',
            ),
            active: diagnostics.pending
                ? this.t(
                      `Drawing detail: ${diagnostics.pending} sections remaining.`,
                      `Détails en cours : ${diagnostics.pending} sections restantes.`,
                  )
                : this.t('Landscape detail active.', 'Détails du paysage actifs.'),
        };
        this.detailStatus.textContent = `${messages[status.reason]} ${this.t('Current scale', 'Échelle actuelle')} ${Math.round(status.screenSpan)} px.`;
        this.element.dataset.detailState = status.reason;
        this.element.dataset.detailPending = String(diagnostics.pending);
    }
    updateTabs() {
        for (const [id, tab] of this.tabs) {
            tab.setAttribute('aria-selected', String(id === this.category));
            tab.setAttribute('aria-expanded', String(id === this.category && !this.drawer.hidden));
            tab.tabIndex = id === this.category ? 0 : -1;
            tab.classList.toggle(
                'll-has-active',
                catalogue.some((l) => l.id === this.active.id && l.group === id),
            );
            this.panels.get(id).hidden = id !== this.category;
        }
        const group = groups.find(([id]) => id === this.category);
        this.drawerTitle.textContent = this.t(group[2], group[3]);
        this.updateFooter();
    }
    updateFooter() {
        if (this.resourceFooter)
            this.resourceFooter.hidden =
                this.category !== this.active.group ||
                (this.resourceField.element.hidden && this.includeWaterField.hidden);
    }
    openCategory(id) {
        this.category = id;
        this.drawer.hidden = false;
        this.updateTabs();
    }
    closeDrawer() {
        this.drawer.hidden = true;
        this.updateTabs();
        this.tabs.get(this.category).focus();
    }
    setLocale(locale) {
        this.locale = locale;
        for (const { node, en, fr, attr } of this.labels) {
            if (attr) node.setAttribute(attr, this.t(en, fr));
            else node.textContent = this.t(en, fr);
        }
        this.update();
    }
    updateDecorations() {
        for (const key of ['units', 'battles'])
            this.decorations.get(key).disabled = this.context.value === 'founding';
        this.nationalBordersInput.disabled = this.context.value === 'founding';
        if (!this.mapState) return;
        for (const [key, input] of this.decorations) this.mapState.layers[key] = input.checked;
        const a = this.appearance;
        this.mapState.layers.terrain = a.landscape;
        this.mapState.layers.tiles = a.detail;
        this.mapState.detailThreshold = a.detailThreshold;
        this.mapState.labelStyle = {
            types: { ...this.nameTypes, ocean: a.ocean && this.nameTypes.ocean },
            opacity: a.namesOpacity,
            size: a.nameSize,
            spacing: a.nameSpacing,
        };
        this.renderer.invalidate();
    }
    update() {
        this.updateTabs();
        for (const layer of catalogue) {
            const row = this.rows.get(layer.id);
            row.input.checked = layer.id === this.active.id;
            row.input.disabled = !available(layer, this.context.value);
            row.note.textContent =
                layer.source !== 'sample'
                    ? ''
                    : row.input.disabled
                      ? this.t('After founding', 'Après fondation')
                      : this.t('Sample', 'Exemple');
        }
        this.resourceField.element.hidden = !resourceLayers.has(this.active.id);
        this.includeWaterField.hidden = ![
            'elevation',
            'biome',
            'temperature',
            'rainfall',
            'moisture',
            'snow',
            'flow',
        ].includes(this.active.id);
        this.updateFooter();
        this.clear.disabled = this.active.id === 'terrain';
        this.updateDecorations();
        if (!this.mapState) return;
        this.values = valuesFor(this.mapState.model, this.samples, this.active, this.resource.value, {
            includeWater: this.includeWater.checked,
            ocean: this.appearance.ocean,
        });
        this.style = analysisStyle(
            this.active.id === 'exposure' ? { ...this.active, scale: 'index' } : this.active,
            this.values,
        );
        // Analyses are overlays; they must not force the independent base terrain back on.
        this.mapState.view = 'terrain';
        const resourceLabel = this.resource.selectedOptions[0]?.textContent ?? '';
        this.legendTitle.textContent =
            this.t(this.active.en, this.active.fr) +
            (resourceLayers.has(this.active.id) ? ` · ${resourceLabel}` : '');
        this.legendSource.textContent =
            this.active.source === 'sample'
                ? this.t(
                      'Sample nation · regional values · hatched = unavailable',
                      'Nation fictive · valeurs régionales · hachures = indisponible',
                  )
                : this.t('Sample map · microcell geography', 'Carte locale · géographie des microcellules');
        this.updateLegend();
        this.inspect();
        this.renderer.invalidate();
    }
    format(value) {
        return new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(value);
    }
    inspect() {
        if (!this.selectedCell || !this.values) return;
        const cell = this.selectedCell,
            value = this.values.get(cell.id);
        this.mapState.selectedCellId = cell.id;
        let text =
            value == null
                ? this.t('Unavailable / not applicable', 'Indisponible / sans objet')
                : typeof value === 'number'
                  ? this.display().format(value)
                  : this.categoryLabel(value);
        if (this.active.id === 'terrain') text = this.categoryLabel(cell.biome);
        if (this.active.scale === 'shore') {
            const shores = this.mapState.model.atlas.coasts.shores.filter((s) => s.landId === cell.id);
            text = shores.length
                ? shores
                      .map((s) =>
                          this.active.id === 'exposure'
                              ? `${s.waterId}: ${this.display().format(s.exposure)}${s.truncated ? ' *' : ''}`
                              : `${s.waterId}: ${this.t(['favourable', 'limited', 'difficult', 'unsuitable'][s.accessGrade], ['favorable', 'limité', 'difficile', 'inadapté'][s.accessGrade])}`,
                      )
                      .join(' · ')
                : this.t('No shore on this cell', 'Aucun rivage sur cette cellule');
        }
        this.detail.textContent = `${this.t('Cell', 'Cellule')} ${cell.id} · ${this.t(this.active.en, this.active.fr)}: ${text}${this.active.source === 'sample' ? this.t(' · illustrative data', ' · données fictives') : ''}`;
    }
}
