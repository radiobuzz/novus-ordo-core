import { destinationNav } from '../ui/DestinationNav.js';
import { Scope } from '../runtime/Scope.js';
import { Host } from '../runtime/Host.js';
import { FeatureLoader } from '../runtime/FeatureLoader.js';
import { entryRegistry } from './entryRegistry.js';
import { el, button } from '../ui/dom.js';
import { glassPanel } from '../ui/GlassPanel.js';
import { actionLink } from '../ui/Button.js';
import { languageSelector } from '../ui/LanguageSelector.js';
import { musicControls } from '../ui/MusicControls.js';
import { AtmosphereBackground } from '../ui/atmosphere/AtmosphereBackground.js';

export class EntryShell {
    scope = new Scope();
    constructor(root, services) {
        this.services = services;
        const { i18n, audio, boot } = services;
        this.atmosphere = new AtmosphereBackground(this.scope, {
            background: boot.assets.background,
            slides: boot.assets.backgroundSlides,
        });
        this.atmosphere.setSlideshow(!boot.userId);
        this.screen = el('main', { class: 'entry-screen' });
        const home = el(
            'a',
            { href: boot.urls.entry, class: 'entry-brand', 'aria-label': 'Novus Ordo' },
            el('span', { class: 'brand-symbol', 'aria-hidden': 'true', text: 'N' }),
            el('span', { text: 'NOVUS ORDO' }),
        );
        this.destinations = el('div');
        root.append(
            this.atmosphere.root,
            el(
                'div',
                { class: 'entry-layout' },
                el(
                    'header',
                    { class: 'entry-header' },
                    home,
                    el(
                        'div',
                        { class: 'entry-preferences' },
                        musicControls(this.scope, i18n, audio),
                        languageSelector(this.scope, i18n),
                    ),
                ),
                this.screen,
                el(
                    'footer',
                    { class: 'entry-footer' },
                    i18n.bind(this.scope, el('span'), 'entry.footer'),
                    this.destinations,
                ),
            ),
        );
        this.syncSession();
        i18n.changed.subscribe(this.scope, () => this.syncSession());
        this.host = new Host({
            loader: new FeatureLoader(entryRegistry),
            services,
            createSlot: () => {
                this.messageScope?.dispose();
                this.screen.classList.remove('is-wide');
                const slot = el('div', { class: 'entry-feature' });
                this.screen.replaceChildren(slot);
                return slot;
            },
            showStatus: (status, error, retry) => {
                if (status === 'loading') this.message('common.loading');
                if (status === 'error') this.message('entry.unavailable', i18n.error(error), retry);
            },
        });
        this.scope.own(() => this.host.dispose());
        this.scope.listen(root, 'click', (event) => {
            const link = event.target.closest('a[href]');
            if (!link || !this.host.current?.process?.dirty) return;
            if (this.host.current.process.busy || !confirm(i18n.t('wizard.leave'))) event.preventDefault();
            else this.host.current.process.dirty = false;
        });
    }
    syncSession() {
        const { boot, i18n } = this.services;
        this.destinations.replaceChildren(destinationNav(boot.destinations, null, (key) => i18n.t(key)));
    }
    message(key, detail = '', retry = null) {
        const { i18n } = this.services;
        this.screen.classList.remove('is-wide');
        this.messageScope?.dispose();
        this.messageScope = new Scope();
        const panel = glassPanel(i18n.bind(this.messageScope, el('h1'), key));
        if (detail) panel.append(el('p', { class: 'panel-intro', text: detail }));
        if (retry) {
            const again = i18n.bind(this.messageScope, button('', 'entry-primary'), 'common.retry');
            this.messageScope.listen(again, 'click', retry);
            panel.append(again);
        }
        this.screen.replaceChildren(panel);
    }
    ready(founded) {
        this.message(founded ? 'entry.founded' : 'entry.ready');
        const { i18n, boot } = this.services,
            panel = this.screen.firstChild;
        panel.prepend(el('div', { class: 'panel-insignia', 'aria-hidden': 'true', text: 'N' }));
        panel.append(
            i18n.bind(
                this.messageScope,
                el('p', { class: 'panel-intro' }),
                founded ? 'entry.foundedBody' : 'entry.readyBody',
            ),
            i18n.bind(
                this.messageScope,
                actionLink('', boot.urls.client, { variant: 'primary', className: 'entry-primary' }),
                'entry.client',
            ),
        );
        if (boot.urls.admin)
            panel.append(
                i18n.bind(
                    this.messageScope,
                    el('a', { class: 'ready-secondary', href: boot.urls.admin }),
                    'entry.admin',
                ),
            );
    }
    async dispose() {
        await this.scope.dispose();
        await this.messageScope?.dispose();
    }
}
