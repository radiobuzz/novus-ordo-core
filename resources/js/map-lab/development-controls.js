import { RangeField } from '../client/ui/RangeField.js';
import { Scope } from '../client/runtime/Scope.js';
import { architecture, architectureLabels, supportsUrbanIntensity } from './development-complexes.js';
import { scaleControls, installScaleControls } from './development-scale-controls.js';
import { restoreScaleCheckpoint, studyCells } from './development-scale.js';
import {
    builtPlots,
    developmentActive,
    DEVELOPMENT_TYPES,
    developmentStage,
    setDevelopmentValue,
    plotActivity,
} from './development.js';

export const developmentControls = `<section class="atlas-controls development-controls">
<p class="eyebrow">Next experiment · visual development</p><h2>A lived-in landscape</h2>
<button type="button" class="secondary-button" data-development="start">Try development visuals</button>
<div class="layer-controls"><label><input type="checkbox" data-layer="development" /> Development footprints</label><label><input type="checkbox" data-layer="developmentNames" checked /> Settlement &amp; district names</label></div>
<label>Development example<select aria-label="Development example" data-development-site></select></label>
<button type="button" class="secondary-button" data-development="find">Find development example</button>
${scaleControls}
<div data-development-ranges></div>
<div class="development-presets" role="group" aria-label="Urban architecture presets">
<button type="button" class="secondary-button" data-development="town">Town</button>
<button type="button" class="secondary-button" data-development="city">City</button>
<button type="button" class="secondary-button" data-development="metropolis">Metropolis</button>
</div>
<div class="development-presets" role="group" aria-label="Development visual stages">
<button type="button" class="secondary-button" data-development="sparse">Sparse</button>
<button type="button" class="secondary-button" data-development="growing">Growing</button>
<button type="button" class="secondary-button" data-development="established">Established</button>
<button type="button" class="secondary-button" data-development="idle">Idle / downturn</button>
<button type="button" class="secondary-button" data-development="resume">Resume activity</button>
</div>
<button type="button" class="secondary-button" data-development="reset">Reset development values</button>
<p class="hint">Built extent scrubs a visual growth study, not demolition or time. Current activity changes occupied/working cues without erasing development. Existing roofs keep their positions as the footprint grows.</p>
<p class="hint">Urban intensity replaces low roofs with dense blocks and a high-rise centre on the same anchors. Town / City / Metropolis change architecture only, not built extent or activity. Factories, terraced excavations and oil compounds share the cleared Terrain V2 ground. Small pause marks identify idle patches.</p>
<p class="hint" data-development-summary></p>
<p class="hint" data-development-art-status role="status"></p>
<p class="hint">Independent illustrative values—not population, migration, production or economic forecasts. Nothing is sent to the game. Map regeneration/reload resets these previews.</p>
</section>`;
export const developmentInspector = `<section class="experiment-panel" data-development-inspector hidden>
<p class="eyebrow">Aggregate activity · visual study</p><h2 data-development-title></h2>
<p class="hint" data-development-description></p><dl class="experiment-metrics" data-development-metrics></dl>
<p class="hint">Buildings are decorative samples of aggregate development, not individually simulated properties or factories. Bare deposits alone do not create workings. Built mines stay visible when activity stops or the resource survey is switched off.</p>
</section>`;

export function installDevelopment({ root, state, camera, renderer, updateInspector }) {
    const scope = new Scope(),
        controls = {};
    const selected = () => state.development.siteById.get(state.selectedDevelopmentId);
    const refresh = () => {
        updateInspector();
        renderer.invalidate();
    };
    const enter = () => {
        state.labFocus = 'development';
        state.layers.development = true;
        root.querySelector('[data-layer="development"]').checked = true;
        state.armySelected = false;
        state.commandMode = null;
        state.orderPreview = null;
        state.selectingBeach = false;
        root.querySelector('#geography-view').value = 'terrain';
        root.querySelector('#geography-view').dispatchEvent(new Event('change'));
    };
    const focus = () => {
        const site = selected();
        if (!site) return;
        state.selectedCellId = site.cellId;
        state.selectedRegionId = state.model.cellById.get(site.cellId).regionId;
        state.selectedFeature = null;
        camera.x = site.x;
        camera.y = site.y;
        camera.zoom = Math.max(
            camera.fitZoom,
            Math.min(camera.width, camera.height) / (state.development.unit * (site.living ? 4.4 : 3.8)),
        );
        camera.constrain();
    };
    for (const [key, label, help] of [
        ['built', 'Built extent', 'Preview developed area; increasing it adds to stable placements.'],
        [
            'activity',
            'Current activity',
            'Occupancy/operation cue only. Zero leaves the built footprint visible.',
        ],
        [
            'urbanIntensity',
            'Urban intensity',
            'Town → dense blocks → high-rise centre. Coastal and inland settlements only; not population.',
        ],
    ]) {
        controls[key] = new RangeField({
            scope,
            label,
            min: 0,
            max: 100,
            value: 0,
            unit: '%',
            help,
            onChange: (value) => {
                if (!controls[key].input.validity.valid) return;
                if (setDevelopmentValue(state.development, state.selectedDevelopmentId, key, value)) {
                    enter();
                    state.message = `${label} preview changed. Geography, population and economy are untouched.`;
                    refresh();
                }
            },
        });
        root.querySelector('[data-development-ranges]').append(controls[key].element);
    }
    scope.listen(root.querySelector('[data-development-site]'), 'change', (event) => {
        state.selectedDevelopmentId = event.target.value;
        enter();
        refresh();
    });
    for (const button of root.querySelectorAll('[data-development]'))
        scope.listen(button, 'click', () => {
            const action = button.dataset.development;
            enter();
            if (action === 'start' || action === 'find') focus();
            else if (action === 'reset') {
                for (const site of state.development.sites) {
                    setDevelopmentValue(state.development, site.id, 'built', site.defaultBuilt);
                    setDevelopmentValue(state.development, site.id, 'activity', 100);
                    setDevelopmentValue(state.development, site.id, 'urbanIntensity', 35);
                    restoreScaleCheckpoint(state.development, site.id);
                }
            } else if (['town', 'city', 'metropolis'].includes(action)) {
                setDevelopmentValue(
                    state.development,
                    state.selectedDevelopmentId,
                    'urbanIntensity',
                    { town: 15, city: 65, metropolis: 100 }[action],
                );
            } else if (action === 'idle' || action === 'resume')
                setDevelopmentValue(
                    state.development,
                    state.selectedDevelopmentId,
                    'activity',
                    action === 'idle' ? 0 : 100,
                );
            else {
                setDevelopmentValue(
                    state.development,
                    state.selectedDevelopmentId,
                    'built',
                    { sparse: 20, growing: 55, established: 100 }[action],
                );
                setDevelopmentValue(state.development, state.selectedDevelopmentId, 'activity', 100);
            }
            state.message = !selected()
                ? 'No suitable development examples on this map. Geography has not been altered.'
                : action === 'idle'
                  ? 'Activity stopped. Built footprints and all existing placements remain; no population or production changed.'
                  : 'Visual development preview only. Zoom for detail; compare growth with idle activity at the same location.';
            refresh();
        });
    scope.listen(window, 'pagehide', (event) => {
        if (!event.persisted) void scope.dispose();
    });
    const scaleStudy = installScaleControls({ root, state, scope, selected, enter, focus, refresh });
    return {
        render() {
            const { development } = state;
            if (!selected()) state.selectedDevelopmentId = development.sites[0]?.id ?? null;
            const site = selected(),
                select = root.querySelector('[data-development-site]');
            const key = JSON.stringify(development.sites.map((s) => [s.id, s.name, s.kind]));
            if (select.dataset.content !== key) {
                select.replaceChildren(
                    ...development.sites.map((s) => {
                        const option = document.createElement('option');
                        option.value = s.id;
                        option.textContent = `${s.name} · ${DEVELOPMENT_TYPES[s.kind]}`;
                        return option;
                    }),
                );
                select.dataset.content = key;
            }
            select.value = site?.id ?? '';
            select.disabled = !site;
            for (const [key, field] of Object.entries(controls)) {
                field.input.disabled = field.range.disabled =
                    !site || (key === 'urbanIntensity' && !supportsUrbanIntensity(site));
                if (document.activeElement !== field.input && document.activeElement !== field.range)
                    field.setValue(site?.[key] ?? 0);
            }
            for (const button of root.querySelectorAll('[data-development]'))
                if (button.dataset.development !== 'start')
                    button.disabled =
                        !site ||
                        (['town', 'city', 'metropolis'].includes(button.dataset.development) &&
                            !supportsUrbanIntensity(site));
            root.querySelector('[data-development-summary]').textContent =
                `${development.sites.length} independent visual studies. ${development.omissions.join(' ')}`;
            scaleStudy.render();
            const active = developmentActive(state);
            root.querySelector('[data-development-inspector]').hidden = !active;
            if (active) root.querySelector('[data-legacy-inspector]').hidden = true;
            if (!active) return;
            root.querySelector('[data-development-title]').textContent = site?.name ?? 'No suitable site';
            root.querySelector('[data-development-description]').textContent = site
                ? `${site.living ? 'Riverside woodland & farmland study' : DEVELOPMENT_TYPES[site.kind]} · ${developmentStage(site)}. ${site.activity === 0 ? 'Idle: development and clearing remain in place.' : 'Illustrative activity, independent of the economy demo.'}`
                : 'Try another seed or a larger map.';
            const plots = site ? builtPlots(site) : [];
            const counts = Object.fromEntries(
                ['homes', 'fields', 'industry', 'mine', 'oil'].map((kind) => [
                    kind,
                    plots.filter((p) => p.use === kind).length,
                ]),
            );
            const cellRows = studyCells(development, site);
            const cellIds = new Set(cellRows.filter((c) => c.area > 0).map((c) => c.cellId));
            const selectedCell = cellRows.find((c) => c.cellId === state.selectedCellId);
            const area =
                plots.reduce(
                    (sum, p) =>
                        sum +
                        Math.abs(
                            p.points.reduce((n, a, i) => {
                                const b = p.points[(i + 1) % p.points.length];
                                return n + a.x * b.y - a.y * b.x;
                            }, 0),
                        ) /
                            2,
                    0,
                ) /
                (Math.sqrt(3) * 1.5 * development.unit ** 2);
            const rows = site
                ? [
                      ['Built extent preview', `${site.built}%`],
                      ['Current activity preview', `${site.activity}%`],
                      [
                          'Development scale',
                          `${site.footprintScale}% linear size · ${site.structureScale}% structures · ${site.spacing}% spacing`,
                      ],
                      [
                          'Microcell inputs',
                          site.useCellData
                              ? 'Synthetic per-cell allowances and intensity applied'
                              : 'Not applied — illustration only',
                      ],
                      ...(site.useCellData && selectedCell
                          ? [
                                [
                                    'Selected cell parcel area',
                                    `${selectedCell.usedPercent.toFixed(1)}% drawn / ${selectedCell.coverage}% allowance`,
                                ],
                                ['Selected cell urban intensity', `${selectedCell.intensity}% synthetic`],
                            ]
                          : []),
                      ...(supportsUrbanIntensity(site)
                          ? [['Urban intensity preview', `${site.urbanIntensity}% (visual only)`]]
                          : []),
                      [
                          'Architecture',
                          [
                              ...new Set(
                                  plots
                                      .map((p) => architectureLabels[architecture(site, p, development.unit)])
                                      .filter(Boolean),
                              ),
                          ].join(' · ') || 'None',
                      ],
                      ['Illustrated land footprint', `${area.toFixed(2)} region-areas`],
                      ['Underlying microcells', String(cellIds.size)],
                      [
                          'Underlying large regions',
                          String(
                              new Set([...cellIds].map((id) => state.model.cellById.get(id).regionId)).size,
                          ),
                      ],
                      [
                          'Decorative patches—not facility counts',
                          `${counts.homes} residential · ${counts.fields} fields · ${counts.industry} industrial · ${counts.mine} workings · ${counts.oil} oil pads`,
                      ],
                      [
                          'Visually active patches',
                          String(plots.filter((p) => plotActivity(site, p, state.substrate) > 0).length),
                      ],
                      [
                          'Resource basis',
                          site.resource
                              ? `${site.resource} survey at sampled cells; missing stock idles existing extraction visuals`
                              : 'Terrain suitability; no resource balance consumed',
                      ],
                      ['Selected microcell', state.selectedCellId ?? 'None'],
                  ]
                : [];
            root.querySelector('[data-development-metrics]').replaceChildren(
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
        },
        inspectCell(cell) {
            if (!developmentActive(state) || !cell) return false;
            state.selectedCellId = cell.id;
            state.selectedRegionId = cell.regionId;
            const current = selected();
            const site = (current?.studyCellIds ?? current?.cellIds)?.has(cell.id)
                ? current
                : state.development.sites.find((s) => s.cellIds.has(cell.id));
            if (site) state.selectedDevelopmentId = site.id;
            state.message = site
                ? `${site.name}: illustrative development, not a city-management command.`
                : 'No development study at this cell. Use the example list to find one.';
            refresh();
            return true;
        },
    };
}
