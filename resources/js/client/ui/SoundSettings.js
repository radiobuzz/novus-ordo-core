import { el } from './dom.js';
import { RangeField } from './RangeField.js';

export function soundSettings(scope, services) {
    const { sound, i18n } = services;
    const t = (key) => i18n.t(`sound.${key}`);
    const title = el('legend'),
        note = el('small');
    const element = el('fieldset', { class: 'sound-settings' }, title);
    const rows = new Map();
    for (const key of ['enabled', 'interaction', 'events']) {
        const input = el('input', { type: 'checkbox' }),
            text = el('span');
        const label = el('label', {}, input, text);
        rows.set(key, { input, text });
        scope.listen(input, 'change', () => {
            sound.set({ [key]: input.checked });
            sound.unlock();
        });
        element.append(label);
    }
    const volume = new RangeField({
        scope,
        label: t('volume'),
        min: 0,
        max: 100,
        step: 1,
        value: sound.store.value.volume * 100,
        unit: '%',
        onChange: (value) => {
            if (Number.isFinite(value)) sound.set({ volume: value / 100 });
        },
    });
    element.append(volume.element, note);
    const update = () => {
        title.textContent = t('title');
        note.textContent = t('hint');
        for (const [key, row] of rows) {
            row.input.checked = sound.store.value[key];
            row.text.textContent = t(key);
        }
        volume.shell.label.textContent = t('volume');
        volume.range.setAttribute('aria-label', t('volume'));
        volume.setValue(Math.round(sound.store.value.volume * 100));
    };
    sound.store.subscribe(scope, update);
    i18n.changed.subscribe(scope, update);
    return element;
}
