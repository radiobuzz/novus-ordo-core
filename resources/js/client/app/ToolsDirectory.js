import { Instance } from '../runtime/Instance.js';
import { el } from '../ui/element.js';
import { actionLink } from '../ui/Button.js';
import { destinationNav } from '../ui/DestinationNav.js';
import { languageSelector } from '../ui/LanguageSelector.js';
import './game-selector.scss';

export class ToolsDirectory extends Instance {
    async onMount(root) {
        this.root = root;
        this.language = languageSelector(this.scope, this.services.i18n);
        this.services.i18n.changed.subscribe(this.scope, () => this.render());
        this.render();
        this.root.querySelector('h1').focus();
    }
    render() {
        const { boot, i18n } = this.services;
        const t = (key) => i18n.t(key);
        this.root.replaceChildren(
            el(
                'main',
                { class: 'game-selector' },
                el(
                    'header',
                    {},
                    el(
                        'div',
                        {},
                        el('p', { class: 'eyebrow', text: 'NOVUS ORDO' }),
                        el('h1', { text: t('destinations.tools'), tabindex: '-1' }),
                    ),
                    this.language,
                ),
                destinationNav(boot.destinations, 'tools', t),
                el('p', { text: t('tools.intro') }),
                el(
                    'div',
                    { class: 'game-list' },
                    (boot.labs ?? []).map((lab) =>
                        el(
                            'article',
                            { class: 'game-card' },
                            el('h2', { text: t(`tools.${lab.id}`) }),
                            el('p', { text: t(`tools.${lab.id}Body`) }),
                            actionLink(t('tools.open'), lab.url),
                        ),
                    ),
                ),
            ),
        );
    }
}
