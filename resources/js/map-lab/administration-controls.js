import {
    createAdministration,
    createAdministrativeArea,
    editAdministrativeCells,
    undoAdministration,
    administrativeMembership,
    administrationActive,
    setDevelopmentZoneColor,
    beginAdministrativeStroke,
    finishAdministrativeStroke,
} from './administration.js';

export const administrationControls = `
<section class="atlas-controls administration-controls">
    <p class="eyebrow">New experiment · map areas only</p><h2>Provinces &amp; development zones</h2>
    <button type="button" class="secondary-button" data-admin-action="start">Try provinces &amp; zones</button>
    <div class="layer-controls">
        <label><input type="checkbox" data-layer="administration" /> Administration experiment</label>
        <label><input type="checkbox" data-layer="adminCountries" checked /> National borders &amp; tint</label>
        <label><input type="checkbox" data-layer="adminProvinces" checked /> Provincial borders</label>
        <label><input type="checkbox" data-layer="adminZones" checked /> Development zones</label>
    </div>
    <p class="hint">Countries: heavy borders. Provinces: thin solid borders. Zones: translucent colour and dashed outlines. Region and microcell grids remain optional below.</p>
    <div data-admin-editor hidden>
        <label>Country<select aria-label="Administration country" data-admin-country></select></label>
        <button type="button" class="secondary-button" data-admin-action="country">Find country</button>
        <label>Area type<select aria-label="Administrative area type" data-admin-kind><option value="province">Province · exclusive</option><option value="zone">Development zone · overlapping</option></select></label>
        <label>Selected area<select aria-label="Administrative area" data-admin-area></select></label>
        <button type="button" class="secondary-button" data-admin-action="find">Find area</button>
        <form data-admin-name-form>
            <label>Area name<input aria-label="Administrative area name" name="name" maxlength="64" required /></label>
            <button type="submit" class="secondary-button" value="create">Create area</button>
            <button type="submit" class="secondary-button" value="rename" data-admin-rename>Rename area</button>
        </form>
        <label>Map tool<select aria-label="Administration map tool" data-admin-tool><option value="inspect">Inspect only</option><option value="add">Add cells to selected area</option><option value="remove">Remove cells from selected area</option></select></label>
        <label data-admin-color-field hidden>Zone overlay colour<input type="color" aria-label="Zone overlay colour" data-admin-color value="#f0b55e" /><span class="hint" data-admin-color-value></span></label>
        <label>Paint brush<select aria-label="Administration brush size" data-admin-radius><option value="0">1 microcell</option><option value="1">7 microcells</option><option value="2">19 microcells</option></select></label>
        <p class="hint">Add/remove: hold left mouse and drag to paint. Right-drag to pan (or left-drag in Inspect). Wheel to zoom; Escape stops editing. Undo reverses a whole stroke. Adding to a province reassigns cells from their old province; adding to a zone keeps other zones. Brush stops at national borders and water.</p>
        <form data-admin-coordinate-form>
            <label>Microcell coordinates (q,r)<input aria-label="Administration cell coordinates" name="coordinates" placeholder="9,70" required /></label>
            <button type="submit" class="secondary-button">Apply tool at coordinates</button>
        </form>
        <button type="button" class="secondary-button" data-admin-action="undo">Undo last boundary edit</button>
        <button type="button" class="secondary-button" data-admin-action="overlap">Find overlapping zones</button>
        <button type="button" class="secondary-button" data-admin-action="reset">Reset political setup</button>
    </div>
    <p class="hint" data-admin-status></p>
    <p class="hint">Land only; islands/disconnected parts allowed. Changes are temporary: seed, resolution or page reload resets them. No policies or economic effects. Military/economy fixtures are separate and visually paused in this view.</p>
</section>`;

export const administrationInspector = `<section class="experiment-panel" data-admin-inspector hidden>
<p class="eyebrow">Independent political sandbox</p><h2 data-admin-title></h2>
<p class="hint" data-admin-summary></p><dl class="experiment-metrics" data-admin-membership></dl>
<h3>Provinces &amp; zones</h3><div data-admin-list></div>
</section>`;

export function resetAdministration(state) {
    state.administration = createAdministration(state.model);
    const country = state.administration.countries[0];
    state.adminEditor = {
        nationId: country?.id,
        kind: 'province',
        areaId: state.administration.provinces[0]?.id,
        operation: 'inspect',
        radius: 0,
    };
}

const areas = (state) =>
    state.administration[state.adminEditor.kind === 'province' ? 'provinces' : 'zones'].filter(
        (a) => a.nationId === state.adminEditor.nationId,
    );
function options(select, entries, value) {
    const key = JSON.stringify(entries.map((e) => [e.id, e.name]));
    if (select.dataset.options !== key) {
        select.replaceChildren(
            ...entries.map((e) => {
                const option = document.createElement('option');
                option.value = e.id;
                option.textContent = e.name;
                return option;
            }),
        );
        select.dataset.options = key;
    }
    select.value = value ?? '';
}

export function renderAdministration(root, state) {
    const { administration: admin, adminEditor: editor } = state;
    const active = administrationActive(state);
    if (!active || !state.layers[editor.kind === 'province' ? 'adminProvinces' : 'adminZones'])
        editor.operation = 'inspect';
    root.querySelector('[data-admin-editor]').hidden = !active;
    root.querySelector('[data-admin-inspector]').hidden = !active;
    // Existing simulation identity is intentionally not the sovereignty of this sandbox.
    root.querySelector('[data-legacy-inspector]').hidden = active;
    root.querySelector('[data-admin-status]').textContent = active
        ? `${editor.operation === 'inspect' ? 'Inspecting' : editor.operation === 'add' ? 'Adding cells' : 'Removing cells'} · ${admin.countries.length} fixed countries · ${admin.provinces.length} provinces · ${admin.zones.length} zones. National ownership cannot be edited.`
        : 'Optional comparison. Enable the experiment and choose Inspect administration in terrain view.';
    options(root.querySelector('[data-admin-country]'), admin.countries, editor.nationId);
    options(root.querySelector('[data-admin-area]'), areas(state), editor.areaId);
    root.querySelector('[data-admin-kind]').value = editor.kind;
    root.querySelector('[data-admin-tool]').value = editor.operation;
    root.querySelector('[data-admin-radius]').value = String(editor.radius);
    const selected = areas(state).find((a) => a.id === editor.areaId);
    root.querySelector('[data-admin-color-field]').hidden = editor.kind !== 'zone';
    const color = root.querySelector('[data-admin-color]');
    color.disabled = !selected || editor.kind !== 'zone';
    color.value = selected?.color ?? '#f0b55e';
    root.querySelector('[data-admin-color-value]').textContent = selected?.color ?? '';
    root.querySelector('[data-admin-rename]').disabled = !selected;
    root.querySelector('[data-admin-action="find"]').disabled = !selected?.cellIds.size;
    root.querySelector('[data-admin-action="undo"]').disabled = !admin.history.length;
    const input = root.querySelector('[data-admin-name-form] input');
    if (input.dataset.area !== editor.areaId) {
        input.value = selected?.name ?? '';
        input.dataset.area = editor.areaId ?? '';
    }
    if (!active) return;
    const country = admin.countries.find((n) => n.id === editor.nationId);
    root.querySelector('[data-admin-title]').textContent = country?.name ?? 'No country';
    const unassigned = [...country.cellIds].filter((id) => !admin.provinceByCell.has(id)).length;
    root.querySelector('[data-admin-summary]').textContent =
        `${country.cellIds.size.toLocaleString()} land cells · ${(country.cellIds.size / state.model.cellCount).toFixed(1)} region-areas · ${unassigned} cells without a province. Province edits do not change the country; zones may overlap.`;
    const cell = state.model.cellById.get(state.selectedCellId),
        membership = administrativeMembership(admin, cell?.id);
    const rows = [
        ['Microcell', cell?.id ?? 'Select a cell'],
        ['Country', membership.country?.name ?? 'Water / outside countries'],
        ['Province', membership.province?.name ?? 'Unassigned'],
        ['Development zones', membership.zones.map((z) => z.name).join(' · ') || 'None'],
        ['Large hex', cell ? state.model.regionById.get(cell.regionId).name : '—'],
    ];
    root.querySelector('[data-admin-membership]').replaceChildren(
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
    const list = root.querySelector('[data-admin-list]');
    const entries = [
        ...admin.provinces.map((a) => ({ ...a, kind: 'province' })),
        ...admin.zones.map((a) => ({ ...a, kind: 'zone' })),
    ].filter((a) => a.nationId === editor.nationId);
    const key = JSON.stringify(entries.map((a) => [a.id, a.name, a.cellIds.size, editor.areaId === a.id]));
    if (list.dataset.content !== key) {
        const focusedId = list.contains(document.activeElement)
            ? document.activeElement.dataset.adminSelect
            : null;
        list.replaceChildren(
            ...entries.map((a) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'secondary-button';
                button.dataset.adminSelect = a.id;
                button.dataset.kind = a.kind;
                button.setAttribute('aria-pressed', String(a.id === editor.areaId));
                button.textContent = `${a.kind === 'province' ? 'Province' : 'Zone'}: ${a.name} · ${a.cellIds.size} cells`;
                return button;
            }),
        );
        list.dataset.content = key;
        if (focusedId)
            [...list.querySelectorAll('[data-admin-select]')]
                .find((button) => button.dataset.adminSelect === focusedId)
                ?.focus({ preventScroll: true });
    }
}

export function installAdministration({ root, state, camera, renderer, updateInspector, fitMap }) {
    const refresh = () => {
        updateInspector();
        renderer.invalidate();
    };
    const enter = () => {
        state.adminEditor.operation = 'inspect';
        state.layers.administration = true;
        root.querySelector('[data-layer="administration"]').checked = true;
        state.labFocus = 'administration';
        state.view = 'terrain';
        root.querySelector('#geography-view').value = 'terrain';
        root.querySelector('#geography-view').dispatchEvent(new Event('change'));
        state.armySelected = false;
        state.commandMode = null;
        state.orderPreview = null;
        state.selectingBeach = false;
    };
    const choose = (kind, id) => {
        state.adminEditor.kind = kind;
        state.adminEditor.areaId = id;
        state.adminEditor.operation = 'inspect';
    };
    const showEditingLayer = () => {
        const key = state.adminEditor.kind === 'province' ? 'adminProvinces' : 'adminZones';
        state.layers[key] = true;
        root.querySelector(`[data-layer="${key}"]`).checked = true;
    };
    const focus = (ids) => {
        if (!ids?.size) return;
        const cells = [...ids].map((id) => state.model.cellById.get(id));
        const xs = cells.map((c) => c.x),
            ys = cells.map((c) => c.y),
            pad = state.model.cellSize * 5;
        camera.x = (Math.min(...xs) + Math.max(...xs)) / 2;
        camera.y = (Math.min(...ys) + Math.max(...ys)) / 2;
        camera.zoom = Math.max(
            camera.fitZoom,
            Math.min(
                camera.width / (Math.max(...xs) - Math.min(...xs) + pad),
                camera.height / (Math.max(...ys) - Math.min(...ys) + pad),
            ) * 0.8,
        );
        camera.constrain();
    };
    const inspectCell = (cell) => {
        if (!administrationActive(state) || !cell) return false;
        state.selectedCellId = cell.id;
        state.selectedRegionId = cell.regionId;
        state.selectedFeature = null;
        const editor = state.adminEditor;
        if (editor.operation !== 'inspect') {
            const result = editAdministrativeCells(state.administration, state.model, {
                ...editor,
                cellId: cell.id,
            });
            state.message =
                result.error ??
                `${result.changed} cells ${editor.operation === 'add' ? 'added' : 'removed'}; ${result.rejected} outside-country/water cells skipped. Other layers unchanged.`;
        } else
            state.message =
                'Cell inspected: country, province, all development zones and underlying large hex.';
        const coordinate = root.querySelector('[data-admin-coordinate-form] input');
        if (document.activeElement !== coordinate) coordinate.value = cell.id;
        refresh();
        return true;
    };
    root.querySelector('[data-admin-country]').addEventListener('change', (event) => {
        state.adminEditor.nationId = event.target.value;
        choose(state.adminEditor.kind, areas(state)[0]?.id);
        refresh();
    });
    root.querySelector('[data-admin-kind]').addEventListener('change', (event) => {
        state.adminEditor.kind = event.target.value;
        choose(event.target.value, areas(state)[0]?.id);
        refresh();
    });
    root.querySelector('[data-admin-area]').addEventListener('change', (event) => {
        choose(state.adminEditor.kind, event.target.value);
        refresh();
    });
    root.querySelector('[data-admin-tool]').addEventListener('change', (event) => {
        state.adminEditor.operation = event.target.value;
        if (event.target.value !== 'inspect') showEditingLayer();
        refresh();
    });
    root.querySelector('[data-admin-radius]').addEventListener('change', (event) => {
        state.adminEditor.radius = Number(event.target.value);
        refresh();
    });
    root.querySelector('[data-admin-name-form]').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!administrationActive(state)) return;
        const name = new FormData(event.currentTarget).get('name').trim().slice(0, 64);
        if (!name) return;
        const editor = state.adminEditor;
        if (event.submitter?.value === 'rename') {
            const area = areas(state).find((a) => a.id === editor.areaId);
            if (area) {
                area.name = name;
                state.administration.revision++;
            }
        } else {
            const area = createAdministrativeArea(state.administration, editor.kind, editor.nationId, name);
            if (area) {
                editor.areaId = area.id;
                editor.operation = 'add';
                showEditingLayer();
            }
        }
        state.message = 'Area saved in this temporary map. Hold left mouse to paint land; right-drag to pan.';
        refresh();
    });
    root.querySelector('[data-admin-coordinate-form]').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!administrationActive(state)) return;
        const raw = String(new FormData(event.currentTarget).get('coordinates')).trim();
        const parts = raw.split(',').map((s) => s.trim());
        const cell =
            parts.length === 2 && parts.every((s) => /^-?\d+$/.test(s))
                ? state.model.cellById.get(parts.map(Number).join(','))
                : null;
        if (cell) inspectCell(cell);
        else {
            state.message = 'Enter existing microcell coordinates as q,r.';
            refresh();
        }
    });
    root.querySelector('[data-admin-list]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-admin-select]');
        if (!button) return;
        choose(button.dataset.kind, button.dataset.adminSelect);
        focus(areas(state).find((a) => a.id === state.adminEditor.areaId)?.cellIds);
        refresh();
    });
    for (const button of root.querySelectorAll('[data-admin-action]'))
        button.addEventListener('click', () => {
            const action = button.dataset.adminAction;
            if (action === 'start') {
                enter();
                fitMap();
                state.message =
                    'Fixed countries, editable provinces, overlapping zones. Select a country or find the overlap example.';
            } else if (!administrationActive(state)) return;
            else if (action === 'reset') {
                if (
                    !window.confirm(
                        'Reset this temporary political setup? Province and zone edits will be lost. The landscape and other experiments stay unchanged.',
                    )
                )
                    return;
                resetAdministration(state);
                state.message = 'Political setup reset; terrain, camera and other experiments retained.';
            } else if (action === 'undo') {
                undoAdministration(state.administration);
                state.message = 'Last boundary edit undone.';
            } else if (action === 'country')
                focus(
                    state.administration.countries.find((n) => n.id === state.adminEditor.nationId)?.cellIds,
                );
            else if (action === 'find')
                focus(areas(state).find((a) => a.id === state.adminEditor.areaId)?.cellIds);
            else if (action === 'overlap') {
                const admin = state.administration;
                const id = [...admin.countryByCell.keys()].find(
                    (id) =>
                        admin.countryByCell.get(id) === state.adminEditor.nationId &&
                        admin.zones.filter((z) => z.cellIds.has(id)).length > 1,
                );
                if (id) {
                    const cell = state.model.cellById.get(id);
                    choose('zone', admin.zones.find((z) => z.cellIds.has(id)).id);
                    camera.x = cell.x;
                    camera.y = cell.y;
                    camera.zoom = Math.max(
                        camera.fitZoom,
                        Math.min(camera.width, camera.height) / (state.model.cellSize * 24),
                    );
                    camera.constrain();
                    inspectCell(cell);
                } else
                    state.message =
                        'This country has no overlapping demo zones on this seed. Create two zones and add the same cells to both.';
            }
            refresh();
        });
    let stroke = null;
    let visited = new Set();
    const canPaint = () =>
        administrationActive(state) &&
        state.layers[state.adminEditor.kind === 'province' ? 'adminProvinces' : 'adminZones'] &&
        ['add', 'remove'].includes(state.adminEditor.operation) &&
        areas(state).some((a) => a.id === state.adminEditor.areaId);
    const endStroke = () => {
        if (!stroke) return;
        const count = finishAdministrativeStroke(stroke);
        stroke = null;
        visited.clear();
        state.message = `${count} cells changed in this stroke. Undo reverses the whole stroke.`;
        refresh();
    };
    root.querySelector('[data-admin-color]').addEventListener('input', (event) => {
        if (!administrationActive(state) || state.adminEditor.kind !== 'zone') return;
        setDevelopmentZoneColor(state.administration, state.adminEditor.areaId, event.target.value);
        refresh();
    });
    return {
        inspectCell,
        canPaint,
        endStroke,
        beginStroke() {
            endStroke();
            if (!canPaint()) return false;
            stroke = beginAdministrativeStroke(state.administration, state.adminEditor);
            return true;
        },
        paintCells(cells) {
            if (!stroke) return;
            if (
                !canPaint() ||
                stroke.admin !== state.administration ||
                Object.entries(stroke.editor).some(([key, value]) => state.adminEditor[key] !== value)
            ) {
                endStroke();
                return;
            }
            let last = null;
            for (const cell of cells) {
                if (!cell || visited.has(cell.id)) continue;
                visited.add(cell.id);
                last = cell;
                editAdministrativeCells(
                    state.administration,
                    state.model,
                    { ...stroke.editor, cellId: cell.id },
                    stroke,
                );
            }
            if (!last) return;
            state.selectedCellId = last.id;
            state.selectedRegionId = last.regionId;
            state.selectedFeature = null;
            state.message = `${stroke.changes.size} cells changed · painting ${stroke.editor.operation === 'add' ? 'additions' : 'removals'}. Water and foreign land are skipped.`;
            refresh();
        },
    };
}
