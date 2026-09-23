import { destinationNav } from '../ui/DestinationNav.js';
import { Instance } from '../runtime/Instance.js';
import { el } from '../ui/element.js';
import { Button, actionLink } from '../ui/Button.js';
import { languageSelector } from '../ui/LanguageSelector.js';
import './game-selector.scss';

/** Feature composition: the directory owns its read and never borrows a game's transport. */
export class GameSelector extends Instance {
    async onMount(root) {
        this.root = root;
        this.services.i18n.changed.subscribe(this.scope, () => this.render());
        await this.load();
    }
    async load() {
        this.error = null;
        this.loading = true;
        this.render();
        try {
            const result = await this.services.api.getGames({ signal: this.scope.signal });
            this.scope.signal.throwIfAborted();
            this.games = result.games;
        } catch (error) {
            if (this.scope.closed) return;
            this.error = error;
        } finally {
            this.loading = false;
            if (!this.scope.closed) this.render();
        }
    }
    render() {
        if (!this.root || this.scope.closed) return;
        const { i18n, boot } = this.services;
        const t = (key, args) => i18n.t(`games.${key}`, args);
        const title = el('h1', { text: t('title'), tabindex: '-1' });
        const refresh = new Button({ label: i18n.t('common.refresh'), disabled: this.loading });
        refresh.element.onclick = () => void this.load();
        const header = el(
            'header',
            {},
            el('div', {}, el('p', { class: 'eyebrow', text: 'NOVUS ORDO' }), title),
            refresh.element,
        );
        // One persistent language control; re-rendered cards own no subscriptions.
        this.language ??= languageSelector(this.scope, i18n);
        header.append(this.language);
        const content = el('div', { class: 'game-list', 'aria-busy': String(this.loading) });
        if (this.loading) content.append(el('p', { role: 'status', text: i18n.t('common.loading') }));
        else if (this.error) {
            content.append(el('p', { role: 'alert', text: i18n.error(this.error) }));
            if (this.error.category === 'session')
                content.append(actionLink(i18n.t('world.signIn'), boot.urls.login));
        } else if (!this.games?.length) content.append(el('p', { role: 'status', text: t('empty') }));
        else
            for (const game of this.games) {
                const label = t('game', { id: game.game_id });
                const card = el(
                    'article',
                    { class: 'game-card', 'data-game-id': game.game_id },
                    el('div', { class: 'game-preview', 'aria-hidden': 'true' }, el('span', { text: 'N' })),
                    el('h2', { text: label }),
                    el('p', { text: i18n.t('world.turn', { turn: game.turn_number }) }),
                    el('p', {
                        class: 'muted',
                        text: t(
                            game.setup_status === 'FinishedSetup'
                                ? 'playing'
                                : game.nation_id
                                  ? 'unfinished'
                                  : game.can_join
                                    ? 'open'
                                    : 'full',
                        ),
                    }),
                );
                const actions = el('div', { class: 'game-card-actions' });
                if (game.setup_status === 'FinishedSetup') {
                    const play = actionLink(t('play'), this.inputs.gameUrl(game.game_id), {
                        variant: 'primary',
                    });
                    this.link(play, game.game_id, false);
                    actions.append(play);
                } else if (game.nation_id || game.can_join) {
                    const setup = new URL(boot.urls.setup, location.href);
                    setup.searchParams.set('game_id', game.game_id);
                    actions.append(
                        actionLink(t(game.nation_id ? 'resume' : 'join'), setup.href, { variant: 'primary' }),
                    );
                }
                if (game.can_spectate) {
                    const watch = actionLink(t('spectate'), this.inputs.gameUrl(game.game_id, true));
                    this.link(watch, game.game_id, true);
                    actions.append(watch);
                }
                card.append(actions);
                content.append(card);
            }
        const page = el(
            'main',
            { class: 'game-selector' },
            header,
            destinationNav(boot.destinations, 'games', (key) => i18n.t(key)),
            el('p', { text: t('intro') }),
            content,
        );
        this.root.replaceChildren(page);
        if (!this.loading && !this.focused) {
            title.focus();
            this.focused = true;
        }
    }
    link(link, id, spectator) {
        link.onclick = (event) => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void this.inputs.choose(id, spectator);
        };
    }
}
