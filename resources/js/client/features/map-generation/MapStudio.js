import { mapText as t, mapLocale } from '../../ui/map/mapStrings.js';
import { worldOptions } from '../../../map/world.js';
import { RESOURCE_PROFILES, defaultProfiles, validateProfiles } from '../../../map/resources.js';
import { SettingsPanel } from './SettingsPanel.js';
import { restoreMap } from '../../../map/snapshot.js';
import { DEFAULT_GEOGRAPHY, geographyOptions } from '../../../map/geography.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { RangeField } from '../../ui/RangeField.js';
import { panel } from '../../ui/Panel.js';
import { GeographyPreview } from '../../ui/map/GeographyPreview.js';
import './map-studio.scss';

const settingsKey = 'no7:map:v2:settings',
    presetsKey = 'no7:map:v2:presets';
function read(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}
function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}
const ranges = [
    ['continents', 'Continental cores', 2, 5, 1, ''],
    ['land', 'Land target', 25, 80, 1, '%'],
    ['coastComplexity', 'Coastal detail', 0, 100, 1, '%'],
    ['islandAbundance', 'Small island abundance', 0, 100, 1, ' / 100'],
    ['lakeAbundance', 'Lake abundance', 0, 100, 1, ' / 100'],
    ['polarExtent', 'Polar extent', 0, 25, 1, '°'],
    ['snowline', 'Mountain snowline', 800, 3200, 100, ' m'],
    ['mountains', 'Mountain strength', 0, 100, 1, '%'],
    ['scale', 'Landscape scale', 50, 180, 1, '%'],
    ['wetness', 'Wetness', 0, 100, 1, '%'],
];

/** Feature-level generator composition. Persistence/start commands are injected by its host. */
export class MapStudio {
    constructor({ scope, onChange = () => {}, limits = { maxCells: 50000 } }) {
        this.limits = limits;
        this.generationId = 0;
        scope.own(() => this.worker?.terminate());
        this.scope = scope;
        this.onChange = onChange;
        this.dirty = true;
        this.busy = false;
        const stored = read(settingsKey, DEFAULT_GEOGRAPHY);
        const settings = geographyOptions({ ...stored, limits });
        this.profiles = defaultProfiles();
        this.panels = new Map();
        this.tabs = new Map();
        const categories = [
            ['world', 'World', 'world'],
            ['terrain', 'Terrain', 'layers'],
            ['climate', 'Climate', 'colors'],
            ['water', 'Water & coasts', 'Oil'],
            ['resources', 'Resources', 'Ore'],
            ['names', 'Names', 'nation'],
            ['layers', 'Layers', 'selection'],
        ];
        this.tablist = el('div', {
            role: 'tablist',
            'aria-label': 'Map settings',
            'aria-orientation': 'vertical',
            class: 'map-studio-tabs',
        });
        for (const [key, title, icon] of categories) {
            const instance = new SettingsPanel(key, t(title));
            const tab = new Button({ label: t(title), icon, variant: 'quiet' }).element;
            tab.id = `${instance.id}-tab`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', instance.id);
            tab.setAttribute('aria-label', t(title));
            tab.title = t(title);
            instance.element.setAttribute('aria-labelledby', tab.id);
            this.panels.set(key, instance);
            this.tabs.set(key, tab);
            this.tablist.append(tab);
            scope.listen(tab, 'click', () => this.selectTab(key));
            scope.listen(tab, 'keydown', (event) => {
                const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
                if (!direction && !['Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const keys = [...this.tabs.keys()];
                const next =
                    event.key === 'Home'
                        ? keys[0]
                        : event.key === 'End'
                          ? keys.at(-1)
                          : keys[(keys.indexOf(key) + direction + keys.length) % keys.length];
                this.selectTab(next);
                this.tabs.get(next).focus();
            });
            scope.own(() => instance.destroy());
            void instance.mount(instance.element).catch((error) => {
                if (!scope.closed) console.error(error);
            });
        }
        this.seed = el('input', { required: true, maxlength: 64, value: settings.seed });
        this.fields = new Map();
        this.fieldset = el(
            'fieldset',
            { class: 'map-studio-fields' },
            ...[...this.panels.values()].map((p) => p.element),
        );
        const world = this.panels.get('world').body;
        world.append(new FieldShell({ control: this.seed, label: t('World seed') }).element);
        this.dimensions = new Map();
        for (const [key, label] of [
            ['regionColumns', 'Regions wide'],
            ['regionRows', 'Regions tall'],
        ]) {
            const input = el('input', {
                type: 'number',
                min: 1,
                step: 1,
                required: true,
                value: settings[key],
            });
            this.dimensions.set(key, input);
            world.append(new FieldShell({ control: input, label: t(label) }).element);
            scope.listen(input, 'input', () => this.markDirty());
        }
        this.resolution = el(
            'select',
            {},
            ...[7, 19, 37].map((n) =>
                el('option', { value: n, text: t('{n} microcells per region', { n }) }),
            ),
        );
        this.resolution.value = String(stored.cellCount ?? 19);
        world.append(new FieldShell({ control: this.resolution, label: t('Resolution') }).element);
        this.worldSummary = el('p', { role: 'status' });
        world.append(this.worldSummary);
        scope.listen(this.resolution, 'change', () => this.markDirty());
        for (const [key, label, min, max, step, unit] of ranges) {
            const field = new RangeField({
                scope,
                label: t(label),
                value: settings[key],
                min,
                max,
                step,
                unit,
                onChange: () => this.markDirty(),
            });
            this.fields.set(key, field);
            const category = ['wetness', 'polarExtent', 'snowline'].includes(key)
                ? 'climate'
                : ['coastComplexity', 'islandAbundance', 'lakeAbundance'].includes(key)
                  ? 'water'
                  : 'terrain';
            this.panels.get(category).body.append(field.element);
        }
        const generate = new Button({ label: t('Generate landscape'), variant: 'primary', type: 'submit' });
        const another = new Button({ label: t('Try another seed') });
        this.cancel = new Button({ label: t('Cancel generation'), icon: 'cancel' });
        this.cancel.element.hidden = true;
        scope.listen(this.cancel.element, 'click', () => this.cancelGeneration());
        this.actions = el(
            'div',
            { class: 'map-studio-actions' },
            generate.element,
            another.element,
            this.cancel.element,
        );
        this.form = el('form', {}, this.fieldset, this.actions);
        this.message = el('p', { role: 'status', text: t('Generate a preview or load an exact saved map.') });
        this.preview = new GeographyPreview(scope);
        const presetName = el('input', { maxlength: 64 });
        const select = el('select');
        const save = new Button({ label: t('Save settings') }),
            load = new Button({ label: t('Load preset') });
        this.presets = el(
            'fieldset',
            { class: 'map-studio-fields' },
            new FieldShell({ control: presetName, label: t('Preset name') }).element,
            save.element,
            new FieldShell({ control: select, label: t('Saved browser presets') }).element,
            load.element,
        );
        const updatePresets = () => {
            const presets = read(presetsKey, []);
            select.replaceChildren(
                ...(Array.isArray(presets) ? presets : []).map((p, i) =>
                    el('option', { value: i, text: p.name }),
                ),
            );
            load.setDisabled(!select.options.length);
        };
        updatePresets();
        this.panels.get('world').body.append(this.presets);
        const toggleInspector = new Button({ label: t('Inspector'), icon: 'search', variant: 'quiet' })
            .element;
        this.inspectorBody = el(
            'div',
            {},
            this.preview.detail,
            this.preview.shoreSelect,
            this.preview.shoreDetail,
        );
        toggleInspector.setAttribute('aria-expanded', 'true');
        scope.listen(toggleInspector, 'click', () => {
            this.inspectorBody.hidden = !this.inspectorBody.hidden;
            toggleInspector.setAttribute('aria-expanded', String(!this.inspectorBody.hidden));
            this.element.classList.toggle('map-studio--inspector-collapsed', this.inspectorBody.hidden);
        });
        this.element = el(
            'div',
            { class: 'map-studio' },
            el('aside', { class: 'map-studio-sidebar' }, this.tablist, this.form),
            panel(
                { title: t('Landscape preview'), className: 'map-studio-preview' },
                this.preview.element,
                this.message,
            ),
            el('aside', { class: 'map-studio-inspector' }, toggleInspector, this.inspectorBody),
        );
        this.resourceControls = new Map();
        for (const profile of RESOURCE_PROFILES) this.addResourceControl(profile);
        this.refreshResourceControls();
        this.featureSelect = el('select');
        this.featureSearch = el('input', { type: 'search' });
        this.featureName = el('input', { maxlength: 120 });
        this.panels.get('names').body.append(
            el('p', {
                text: t('Fictional English · saved names stay unchanged when the naming pack changes.'),
            }),
            new FieldShell({ control: this.featureSearch, label: t('Find a feature') }).element,
            new FieldShell({ control: this.featureSelect, label: t('Geographic feature') }).element,
            new FieldShell({ control: this.featureName, label: t('Name') }).element,
        );
        scope.listen(this.featureSelect, 'change', () => this.selectFeature());
        scope.listen(this.featureSearch, 'input', () => this.updateFeatures());
        scope.listen(this.featureName, 'input', () => this.renameFeature());
        const view = el(
            'select',
            {},
            ...[
                'terrain',
                'elevation',
                'temperature',
                'moisture',
                'drainage',
                'fertility',
                'depth',
                'coast',
            ].map((key) => el('option', { value: key, text: t(key) })),
        );
        this.analysisView = view;
        this.legend = el('p', { class: 'map-analysis-legend' });
        this.panels
            .get('layers')
            .body.append(new FieldShell({ control: view, label: t('Analysis layer') }).element, this.legend);
        scope.listen(view, 'change', () => {
            if (this.preview.state) {
                this.preview.state.view = view.value;
                this.legend.textContent = view.value.startsWith('resource:')
                    ? t(
                          'Density: absent (dark), low (brown), high (orange). Static potential, not production.',
                      )
                    : view.value === 'coast'
                      ? t(
                            'Green: favourable · yellow: limited · orange: difficult · red: unsuitable. Select a land cell to inspect each shore edge.',
                        )
                      : view.value === 'fertility'
                        ? t('Suitability: low (brown) to high (green). No farmland is implied.')
                        : view.value === 'depth'
                          ? t('Water depth: shallow (light) to deep (dark).')
                          : view.value === 'temperature' || view.value === 'moisture'
                            ? t('Normalized index, 0–1.')
                            : '';
                this.preview.renderer.invalidate();
            }
        });
        this.selectTab('world');
        this.updateWorldSummary();
        scope.listen(this.seed, 'input', () => this.markDirty());
        scope.listen(this.form, 'submit', (event) => {
            event.preventDefault();
            void this.generate();
        });
        scope.listen(another.element, 'click', () => {
            this.seed.value = `world-${globalThis.crypto?.randomUUID?.().slice(0, 12) ?? Date.now().toString(36)}`;
            this.markDirty();
            void this.generate();
        });
        scope.listen(save.element, 'click', () => {
            if (!this.form.reportValidity() || !presetName.value.trim()) {
                this.message.textContent = t('Enter a preset name and valid settings.');
                return;
            }
            const previous = read(presetsKey, []);
            const presets = (Array.isArray(previous) ? previous : []).filter(
                (p) => p.name !== presetName.value.trim(),
            );
            presets.push({
                name: presetName.value.trim(),
                settings: this.settings(),
                profiles: this.currentProfiles(),
            });
            this.message.textContent = write(presetsKey, presets.slice(-30))
                ? t('Settings preset saved in this browser.')
                : t('Browser storage is unavailable.');
            updatePresets();
        });
        scope.listen(load.element, 'click', () => {
            const preset = read(presetsKey, [])[Number(select.value)];
            if (!preset) return;
            this.setSettings(preset.settings);
            this.setProfiles(preset.profiles ?? defaultProfiles());
            this.markDirty();
            void this.generate();
        });
    }
    settings() {
        return {
            ...geographyOptions({
                seed: this.seed.value,
                ...Object.fromEntries([...this.dimensions].map(([key, input]) => [key, Number(input.value)])),
                cellCount: Number(this.resolution.value),
                limits: this.limits,
                ...Object.fromEntries([...this.fields].map(([key, field]) => [key, field.value])),
            }),
            cellCount: Number(this.resolution.value),
            limits: this.limits,
        };
    }
    setSettings(settings) {
        this.seed.value = settings.seed;
        for (const [key, input] of this.dimensions)
            input.value = settings[key] ?? (key === 'regionColumns' ? 30 : 20);
        this.resolution.value = String(settings.cellCount ?? 19);
        for (const [key, field] of this.fields) field.setValue(settings[key]);
    }
    capture() {
        return {
            snapshot: this.savedSnapshot,
            dirty: this.dirty,
            activeTab: this.activeTab,
            profiles: this.currentProfiles(),
            settings: {
                seed: this.seed.value,
                ...Object.fromEntries([...this.dimensions].map(([key, input]) => [key, input.value])),
                cellCount: this.resolution.value,
                ...Object.fromEntries([...this.fields].map(([key, field]) => [key, field.input.value])),
            },
        };
    }
    restore(draft) {
        if (draft.snapshot) this.load(draft.snapshot);
        this.setSettings(draft.settings);
        if (draft.profiles) this.setProfiles(draft.profiles);
        this.selectTab(draft.activeTab ?? 'world');
        if (draft.dirty) this.markDirty();
    }
    setBusy(busy) {
        this.generating = busy;
        this.updateBusy();
    }
    setCommandBusy(busy) {
        this.commandBusy = busy;
        this.updateBusy();
    }
    updateBusy() {
        this.busy = Boolean(this.generating || this.commandBusy);
        this.fieldset.disabled = this.busy;
        this.presets.disabled = this.busy;
        this.cancel.element.hidden = !this.generating;
        this.onChange();
    }
    markDirty() {
        this.dirty = true;
        this.updateWorldSummary();
        this.message.textContent = t(
            'Settings changed. Generate to update the preview before saving or starting.',
        );
        this.onChange();
    }
    get snapshot() {
        return this.dirty || this.busy || this.invalidName ? null : this.savedSnapshot;
    }
    load(snapshot, preserveView = false) {
        const model = restoreMap(snapshot);
        const previousView = this.analysisView.value;
        this.preview.show(model, preserveView);
        this.savedSnapshot = snapshot;
        this.setSettings({ ...snapshot.settings, cellCount: snapshot.cellCount });
        this.setProfiles(snapshot.resourceProfiles);
        for (const [key, control] of this.resourceControls) {
            const samples = snapshot.resources.find((r) => r.key === key)?.cells ?? [];
            control.summary.textContent = t(
                '{cells} cells · potential {quantity} units · capacity {capacity}/season',
                {
                    cells: samples.length.toLocaleString(),
                    quantity: Math.round(samples.reduce((n, c) => n + c[2], 0)).toLocaleString(),
                    capacity: Math.round(samples.reduce((n, c) => n + c[3], 0)).toLocaleString(),
                },
            );
        }
        this.updateFeatures();
        this.updateWorldSummary();
        for (const option of [...this.analysisView.options])
            if (option.value.startsWith('resource:')) option.remove();
        for (const p of snapshot.resourceProfiles)
            this.analysisView.append(
                el('option', { value: `resource:${p.key}`, text: p.labels[mapLocale()] ?? p.labels.en }),
            );
        this.analysisView.value =
            preserveView && [...this.analysisView.options].some((o) => o.value === previousView)
                ? previousView
                : 'terrain';
        this.analysisView.dispatchEvent(new Event('change'));
        this.dirty = false;
        this.message.textContent = `Exact saved landscape · ${snapshot.settings.seed} · ${snapshot.regionColumns} × ${snapshot.regionRows} regions, ${snapshot.cellCount} cells each.`;
        this.onChange();
    }
    selectTab(key) {
        this.activeTab = key;
        for (const [id, panel] of this.panels) {
            const selected = id === key;
            panel.element.hidden = !selected;
            this.tabs.get(id).setAttribute('aria-selected', String(selected));
            this.tabs.get(id).tabIndex = selected ? 0 : -1;
        }
    }
    updateWorldSummary() {
        try {
            const world = worldOptions(
                {
                    ...Object.fromEntries([...this.dimensions].map(([k, v]) => [k, v.value])),
                    cellCount: this.resolution.value,
                },
                this.limits,
            );
            this.worldSummary.textContent = t('{regions} regions · {cells} microcells · limit {limit}', {
                regions: world.regionColumns * world.regionRows,
                cells: (world.regionColumns * world.regionRows * world.cellCount).toLocaleString(),
                limit: this.limits.maxCells.toLocaleString(),
            });
        } catch (error) {
            this.worldSummary.textContent = error.message;
        }
    }
    addResourceControl(profile) {
        const checkbox = el('input', { type: 'checkbox' });
        checkbox.checked = this.profiles.some((p) => p.key === profile.key);
        const controls = el('div', { class: 'map-studio-fields' }),
            fields = new Map();
        for (const [key, label, max, value] of [
            ['abundance', 'Abundance', 100, 50],
            ['concentration', 'Concentration', 100, 50],
            ['richness', 'Richness', 200, 100],
        ]) {
            if (key === 'concentration' && profile.method !== 'deposit') continue;
            const field = new RangeField({
                scope: this.panels.get('resources').scope,
                label: t(label),
                min: 0,
                max,
                step: 1,
                value,
                onChange: () => this.resourcesChanged(),
            });
            fields.set(key, field);
            controls.append(field.element);
        }
        const reason = el('p', { class: 'map-resource-reason' });
        const summary = el('p', { class: 'map-resource-summary' });
        controls.append(summary);
        this.panels
            .get('resources')
            .body.append(
                el(
                    'section',
                    {},
                    el('label', {}, checkbox, profile.labels[mapLocale()] ?? profile.labels.en),
                    reason,
                    controls,
                ),
            );
        this.resourceControls.set(profile.key, { profile, checkbox, controls, fields, reason, summary });
        this.panels.get('resources').scope.listen(checkbox, 'change', () => this.resourcesChanged());
    }
    currentProfiles() {
        return [...this.resourceControls.values()]
            .filter((c) => c.checkbox.checked)
            .map(({ profile, fields }) => ({
                version: 1,
                abundance: 50,
                concentration: 50,
                richness: 100,
                ...structuredClone(profile),
                ...Object.fromEntries([...fields].map(([k, f]) => [k, Number(f.value)])),
            }));
    }
    setProfiles(profiles) {
        for (const profile of profiles)
            if (!this.resourceControls.has(profile.key)) this.addResourceControl(profile);
        for (const c of this.resourceControls.values()) {
            const selected = profiles.find((p) => p.key === c.profile.key);
            c.checkbox.checked = Boolean(selected);
            if (selected) {
                c.profile = structuredClone(selected);
                for (const [key, field] of c.fields) field.setValue(selected[key]);
            }
        }
        this.refreshResourceControls();
    }
    refreshResourceControls() {
        const selected = [...this.resourceControls.values()]
            .filter((c) => c.checkbox.checked)
            .map((c) => c.profile);
        for (const c of this.resourceControls.values()) {
            const conflict = selected.find(
                (p) => p.excludes.includes(c.profile.key) || c.profile.excludes.includes(p.key),
            );
            c.checkbox.disabled = Boolean(conflict);
            c.reason.textContent = conflict
                ? t('Uncheck {name} to select this resource.', {
                      name: conflict.labels[mapLocale()] ?? conflict.labels.en,
                  })
                : '';
            c.controls.hidden = !c.checkbox.checked;
        }
    }
    resourcesChanged() {
        this.refreshResourceControls();
        this.markDirty();
    }
    updateFeatures() {
        const query = this.featureSearch.value.trim().toLocaleLowerCase();
        const previous = this.featureSelect.value;
        const features = (this.preview.state?.model.atlas?.features ?? []).filter((f) =>
            `${f.name} ${f.type}`.toLocaleLowerCase().includes(query),
        );
        this.featureSelect.replaceChildren(
            ...features.map((f) => el('option', { value: f.id, text: `${f.name} · ${f.type}` })),
        );
        if (features.some((f) => f.id === previous)) this.featureSelect.value = previous;
        this.selectFeature();
    }
    selectFeature() {
        const model = this.preview.state?.model,
            f = model?.atlas.featureById.get(this.featureSelect.value);
        this.invalidName = false;
        this.featureName.value = f?.name ?? '';
        this.featureName.disabled = !f;
        if (f) {
            this.preview.state.selectedFeatureId = f.id;
            this.preview.renderer.invalidate();
        } else if (this.preview.state) {
            this.preview.state.selectedFeatureId = null;
            this.preview.renderer.invalidate();
        }
    }
    renameFeature() {
        const name = this.featureName.value.trim(),
            f = this.preview.state?.model.atlas.featureById.get(this.featureSelect.value);
        if (!f) return;
        this.invalidName = !name;
        if (this.invalidName) {
            this.onChange();
            return;
        }
        f.name = name;
        this.featureSelect.selectedOptions[0].textContent = `${name} · ${f.type}`;
        if (this.savedSnapshot)
            this.savedSnapshot = {
                ...this.savedSnapshot,
                features: this.savedSnapshot.features.map((item) =>
                    item.id === f.id ? { ...item, name } : item,
                ),
            };
        this.preview.renderer.invalidate();
        this.onChange();
    }
    cancelGeneration() {
        ++this.generationId;
        this.worker?.terminate();
        this.worker = null;
        this.setBusy(false);
        this.message.textContent = t('Generation cancelled. Previous preview retained.');
    }
    async generate() {
        if (this.busy) return;
        const invalid = [...this.form.querySelectorAll('input,select')].find(
            (input) => !input.checkValidity(),
        );
        if (invalid) {
            const category = [...this.panels].find(([, p]) => p.element.contains(invalid));
            if (category) this.selectTab(category[0]);
            invalid.reportValidity();
            return;
        }
        let settings, profiles;
        try {
            settings = this.settings();
            worldOptions(settings, this.limits);
            profiles = this.currentProfiles();
            validateProfiles(profiles);
        } catch (error) {
            this.message.textContent = error.message;
            return;
        }
        this.setBusy(true);
        this.message.textContent = t('Generating geography and resources…');
        const generation = ++this.generationId;
        let worker;
        try {
            worker = new Worker(new URL('../../../map/generation-worker.js', import.meta.url), {
                type: 'module',
            });
            this.worker = worker;
        } catch (error) {
            this.setBusy(false);
            this.message.textContent = error.message;
            return;
        }
        const sameGeography =
            this.savedSnapshot &&
            this.savedSnapshot.cellCount === settings.cellCount &&
            JSON.stringify(this.savedSnapshot.settings) === JSON.stringify(geographyOptions(settings));
        worker.onmessage = ({ data }) => {
            if (this.scope.closed || generation !== this.generationId) return;
            try {
                if (data.error) throw new Error(data.error);
                this.load(data.snapshot, Boolean(sameGeography));
                write(settingsKey, settings);
                this.message.textContent = t(
                    '{columns} × {rows} · {count} microcells per region · preview ready',
                    {
                        columns: data.snapshot.regionColumns,
                        rows: data.snapshot.regionRows,
                        count: data.snapshot.cellCount,
                    },
                );
            } catch (error) {
                this.message.textContent = error.message;
                this.dirty = true;
            } finally {
                worker.terminate();
                this.worker = null;
                this.setBusy(false);
            }
        };
        worker.onerror = (event) => {
            if (this.scope.closed || generation !== this.generationId) return;
            this.message.textContent = event.message;
            worker.terminate();
            this.worker = null;
            this.setBusy(false);
        };
        try {
            worker.postMessage({
                settings,
                profiles,
                cellCount: settings.cellCount,
                snapshot: sameGeography ? this.savedSnapshot : null,
            });
        } catch (error) {
            worker.terminate();
            this.worker = null;
            this.setBusy(false);
            this.message.textContent = error.message;
        }
    }
}
