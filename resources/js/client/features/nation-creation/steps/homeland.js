import { MapLayerMenu } from '../../../ui/map/MapLayerMenu.js';
import { Component } from '../../../runtime/Component.js';
import { el, button } from '../../../ui/dom.js';
import { MapViewport } from '../../../ui/map/MapViewport.js';
import { createLayers } from '../../../ui/map/layers.js';
import { mapDefinitionFor } from '../../../ui/map/HexMap.js';

class HomelandStep extends Component {
    async render() {
        const { process } = this.inputs,
            { i18n } = this.services;
        const mapDefinition = mapDefinitionFor(process.options.map, process.options.territories);
        this.element.append(
            i18n.bind(this.scope, el('h2', { tabindex: -1 }), 'nation.homelandTitle'),
            i18n.bind(this.scope, el('p', { class: 'step-intro' }), 'nation.homelandBody', () => ({
                count: process.options.required_territories,
            })),
        );
        const count = el('strong', { class: 'homeland-count', role: 'status' });
        const clear = i18n.bind(this.scope, button('', 'text-button'), 'nation.clear');
        const search = el('input', { type: 'search', class: 'territory-search' });
        i18n.bind(this.scope, search, 'nation.search', {}, 'placeholder');
        i18n.bind(this.scope, search, 'nation.search', {}, 'aria-label');
        const list = el('div', { class: 'homeland-list' });
        const error = el('p', { class: 'field-error', role: 'alert', tabindex: -1 });
        const layers = createLayers().filter((layer) => ['terrain', 'detail'].includes(layer.id));
        const map = new MapViewport({
            scope: this.scope,
            i18n,
            definition: mapDefinition,
            territories: process.options.territories,
            layers,
            savedCamera: process.camera,
            context: {
                homeland: () => ({
                    selected: process.draft.homeland,
                    available: process.options.suitable_ids,
                }),
            },
            onDraw: () => {
                if (map.context.mapLayers) map.context.mapLayers.updateDetailStatus(map.renderer);
            },
            onSelect: (territory) => {
                if (territory) process.select(territory.territory_id);
            },
        });
        const layerMenu = new MapLayerMenu({
            scope: this.scope,
            i18n,
            model: mapDefinition.model,
            snapshot: {
                territories: process.options.territories,
                resource_definitions: process.options.resource_definitions,
            },
            host: map.element,
            controls: map.element.querySelector('.map-controls'),
            homeland: true,
            saved: process.mapLayers,
            onChange: () => {
                process.mapLayers = layerMenu.preferences();
                map.invalidate();
            },
        });
        map.context.mapLayers = layerMenu;
        this.scope.listen(map.canvas, 'click', (e) => {
            layerMenu.drawer.hidden = true;
            layerMenu.updatePanels();
            const b = map.canvas.getBoundingClientRect();
            layerMenu.inspect(map.renderer.cellAtScreen(e.clientX - b.left, e.clientY - b.top));
        });
        this.scope.own(() => {
            process.mapLayers = layerMenu.preferences();
            process.camera = map.camera.snapshot();
        });
        this.element.append(
            el('div', { class: 'homeland-toolbar' }, count, clear),
            error,
            el(
                'div',
                { class: 'homeland-workspace' },
                map.element,
                el('aside', { class: 'homeland-directory' }, search, list),
            ),
        );
        const renderList = () => {
            const active = list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
            const scroll = list.scrollTop;
            const matches = process.options.territories.filter(
                (t) =>
                    process.options.suitable_ids.includes(t.territory_id) &&
                    t.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
            );
            list.replaceChildren(
                ...matches.map((t) => {
                    const selected = process.draft.homeland.includes(t.territory_id);
                    return el(
                        'button',
                        {
                            type: 'button',
                            class: 'homeland-territory',
                            'data-id': t.territory_id,
                            'aria-pressed': String(selected),
                            disabled:
                                !selected &&
                                (!process.selectable(t.territory_id) ||
                                    process.draft.homeland.length >= process.options.required_territories),
                        },
                        el('span', { text: t.name }),
                        el('small', { text: i18n.t(selected ? 'nation.chosen' : 'nation.available') }),
                    );
                }),
            );
            if (!matches.length) list.append(el('p', { text: i18n.t('nation.noMatches') }));
            if (active) list.querySelector(`[data-id="${active}"]`)?.focus({ preventScroll: true });
            list.scrollTop = scroll;
        };
        const update = () => {
            count.textContent = i18n.t('nation.selected', {
                selected: process.draft.homeland.length,
                total: process.options.required_territories,
            });
            const issue = process.errors.territory_ids;
            error.textContent = issue?.key
                ? i18n.t(issue.key, issue.params)
                : Array.isArray(issue)
                  ? issue.join(' ')
                  : '';
            renderList();
            map.invalidate();
        };
        this.focusError = () => error.focus();
        this.scope.listen(clear, 'click', () => process.updateDraft('homeland', []));
        this.scope.listen(search, 'input', renderList);
        this.scope.listen(list, 'click', (event) => {
            const row = event.target.closest('[data-id]');
            if (row) {
                const id = Number(row.dataset.id);
                process.select(id);
                const territory = process.options.territories.find((t) => t.territory_id === id);
                const center = map.picker.center?.(territory);
                if (center) {
                    map.camera.x = center.x;
                    map.camera.y = center.y;
                    map.camera.zoom = Math.max(map.camera.zoom, map.camera.fitZoom * 4);
                    map.invalidate();
                }
            }
        });
        process.changed.subscribe(this.scope, update);
        i18n.changed.subscribe(this.scope, update);
        update();
    }
}
export function createInstance(options) {
    return new HomelandStep(options);
}
