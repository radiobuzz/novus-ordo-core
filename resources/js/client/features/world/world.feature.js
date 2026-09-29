import { MapLayerMenu } from '../../ui/map/MapLayerMenu.js';
import { Component } from '../../runtime/Component.js';
import { installTrait } from '../../runtime/traits.js';
import { button, el } from '../../ui/dom.js';
import { mapDefinitionFor, HexMapPicker } from '../../ui/map/HexMap.js';
import { Camera } from './Camera.js';
import { setButtonIcon } from '../../ui/icons.js';
import { MapViewport } from '../../ui/map/MapViewport.js';
import { createLayers } from './layers.js';
import './world.scss';
import { localizedDom } from '../../ui/localizedDom.js';
import { WorldCommands } from './WorldCommands.js';
import { projectBattleMarkers } from '../../ui/map/battleOverlay.js';

class WorldWorkspace extends Component {
    async render() {
        const { i18n } = this.services;
        const { el } = localizedDom(this.scope, i18n);
        let snapshot = this.services.world.snapshot ?? this.inputs.snapshot;
        const mapDefinition = mapDefinitionFor(snapshot.map, snapshot.territories);
        this.stateStore = this.services.saved.child(`game-${snapshot.game_id}`).child('world');
        const saved = this.stateStore.read();
        const camera = new Camera(mapDefinition.width, mapDefinition.height);
        const picker = new HexMapPicker(snapshot.territories, mapDefinition);
        const layers = createLayers();
        const militaryLayers = {
            showUnits: saved.military?.showUnits !== false,
            lastTurnBattles: saved.military?.lastTurnBattles === true,
            unitDetails: saved.military?.unitDetails === true,
            muteForeignColors:
                Boolean(snapshot.setup.nation_id) &&
                (typeof saved.military?.muteForeignColors === 'boolean'
                    ? saved.military.muteForeignColors
                    : false),
            battles: [],
        };
        const analysisLayer = { type: 'none', resource: '', entries: [], scale: null };
        let loadMilitaryHistory = () => {},
            refreshAnalysis = () => {};
        let menu;
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
                if (menu) menu.updateDetailStatus(renderer);
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
        menu = new MapLayerMenu({
            scope: this.scope,
            i18n,
            model: mapDefinition.model,
            snapshot,
            host: map,
            controls,
            saved: saved.mapLayers,
            military: militaryLayers,
            onChange: (kind) => {
                if (kind === 'analysis') refreshAnalysis();
                else {
                    renderer.invalidate();
                    this.commands?.updateOverlay();
                }
                if (kind === 'military' && militaryLayers.lastTurnBattles) void loadMilitaryHistory();
                this.saveView?.();
            },
        });
        context.mapLayers = menu;
        this.scope.listen(canvas, 'click', (e) => {
            menu.drawer.hidden = true;
            menu.updatePanels();
            const b = canvas.getBoundingClientRect();
            menu.inspect(
                renderer.cellAtScreen(e.clientX - b.left, e.clientY - b.top),
                this.services.selection.id,
            );
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
                            mapLayers: menu.preferences(),
                            military: {
                                showUnits: militaryLayers.showUnits,
                                lastTurnBattles: militaryLayers.lastTurnBattles,
                                unitDetails: militaryLayers.unitDetails,
                                muteForeignColors: militaryLayers.muteForeignColors,
                            },
                        }),
                },
                cleanup: () =>
                    target.stateStore.write({
                        ...target.stateStore.read(),
                        camera: camera.snapshot(),
                        mapLayers: menu.preferences(),
                        military: {
                            showUnits: militaryLayers.showUnits,
                            lastTurnBattles: militaryLayers.lastTurnBattles,
                            unitDetails: militaryLayers.unitDetails,
                            muteForeignColors: militaryLayers.muteForeignColors,
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
            const center = picker.center(t);
            if (!center) return;
            camera.x = center.x;
            camera.y = center.y;
            camera.zoom = Math.max(camera.zoom, camera.fitZoom * 5);
            renderer.invalidate();
            tool.select(t);
        });
        this.services.selection.changed.subscribe(this.scope, (id) => {
            menu.inspect(undefined, id);
            if (this.scope.closed) return;
            context.selectedId = id;
            this.commands?.select(id);
            renderer.invalidate();

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
            onModeChange: () => {},
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
        let analysisGeneration = 0;
        const syncAnalysis = () => {
            analysisLayer.type = menu.type === 'terrain' ? 'none' : menu.type;
            analysisLayer.resource = menu.resource;
            analysisLayer.entries = menu.result.entries;
            analysisLayer.scale = menu.style;
            this.commands?.updateOverlay();
            this.commands?.refreshDock?.();
            renderer.invalidate();
        };
        refreshAnalysis = () => {
            const generation = ++analysisGeneration;
            menu.refresh();
            syncAnalysis();
            if (!['defense', 'guard'].includes(menu.type)) return;
            const requested = snapshot,
                requestedType = menu.type;
            menu.setCoverage(null, 'loading');
            syncAnalysis();
            void this.services.gameplay
                .defenseCoverage(requested, this.scope.signal)
                .then((coverage) => {
                    if (
                        this.scope.closed ||
                        generation !== analysisGeneration ||
                        menu.type !== requestedType ||
                        !this.services.world.same(requested, snapshot)
                    )
                        return;
                    menu.setCoverage(coverage);
                    syncAnalysis();
                })
                .catch((error) => {
                    if (this.scope.closed || generation !== analysisGeneration || error.name === 'AbortError')
                        return;
                    menu.setCoverage(null, 'error');
                    syncAnalysis();
                });
        };
        if (militaryLayers.lastTurnBattles) void loadMilitaryHistory();
        refreshAnalysis();
        this.services.world.store.subscribe(this.scope, (state) => {
            const next = state.snapshot;
            if (!next) {
                ++analysisGeneration;
                menu.setSnapshot({ ...snapshot, nation: null, setup: { nation_id: null } });
                renderer.invalidate();
                return;
            }
            if (
                !next ||
                !this.services.world.sameScope(snapshot, next) ||
                snapshot.mapFingerprint !== next.mapFingerprint
            )
                return;
            if (state.status === 'ready' && next !== snapshot) {
                const changedTurn =
                    snapshot.turn_number !== next.turn_number ||
                    snapshot.turn_context_revision !== next.turn_context_revision;
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
                menu.setSnapshot(next);
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
        notice.hidden = true;
    }
}
export function createInstance(options) {
    return new WorldWorkspace(options);
}
