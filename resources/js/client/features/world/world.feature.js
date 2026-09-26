import { Component } from '../../runtime/Component.js';
import { installTrait } from '../../runtime/traits.js';
import { button, el } from '../../ui/dom.js';
import { mapDefinitionFor, HexMapPicker } from '../../ui/map/HexMap.js';
import { Camera } from './Camera.js';
import { setButtonIcon } from '../../ui/icons.js';
import { MapPicker } from './MapPicker.js';
import { MapViewport } from '../../ui/map/MapViewport.js';
import { createLayers } from './layers.js';
import './world.scss';
import { localizedDom } from '../../ui/localizedDom.js';
import { WorldCommands } from './WorldCommands.js';
import { Disclosure } from '../../ui/Disclosure.js';
import { compactLabel } from '../../ui/compactLabel.js';
import { projectBattleMarkers } from '../../ui/map/battleOverlay.js';
import { defenseGradientCss, projectDefenseHeatmap } from '../../ui/map/defenseHeatmap.js';
import { analysisTypes, projectLocalAnalysis } from '../../ui/map/mapAnalysis.js';

class WorldWorkspace extends Component {
    async render() {
        const { i18n } = this.services;
        const { el } = localizedDom(this.scope, i18n);
        let snapshot = this.services.world.snapshot ?? this.inputs.snapshot;
        const mapDefinition = mapDefinitionFor(snapshot.map, snapshot.territories);
        this.stateStore = this.services.saved.child(`game-${snapshot.game_id}`).child('world');
        const saved = this.stateStore.read();
        const camera = new Camera(mapDefinition.width, mapDefinition.height);
        const picker = mapDefinition.model
            ? new HexMapPicker(snapshot.territories, mapDefinition)
            : new MapPicker(snapshot.territories, mapDefinition);
        const layers = createLayers();
        const availableAnalysisTypes = snapshot.setup.nation_id
            ? analysisTypes
            : analysisTypes.filter((type) => ['none', 'population'].includes(type));
        const savedAnalysisType =
            saved.analysis?.type ?? (saved.military?.defenseHeatmap === true ? 'defense' : 'none');
        const initialAnalysisType = availableAnalysisTypes.includes(savedAnalysisType)
            ? savedAnalysisType
            : 'none';
        const resources = Object.entries(snapshot.nation?.production_planning?.resources ?? {})
            .filter(([, resource]) => resource.produced_by_labor)
            .map(([resource]) => resource);
        const initialResource = resources.includes(saved.analysis?.resource)
            ? saved.analysis.resource
            : (resources[0] ?? 'Capital');
        const militaryLayers = {
            showUnits: saved.military?.showUnits !== false,
            lastTurnBattles: saved.military?.lastTurnBattles === true,
            unitDetails: saved.military?.unitDetails === true,
            muteForeignColors:
                Boolean(snapshot.setup.nation_id) &&
                (typeof saved.military?.muteForeignColors === 'boolean'
                    ? saved.military.muteForeignColors
                    : initialAnalysisType !== 'none'),
            battles: [],
        };
        const analysisLayer = {
            type: initialAnalysisType,
            resource: initialResource,
            entries: [],
            scale: null,
        };
        let loadMilitaryHistory = () => {};
        let refreshAnalysis = () => {};
        for (const layer of layers)
            if (!layer.fixed && typeof saved.layers?.[layer.id] === 'boolean')
                layer.visible = saved.layers[layer.id];
        const canvas = el('canvas', {
            class: 'world-canvas',
            tabindex: '0',
            'aria-label':
                'World map. Drag to pan, scroll to zoom. Arrow keys pan, plus and minus zoom, Home fits the world. Use the territory list to select.',
        });
        i18n.bind(this.scope, canvas, 'map.label', {}, 'aria-label');
        const zoom = el('span', { class: 'zoom-value', 'aria-label': 'Map zoom' });
        const zoomIn = button('+'),
            zoomOut = button('−'),
            recenter = i18n.bind(this.scope, button(''), 'map.fit');
        i18n.bind(this.scope, zoomIn, 'map.zoomIn', {}, 'aria-label');
        i18n.bind(this.scope, zoomOut, 'map.zoomOut', {}, 'aria-label');
        const rotateLeft = button('↶'),
            rotateRight = button('↷'),
            north = button('0°');
        north.classList.add('map-orientation-value');
        setButtonIcon(north, 'world');
        setButtonIcon(recenter, 'fit');
        for (const [node, key] of [
            [rotateLeft, 'map.rotateLeft'],
            [rotateRight, 'map.rotateRight'],
            [north, 'map.northUp'],
        ]) {
            i18n.bind(this.scope, node, key, {}, 'aria-label');
            i18n.bind(this.scope, node, key, {}, 'title');
        }
        const controls = el(
            'div',
            { class: 'map-controls', 'aria-label': 'Map navigation' },
            zoomOut,
            zoom,
            zoomIn,
            recenter,
            el('div', { class: 'map-orientation' }, rotateLeft, north, rotateRight),
        );
        const notice = el('p', { class: 'map-notice', role: 'status', textKey: 'map.loading' });
        const analysisLegendTitle = el('strong');
        const analysisLegendHint = el('small');
        const analysisLegendLow = el('span');
        const analysisLegendHigh = el('span');
        const analysisLegendSelected = el('small', { class: 'defense-heatmap-selected', hidden: true });
        const analysisLegend = el(
            'aside',
            { class: 'defense-heatmap-legend', hidden: true },
            analysisLegendTitle,
            analysisLegendHint,
            el('i', { class: 'defense-heatmap-gradient', style: `--defense-gradient:${defenseGradientCss}` }),
            el('div', { class: 'defense-heatmap-range' }, analysisLegendLow, analysisLegendHigh),
            analysisLegendSelected,
        );
        const map = el(
            'section',
            { class: 'map-viewport', 'aria-label': 'World map' },
            canvas,
            el(
                'div',
                { class: 'map-caption' },
                el('span', { class: 'eyebrow', textKey: 'world.survey' }),
                el('span', { textKey: 'world.browse' }),
            ),
            controls,
            notice,
            analysisLegend,
            el(
                'div',
                { class: 'map-legend' },
                el('span', { class: 'legend-own', textKey: 'world.yours' }),
                el('span', { class: 'legend-foreign', textKey: 'world.others' }),
                el('span', { textKey: 'world.zoomNames' }),
            ),
        );
        const search = el('input', {
            type: 'search',
            id: `${this.id}-search`,
            placeholder: 'Find a territory…',
            autocomplete: 'off',
        });
        i18n.bind(this.scope, search, 'world.search', {}, 'placeholder');
        const list = el('div', { class: 'territory-list', 'aria-label': 'Territories' });
        const count = el('p', { class: 'directory-count', role: 'status' });
        const directory = el(
            'section',
            { class: 'world-directory', 'aria-label': 'World directory' },
            el(
                'div',
                { class: 'directory-heading' },
                el('p', { class: 'eyebrow', textKey: 'world.known' }),
                el('h2', { textKey: 'world.territories' }),
            ),
            el('label', { class: 'sr-only', for: search.id, textKey: 'world.searchLabel' }),
            search,
            count,
            list,
        );
        const layerControl = new Disclosure(this.scope, {
            label: i18n.t('world.layers'),
            className: 'hud-layers layer-panel',
            group: 'game-hud',
        });
        let mode = 'geopolitical';
        const resourceLabel = () => i18n.t(`command.resource.${analysisLayer.resource}`);
        const updateAnalysisLegend = () => {
            const type = analysisLayer.type;
            analysisLegend.hidden = type === 'none';
            if (type === 'none') return;
            const config = {
                defense: ['layer.defenseTitle', 'layer.defenseHintShort', 'layer.defenseLow'],
                population: ['layer.populationTitle', 'layer.populationHintShort', 'layer.populationLow'],
                production: ['layer.productionTitle', 'layer.productionHintShort', 'layer.productionLow'],
                loyalty: ['layer.loyaltyTitle', 'layer.loyaltyHintShort', 'layer.loyaltyLow'],
            }[type];
            analysisLegendTitle.textContent = i18n.t(config[0], { resource: resourceLabel() });
            analysisLegendHint.textContent = i18n.t(config[1]);
            analysisLegendLow.textContent = i18n.t(config[2]);
            const maximum = analysisLayer.scale?.maximum;
            analysisLegendHigh.textContent =
                type === 'defense' && maximum == null
                    ? i18n.t('layer.defenseLoading')
                    : i18n.t(`layer.${type}High`, {
                          value: i18n.number(maximum ?? 0, {
                              maximumFractionDigits: type === 'population' ? 2 : 0,
                          }),
                      });
            const explanation = i18n.t(`layer.${type}Hint`, { resource: resourceLabel() });
            analysisLegend.setAttribute('aria-label', explanation);
            analysisLegend.title = explanation;
            const selected = analysisLayer.entries.find(
                (entry) => entry.territoryId === this.services.selection.id,
            );
            analysisLegendSelected.hidden = !selected;
            if (selected) {
                const name = snapshot.territories.find(
                    (territory) => territory.territory_id === selected.territoryId,
                )?.name;
                const value =
                    type === 'loyalty'
                        ? i18n.number(selected.value * 100, { maximumFractionDigits: 0 }) + '%'
                        : i18n.number(type === 'defense' ? selected.total : selected.value, {
                              maximumFractionDigits: type === 'population' ? 2 : 2,
                          });
                analysisLegendSelected.textContent = i18n.t(`layer.${type}Selected`, {
                    name,
                    value,
                    resource: resourceLabel(),
                });
            }
        };
        i18n.changed.subscribe(this.scope, updateAnalysisLegend);
        setButtonIcon(layerControl.trigger, 'layers');
        const labelLayers = () =>
            compactLabel(layerControl.trigger, i18n.t('hud.layers', { mode: i18n.t(`command.${mode}`) }));
        i18n.changed.subscribe(this.scope, labelLayers);
        for (const layer of layers.filter((l) => !l.fixed && (snapshot.map || l.id !== 'rivers'))) {
            const input = el('input', { type: 'checkbox', checked: layer.visible });
            this.scope.listen(input, 'change', () => {
                layer.visible = input.checked;
                renderer.invalidate();
                this.saveView?.();
            });
            layerControl.content.append(el('label', {}, input, el('span', { textKey: `layer.${layer.id}` })));
        }
        layerControl.content.append(el('p', { class: 'layer-group-title', textKey: 'layer.military' }));
        const militaryToggles = [
            ['showUnits', 'layer.showUnits'],
            ['lastTurnBattles', 'layer.lastTurnBattles'],
            ['unitDetails', 'layer.unitDetails'],
        ];
        if (snapshot.setup.nation_id) militaryToggles.push(['muteForeignColors', 'layer.muteForeignColors']);
        const militaryInputs = new Map();
        for (const [key, textKey] of militaryToggles) {
            const input = el('input', { type: 'checkbox', checked: militaryLayers[key] });
            militaryInputs.set(key, input);
            this.scope.listen(input, 'change', () => {
                militaryLayers[key] = input.checked;
                this.commands?.updateOverlay();
                if (key === 'lastTurnBattles' && input.checked) void loadMilitaryHistory();
                this.saveView?.();
            });
            layerControl.content.append(el('label', {}, input, el('span', { textKey })));
        }
        layerControl.content.append(el('p', { class: 'layer-group-title', textKey: 'layer.analysis' }));
        const analysisSelect = el('select', { 'aria-label': i18n.t('layer.analysis') });
        const resourceSelect = el('select', { 'aria-label': i18n.t('layer.productionResource') });
        const resourceRow = el(
            'label',
            { class: 'layer-select-row', hidden: analysisLayer.type !== 'production' },
            el('span', { textKey: 'layer.productionResource' }),
            resourceSelect,
        );
        const renderAnalysisOptions = () => {
            analysisSelect.replaceChildren(
                ...availableAnalysisTypes.map((type) =>
                    el('option', {
                        value: type,
                        text: i18n.t(`layer.analysis.${type}`),
                        selected: type === analysisLayer.type,
                    }),
                ),
            );
            resourceSelect.replaceChildren(
                ...resources.map((resource) =>
                    el('option', {
                        value: resource,
                        text: i18n.t(`command.resource.${resource}`),
                        selected: resource === analysisLayer.resource,
                    }),
                ),
            );
            analysisSelect.setAttribute('aria-label', i18n.t('layer.analysis'));
            resourceSelect.setAttribute('aria-label', i18n.t('layer.productionResource'));
        };
        renderAnalysisOptions();
        i18n.changed.subscribe(this.scope, renderAnalysisOptions);
        this.scope.listen(analysisSelect, 'change', () => {
            analysisLayer.type = analysisSelect.value;
            analysisLayer.entries = [];
            analysisLayer.scale = null;
            resourceRow.hidden = analysisLayer.type !== 'production';
            if (analysisLayer.type !== 'none' && militaryInputs.has('muteForeignColors')) {
                militaryLayers.muteForeignColors = true;
                militaryInputs.get('muteForeignColors').checked = true;
            }
            refreshAnalysis();
            updateAnalysisLegend();
            this.commands?.updateOverlay();
            this.commands?.renderDock();
            this.saveView?.();
        });
        this.scope.listen(resourceSelect, 'change', () => {
            analysisLayer.resource = resourceSelect.value;
            refreshAnalysis();
            updateAnalysisLegend();
            this.commands?.updateOverlay();
            this.saveView?.();
        });
        layerControl.content.append(
            el(
                'label',
                { class: 'layer-select-row' },
                el('span', { textKey: 'layer.analysisOverlay' }),
                analysisSelect,
            ),
            resourceRow,
        );
        this.services.attachHeaderControls(this.scope, layerControl.element);
        for (const [node, key] of [
            [zoom, 'map.zoom'],
            [controls, 'map.navigation'],
            [map, 'map.world'],
            [list, 'world.territories'],
            [directory, 'world.directory'],
        ]) {
            i18n.bind(this.scope, node, key, {}, 'aria-label');
        }
        this.element.classList.add('world-workspace');
        this.element.append(directory, map);
        if (snapshot.map) map.append(el('span', { class: 'map-beta-badge', textKey: 'map.beta' }));
        const context = {
            definition: mapDefinition,
            territories: snapshot.territories,
            layers,
            picker,
            ownNationId: snapshot.setup.nation_id,
            nationColors: snapshot.nation_colors,
            selectedId: this.services.selection.id,
            hoveredId: null,
        };
        const renderer = MapViewport.connect({
            canvas,
            camera,
            context,
            scope: this.scope,
            onChange: () => {
                zoom.textContent = `${Math.round(camera.zoom * 100)}%`;
                north.textContent = `${Math.round((camera.angle * 180) / Math.PI) % 360}°`;
                this.commands?.mini.invalidate();
            },
            onSelect: (territory) => {
                this.services.selectTerritory(territory?.territory_id ?? null);
            },
            tool: {
                select: (territory, point, event) =>
                    this.commands
                        ? this.commands.mapClick(territory, point, event)
                        : this.services.selectTerritory(territory?.territory_id ?? null),
                boxEnabled: () => this.commands?.canBoxSelect(),
                previewBox: (box) => this.commands?.previewBox(box),
                selectBox: (box, event) => this.commands?.selectBox(box, event),
                hover: (territory) => {
                    const id = territory?.territory_id ?? null;
                    if (context.hoveredId === id) return;
                    context.hoveredId = id;
                    renderer.invalidate();
                },
            },
        });
        camera.restore(saved.camera);
        installTrait(this, {
            name: 'camera-state',
            requires: ['scope', 'stateStore'],
            exports: ['saveView'],
            install: (target) => ({
                capabilities: {
                    saveView: () =>
                        target.stateStore.write({
                            ...target.stateStore.read(),
                            camera: camera.snapshot(),
                            layers: Object.fromEntries(
                                layers.filter((l) => !l.fixed).map((l) => [l.id, l.visible]),
                            ),
                            military: {
                                showUnits: militaryLayers.showUnits,
                                lastTurnBattles: militaryLayers.lastTurnBattles,
                                unitDetails: militaryLayers.unitDetails,
                                muteForeignColors: militaryLayers.muteForeignColors,
                            },
                            analysis: {
                                type: analysisLayer.type,
                                resource: analysisLayer.resource,
                            },
                        }),
                },
                cleanup: () =>
                    target.stateStore.write({
                        ...target.stateStore.read(),
                        camera: camera.snapshot(),
                        layers: Object.fromEntries(
                            layers.filter((l) => !l.fixed).map((l) => [l.id, l.visible]),
                        ),
                        military: {
                            showUnits: militaryLayers.showUnits,
                            lastTurnBattles: militaryLayers.lastTurnBattles,
                            unitDetails: militaryLayers.unitDetails,
                            muteForeignColors: militaryLayers.muteForeignColors,
                        },
                        analysis: {
                            type: analysisLayer.type,
                            resource: analysisLayer.resource,
                        },
                    }),
            }),
        });
        this.scope.listen(window, 'pagehide', () => this.saveView());
        this.scope.listen(document, 'visibilitychange', () => {
            if (document.hidden) this.saveView();
        });
        const tool = {
            select: (territory) => {
                if (territory) this.services.selectTerritory(territory.territory_id);
            },
        };
        this.scope.listen(zoomIn, 'click', () => {
            camera.zoomAt(1.35);
            renderer.invalidate();
        });
        this.scope.listen(zoomOut, 'click', () => {
            camera.zoomAt(1 / 1.35);
            renderer.invalidate();
        });
        this.scope.listen(recenter, 'click', () => {
            camera.fit();
            renderer.invalidate();
        });
        for (const [node, step] of [
            [rotateLeft, -1],
            [rotateRight, 1],
            [north, 0],
        ]) {
            this.scope.listen(node, 'click', () => {
                camera.setAngle(step ? camera.angle + (step * Math.PI) / 12 : 0);
                renderer.invalidate();
                this.saveView();
            });
        }
        // Delegate list events: no per-row subscriptions retained when search rerenders.
        const renderList = () => {
            const active = list.contains(document.activeElement)
                ? document.activeElement.dataset.territoryId
                : null;
            const scroll = list.scrollTop;
            const term = search.value.trim().toLocaleLowerCase();
            const matches = snapshot.territories.filter(
                (t) => t.terrain_type !== 'Water' && (!term || t.name.toLocaleLowerCase().includes(term)),
            );
            count.textContent = i18n.t(term ? 'world.matching' : 'world.count', { count: matches.length });
            list.replaceChildren(
                ...matches.map((t) =>
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'territory-row',
                            'data-territory-id': t.territory_id,
                            'aria-pressed': String(this.services.selection.id === t.territory_id),
                        },
                        el('span', { class: 'territory-row-name', text: t.name }),
                        el('span', {
                            class:
                                t.owner_nation_id === snapshot.setup.nation_id && t.owner_nation_id
                                    ? 'territory-row-own'
                                    : 'territory-row-type',
                            text:
                                t.owner_nation_id === snapshot.setup.nation_id && t.owner_nation_id
                                    ? i18n.t('world.ownTerritory')
                                    : i18n.t(`terrain.${t.terrain_type}`),
                        }),
                    ),
                ),
            );
            if (!matches.length) list.append(el('p', { class: 'muted', text: i18n.t('world.noMatches') }));
            if (active) list.querySelector(`[data-territory-id="${active}"]`)?.focus({ preventScroll: true });
            list.scrollTop = scroll;
        };
        i18n.changed.subscribe(this.scope, renderList);
        this.scope.listen(search, 'input', renderList);
        this.scope.listen(list, 'click', (event) => {
            const target = event.target.closest('[data-territory-id]');
            if (!target) return;
            const t = snapshot.territories.find((t) => t.territory_id === Number(target.dataset.territoryId));
            const center = picker.center?.(t);
            camera.x = center?.x ?? (t.x + 0.5) * mapDefinition.tileWidth;
            camera.y = center?.y ?? (t.y + 0.5) * mapDefinition.tileHeight;
            camera.zoom = Math.max(camera.zoom, mapDefinition.model ? camera.fitZoom * 5 : 2.8);
            renderer.invalidate();
            tool.select(t);
        });
        this.services.selection.changed.subscribe(this.scope, (id) => {
            if (this.scope.closed) return;
            context.selectedId = id;
            this.commands?.select(id);
            renderer.invalidate();
            updateAnalysisLegend();
            for (const row of list.querySelectorAll('[data-territory-id]'))
                row.setAttribute('aria-pressed', String(Number(row.dataset.territoryId) === id));
        });
        renderList();
        this.commands = new WorldCommands({
            scope: this.scope,
            services: this.services,
            snapshot,
            root: this.element,
            map,
            directory,
            camera,
            context,
            renderer,
            saved: this.stateStore,
            militaryLayers,
            analysisLayer,
            onModeChange: (next) => {
                mode = next;
                labelLayers();
                updateAnalysisLegend();
            },
        });
        loadMilitaryHistory = async () => {
            if (!militaryLayers.lastTurnBattles) return;
            const requested = snapshot;
            try {
                const { news, battles } = await this.services.gameplay.militaryHistory(
                    requested,
                    this.scope.signal,
                );
                if (this.scope.closed || !this.services.world.same(requested, snapshot)) return;
                militaryLayers.battles = projectBattleMarkers(news, battles);
                this.commands.updateOverlay();
            } catch (error) {
                if (error.name !== 'AbortError') console.warn('Military history unavailable', error);
            }
        };
        const loadDefenseCoverage = async () => {
            if (analysisLayer.type !== 'defense' || !snapshot.setup.nation_id) return;
            const requested = snapshot;
            try {
                const coverage = await this.services.gameplay.defenseCoverage(requested, this.scope.signal);
                if (
                    this.scope.closed ||
                    analysisLayer.type !== 'defense' ||
                    !this.services.world.same(requested, snapshot)
                )
                    return;
                const projection = projectDefenseHeatmap(snapshot, coverage);
                analysisLayer.entries = projection.entries;
                analysisLayer.scale = projection.scale;
                updateAnalysisLegend();
                this.commands.updateOverlay();
                this.commands.renderDock();
            } catch (error) {
                if (error.name !== 'AbortError') console.warn('Defence coverage unavailable', error);
            }
        };
        refreshAnalysis = () => {
            analysisLayer.entries = [];
            analysisLayer.scale = null;
            if (analysisLayer.type === 'defense') {
                void loadDefenseCoverage();
            } else {
                const projection = projectLocalAnalysis(snapshot, analysisLayer.type, analysisLayer.resource);
                analysisLayer.entries = projection.entries;
                analysisLayer.scale = projection.scale;
            }
            updateAnalysisLegend();
            this.commands.updateOverlay();
            this.commands.renderDock();
        };
        if (militaryLayers.lastTurnBattles) void loadMilitaryHistory();
        refreshAnalysis();
        this.services.world.store.subscribe(this.scope, (state) => {
            const next = state.snapshot;
            if (
                !next ||
                !this.services.world.sameScope(snapshot, next) ||
                snapshot.mapFingerprint !== next.mapFingerprint
            )
                return;
            if (state.status === 'ready' && next !== snapshot) {
                const changedTurn = snapshot.turn_number !== next.turn_number;
                const changed =
                    snapshot.territories !== next.territories ||
                    snapshot.nation_colors !== next.nation_colors;
                snapshot = next;
                context.territories = next.territories;
                context.ownNationId = next.setup.nation_id;
                context.nationColors = next.nation_colors;
                if (changed) {
                    picker.update(next.territories);
                    renderer.updateData?.();
                    this.commands.mini.updateData(context);
                    renderList();
                }
                this.commands.updateData(next);
                refreshAnalysis();
                if (changedTurn) {
                    militaryLayers.battles = [];
                    if (militaryLayers.lastTurnBattles) void loadMilitaryHistory();
                }
                renderer.invalidate();
            }
            this.commands.updateBusy();
        });
        renderer.invalidate();
        // Drawing is useful even if a texture fails. Picking/list navigation remain available.
        void renderer.loadImages(this.services.boot.mapImages).then((ok) => {
            if (this.scope.closed) return;
            notice.hidden = ok;
            if (!ok) i18n.bind(this.scope, notice, 'map.failed');
        });
    }
}
export function createInstance(options) {
    return new WorldWorkspace(options);
}
