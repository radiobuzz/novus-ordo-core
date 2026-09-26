import { createFlagEditor } from './editor.js';
import { el } from '../client/ui/element.js';
import { actionLink } from '../client/ui/Button.js';
import { Scope } from '../client/runtime/Scope.js';
import { translate } from './strings.js';

const root = document.getElementById('identity-lab-root');
const scope = new Scope();
let locale = new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
let chromeScope;
scope.own(() => chromeScope?.dispose());
const t = (key) => translate(locale, key);
const chrome = el('div');
const host = el('section', {
    id: 'identity-flag-panel',
    role: 'tabpanel',
    'aria-labelledby': 'identity-flag-tab',
});
root.replaceChildren(chrome, host);
const editor = createFlagEditor(host, { locale });
function renderChrome() {
    const focused = chrome.contains(document.activeElement);
    void chromeScope?.dispose();
    chromeScope = new Scope();
    document.documentElement.lang = locale;
    document.title = `Novus Ordo · ${t('title')}`;
    const language = el(
        'select',
        { id: 'identity-language', class: 'ui-control', 'aria-label': t('language') },
        el('option', { value: 'en', text: 'EN · English' }),
        el('option', { value: 'fr', text: 'FR · Français' }),
    );
    language.value = locale;
    chromeScope.listen(language, 'change', () => {
        locale = language.value;
        renderChrome();
        editor.setLocale(locale);
    });
    const tabs = el(
        'div',
        { class: 'identity-tabs', role: 'tablist', 'aria-label': t('tabs') },
        el('button', {
            type: 'button',
            id: 'identity-flag-tab',
            role: 'tab',
            'aria-selected': 'true',
            'aria-controls': 'identity-flag-panel',
            text: t('flagTab'),
        }),
        ...['emblemTab', 'armsTab'].map((key) =>
            el('button', {
                type: 'button',
                role: 'tab',
                disabled: true,
                'aria-disabled': 'true',
                'aria-selected': 'false',
                tabindex: '-1',
                text: t(key),
            }),
        ),
    );
    chrome.replaceChildren(
        el(
            'header',
            { class: 'identity-header' },
            el(
                'div',
                {},
                el('p', { class: 'identity-eyebrow', text: t('eyebrow') }),
                el('h1', { text: t('title') }),
            ),
            el('div', { class: 'identity-actions' }, actionLink(t('tools'), '/client/tools'), language),
        ),
        tabs,
    );
    if (focused) language.focus({ preventScroll: true });
}
renderChrome();
root.dataset.ready = 'true';
scope.own(() => editor.dispose());
scope.listen(window, 'pagehide', (event) => {
    if (!event.persisted) void scope.dispose();
});
