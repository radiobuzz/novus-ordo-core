import { createMapModel } from '../../../map/model.js';
import { exportMap, restoreMap } from '../../../map/snapshot.js';
import { DEFAULT_GEOGRAPHY, geographyOptions } from '../../../map/geography.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { RangeField } from '../../ui/RangeField.js';
import { panel } from '../../ui/Panel.js';
import { GeographyPreview } from '../../ui/map/GeographyPreview.js';
import './map-studio.scss';

const settingsKey = 'no7:map-beta:settings',
    presetsKey = 'no7:map-beta:presets';
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
    constructor({ scope, onChange = () => {} }) {
        this.scope = scope;
        this.onChange = onChange;
        this.dirty = true;
        this.busy = false;
        const settings = geographyOptions(read(settingsKey, DEFAULT_GEOGRAPHY));
        this.seed = el('input', { required: true, maxlength: 64, value: settings.seed });
        this.fields = new Map();
        this.fieldset = el(
            'fieldset',
            { class: 'map-studio-fields' },
            new FieldShell({ control: this.seed, label: 'World seed' }).element,
        );
        for (const [key, label, min, max, step, unit] of ranges) {
            const field = new RangeField({
                scope,
                label,
                value: settings[key],
                min,
                max,
                step,
                unit,
                onChange: () => this.markDirty(),
            });
            this.fields.set(key, field);
            this.fieldset.append(field.element);
        }
        const generate = new Button({ label: 'Generate landscape', variant: 'primary', type: 'submit' });
        const another = new Button({ label: 'Try another seed' });
        this.fieldset.append(el('div', { class: 'map-studio-actions' }, generate.element, another.element));
        this.form = el('form', {}, this.fieldset);
        this.message = el('p', { role: 'status', text: 'Generate a preview or load an exact saved map.' });
        this.preview = new GeographyPreview(scope);
        const presetName = el('input', { maxlength: 64 });
        const select = el('select');
        const save = new Button({ label: 'Save settings' }),
            load = new Button({ label: 'Load preset' });
        this.presets = el(
            'fieldset',
            { class: 'map-studio-fields' },
            new FieldShell({ control: presetName, label: 'Preset name' }).element,
            save.element,
            new FieldShell({ control: select, label: 'Saved browser presets' }).element,
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
        this.element = el(
            'div',
            { class: 'map-studio' },
            panel(
                { title: 'Shape the next world', className: 'map-studio-settings' },
                this.form,
                el('p', {
                    text: 'Same beta generator and tuning. Island/lake abundance is relative, not an exact count. Changes never modify a running game.',
                }),
                this.presets,
                el('p', {
                    text: 'Settings presets stay in this browser. Saved maps in the library are shared.',
                }),
            ),
            panel(
                { title: 'Landscape preview', className: 'map-studio-preview' },
                this.preview.element,
                this.message,
            ),
        );
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
                this.message.textContent = 'Enter a preset name and valid settings.';
                return;
            }
            const previous = read(presetsKey, []);
            const presets = (Array.isArray(previous) ? previous : []).filter(
                (p) => p.name !== presetName.value.trim(),
            );
            presets.push({ name: presetName.value.trim(), settings: this.settings() });
            this.message.textContent = write(presetsKey, presets.slice(-30))
                ? 'Settings preset saved in this browser.'
                : 'Browser storage is unavailable.';
            updatePresets();
        });
        scope.listen(load.element, 'click', () => {
            const preset = read(presetsKey, [])[Number(select.value)];
            if (!preset) return;
            this.setSettings(geographyOptions(preset.settings));
            this.markDirty();
            void this.generate();
        });
    }
    settings() {
        return geographyOptions({
            seed: this.seed.value,
            ...Object.fromEntries([...this.fields].map(([key, field]) => [key, field.value])),
        });
    }
    setSettings(settings) {
        this.seed.value = settings.seed;
        for (const [key, field] of this.fields) field.setValue(settings[key]);
    }
    capture() {
        return {
            snapshot: this.savedSnapshot,
            dirty: this.dirty,
            settings: {
                seed: this.seed.value,
                ...Object.fromEntries([...this.fields].map(([key, field]) => [key, field.input.value])),
            },
        };
    }
    restore(draft) {
        if (draft.snapshot) this.load(draft.snapshot);
        this.setSettings(draft.settings);
        if (draft.dirty) this.markDirty();
    }
    setBusy(busy) {
        this.busy = busy;
        this.fieldset.disabled = busy;
        this.presets.disabled = busy;
        this.onChange();
    }
    markDirty() {
        this.dirty = true;
        this.message.textContent =
            'Settings changed. Generate to update the preview before saving or starting.';
        this.onChange();
    }
    get snapshot() {
        return this.dirty || this.busy ? null : this.savedSnapshot;
    }
    load(snapshot) {
        const model = restoreMap(snapshot);
        this.preview.show(model);
        this.savedSnapshot = snapshot;
        this.setSettings(snapshot.settings);
        this.dirty = false;
        this.message.textContent = `Exact saved landscape · ${snapshot.settings.seed} · 600 regions, 19 cells each.`;
        this.onChange();
    }
    async generate() {
        if (this.busy || !this.form.reportValidity()) return;
        this.setBusy(true);
        this.message.textContent = 'Generating landscape…';
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (this.scope.closed) return;
        try {
            const model = createMapModel(19, 'world', this.settings());
            this.preview.show(model);
            this.savedSnapshot = exportMap(model);
            this.dirty = false;
            write(settingsKey, model.geography.settings);
            this.message.textContent = `${model.generation.landPercent.toFixed(1)}% land · seed ${model.geography.settings.seed} · preview ready`;
        } catch (error) {
            this.dirty = true;
            this.message.textContent = error.message;
        } finally {
            this.setBusy(false);
        }
    }
}
