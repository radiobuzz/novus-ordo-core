import { el } from './element.js';

/** Small semantic table, not a sorting/filtering framework. Cells accept text or DOM nodes. */
export function dataTable(label, headers, rows) {
    return el(
        'div',
        { class: 'ui-table-scroll', tabindex: 0, role: 'region', 'aria-label': label },
        el(
            'table',
            { class: 'ui-table' },
            el('caption', { class: 'ui-visually-hidden', text: label }),
            el(
                'thead',
                {},
                el(
                    'tr',
                    {},
                    headers.map((text) => el('th', { scope: 'col', text })),
                ),
            ),
            el(
                'tbody',
                {},
                rows.map((row) =>
                    el(
                        'tr',
                        {},
                        row.map((cell) => el('td', {}, cell ?? '—')),
                    ),
                ),
            ),
        ),
    );
}
