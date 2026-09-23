import { Camera } from '../client/features/world/Camera.js';
import { createMapLabModel, moveArmy, nations, reachableCells, regionControl } from './model.js';
import { MapLabRenderer, terrainLabel } from './renderer.js';
import { isWater, sharedEdgeId } from './water.js';
import { DEFAULT_GEOGRAPHY } from './geography.js';
import {
    createMilitary,
    resetMilitary,
    activeFormations,
    formationsAt,
    UNIT_TYPES,
    planOrder,
    issueOrder,
    advanceMilitary,
} from './military.js';
import { flagMarkup } from './military-renderer.js';
import { initializeExperiments, renderExperiments, installExperiments } from './experiment-panels.js';
import { recomputeEconomy, recordOilUse } from './economy.js';
import { atlasControls, atlasInspector, renderAtlas, installAtlas } from './atlas-controls.js';
import { administrationActive, administrativeMembership } from './administration.js';
import {
    administrationControls,
    administrationInspector,
    resetAdministration,
    renderAdministration,
    installAdministration,
} from './administration-controls.js';
import './map-lab.scss';

const root = document.getElementById('map-lab-root');

const html = String.raw;
root.innerHTML = html`
    <div class="lab-shell">
        <header class="lab-header">
            <div>
                <p class="eyebrow">Experimental cartography</p>
                <h1>Landscape laboratory</h1>
            </div>
            <div class="lab-header-actions">
                <span class="prototype-badge">Generated geography · demo rules</span>
                <a href="/client/tools">Tools &amp; experiments</a>
            </div>
        </header>
        <aside class="lab-controls" aria-label="Experiment controls">
            ${administrationControls}
            <section>
                <p class="eyebrow">Lab-only visual comparison</p>
                <h2>Terrain v2</h2>
                <div class="layer-controls">
                    <label
                        ><input type="checkbox" data-layer="terrainV2" /> Terrain v2 · layered
                        landscape</label
                    >
                </div>
                <button type="button" class="secondary-button" data-action="terrain-v2-detail">
                    Find terrain comparison
                </button>
                <p class="hint">
                    Toggle at the same camera position to compare. V2 adds continuous ground, tree clusters,
                    shorelines and softer rivers at close zoom. World overview and gameplay geography stay
                    unchanged. Existing terrain, relief, transition and grid controls still apply.
                </p>
                <p class="hint" data-field="terrain-v2-status">Original terrain renderer selected.</p>
            </section>
            ${atlasControls}
            <section>
                <p class="eyebrow">New experiment · optional layers</p>
                <h2>Forces &amp; flags</h2>
                <button type="button" class="secondary-button" data-action="military-demo">
                    Try military demo
                </button>
                <div class="layer-controls">
                    <label><input type="checkbox" data-layer="formations" /> Military formations</label>
                    <label><input type="checkbox" data-layer="orders" checked /> Order arrows</label>
                    <label><input type="checkbox" data-layer="flags" /> Faction flags</label>
                </div>
                <p class="hint">
                    Optional demo layers; geography stays unchanged. Disable formations to return to the
                    original army test. Rebuilding the map resets demo orders.
                </p>
                <button type="button" class="secondary-button" data-action="economy-demo">
                    Try economy demo
                </button>
                <button type="button" class="secondary-button" data-action="naval-demo">
                    Try naval demo
                </button>
                <div class="layer-controls">
                    <label><input type="checkbox" data-layer="economy" /> Economic overlay</label>
                    <label><input type="checkbox" data-layer="naval" /> Naval landing overlay</label>
                </div>
            </section>
            <section>
                <p class="eyebrow">Map scale</p>
                <h2>World size</h2>
                <div class="scale-control" role="group" aria-label="World size">
                    <button type="button" data-scale="scenario" aria-pressed="false">
                        7-region scenario
                    </button>
                    <button type="button" data-scale="world" aria-pressed="true">600-region world</button>
                </div>
                <p class="hint">
                    The full world is a 30 × 20 political map with 11,400 cells at the selected 19-cell
                    resolution.
                </p>
            </section>
            <section>
                <p class="eyebrow">Resolution</p>
                <h2>Cells per region</h2>
                <div class="resolution-control" role="group" aria-label="Cells per region">
                    ${[7, 19, 37]
                        .map(
                            (count) =>
                                `<button type="button" data-resolution="${count}" aria-pressed="${count === 19}">${count}</button>`,
                        )
                        .join('')}
                </div>
                <p class="hint">
                    Changing density resamples the same broad landscape. Small shorelines and drainage routes
                    can change. Demo moves reset.
                </p>
            </section>
            <section>
                <p class="eyebrow">World generation</p>
                <h2>A landscape with reasons</h2>
                <form class="geography-controls" data-form="geography">
                    <label for="geography-seed">World seed</label>
                    <input
                        id="geography-seed"
                        name="seed"
                        type="text"
                        maxlength="64"
                        value="${DEFAULT_GEOGRAPHY.seed}"
                        required
                    />
                    ${[
                        ['continents', 'Continental cores', 2, 5, ''],
                        ['land', 'Land target', 25, 80, '%'],
                        ['coastComplexity', 'Coastal detail', 0, 100, '%'],
                        ['islandAbundance', 'Small island abundance', 0, 100, ' / 100'],
                        ['lakeAbundance', 'Lake abundance', 0, 100, ' / 100'],
                        ['polarExtent', 'Polar extent', 0, 25, '°'],
                        ['snowline', 'Mountain snowline', 800, 3200, ' m'],
                        ['mountains', 'Mountain strength', 0, 100, '%'],
                        ['scale', 'Landscape scale', 50, 180, '%'],
                        ['wetness', 'Wetness', 0, 100, '%'],
                    ]
                        .map(
                            ([key, label, min, max, unit]) => html`
                                <label for="geography-${key}"
                                    >${label}
                                    <output data-output="${key}"
                                        >${DEFAULT_GEOGRAPHY[key]}${unit}</output
                                    ></label
                                >
                                <input
                                    id="geography-${key}"
                                    name="${key}"
                                    type="range"
                                    min="${min}"
                                    max="${max}"
                                    value="${DEFAULT_GEOGRAPHY[key]}"
                                    data-unit="${unit}"
                                    step="${key === 'snowline' ? 100 : 1}"
                                />
                            `,
                        )
                        .join('')}
                    <button class="secondary-button" type="submit">Generate landscape</button>
                    <button class="secondary-button" type="button" data-action="new-seed">
                        Try another seed
                    </button>
                </form>
                <p class="hint" data-field="generation-summary"></p>
                <p class="hint">
                    Small island abundance runs from sparse to plentiful, not an exact count. Zero disables
                    added island groups; natural coastal fragments can remain. Lake abundance controls basin
                    retention (0 = no lakes); higher values allow shallower lakes. Wetness controls vegetation
                    and river flow, not lake abundance. Polar extent is degrees from each pole (0 = no polar
                    caps). Mountain snowline is separate. Coverage applies to the full world before inland
                    lakes. A small scenario is a crop; it may have no lakes or even no land.
                </p>
            </section>
            <section>
                <p class="eyebrow">Layers</p>
                <h2>Read the landscape</h2>
                <label class="view-label" for="geography-view">Map view</label>
                <select id="geography-view">
                    <option value="terrain">Illustrated landscape</option>
                    <option value="elevation">Elevation</option>
                    <option value="moisture">Moisture</option>
                    <option value="temperature">Temperature / polar climate</option>
                    <option value="drainage">Drainage / accumulated flow</option>
                </select>
                <p class="hint" data-field="view-legend"></p>
                <div class="layer-controls">
                    <label><input type="checkbox" data-layer="terrain" checked /> Terrain</label>
                    <label><input type="checkbox" data-layer="tiles" checked /> Illustrated terrain</label>
                    <label
                        ><input type="checkbox" data-layer="transitions" checked /> Terrain transitions</label
                    >
                    <label><input type="checkbox" data-layer="rivers" checked /> Rivers</label>
                    <label><input type="checkbox" data-layer="relief" checked /> Relief shading</label>
                    <label><input type="checkbox" data-layer="political" /> Political ownership</label>
                    <label><input type="checkbox" data-layer="control" /> Military control</label>
                    <label><input type="checkbox" data-layer="microGrid" /> Micro-cell grid</label>
                    <label><input type="checkbox" data-layer="borders" /> Region borders</label>
                    <label><input type="checkbox" data-layer="damage" /> Battle traces</label>
                </div>
                <p class="hint" data-field="tile-status">Loading terrain artwork…</p>
                <p class="hint" data-field="water-summary"></p>
                <button type="button" class="secondary-button" data-action="lake">Find a lake</button>
                <button type="button" class="secondary-button" data-action="army">Find army</button>
                <button type="button" class="secondary-button" data-action="north-pole">
                    Find north polar ice
                </button>
                <button type="button" class="secondary-button" data-action="south-pole">
                    Find south polar ice
                </button>
            </section>
            <section class="scenario-guide">
                <p class="eyebrow">Scenario</p>
                <h2>The Emberfall incursion</h2>
                <p>
                    The <strong>Sable League</strong> occupies Emberfall's western edge, but the region
                    remains politically Aurelian.
                </p>
                <p>
                    Lakes block land movement. Rivers mark cell edges; crossing penalties and bridges come
                    later.
                </p>
                <ol>
                    <li>Click the blue diamond army.</li>
                    <li>Choose a highlighted adjacent cell.</li>
                    <li>Watch control, population, and damage change.</li>
                </ol>
                <button type="button" class="secondary-button" data-action="reset">Reset scenario</button>
            </section>
        </aside>
        <section class="lab-map" aria-label="Interactive experimental hex map">
            <canvas
                tabindex="0"
                aria-label="Hex map. Drag to pan, scroll to zoom, and click cells to inspect or move the army."
            ></canvas>
            <div class="map-status" role="status"></div>
            <div class="performance-status" aria-live="polite">Measuring…</div>
            <div class="map-tools">
                <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
                <span class="zoom-value">100%</span>
                <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
                <button type="button" data-action="fit">Fit</button>
            </div>
            <div class="map-key" aria-hidden="true">
                <span>Zoom for terrain · select a cell to inspect</span>
            </div>
        </section>
        <aside class="lab-inspector" aria-live="polite">
            <div class="inspector-tabs" role="group" aria-label="Inspector focus">
                <button type="button" data-inspect="geography">Inspect geography</button>
                <button type="button" data-inspect="military">Inspect formations</button>
                <button type="button" data-inspect="economy">Inspect economy</button>
                <button type="button" data-inspect="naval">Inspect navy</button>
                <button type="button" data-inspect="administration">Inspect administration</button>
            </div>
            <section class="experiment-panel" data-field="economy-panel" hidden></section>
            <section class="experiment-panel" data-field="naval-panel" hidden></section>
            ${atlasInspector} ${administrationInspector}
            <div data-legacy-inspector>
                <section class="military-panel" data-field="military-panel" hidden></section>
                <div class="faction-key" data-field="faction-key" hidden>
                    ${Object.values(nations)
                        .map((nation) => `<span>${flagMarkup(nation.id)} ${nation.name}</span>`)
                        .join('')}
                    <small>Flags mark political ownership, not local military control.</small>
                </div>
                <p class="eyebrow">Selected region</p>
                <h2 data-field="region-name"></h2>
                <details>
                    <summary>Demo ownership (optional)</summary>
                    <div class="owner-line">
                        <span>Political owner</span><strong data-field="owner"></strong>
                    </div>
                    <div class="control-summary" data-field="control"></div>
                </details>
                <div class="cell-card">
                    <p class="eyebrow">Selected cell</p>
                    <h3 data-field="cell-title">Select a cell</h3>
                    <dl data-field="cell-details"></dl>
                </div>
                <div class="design-question">
                    <p class="eyebrow">Question under test</p>
                    <p>
                        Can you distinguish political ownership, local military control, and the orders of
                        each formation? All geography and display options remain available independently.
                    </p>
                </div>
            </div>
        </aside>
    </div>
`;

const canvas = root.querySelector('canvas');
const useSettings = document.createElement('a');
useSettings.href = '/client/map-generation';
useSettings.textContent = 'Use these settings for a game (beta)';
useSettings.addEventListener('click', () => {
    try {
        localStorage.setItem('no7:map-beta:settings', JSON.stringify(state.model.geography.settings));
    } catch {}
});
root.querySelector('.lab-header-actions').append(useSettings);
const state = {
    model: createMapLabModel(19, 'world'),
    scale: 'world',
    view: 'terrain',
    layers: {
        terrain: true,
        tiles: true,
        transitions: true,
        rivers: true,
        relief: true,
        political: false,
        control: false,
        microGrid: false,
        borders: false,
        damage: false,
        formations: false,
        orders: true,
        flags: false,
        economy: false,
        naval: false,
        oceanNames: false,
        oceanAreas: false,
        riverNames: false,
        continentNames: false,
        islandNames: false,
        mountainNames: false,
        lakeNames: false,
        resources: false,
        terrainV2: false,
        administration: false,
        adminCountries: true,
        adminProvinces: true,
        adminZones: true,
    },
    selectedCellId: null,
    selectedRegionId: 'emberfall',
    armySelected: false,
    message: 'Explore the landscape. Change the seed, coastal detail, or polar extent to compare worlds.',
    metrics: null,
    selectedFormationId: null,
    commandMode: null,
    orderPreview: null,
    labFocus: 'geography',
    economicResource: 'Food',
    economicLens: 'production',
    economicNation: 'aurelia',
    naturalResource: 'Oil',
    resourceSettings: { abundance: 50, concentration: 50, richness: 100 },
    selectedFeature: null,
    atlasSettings: { continentMinimum: 20 },
};
state.military = createMilitary(state.model);
initializeExperiments(state);
resetAdministration(state);
const camera = new Camera(state.model.width, state.model.height);
const renderer = new MapLabRenderer(
    canvas,
    camera,
    () => state,
    (metrics) => {
        state.metrics = metrics;
        const v2 = renderer.terrainV2.diagnostics();
        root.querySelector('[data-field="terrain-v2-status"]').textContent = !state.layers.terrainV2
            ? 'Original terrain renderer selected.'
            : v2.active
              ? `Terrain v2 · ${v2.pending ? `${v2.pending} detail patches preparing` : 'detail ready'} · ${((v2.pixels * 4) / 1048576).toFixed(1)} MiB raster cache.`
              : 'Terrain v2 selected. Zoom in for detail; illustrated terrain must be enabled. Diagnostic views retain their original colours.';
        root.querySelector('.zoom-value').textContent =
            `${Math.round((camera.zoom / camera.fitZoom) * 100)}%`;
        root.querySelector('.performance-status').textContent =
            `${metrics.visibleCells.toLocaleString()} / ${metrics.totalCells.toLocaleString()} visible cells · ${metrics.frameMs.toFixed(1)} ms draw CPU · ${metrics.transitionsPending ? 'preparing blends' : metrics.detail}`;
        root.querySelector('[data-field="tile-status"]').textContent = v2.active
            ? 'Terrain v2 uses procedural ground and canopy sprites, independent of the original artwork. Relief, transitions, rivers, and the grid remain selectable.'
            : metrics.tileStatus === 'ready'
              ? 'Zoom in for blended terrain and shorelines. Toggle Terrain transitions to compare; hide the micro-cell grid for a continuous landscape.'
              : metrics.tileStatus === 'loading'
                ? 'Loading terrain artwork…'
                : 'Artwork unavailable. Terrain colors remain usable.';
    },
);

function fitMap() {
    camera.worldWidth = state.model.width;
    camera.worldHeight = state.model.height;
    camera.fit();
    renderer.invalidate();
}

function percent(value, total) {
    return total ? Math.round((value / total) * 100) : 0;
}

function nationFor(id) {
    return nations[id] ?? { id: 'open-sea', name: 'Open sea', color: '#55798a' };
}

function updateInspector() {
    renderExperiments(root, state);
    renderAtlas(root, state);
    renderAdministration(root, state);
    updateMilitaryPanel();
    const summary = regionControl(state.model, state.selectedRegionId);
    const region = summary.region;
    root.querySelector('[data-field="region-name"]').textContent = region.name;
    const owner = nationFor(region.ownerId);
    const ownerField = root.querySelector('[data-field="owner"]');
    ownerField.textContent = owner.name;
    ownerField.style.setProperty('--nation-color', owner.color);
    const rows = [...summary.controlledCells.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([nationId, count]) => {
            const nation = nationFor(nationId);
            const population = summary.controlledPopulation.get(nationId) ?? 0;
            return html`
                <div class="control-row">
                    <div>
                        <i style="--nation-color:${nation.color}"></i><strong>${nation.name}</strong
                        ><span>${count} cells</span>
                    </div>
                    <div class="bar">
                        <span
                            style="width:${percent(
                                population,
                                summary.population,
                            )}%;--nation-color:${nation.color}"
                        ></span>
                    </div>
                    <small>${percent(population, summary.population)}% of population controlled</small>
                </div>
            `;
        })
        .join('');
    root.querySelector('[data-field="control"]').innerHTML =
        rows +
        `<p class="hint">${summary.waterCells} water cells (excluded from land control)</p><p class="damage-total">Battle trace: ${summary.damage} damage marks</p>`;
    root.querySelector('[data-field="water-summary"]').textContent =
        `${state.model.lakes.length} lakes · ${state.model.rivers.length} river reaches · ${state.model.riverEdges.size} river edges`;
    root.querySelector('[data-action="lake"]').disabled = !state.model.lakes.length;
    const generation = state.model.generation;
    root.querySelector('[data-field="generation-summary"]').textContent =
        `Seed ${generation.settings.seed} · ${generation.landPercent.toFixed(1)}% dry land · ${state.scale === 'world' ? `${generation.majorContinents} major continents · ${generation.islands} small islands · ` : ''}${(generation.largestLakeCells / state.model.cellCount).toFixed(1)} region-areas in largest lake · ${Math.round(generation.milliseconds)} ms generation`;
    for (const [side, sign] of [
        ['north', 1],
        ['south', -1],
    ])
        root.querySelector(`[data-action="${side}-pole"]`).disabled =
            state.scale !== 'world' ||
            !state.model.cells.some((cell) => cell.polarIce && cell.latitude * sign > 0);

    const cell = state.model.cellById.get(state.selectedCellId);
    const title = root.querySelector('[data-field="cell-title"]');
    const details = root.querySelector('[data-field="cell-details"]');
    if (!cell) {
        title.textContent = 'Select a cell';
        details.replaceChildren();
    } else {
        title.textContent = cell.city
            ? 'Emberfall City'
            : cell.lakeId
              ? ((state.cartography.featuresByCell.get(cell.id) ?? [])
                    .map((id) => state.cartography.featureById.get(id))
                    .find((feature) => feature.type === 'lake')?.name ?? 'Lake')
              : cell.frozen
                ? 'Sea ice (ocean underneath)'
                : `${terrainLabel[cell.terrain]} cell`;
        details.innerHTML = html`
            <div>
                <dt>Coordinates</dt>
                <dd>${cell.q}, ${cell.r}</dd>
            </div>
            <div>
                <dt>Population</dt>
                <dd>${cell.population.toLocaleString()}</dd>
            </div>
            <div>
                <dt>Controller</dt>
                <dd>${isWater(cell) ? 'Water — no land occupation' : nationFor(cell.controllerId).name}</dd>
            </div>
            <div>
                <dt>Political owner</dt>
                <dd>${nationFor(cell.politicalOwnerId).name}</dd>
            </div>
            <div>
                <dt>Movement cost</dt>
                <dd>${isWater(cell) ? 'Impassable to land army' : cell.movementCost}</dd>
            </div>
            <div>
                <dt>River banks</dt>
                <dd>${cell.riverEdgeIds.length} edges</dd>
            </div>
            <div>
                <dt>Landform / cover</dt>
                <dd>${cell.landform} / ${cell.vegetation}</dd>
            </div>
            <div>
                <dt>${isWater(cell) ? 'Bed elevation' : 'Elevation'}</dt>
                <dd>${Math.round(cell.elevation)} m</dd>
            </div>
            ${cell.lakeId
                ? `<div><dt>Lake surface / depth</dt><dd>${Math.round(cell.waterLevel)} m / ${Math.round(cell.waterDepth)} m</dd></div>`
                : ''}
            <div>
                <dt>Rainfall / moisture</dt>
                <dd>${Math.round(cell.rainfall * 100)}% / ${Math.round(cell.moisture * 100)}%</dd>
            </div>
            <div>
                <dt>Latitude / temperature</dt>
                <dd>
                    ${Math.abs(cell.latitude).toFixed(1)}° ${cell.latitude >= 0 ? 'N' : 'S'} /
                    ${Math.round(cell.temperature * 50 - 20)}°C
                </dd>
            </div>
            ${cell.frozen
                ? '<div><dt>Ice cover</dt><dd>Frozen water; still impassable to this army</dd></div>'
                : ''}
            <div>
                <dt>Nearby flow</dt>
                <dd>${cell.flow.toFixed(2)} relative runoff</dd>
            </div>
            <div>
                <dt>Drainage outlet</dt>
                <dd>${cell.outletId}</dd>
            </div>
            <div>
                <dt>Battle damage</dt>
                <dd>${cell.damage} / 3</dd>
            </div>
        `;
    }
    root.querySelector('.map-status').textContent = state.message;
}

function rebuild(count, scale = state.scale, options = state.model.geography.settings) {
    let model;
    try {
        model = createMapLabModel(count, scale, options);
    } catch (error) {
        state.message = `${error.message} The previous landscape is still loaded.`;
        updateInspector();
        return;
    }
    state.scale = scale;
    state.model = model;
    state.military = createMilitary(model);
    initializeExperiments(state);
    resetAdministration(state);
    state.selectedFormationId = null;
    state.commandMode = null;
    state.orderPreview = null;
    state.selectedCellId = null;
    state.selectedRegionId = 'emberfall';
    state.armySelected = false;
    state.message =
        scale === 'world'
            ? `${state.model.regions.length} regions and ${state.model.cells.length.toLocaleString()} operational cells loaded.`
            : `${count} cells per region. The scenario has been reset.`;
    for (const button of root.querySelectorAll('[data-resolution]'))
        button.setAttribute('aria-pressed', String(Number(button.dataset.resolution) === Number(count)));
    for (const button of root.querySelectorAll('[data-scale]'))
        button.setAttribute('aria-pressed', String(button.dataset.scale === scale));
    fitMap();
    updateInspector();
}

const geographyForm = root.querySelector('[data-form="geography"]');
for (const input of geographyForm.querySelectorAll('input[type="range"]'))
    input.addEventListener('input', () => {
        root.querySelector(`[data-output="${input.name}"]`).textContent =
            `${input.value}${input.dataset.unit}`;
    });
geographyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    rebuild(state.model.cellCount, state.scale, Object.fromEntries(new FormData(geographyForm)));
});
root.querySelector('[data-action="new-seed"]').addEventListener('click', () => {
    geographyForm.elements.seed.value = `world-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
    geographyForm.requestSubmit();
});
const legends = {
    terrain:
        'Terrain artwork follows landform and vegetation. Hide borders and the grid to read the landscape.',
    elevation:
        'Blue: water · green: low ground · ochre: uplands · white: high peaks. Elevations are illustrative metres above sea level.',
    moisture: 'Ochre: dry → teal: wet. Simplified rainfall plus water proximity, not a weather simulation.',
    temperature:
        'Blue: cold → orange: warm. Northern and southern map rows are the poles; latitude and elevation drive snow, tundra, and sea ice. Temperatures are illustrative.',
    drainage:
        'Dark: little flow → cyan: larger upstream catchment. Select a cell to trace its sampled downstream route in gold. Arrows point toward its outlet.',
};
function updateView() {
    state.view = root.querySelector('#geography-view').value;
    root.querySelector('[data-field="view-legend"]').textContent = legends[state.view];
    updateInspector();
    renderer.invalidate();
}
root.querySelector('#geography-view').addEventListener('change', updateView);

for (const button of root.querySelectorAll('[data-resolution]'))
    button.addEventListener('click', () => rebuild(Number(button.dataset.resolution)));

for (const button of root.querySelectorAll('[data-scale]'))
    button.addEventListener('click', () => rebuild(state.model.cellCount, button.dataset.scale));

for (const input of root.querySelectorAll('[data-layer]'))
    input.addEventListener('change', () => {
        state.layers[input.dataset.layer] = input.checked;
        if (input.dataset.layer === 'administration') {
            state.labFocus = input.checked ? 'administration' : 'geography';
            state.armySelected = false;
            state.commandMode = null;
            state.orderPreview = null;
            state.selectingBeach = false;
        }
        if (
            [
                'oceanNames',
                'oceanAreas',
                'riverNames',
                'continentNames',
                'islandNames',
                'mountainNames',
                'lakeNames',
                'resources',
            ].includes(input.dataset.layer) &&
            input.checked
        )
            state.labFocus = 'geography';
        if (['economy', 'naval', 'formations'].includes(input.dataset.layer)) {
            state.labFocus = input.checked
                ? input.dataset.layer === 'formations'
                    ? 'military'
                    : input.dataset.layer
                : 'geography';
            state.selectingBeach = false;
        }
        if (input.dataset.layer === 'formations') {
            state.armySelected = false;
            state.commandMode = null;
            state.orderPreview = null;
        }
        updateInspector();
        renderer.invalidate();
    });

root.querySelector('[data-action="reset"]').addEventListener('click', () => rebuild(state.model.cellCount));
root.querySelector('[data-action="zoom-in"]').addEventListener('click', () => {
    camera.zoomAt(1.3);
    renderer.invalidate();
});
root.querySelector('[data-action="zoom-out"]').addEventListener('click', () => {
    camera.zoomAt(1 / 1.3);
    renderer.invalidate();
});
root.querySelector('[data-action="fit"]').addEventListener('click', fitMap);
root.querySelector('[data-action="terrain-v2-detail"]').addEventListener('click', () => {
    state.layers.terrainV2 = true;
    root.querySelector('[data-layer="terrainV2"]').checked = true;
    state.labFocus = 'geography';
    state.commandMode = null;
    state.orderPreview = null;
    state.selectingBeach = false;
    root.querySelector('#geography-view').value = 'terrain';
    updateView();
    const army = state.model.cellById.get(state.model.army.cellId);
    const candidates = state.model.cells.filter((cell) => !isWater(cell) && !cell.snowCover);
    const score = (cell) =>
        (cell.vegetation === 'forest' ? 4 : 0) +
        (cell.riverEdgeIds.length ? 4 : 0) +
        (cell.moisture > 0.6 ? 1 : 0) -
        Math.hypot(cell.x - army.x, cell.y - army.y) / state.model.width;
    const cell =
        candidates.reduce((best, cell) => (!best || score(cell) > score(best) ? cell : best), null) ?? army;
    focusCell(cell);
    state.armySelected = false;
    camera.zoom = Math.max(
        camera.fitZoom,
        Math.min(camera.width, camera.height) / (state.model.cellSize * 22),
    );
    camera.constrain();
    state.message =
        'Same map, new drawing. Toggle Terrain v2 to compare without moving the camera or changing the seed.';
    updateInspector();
    renderer.invalidate();
});
function focusCell(cell) {
    // Navigation helpers must never apply a currently armed administration stamp.
    if (administrationActive(state)) state.adminEditor.operation = 'inspect';
    camera.x = cell.x;
    camera.y = cell.y;
    camera.zoom = Math.max(
        camera.fitZoom,
        Math.min(camera.width, camera.height) / (state.model.cellSize * 12),
    );
    camera.constrain();
    state.armySelected = false;
    selectCell(cell);
}
root.querySelector('[data-action="lake"]').addEventListener('click', () => {
    const lake = state.model.lakes[0];
    if (lake) focusCell(state.model.cellById.get(lake.cellIds[Math.floor(lake.cellIds.length / 2)]));
});
root.querySelector('[data-action="army"]').addEventListener('click', () =>
    focusCell(state.model.cellById.get(state.model.army.cellId)),
);
for (const [side, sign] of [
    ['north', 1],
    ['south', -1],
])
    root.querySelector(`[data-action="${side}-pole"]`).addEventListener('click', () => {
        const candidates = state.model.cells.filter((cell) => cell.latitude * sign > 0 && cell.polarIce);
        const cell = candidates[Math.floor(candidates.length / 2)];
        if (cell) focusCell(cell);
    });

let pointer = null;
function endPointer() {
    if (!pointer) return;
    const id = pointer.id;
    const painting = pointer.painting;
    pointer = null;
    if (painting) administration.endStroke();
    canvas.classList.remove('is-panning', 'is-painting');
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
}
function paintPointer(x, y) {
    const bounds = canvas.getBoundingClientRect();
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
        pointer.previousPaint = null;
        return;
    }
    const from = pointer.previousPaint ?? { x, y };
    // Sample between events so a fast drag doesn't skip whole microcells.
    const steps = Math.max(
        1,
        Math.ceil(
            Math.hypot(x - from.x, y - from.y) / Math.max(0.5, state.model.cellSize * camera.zoom * 0.35),
        ),
    );
    const cells = [];
    for (let i = 0; i <= steps; i++)
        cells.push(
            renderer.cellAtScreen(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps),
        );
    pointer.previousPaint = { x, y };
    administration.paintCells(cells);
}
canvas.addEventListener('pointerdown', (event) => {
    if (pointer || (event.button !== 0 && !(administrationActive(state) && [1, 2].includes(event.button))))
        return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const bounds = canvas.getBoundingClientRect();
    pointer = {
        id: event.pointerId,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        dragged: false,
        button: event.button,
        painting: event.button === 0 && administration.beginStroke(),
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add(pointer.painting ? 'is-painting' : 'is-panning');
    if (pointer.painting) paintPointer(pointer.x, pointer.y);
});
canvas.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (pointer.painting) {
        if (!(event.buttons & 1)) endPointer();
        else paintPointer(x, y);
        return;
    }
    if (Math.hypot(x - pointer.x, y - pointer.y) > 3) pointer.dragged = true;
    if (pointer.dragged) {
        camera.pan(x - pointer.x, y - pointer.y);
        renderer.invalidate();
    }
    pointer.x = x;
    pointer.y = y;
});
canvas.addEventListener('pointerup', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    if (pointer.painting) {
        paintPointer(event.clientX - bounds.left, event.clientY - bounds.top);
        endPointer();
        return;
    }
    if (!pointer.dragged && pointer.button === 0) {
        const x = event.clientX - bounds.left,
            y = event.clientY - bounds.top;
        const marker =
            !administrationActive(state) && state.layers.formations && state.view === 'terrain'
                ? renderer.militaryOverlay.markerAt(x, y)
                : null;
        const navalMarker =
            !administrationActive(state) &&
            state.layers.naval &&
            state.view === 'terrain' &&
            renderer.experimentOverlay.navalMarkers.find(
                (entry) => Math.abs(entry.x - x) < 25 && Math.abs(entry.y - y) < 20,
            );
        if (navalMarker && !state.selectingBeach && !state.commandMode && state.labFocus !== 'economy') {
            state.labFocus = 'naval';
            updateInspector();
        } else if (marker && !state.commandMode && !state.selectingBeach && state.labFocus !== 'economy') {
            const index = marker.ids.indexOf(state.selectedFormationId);
            selectFormation(marker.ids[(index + 1) % marker.ids.length], false);
        } else selectCell(marker ? state.model.cellById.get(marker.cellId) : renderer.cellAtScreen(x, y));
    }
    endPointer();
});
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
window.addEventListener('blur', endPointer);
root.addEventListener('change', endPointer, true);
root.addEventListener(
    'click',
    (event) => {
        if (event.target !== canvas) endPointer();
    },
    true,
);
canvas.addEventListener('contextmenu', (event) => {
    if (administrationActive(state)) event.preventDefault();
});
canvas.addEventListener(
    'wheel',
    (event) => {
        event.preventDefault();
        endPointer();
        const bounds = canvas.getBoundingClientRect();
        camera.zoomAt(
            Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003),
            event.clientX - bounds.left,
            event.clientY - bounds.top,
        );
        renderer.invalidate();
    },
    { passive: false },
);
canvas.addEventListener('keydown', (event) => {
    if (
        ['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(
            event.key,
        )
    )
        endPointer();
    const pans = {
        ArrowLeft: [55, 0],
        ArrowRight: [-55, 0],
        ArrowUp: [0, 55],
        ArrowDown: [0, -55],
    };
    if (event.key === 'Escape') {
        state.adminEditor.operation = 'inspect';
        state.selectingBeach = false;
        state.commandMode = null;
        state.orderPreview = null;
        updateInspector();
    } else if (pans[event.key]) camera.pan(...pans[event.key]);
    else if (['+', '='].includes(event.key)) camera.zoomAt(1.3);
    else if (event.key === '-') camera.zoomAt(1 / 1.3);
    else if (event.key === 'Home') camera.fit();
    else return;
    event.preventDefault();
    renderer.invalidate();
});

function selectCell(cell) {
    state.selectedFeature = null;
    if (!cell) return;
    if (administration.inspectCell(cell)) return;
    if (experiments.inspectCell(cell)) return;
    if (state.layers.formations && state.view === 'terrain') {
        state.selectedCellId = cell.id;
        state.selectedRegionId = cell.regionId;
        if (state.commandMode && state.selectedFormationId) {
            state.orderPreview = planOrder(
                state.model,
                state.military,
                state.selectedFormationId,
                cell.id,
                state.commandMode,
            );
            state.message =
                state.orderPreview.error ??
                'Order preview ready. Confirm to queue it; Advance simulation executes orders.';
        } else {
            const group = formationsAt(state.military, cell.id)[0];
            if (group) state.selectedFormationId = group.id;
            state.message = group
                ? `${group.name} selected. Choose Move or Attack, then a target cell.`
                : 'Cell inspected. Select a formation marker or use the roster to give orders.';
        }
        state.armySelected = false;
        updateInspector();
        renderer.invalidate();
        return;
    }
    const armyCellId = state.model.army.cellId;
    if (cell.id === armyCellId) {
        state.armySelected = !state.armySelected;
        state.selectedCellId = cell.id;
        state.selectedRegionId = cell.regionId;
        state.message = state.armySelected
            ? 'Army selected. Highlighted cells are available moves.'
            : 'Army deselected.';
    } else if (
        state.armySelected &&
        reachableCells(state.model).some((candidate) => candidate.id === cell.id)
    ) {
        const previousRegion = state.model.cellById.get(armyCellId).regionId;
        const crossing = state.model.riverEdges.has(sharedEdgeId(armyCellId, cell.id));
        moveArmy(state.model, cell.id);
        recomputeEconomy(state.economy);
        state.selectedCellId = cell.id;
        state.selectedRegionId = cell.regionId;
        state.message =
            previousRegion === cell.regionId
                ? `${nations.sable.name} advanced inside ${state.model.regionById.get(cell.regionId).name}.`
                : `${nations.sable.name} crossed into ${state.model.regionById.get(cell.regionId).name}.`;
        if (crossing) state.message += ' River crossed (no penalty in this demo).';
    } else {
        state.selectedCellId = cell.id;
        state.selectedRegionId = cell.regionId;
        state.armySelected = false;
        state.message = isWater(cell)
            ? `${terrainLabel[cell.terrain]}: impassable to this land army.`
            : `${state.model.regionById.get(cell.regionId).name}: ${terrainLabel[cell.terrain]}, controlled by ${nationFor(cell.controllerId).name}.`;
    }
    updateInspector();
    renderer.invalidate();
}

function selectFormation(id, focus = true) {
    const group = activeFormations(state.military).find((entry) => entry.id === id);
    if (!group) return;
    state.labFocus = 'military';
    const cell = state.model.cellById.get(group.cellId);
    state.selectedFormationId = id;
    state.commandMode = null;
    state.orderPreview = null;
    state.selectedCellId = cell.id;
    state.selectedRegionId = cell.regionId;
    state.armySelected = false;
    if (focus) {
        camera.x = cell.x;
        camera.y = cell.y;
        camera.zoom = Math.max(
            camera.fitZoom,
            Math.min(camera.width, camera.height) / (state.model.cellSize * 22),
        );
        camera.constrain();
    }
    state.message = `${group.name} selected. Choose Move or Attack, then a target cell.`;
    updateInspector();
    renderer.invalidate();
}

function updateMilitaryPanel() {
    const panel = root.querySelector('[data-field="military-panel"]');
    panel.hidden = !state.layers.formations || state.labFocus !== 'military';
    root.querySelector('[data-field="faction-key"]').hidden = !state.layers.flags && !state.layers.formations;
    if (panel.hidden) return;
    const group = state.military.formations.find((entry) => entry.id === state.selectedFormationId);
    panel.innerHTML = html`
        <p class="eyebrow">Command desk · step ${state.military.tick}</p>
        <h2>Field formations</h2>
        <p class="hint">
            Simulation only: all three factions are controllable, with no fog of war. Green = strength; blue =
            morale. Stacks stay individually selectable below.
        </p>
        <div class="formation-roster" role="group" aria-label="Formation roster">
            ${activeFormations(state.military)
                .map(
                    (entry) =>
                        `<button type="button" data-formation="${entry.id}" aria-pressed="${entry.id === state.selectedFormationId}">${flagMarkup(entry.nationId)}<span>${entry.name}<small>${UNIT_TYPES[entry.type].label} · ${entry.strength}% strength · ${entry.status}</small></span></button>`,
                )
                .join('')}
        </div>
        ${group
            ? html` <div class="formation-detail">
                  <h3>${flagMarkup(group.nationId)} ${group.name}</h3>
                  <p>
                      ${group.units
                          .map((unit) => `${unit.count} × ${UNIT_TYPES[unit.type].label}`)
                          .join(' · ')}
                  </p>
                  <label
                      >Strength ${group.strength}%<progress
                          aria-label="Formation strength"
                          value="${group.strength}"
                          max="100"
                      ></progress
                  ></label>
                  <label
                      >Morale ${group.morale}%<progress
                          class="morale"
                          aria-label="Formation morale"
                          value="${group.morale}"
                          max="100"
                      ></progress
                  ></label>
                  <p>
                      ${group.status} ·
                      ${group.order ? `${group.order.type} → ${group.order.targetId}` : 'No order'}
                  </p>
                  <div class="command-buttons">
                      <button
                          type="button"
                          data-command="move"
                          aria-pressed="${state.commandMode === 'move'}"
                          ${group.strength <= 0 ? 'disabled' : ''}
                      >
                          ${group.air ? 'Rebase' : 'Move'}
                      </button>
                      <button
                          type="button"
                          data-command="attack"
                          aria-pressed="${state.commandMode === 'attack'}"
                          ${group.strength <= 0 ? 'disabled' : ''}
                      >
                          ${group.air ? 'Air strike' : 'Attack'}
                      </button>
                      <button type="button" data-command="hold">Hold / cancel order</button>
                  </div>
                  ${state.commandMode
                      ? '<p class="hint">Click a destination on the map. A dashed arrow previews the order; nothing moves until confirmed and advanced. Escape cancels the preview.</p>'
                      : ''}
                  ${state.orderPreview
                      ? `<p class="hint">${state.orderPreview.error ?? `${state.orderPreview.type} · route cost ${state.orderPreview.cost}`}</p>
                    <div class="command-buttons"><button type="button" data-command="confirm" ${state.orderPreview.error ? 'disabled' : ''}>Confirm order</button><button type="button" data-command="discard">Discard preview</button></div>`
                      : ''}
              </div>`
            : '<p class="hint">Select a formation from the roster or the map.</p>'}
        <button type="button" class="secondary-button" data-command="advance">Advance simulation</button>
        <button type="button" class="secondary-button" data-command="reset">Reset military demo</button>
        <p class="hint">
            Cyan arrows: movement · coral: attacks · dotted: air strikes. Low morale can trigger retreat.
            Aircraft strikes return to their base; they never capture land.
        </p>
        <ol class="combat-log" aria-label="Simulation events">
            ${state.military.events.map((event) => `<li>${event}</li>`).join('')}
        </ol>
    `;
}

root.querySelector('[data-action="military-demo"]').addEventListener('click', () => {
    for (const key of ['formations', 'flags', 'orders', 'political']) {
        state.layers[key] = true;
        root.querySelector(`[data-layer="${key}"]`).checked = true;
    }
    root.querySelector('#geography-view').value = 'terrain';
    updateView();
    if (!state.military.tick && !state.military.formations.some((group) => group.order)) {
        const target = state.military.formations.find((group) => group.id === 'aurelia-1');
        for (const id of ['sable-1', 'sable-4'])
            issueOrder(state.model, state.military, id, target.cellId, 'attack');
    }
    selectFormation('sable-1');
    state.message =
        'Military demo enabled. Example attack orders are queued where reachable. Advance simulation, or select any formation and replace its orders.';
    updateInspector();
});

root.querySelector('[data-field="military-panel"]').addEventListener('click', (event) => {
    const formation = event.target.closest('[data-formation]');
    if (formation) {
        selectFormation(formation.dataset.formation);
        return;
    }
    const button = event.target.closest('[data-command]');
    if (!button || button.disabled || !state.layers.formations) return;
    const action = button.dataset.command;
    const group = state.military.formations.find((entry) => entry.id === state.selectedFormationId);
    if (action === 'advance') {
        const fuelBefore = new Map(state.military.formations.map((entry) => [entry.id, entry.oilConsumed]));
        const events = advanceMilitary(state.model, state.military);
        for (const entry of state.military.formations)
            recordOilUse(state.economy, entry.nationId, entry.oilConsumed - fuelBefore.get(entry.id), {
                id: entry.id,
                cellId: entry.cellId,
                label: entry.name,
            });
        recomputeEconomy(state.economy);
        state.orderPreview = null;
        state.commandMode = null;
        state.message =
            events[0] ??
            `Simulation step ${state.military.tick}. Orders advancing; idle formations recover morale.`;
        if (group) {
            state.selectedCellId = group.cellId;
            state.selectedRegionId = state.model.cellById.get(group.cellId).regionId;
        }
    } else if (action === 'reset') {
        state.military = resetMilitary(state.model, state.military);
        recomputeEconomy(state.economy);
        state.selectedFormationId = null;
        state.orderPreview = null;
        state.commandMode = null;
        state.message =
            'Military demo reset. Geography, political ownership, and layer preferences are unchanged.';
    } else if (group) {
        if (['move', 'attack'].includes(action)) {
            state.commandMode = action;
            state.orderPreview = null;
            state.message = 'Click a target cell to preview the order.';
        }
        if (action === 'hold') {
            group.order = null;
            group.progress = 0;
            group.status = 'Holding';
            state.orderPreview = null;
            state.commandMode = null;
        }
        if (action === 'discard') {
            state.orderPreview = null;
            state.commandMode = null;
        }
        if (action === 'confirm' && state.orderPreview && !state.orderPreview.error) {
            const result = issueOrder(
                state.model,
                state.military,
                group.id,
                state.orderPreview.targetId,
                state.commandMode,
            );
            state.message = result.error ?? 'Order confirmed. Advance simulation to execute it.';
            state.orderPreview = null;
            state.commandMode = null;
        }
    }
    updateInspector();
    renderer.invalidate();
});

const experiments = installExperiments({
    root,
    state,
    camera,
    renderer,
    updateInspector,
    fitMap,
});
installAtlas({ root, state, camera, renderer, updateInspector, fitMap });
const administration = installAdministration({ root, state, camera, renderer, updateInspector, fitMap });

fitMap();
updateInspector();
updateView();

Object.defineProperty(window, 'mapLabDiagnostics', {
    configurable: true,
    value: () => {
        const armyCell = state.model.cellById.get(state.model.army.cellId);
        return {
            cellsPerRegion: state.model.cellCount,
            regionCount: state.model.regions.length,
            totalCells: state.model.cells.length,
            scale: state.model.scale,
            view: state.view,
            generation: state.model.generation,
            layers: { ...state.layers },
            labFocus: state.labFocus,
            administration: {
                active: administrationActive(state),
                editor: { ...state.adminEditor },
                revision: state.administration.revision,
                historyLength: state.administration.history.length,
                labels: renderer.administrationOverlay.labels,
                countries: state.administration.countries.map((n) => ({
                    id: n.id,
                    name: n.name,
                    count: n.cellIds.size,
                })),
                provinces: state.administration.provinces.map((p) => ({
                    id: p.id,
                    name: p.name,
                    nationId: p.nationId,
                    count: p.cellIds.size,
                })),
                zones: state.administration.zones.map((z) => ({
                    id: z.id,
                    name: z.name,
                    nationId: z.nationId,
                    color: z.color,
                    count: z.cellIds.size,
                })),
                selected: (() => {
                    const m = administrativeMembership(state.administration, state.selectedCellId);
                    return {
                        cellId: state.selectedCellId,
                        screen: state.model.cellById.has(state.selectedCellId)
                            ? camera.worldToScreen(
                                  state.model.cellById.get(state.selectedCellId).x,
                                  state.model.cellById.get(state.selectedCellId).y,
                              )
                            : null,
                        countryId: m.country?.id,
                        provinceId: m.province?.id,
                        zoneIds: m.zones.map((z) => z.id),
                    };
                })(),
                // Bounded real-cell samples for fixture/browser interaction checks.
                samples: [...state.administration.countryByCell]
                    .filter(([, id]) => id === state.adminEditor.nationId)
                    .slice(0, 10)
                    .map(([id]) => {
                        const c = state.model.cellById.get(id);
                        return { id, ...camera.worldToScreen(c.x, c.y) };
                    }),
            },
            terrainV2: renderer.terrainV2.diagnostics(),
            camera: camera.snapshot(),
            atlas: {
                labels: renderer.atlasOverlay.labels,
                resourceCells: renderer.atlasOverlay.resourceCells,
                resource: state.naturalResource,
                settings: state.substrate.settings,
                totals: state.substrate.totals,
                oceans: state.cartography.oceans.map(({ cellIds, ...ocean }) => ({
                    ...ocean,
                    count: cellIds.length,
                    ...camera.worldToScreen(
                        state.model.cellById.get(ocean.anchorId).x,
                        state.model.cellById.get(ocean.anchorId).y,
                    ),
                })),
                rivers: state.cartography.rivers.map((river) => ({
                    id: river.id,
                    name: river.name,
                    length: river.length,
                    tributaryOf: river.tributaryOf,
                })),
                selectedFeature: state.selectedFeature,
                featureSettings: state.cartography.settings,
                features: state.cartography.features.map((f) => ({
                    id: f.id,
                    type: f.type,
                    name: f.name,
                    area: f.area,
                    count: f.cellIds.length,
                    anchorId: f.anchorId,
                    relations: f.relations,
                    namedAfterId: f.namedAfterId,
                })),
                memberships: state.cartography.featuresByCell.get(state.selectedCellId) ?? [],
                selectedOcean: state.cartography.oceanByCell.get(state.selectedCellId) ?? null,
            },
            economy: {
                resource: state.economicResource,
                lens: state.economicLens,
                nation: state.economicNation,
                tick: state.economy.tick,
                totals: state.economy.totals,
                accounts: state.economy.accounts,
                pendingOil: state.economy.pendingOil,
                lastTurn: state.economy.lastTurn,
                sitesDrawn: renderer.experimentOverlay.economicSites,
                oilSitesDrawn: renderer.experimentOverlay.oilSitesDrawn,
                operationSites: state.economy.operationSites,
                districts: state.economy.districts.map((district) => ({
                    id: district.id,
                    nationId: district.nationId,
                    foodShare: district.foodShare,
                    output: district.output,
                    workforce: district.workforce,
                    usedWorkers: district.usedWorkers,
                    anchorId: district.anchorId,
                    ...camera.worldToScreen(
                        state.model.cellById.get(district.anchorId).x,
                        state.model.cellById.get(district.anchorId).y,
                    ),
                })),
            },
            naval: {
                ...state.naval,
                replay: state.navalReplay,
                markers: renderer.experimentOverlay.navalMarkers,
            },
            military: {
                tick: state.military.tick,
                selectedId: state.selectedFormationId,
                preview: state.orderPreview,
                flagsDrawn: renderer.militaryOverlay.flagsDrawn,
                markers: renderer.militaryOverlay.markers,
                formations: state.military.formations.map((group) => ({
                    ...group,
                    ...camera.worldToScreen(
                        state.model.cellById.get(group.cellId).x,
                        state.model.cellById.get(group.cellId).y,
                    ),
                })),
                events: state.military.events,
            },
            geographySignature: state.model.cells.reduce(
                (hash, cell) => Math.imul(hash ^ Math.round(cell.baseElevation * 100), 16777619),
                2166136261,
            ),
            selectedCell: (() => {
                const cell = state.model.cellById.get(state.selectedCellId);
                return cell
                    ? {
                          id: cell.id,
                          elevation: cell.elevation,
                          moisture: cell.moisture,
                          flow: cell.flow,
                          landform: cell.landform,
                          vegetation: cell.vegetation,
                          latitude: cell.latitude,
                          temperature: cell.temperature,
                          frozen: Boolean(cell.frozen),
                          terrain: cell.terrain,
                      }
                    : null;
            })(),
            landRegions: state.model.regions.filter((region) => region.isLand).length,
            waterRegions: state.model.regions.filter((region) => !region.isLand).length,
            selectedRegionId: state.selectedRegionId,
            armyCellId: state.model.army.cellId,
            metrics: state.metrics,
            rivers: state.model.rivers.length,
            riverEdges: state.model.riverEdges.size,
            lakes: state.model.lakes.length,
            lakeCellScreen: (() => {
                const cell = state.model.cells.find((candidate) => candidate.terrain === 'lake');
                return cell ? camera.worldToScreen(cell.x, cell.y) : null;
            })(),
            armyScreen: camera.worldToScreen(armyCell.x, armyCell.y),
            reachableTargets: reachableCells(state.model).map((cell) => ({
                id: cell.id,
                controllerId: cell.controllerId,
                ...camera.worldToScreen(cell.x, cell.y),
            })),
        };
    },
});

if (import.meta.hot)
    import.meta.hot.dispose(() => {
        renderer.destroy();
        delete window.mapLabDiagnostics;
    });
