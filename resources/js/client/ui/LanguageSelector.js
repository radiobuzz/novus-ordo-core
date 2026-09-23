import { el } from './dom.js';
export function languageSelector(scope, i18n) {
    const select = el(
        'select',
        { class: 'language-selector' },
        el('option', { value: 'en', text: 'EN · English' }),
        el('option', { value: 'fr', text: 'FR · Français' }),
    );
    select.value = i18n.locale;
    i18n.bind(scope, select, 'common.language', {}, 'aria-label');
    scope.listen(select, 'change', () => i18n.setLocale(select.value));
    i18n.changed.subscribe(scope, () => {
        select.value = i18n.locale;
    });
    return select;
}
