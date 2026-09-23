import { el } from '../ui/dom.js';
import { FieldShell } from '../ui/FieldShell.js';
import { Button } from '../ui/Button.js';

/** Disposable configuration; zero leaves the ordinary game unchanged. */
export function aiSetupFields(scope) {
    const count = el(
        'select',
        {},
        ...Array.from({ length: 11 }, (_, value) =>
            el('option', { value, text: value ? `${value} AI players` : 'No AI players' }),
        ),
    );
    const behavior = el(
        'select',
        {},
        ...['mixed', 'cautious', 'balanced', 'aggressive'].map((value) =>
            el('option', { value, text: value }),
        ),
    );
    const protection = el('input', { type: 'checkbox' });
    const seed = el('input', { type: 'text', maxlength: 64, value: 'experimental' });
    const preset = new Button({ label: 'Watch-test preset: 6 mixed bots + protection' });
    scope.listen(preset.element, 'click', () => {
        count.value = '6';
        behavior.value = 'mixed';
        protection.checked = true;
    });
    const element = el(
        'fieldset',
        {},
        el('legend', { text: 'AI Player · V1 Experimental (temporary)' }),
        preset.element,
        new FieldShell({
            control: count,
            label: 'AI players',
            help: 'Usually 5–6; maximum 10. A human starting area is kept free.',
        }).element,
        new FieldShell({ control: behavior, label: 'Aggressiveness' }).element,
        new FieldShell({
            control: protection,
            label: 'Protect human nations from AI attacks',
            help: 'Humans can still attack; normal combat defense applies. Enable Auto-ready in the game to watch.',
        }).element,
        new FieldShell({
            control: seed,
            label: 'Decision seed',
            help: 'Reproduces policy choices from the same position, not random battle outcomes.',
        }).element,
    );
    return {
        element,
        value: () => ({
            count: Number(count.value),
            behavior: behavior.value,
            protect_humans: protection.checked,
            seed: seed.value || 'experimental',
        }),
    };
}
