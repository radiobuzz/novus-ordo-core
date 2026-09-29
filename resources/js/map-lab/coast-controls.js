import { coastActive, ACCESS_LABELS, EXPOSURE_LABELS } from '../map/coasts.js';

export const coastControls = `<section class="atlas-controls">
<p class="eyebrow">Geographic interpretation · first test</p><h2>Coasts &amp; bays</h2>
<button type="button" class="secondary-button" data-coast-start>Try coasts &amp; bays</button>
<div class="layer-controls"><label><input type="checkbox" data-layer="coasts" /> Shoreline analysis</label></div>
<div class="layer-controls"><label><input type="checkbox" data-layer="coastalDetail" checked /> Coastal terrain detail</label></div>
<p class="hint">Close-up artwork: soft margins, rocky faces, rough approaches and exposure-inspired foam. Turn analysis off to see the landscape clearly. Artistic cues, not surveyed beaches or current weather.</p>
<label>Shoreline view<select aria-label="Shoreline view" data-coast-lens><option value="exposure">Potential exposure</option><option value="access">Land access</option></select></label>
<p class="hint" data-coast-legend></p>
<label>Bay candidate<select aria-label="Bay candidate" data-coast-bay></select></label>
<button type="button" class="secondary-button" data-coast-find-bay>Find bay</button>
<label>Shore example<select aria-label="Shore example" data-coast-example><option value="sheltered">Sheltered ocean shore</option><option value="exposed">Exposed ocean shore</option><option value="gentle">Easier land access</option><option value="steep">Harder land access</option><option value="lake">Lake shore</option></select></label>
<button type="button" class="secondary-button" data-coast-find-shore>Find shore example</button>
<p class="hint" data-coast-summary></p>
<p class="hint">Bay names use the same atlas as oceans and lakes (Bay names toggle below). Dashed white lines mark a selected candidate's proposed mouth. Colours grade individual shore edges, not whole regions. Geometry only—not waves, seabed depth, port quality or battle odds.</p>
</section>`;
export const coastInspector = `<section class="experiment-panel" data-coast-inspector hidden>
<p class="eyebrow">Coasts &amp; bays · provisional measurements</p><h2 data-coast-title></h2>
<p class="hint" data-coast-description></p>
<label>Selected cell shoreline<select aria-label="Selected cell shoreline" data-coast-edge></select></label>
<dl class="experiment-metrics" data-coast-metrics></dl>
<p class="hint">Lengths use region-lengths, not km; area uses region-areas. Shore rise is elevation change per region-length, not a surveyed beach slope. Small inlets and grades may change with sampling resolution. Ice is reported separately.</p>
</section>`;

function options(select, entries, value) {
    const key = JSON.stringify(entries);
    if (select.dataset.entries !== key) {
        select.replaceChildren(
            ...entries.map(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                return option;
            }),
        );
        select.dataset.entries = key;
    }
    if (entries.some(([id]) => id === value)) select.value = value;
}
export function renderCoasts(root, state) {
    const { coasts, bays } = state.cartography;
    const active = coastActive(state);
    root.querySelector('[data-coast-inspector]').hidden = !active;
    if (active) root.querySelector('[data-base-inspector]').hidden = true;
    root.querySelector('[data-coast-lens]').value = state.coastLens;
    root.querySelector('[data-coast-legend]').textContent =
        state.coastLens === 'access'
            ? 'Green → yellow → orange → red: favourable / limited / difficult / unsuitable land access. Grey: unknown.'
            : 'Green → yellow → orange → red: sheltered / partly sheltered / open / exposed. Potential exposure, not prevailing weather.';
    root.querySelector('[data-coast-summary]').textContent =
        `${bays.length} conservative bay candidates · ${coasts.shores.length.toLocaleString()} shore edges. No coastline was changed.`;
    const baySelect = root.querySelector('[data-coast-bay]');
    options(
        baySelect,
        bays.map((b) => [b.id, `${b.name} · ${b.waterType === 'lake' ? 'lake inlet' : 'ocean inlet'}`]),
        state.selectedFeature,
    );
    root.querySelector('[data-coast-find-bay]').disabled = !bays.length;
    baySelect.disabled = !bays.length;
    if (!active) return;
    const ids = coasts.shoresByCell.get(state.selectedCellId) ?? [];
    if (!ids.includes(state.selectedShoreId)) state.selectedShoreId = ids[0] ?? null;
    const edgeSelect = root.querySelector('[data-coast-edge]');
    options(
        edgeSelect,
        ids.map((id, i) => [
            id,
            `Edge ${i + 1} · ${coasts.shoreById.get(id).waterType} · land ${coasts.shoreById.get(id).landId}`,
        ]),
        state.selectedShoreId,
    );
    edgeSelect.disabled = !ids.length;
    const shore = coasts.shoreById.get(state.selectedShoreId);
    const bay =
        bays.find((b) => b.id === state.selectedFeature) ??
        bays.find((b) => b.cellIds.includes(state.selectedCellId));
    root.querySelector('[data-coast-title]').textContent =
        bay?.name ?? (shore ? 'Shoreline segment' : 'Inspect a coast');
    root.querySelector('[data-coast-description]').textContent = bay
        ? 'Candidate inferred from land enclosure and one connected opening. Highlight and dashed mouth are provisional, not an official geographic boundary.'
        : 'Click either side of a shoreline, or use Find shore example. Different sides of the same cell can have different conditions.';
    const rows = [];
    if (bay)
        rows.push(
            ['Water body', bay.waterType === 'lake' ? 'Lake inlet—not ocean access' : 'Ocean inlet'],
            ['Bay area', `${bay.area.toFixed(2)} region-areas`],
            ['Proposed mouth length', `${bay.mouthWidth.toFixed(2)} region-lengths`],
            ['Inward extent', `${bay.inward.toFixed(2)} region-lengths`],
            ['Land enclosure of boundary', `${Math.round(bay.enclosure * 100)}%`],
        );
    if (shore)
        rows.push(
            ['Shore edge', `${shore.landId} ↔ ${shore.waterId}`],
            [
                'Potential exposure',
                `${EXPOSURE_LABELS[shore.exposureGrade]}${shore.truncated ? ' · map-edge-limited estimate' : ''}`,
            ],
            ['Land access', shore.accessGrade === null ? 'Unknown' : ACCESS_LABELS[shore.accessGrade]],
            ['Why', shore.reasons.join('; ')],
            ['Water surface', shore.surface === null ? 'Unknown' : `${Math.round(shore.surface)} m`],
            [
                'Shore rise',
                shore.shoreRise === null ? 'Unknown' : `${Math.round(shore.shoreRise)} m / region-length`,
            ],
            [
                'Best sampled inland rise',
                shore.inlandRise === null
                    ? 'Unknown'
                    : `${Math.round(shore.inlandRise)} m over 1 region-length`,
            ],
            ['Lower-relief inland samples', `${Math.round(shore.ground * 100)}%`],
            ['Water approach', 'Geometric openness only; navigability and seabed depth not assessed'],
        );
    root.querySelector('[data-coast-metrics]').replaceChildren(
        ...rows.map(([label, value]) => {
            const div = document.createElement('div'),
                dt = document.createElement('dt'),
                dd = document.createElement('dd');
            dt.textContent = label;
            dd.textContent = value;
            div.append(dt, dd);
            return div;
        }),
    );
}

export function installCoasts({ root, state, camera, renderer, updateInspector }) {
    const refresh = () => {
        updateInspector();
        renderer.invalidate();
    };
    const enter = (names = false) => {
        state.labFocus = 'coasts';
        state.armySelected = false;
        state.commandMode = null;
        state.orderPreview = null;
        state.selectingBeach = false;
        state.layers.coasts = true;
        if (names) state.layers.bayNames = true;
        root.querySelector('[data-layer="coasts"]').checked = true;
        root.querySelector('[data-layer="bayNames"]').checked = state.layers.bayNames;
        root.querySelector('#geography-view').value = 'terrain';
        root.querySelector('#geography-view').dispatchEvent(new Event('change'));
    };
    const focus = (point, span) => {
        camera.x = point.x;
        camera.y = point.y;
        camera.zoom = Math.max(camera.fitZoom, Math.min(camera.width, camera.height) / span);
        camera.constrain();
    };
    const findBay = () => {
        const id = root.querySelector('[data-coast-bay]').value;
        enter(true);
        const bay = state.cartography.featureById.get(id);
        if (!bay) {
            state.message =
                'No convincing bay candidates on this map. Try a different seed; no coastline will be altered.';
            refresh();
            return;
        }
        state.selectedFeature = bay.id;
        state.selectedCellId = bay.anchorId;
        state.selectedRegionId = state.model.cellById.get(bay.anchorId).regionId;
        state.selectedShoreId = null;
        const cells = bay.cellIds.map((key) => state.model.cellById.get(key));
        const xs = cells.map((c) => c.x),
            ys = cells.map((c) => c.y);
        const left = Math.min(...xs),
            right = Math.max(...xs),
            top = Math.min(...ys),
            bottom = Math.max(...ys);
        const pad = state.model.cellSize * 5;
        camera.x = (left + right) / 2;
        camera.y = (top + bottom) / 2;
        camera.zoom = Math.max(
            camera.fitZoom,
            Math.min(camera.width / (right - left + pad), camera.height / (bottom - top + pad)) * 0.8,
        );
        camera.constrain();
        state.message = `${bay.name}: inspect the highlighted interior and dashed proposed mouth. This is a candidate, not a navigation guarantee.`;
        refresh();
    };
    root.querySelector('[data-coast-start]').addEventListener('click', () => {
        enter(true);
        state.message =
            'Coasts & bays: inspect named candidates, then compare exposure and land access. Generator and all other experiments are unchanged.';
        if (state.cartography.bays.length) findBay();
        else refresh();
    });
    root.querySelector('[data-coast-find-bay]').addEventListener('click', findBay);
    root.querySelector('[data-coast-lens]').addEventListener('change', (event) => {
        state.coastLens = event.target.value;
        enter();
        refresh();
    });
    root.querySelector('[data-coast-edge]').addEventListener('change', (event) => {
        state.selectedShoreId = event.target.value;
        refresh();
    });
    root.querySelector('[data-coast-find-shore]').addEventListener('click', () => {
        enter();
        const kind = root.querySelector('[data-coast-example]').value;
        const all = state.cartography.coasts.shores.filter(
            (s) => s.waterType === (kind === 'lake' ? 'lake' : 'ocean') && !s.truncated,
        );
        const rank = (s) =>
            kind === 'gentle'
                ? -(s.shoreRise ?? Infinity)
                : kind === 'steep'
                  ? (s.shoreRise ?? -Infinity)
                  : kind === 'sheltered'
                    ? -s.exposure
                    : s.exposure;
        const shore = all.sort((a, b) => rank(b) - rank(a))[0];
        if (!shore) {
            state.message = 'No matching shore example on this map.';
            refresh();
            return;
        }
        const cell = state.model.cellById.get(shore.landId);
        state.selectedFeature = null;
        state.selectedCellId = cell.id;
        state.selectedRegionId = cell.regionId;
        state.selectedShoreId = shore.id;
        state.coastLens = ['gentle', 'steep'].includes(kind) ? 'access' : 'exposure';
        focus(shore.midpoint, state.cartography.coasts.unit * 5);
        state.message =
            'Selected one shoreline segment. Shelter, shore rise and inland access are separate geographic clues.';
        refresh();
    });
    return {
        inspectCell(cell) {
            if (!coastActive(state) || !cell) return false;
            state.selectedCellId = cell.id;
            state.selectedRegionId = cell.regionId;
            state.selectedShoreId = null;
            state.selectedFeature =
                state.cartography.bays.find((b) => b.cellIds.includes(cell.id))?.id ?? null;
            refresh();
            return true;
        },
    };
}
