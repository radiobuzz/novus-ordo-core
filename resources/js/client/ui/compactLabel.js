import { el } from './element.js';

/** Responsive visible text; the full accessible name survives icon-only presentation. */
export function compactLabel(element, label, short = '') {
    element.classList.add('ui-compact-label');
    element.setAttribute('aria-label', label);
    element.title = label;
    element.replaceChildren(
        el('span', { class: 'ui-label-full', text: label, 'aria-hidden': 'true' }),
        el('span', { class: 'ui-label-short', text: short, 'aria-hidden': 'true' }),
    );
}
