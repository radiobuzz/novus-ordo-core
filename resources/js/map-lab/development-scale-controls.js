import { RangeField } from '../client/ui/RangeField.js';
import { setScaleValue, restoreScaleCheckpoint, studyCells, setCellIndicator } from './development-scale.js';
import { supportsUrbanIntensity } from './development-complexes.js';

export const scaleControls = `<button type="button" class="secondary-button" data-development-scale="start">Try scale comparison</button>
<details data-development-scale-panel><summary>Scale &amp; microcell study</summary>
<p class="hint">Current / Half / Quarter compare linear dimensions at the same camera. Half-size occupies roughly one-quarter the area; quarter-size roughly one-sixteenth, before terrain checks. Values apply to this example only.</p>
<div class="development-presets" role="group" aria-label="Development scale comparison">
<button type="button" class="secondary-button" data-development-scale="100">Current size</button>
<button type="button" class="secondary-button" data-development-scale="50">Half size</button>
<button type="button" class="secondary-button" data-development-scale="25">Quarter size</button>
</div><div data-development-scale-ranges></div>
<label><input type="checkbox" data-development-cell-data /> Use synthetic microcell data</label>
<label><input type="checkbox" data-layer="developmentCells" /> Microcell development indicators</label>
<button type="button" class="secondary-button" data-development-scale="guides">Show study guides</button>
<p class="hint">Synthetic allowance limits the parcel area in each microcell; cell intensity modulates the urban architecture. These are independent examples, not real population or production. Parcels can cross hex edges, sharing the area allowance of each touched cell. Roads, clearing fringes and sprite shadows are excluded from the area measurement.</p>
<label>Study microcell<select aria-label="Study microcell" data-development-study-cell></select></label>
<div data-development-cell-ranges></div>
<p class="hint" data-development-scale-summary></p>
<button type="button" class="secondary-button" data-development-scale="restore">Restore scale checkpoint</button>
<p class="hint">Restore returns original geometry, size and spacing and disables synthetic inputs. It preserves built extent, activity, urban intensity and the camera. Hiding the optional indicators leaves the test values applied.</p>
</details>`;

export function installScaleControls({ root, state, scope, selected, enter, focus, refresh }) {
    const fields = {},
        cellFields = {};
    for (const [key, label, min, max, help] of [
        [
            'footprintScale',
            'Development scale',
            25,
            100,
            'Scales the whole example: structures, spacing, fields, tracks and clearing. Linear size, not area.',
        ],
        [
            'structureScale',
            'Structure size',
            40,
            100,
            'Relative to the chosen scale. Smaller buildings/equipment and pads, without moving their centres. Fields and quarry pits are unchanged.',
        ],
        [
            'spacing',
            'Structure spacing',
            70,
            140,
            'Relative distance between parcel centres. Crowded overlaps and unsuitable terrain are omitted.',
        ],
    ]) {
        fields[key] = new RangeField({
            scope,
            label,
            min,
            max,
            value: 100,
            unit: '%',
            help,
            onChange: (value) => {
                if (!fields[key].input.validity.valid) return;
                if (setScaleValue(state.development, selected()?.id, key, value)) {
                    enter();
                    refresh();
                }
            },
        });
        root.querySelector('[data-development-scale-ranges]').append(fields[key].element);
    }
    for (const [key, label, help] of [
        [
            'coverage',
            'Cell development allowance',
            'Maximum parcel area in this microcell. Zero excludes parcels touching it; no land is manufactured to fill an allowance.',
        ],
        [
            'intensity',
            'Cell urban intensity',
            'Scales the selected cell’s urban architecture in combination with the site-wide Urban intensity.',
        ],
    ]) {
        cellFields[key] = new RangeField({
            scope,
            label,
            min: 0,
            max: 100,
            value: 0,
            unit: '%',
            help,
            onChange: (value) => {
                if (!cellFields[key].input.validity.valid) return;
                if (setCellIndicator(state.development, selected()?.id, state.selectedCellId, key, value)) {
                    enter();
                    refresh();
                }
            },
        });
        root.querySelector('[data-development-cell-ranges]').append(cellFields[key].element);
    }
    const cellData = root.querySelector('[data-development-cell-data]');
    scope.listen(cellData, 'change', () => {
        setScaleValue(state.development, selected()?.id, 'useCellData', cellData.checked);
        enter();
        refresh();
    });
    scope.listen(root.querySelector('[data-development-study-cell]'), 'change', (event) => {
        state.selectedCellId = event.target.value;
        state.selectedRegionId =
            state.model.cellById.get(state.selectedCellId)?.regionId ?? state.selectedRegionId;
        enter();
        refresh();
    });
    for (const button of root.querySelectorAll('[data-development-scale]'))
        scope.listen(button, 'click', () => {
            const action = button.dataset.developmentScale,
                site = selected();
            if (!site) return;
            enter();
            root.querySelector('[data-development-scale-panel]').open = true;
            if (action === 'start') {
                // Establish one common framing, then never refit for size/spacing changes.
                focus();
                setScaleValue(state.development, site.id, 'useCellData', true);
                for (const key of ['microGrid', 'developmentCells']) {
                    state.layers[key] = true;
                    root.querySelector(`[data-layer="${key}"]`).checked = true;
                }
            } else if (action === 'guides') {
                const show = !state.layers.microGrid && !state.layers.developmentCells;
                for (const key of ['microGrid', 'developmentCells']) {
                    state.layers[key] = show;
                    root.querySelector(`[data-layer="${key}"]`).checked = show;
                }
            } else if (action === 'restore') restoreScaleCheckpoint(state.development, site.id);
            else setScaleValue(state.development, site.id, 'footprintScale', Number(action));
            state.message =
                action === 'restore'
                    ? 'Scale checkpoint restored. Built extent, activity, urban intensity and camera preserved.'
                    : 'Scale comparison at a fixed camera. Synthetic microcell indicators are test inputs, not real game data.';
            refresh();
        });
    return {
        render() {
            const site = selected();
            for (const [key, field] of Object.entries(fields)) {
                field.input.disabled = field.range.disabled = !site;
                if (![field.input, field.range].includes(document.activeElement))
                    field.setValue(site?.[key] ?? 100);
            }
            cellData.disabled = !site;
            cellData.checked = Boolean(site?.useCellData);
            root.querySelector('[data-development-scale="guides"]').textContent =
                state.layers.microGrid || state.layers.developmentCells
                    ? 'Hide study guides'
                    : 'Show study guides';
            for (const button of root.querySelectorAll('[data-development-scale]')) {
                button.disabled = !site;
                if (['100', '50', '25'].includes(button.dataset.developmentScale))
                    button.setAttribute(
                        'aria-pressed',
                        String(site?.footprintScale === Number(button.dataset.developmentScale)),
                    );
            }
            const rows = studyCells(state.development, site),
                select = root.querySelector('[data-development-study-cell]');
            const key = rows.map((r) => r.cellId).join('|');
            if (select.dataset.content !== key) {
                select.replaceChildren(
                    ...rows.map((r) => {
                        const o = document.createElement('option');
                        o.value = r.cellId;
                        return o;
                    }),
                );
                select.dataset.content = key;
            }
            rows.forEach((r, i) => {
                select.options[i].textContent =
                    `${r.cellId} · ${r.usedPercent.toFixed(1)}% drawn / ${r.coverage}% allowance`;
            });
            const row = rows.find((r) => r.cellId === state.selectedCellId);
            select.value = row?.cellId ?? '';
            select.disabled = !rows.length;
            for (const [key, field] of Object.entries(cellFields)) {
                field.input.disabled = field.range.disabled =
                    !row || !site?.useCellData || (key === 'intensity' && !supportsUrbanIntensity(site));
                if (![field.input, field.range].includes(document.activeElement))
                    field.setValue(row?.[key] ?? 0);
            }
            const skipped = site ? Object.values(site.excluded).reduce((a, b) => a + b, 0) : 0;
            root.querySelector('[data-development-scale-summary]').textContent = site
                ? `${site.layoutKey === 'checkpoint' ? 'Original artwork checkpoint' : `${site.footprintScale}% linear scale · ${site.structureScale}% structure size · ${site.spacing}% spacing`}. ${site.useCellData ? 'Synthetic inputs applied' : 'Synthetic inputs not applied'}. ${rows.filter((r) => r.area > 0).length} microcells contain drawn parcels. ${skipped} candidates excluded (${site.excluded.terrain} terrain, ${site.excluded.overlap} overlap, ${site.excluded.allowance} allowance). ${row ? `Selected cell ${row.cellId}: ${row.usedPercent.toFixed(1)}% drawn / ${row.coverage}% allowance; ${row.intensity}% urban intensity.` : 'Pick a study microcell on the map or in the list to inspect its values.'}`
                : 'No suitable study on this map.';
        },
    };
}
