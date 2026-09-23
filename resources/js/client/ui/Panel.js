import { el } from './element.js';

/** Static surface composition. FeatureSurface remains responsible for hosts and dialogs. */
export function panel(
    { title, headingLevel = 2, tone = 'neutral', surface = 'solid', actions, footer, className = '' } = {},
    ...content
) {
    if (!['neutral', 'accent', 'ready', 'warning', 'danger'].includes(tone))
        throw new TypeError('Unknown panel tone.');
    if (!['solid', 'glass'].includes(surface)) throw new TypeError('Unknown panel surface.');
    if (!Number.isInteger(headingLevel) || headingLevel < 1 || headingLevel > 6)
        throw new TypeError('Invalid heading level.');
    const element = el('section', {
        class: `ui-panel ui-panel--${surface} ${className}`.trim(),
        'data-tone': tone,
    });
    if (title != null || actions)
        element.append(
            el(
                'header',
                { class: 'ui-panel-heading' },
                title != null ? el(`h${headingLevel}`, { class: 'ui-panel-title', text: title }) : null,
                actions ? el('div', { class: 'ui-panel-actions' }, actions) : null,
            ),
        );
    element.append(...content.flat().filter((child) => child != null));
    if (footer) element.append(el('footer', { class: 'ui-panel-footer' }, footer));
    return element;
}
