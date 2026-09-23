import { createNaturalResources, RESOURCE_KINDS } from './natural-resources.js';
import { updateOilSubstrate } from './economy.js';
import { createCartography } from './cartography.js';
import { FEATURE_LAYERS, FEATURE_TITLES } from './geographic-features.js';

export const atlasControls = `
    <section class="atlas-controls">
        <p class="eyebrow">New experiment · geography &amp; resources</p><h2>A named, resourceful world</h2>
        <button type="button" class="secondary-button" data-atlas="names">Try geographic names</button>
        <div class="layer-controls">
            <label><input type="checkbox" data-layer="oceanNames" /> Ocean names</label>
            <label><input type="checkbox" data-layer="oceanAreas" /> Ocean membership tint</label>
            <label><input type="checkbox" data-layer="riverNames" /> River names</label>
            <label><input type="checkbox" data-layer="continentNames" /> Continent names</label>
            <label><input type="checkbox" data-layer="islandNames" /> Island names</label>
            <label><input type="checkbox" data-layer="mountainNames" /> Mountain range names</label>
            <label><input type="checkbox" data-layer="lakeNames" /> Lake names</label>
        </div>
        <p class="hint">One geographic-feature layer, independent of borders. Features can overlap: a range and a lake can belong to the same continent. Small labels appear as you zoom; every feature remains available below.</p>
        <form data-atlas-geography-settings>
            <label>Minimum continent area<select aria-label="Minimum continent area" name="continentMinimum"><option value="10">10 region-areas</option><option value="20" selected>20 region-areas</option><option value="40">40 region-areas</option><option value="80">80 region-areas</option></select></label>
            <button type="submit" class="secondary-button">Classify landmasses</button>
        </form>
        <label>Named feature<select aria-label="Named feature" data-atlas-feature></select></label>
        <button type="button" class="secondary-button" data-atlas="find">Find named feature</button>
        <button type="button" class="secondary-button" data-atlas="resources">Try natural resources</button>
        <div class="layer-controls"><label><input type="checkbox" data-layer="resources" /> Natural resources</label></div>
        <label>Natural resource<select aria-label="Natural resource" data-atlas-resource>${RESOURCE_KINDS.map((kind) => `<option>${kind}</option>`).join('')}</select></label>
        <form data-atlas-settings>
            <label>Deposit abundance<select name="abundance" aria-label="Deposit abundance"><option value="0">None</option><option value="25">Sparse</option><option value="50" selected>Balanced</option><option value="75">Plentiful</option><option value="100">Very plentiful</option></select></label>
            <label>Deposit concentration<select name="concentration" aria-label="Deposit concentration"><option value="0">Dispersed</option><option value="50" selected>Mixed fields</option><option value="100">Concentrated major fields</option></select></label>
            <label>Resource richness<select name="richness" aria-label="Resource richness"><option value="50">Lean · 50%</option><option value="100" selected>Normal · 100%</option><option value="150">Rich · 150%</option><option value="200">Very rich · 200%</option></select></label>
            <button type="submit" class="secondary-button">Apply resource settings</button>
        </form>
        <p class="hint">Resources do not regenerate the landscape. Abundance activates deposits and scales timber stock; concentration clusters mineral/oil fields, not forests. Richness changes quantities. Bright tint = richer; untinted = none. Existing forest cover stays unchanged.</p>
        <p class="hint" data-atlas-summary></p>
    </section>`;
export const atlasInspector = `<section class="experiment-panel" data-atlas-inspector hidden><p class="eyebrow">Geographic identity &amp; natural stock</p><h2 data-atlas-title>Explore the atlas</h2><p class="hint" data-atlas-detail></p><dl class="experiment-metrics" data-atlas-stock></dl><p class="hint">Illustrative stock units, not production per turn. Terrain difficulty is not a road/logistics simulation. Onshore Oil feeds the economic demo; offshore oil, minerals and timber are survey-only. No depletion or harvesting is simulated.</p></section>`;
let lastCartography = null;
export function renderAtlas(root, state) {
    const { cartography, model, substrate } = state;
    const select = root.querySelector('[data-atlas-feature]');
    if (lastCartography !== cartography) {
        const groups = [
            ['Oceans & seas', cartography.oceans],
            ['Rivers & tributaries', cartography.rivers],
            ['Continents', cartography.landmasses.filter((f) => f.type === 'continent')],
            ['Islands', cartography.landmasses.filter((f) => f.type === 'island')],
            ['Mountain ranges', cartography.mountains],
            ['Lakes', cartography.lakes],
        ];
        select.replaceChildren(
            ...groups.map(([title, features]) => {
                const group = document.createElement('optgroup');
                group.label = title;
                for (const feature of features) {
                    const option = document.createElement('option');
                    option.value = feature.id;
                    option.textContent = feature.name;
                    group.append(option);
                }
                return group;
            }),
        );
        lastCartography = cartography;
        state.selectedFeature = null;
    }
    root.querySelector('[data-atlas="find"]').disabled = !select.value;
    const total = substrate.totals[state.naturalResource];
    root.querySelector('[data-atlas-summary]').textContent =
        `${cartography.oceans.length} ocean/sea areas · ${cartography.rivers.length} rivers · ${cartography.landmasses.filter((f) => f.type === 'continent').length} continents · ${cartography.landmasses.filter((f) => f.type === 'island').length} islands · ${cartography.mountains.length} ranges · ${cartography.lakes.length} lakes. ${state.naturalResource}: ${Math.round(total.quantity).toLocaleString()} stock units in ${(total.sites / model.cellCount).toFixed(1)} region-areas${total.offshore ? `; ${total.offshore} offshore cells` : ''}.`;
    root.querySelector('[data-atlas-inspector]').hidden =
        state.labFocus !== 'geography' ||
        ![...Object.values(FEATURE_LAYERS), 'oceanAreas', 'resources'].some((key) => state.layers[key]);
    const cell = model.cellById.get(state.selectedCellId);
    const memberships = (cartography.featuresByCell.get(cell?.id) ?? []).map((id) =>
        cartography.featureById.get(id),
    );
    const feature =
        cartography.featureById.get(state.selectedFeature) ??
        memberships.find((f) => state.layers[FEATURE_LAYERS[f.type]]) ??
        memberships[0];
    root.querySelector('[data-atlas-title]').textContent = feature?.name ?? 'Natural-resource survey';
    const relations = feature?.relations
        .map((r) => `${r.type}: ${cartography.featureById.get(r.featureId)?.name ?? r.featureId}`)
        .join(' · ');
    root.querySelector('[data-atlas-detail]').textContent = feature
        ? `${FEATURE_TITLES[feature.type]} · ${feature.area?.toFixed(1) ?? (feature.cellIds.length / model.cellCount).toFixed(1)} region-areas. ${relations || 'Independent geographic feature.'} ${feature.type === 'lake' ? (feature.namedAfterId ? 'Shares its name with the dominant connected river.' : 'Independent lake name; no unambiguous dominant named river.') : ''}`
        : 'Click a cell or find a feature. Geographic identity is independent of political ownership.';
    const stock = root.querySelector('[data-atlas-stock]');
    stock.replaceChildren();
    if (cell) {
        const entry = substrate.cells.get(cell.id)[state.naturalResource];
        const rows = [
            ...memberships.map((f) => [FEATURE_TITLES[f.type], f.name]),
            [`${state.naturalResource} stock here`, entry.quantity.toFixed(1)],
            ['Richness index', entry.density.toFixed(2)],
            [
                'Terrain extraction difficulty',
                entry.quantity ? `${Math.round(entry.difficulty * 100)} / 100` : 'No deposit',
            ],
            ['Terrain-accessible stock', entry.accessible.toFixed(1)],
        ];
        if (state.naturalResource === 'Timber')
            rows.push(['Illustrative regrowth potential / turn', entry.regrowth.toFixed(2)]);
        if (entry.fieldId) rows.push(['Deposit identity', entry.fieldId]);
        for (const [label, value] of rows) {
            const div = document.createElement('div'),
                dt = document.createElement('dt'),
                dd = document.createElement('dd');
            dt.textContent = label;
            dd.textContent = value;
            div.append(dt, dd);
            stock.append(div);
        }
    }
}

export function installAtlas({ root, state, camera, renderer, fitMap, updateInspector }) {
    const refresh = () => {
        updateInspector();
        renderer.invalidate();
    };
    const enable = (key) => {
        state.layers[key] = true;
        root.querySelector(`[data-layer="${key}"]`).checked = true;
    };
    const terrain = () => {
        state.labFocus = 'geography';
        state.commandMode = null;
        state.orderPreview = null;
        state.armySelected = false;
        state.selectingBeach = false;
        root.querySelector('#geography-view').value = 'terrain';
        root.querySelector('#geography-view').dispatchEvent(new Event('change'));
    };
    for (const button of root.querySelectorAll('[data-atlas]'))
        button.addEventListener('click', () => {
            terrain();
            if (button.dataset.atlas === 'names') {
                for (const key of [...Object.values(FEATURE_LAYERS), 'oceanAreas']) enable(key);
                fitMap();
                state.message =
                    'One geographic atlas: oceans, rivers, continents, islands, ranges and lakes. Click a cell to inspect overlapping memberships, or find a named feature.';
            } else if (button.dataset.atlas === 'resources') {
                enable('resources');
                fitMap();
                state.message =
                    'Natural stock, not production. Choose Oil, minerals, or Timber; click cells to inspect.';
            } else {
                const id = root.querySelector('[data-atlas-feature]').value;
                const feature = state.cartography.featureById.get(id);
                if (!feature) return;
                state.selectedFeature = id;
                const anchor = feature.anchor;
                const cell = state.model.cellById.get(feature.anchorId ?? feature.cellIds[0]);
                state.selectedCellId = cell.id;
                state.selectedRegionId = cell.regionId;
                enable(FEATURE_LAYERS[feature.type]);
                if (feature.type === 'river') enable('rivers');
                camera.x = anchor.x;
                camera.y = anchor.y;
                camera.zoom = Math.max(
                    camera.fitZoom,
                    Math.min(camera.width, camera.height) /
                        (state.model.cellSize *
                            (feature.type === 'river'
                                ? 28
                                : Math.max(12, Math.sqrt(feature.cellIds.length) * 2.5))),
                );
                camera.constrain();
                state.message = `${feature.name} selected. Geography and political ownership are unchanged.`;
            }
            refresh();
        });
    root.querySelector('[data-atlas-geography-settings]').addEventListener('submit', (event) => {
        event.preventDefault();
        state.atlasSettings = Object.fromEntries(new FormData(event.currentTarget));
        state.cartography = createCartography(state.model, state.atlasSettings);
        state.selectedFeature = null;
        enable('continentNames');
        enable('islandNames');
        terrain();
        state.message =
            'Landmass classification updated by land area, not microcell count. Terrain, orders and resources are unchanged.';
        refresh();
    });
    root.querySelector('[data-atlas-resource]').addEventListener('change', (event) => {
        state.naturalResource = event.target.value;
        refresh();
    });
    root.querySelector('[data-atlas-settings]').addEventListener('submit', (event) => {
        event.preventDefault();
        state.resourceSettings = Object.fromEntries(new FormData(event.currentTarget));
        state.substrate = createNaturalResources(state.model, state.resourceSettings);
        updateOilSubstrate(state.economy, state.model, state.substrate);
        enable('resources');
        terrain();
        state.message =
            'Resource fields updated; landscape, names, orders, stocks, and pending oil costs retained. Onshore oil capacity recalculated.';
        refresh();
    });
}
