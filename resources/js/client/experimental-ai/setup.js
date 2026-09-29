import { el } from '../ui/dom.js';
import { FieldShell } from '../ui/FieldShell.js';

/** Temporary passive-player configuration; zero leaves the ordinary game unchanged. */
export function aiSetupFields(scope) {
    const count = el(
        'select',
        {},
        ...Array.from({ length: 11 }, (_, value) =>
            el('option', { value, text: value ? `${value} passive players` : 'No passive players' }),
        ),
    );
    const element = el(
        'fieldset',
        {},
        el('legend', { text: 'Passive players · temporary' }),
        el('p', {
            text: 'Passive nations only submit Ready. They make no economic, policy, military or diplomatic choices.',
        }),
        new FieldShell({
            control: count,
            label: 'Passive players',
            help: 'Maximum 10. A connected human starting area is kept free.',
        }).element,
    );
    return {
        element,
        value: () => ({ count: Number(count.value) }),
    };
}
