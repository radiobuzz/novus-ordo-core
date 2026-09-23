import { el } from '../ui/dom.js';
import { Button } from '../ui/Button.js';
import { Disclosure } from '../ui/Disclosure.js';
import { languageSelector } from '../ui/LanguageSelector.js';
import { resourceIcon } from '../ui/resourceVisuals.js';
import { resourceValues } from '../services/turnBriefing.js';
import { TurnBriefing } from './TurnBriefing.js';
import { Scope } from '../runtime/Scope.js';
import './header.scss';
import { soundSettings } from '../ui/SoundSettings.js';
import { setButtonIcon } from '../ui/icons.js';
import { compactLabel } from '../ui/compactLabel.js';
import { watchingControls } from '../experimental-ai/WatchingControls.js';

/** Shell composition: shared snapshots in, explicit commands out. */
export class GameHeader {
    constructor(scope, services) {
        Object.assign(this, { scope, services });
        this.t = (key, params) => services.i18n.t(`hud.${key}`, params);
        this.nodes = new Map();
        this.element = el('header', { class: 'shell-header game-hud' });
        this.menu = new Disclosure(scope, { label: '☰', className: 'game-menu', group: 'game-hud' });
        this.menu.trigger.setAttribute('aria-label', this.t('menu'));
        this.navigation = el('nav', { class: 'hud-navigation', 'aria-label': this.t('navigation') });
        for (const page of ['world', 'nation', 'economy', 'military', 'reports']) {
            const label = el('span', { class: 'ui-visually-hidden', text: this.t(page) });
            const link = el('a', {
                class: 'ui-button ui-button--quiet hud-navigation-link',
                href: `#/${page}`,
                'data-page': page,
                'aria-label': this.t(page),
                title: this.t(page),
            });
            link.append(label);
            setButtonIcon(link, page === 'economy' ? 'economic' : page === 'reports' ? 'news' : page);
            this.navigation.append(link);
        }
        const games = new Button({ label: services.i18n.t('games.title'), icon: 'games', variant: 'quiet' });
        scope.listen(games.element, 'click', () => {
            this.menu.close();
            void services.chooseGame?.();
        });
        services.i18n.bind(scope, games.element, 'games.title');
        this.refresh = new Button({ label: services.i18n.t('common.refresh'), icon: 'refresh' });
        scope.listen(this.refresh.element, 'click', () => {
            this.menu.close();
            void services.world.refresh();
        });
        const settings = el(
            'div',
            { class: 'hud-settings' },
            games.element,
            this.refresh.element,
            languageSelector(scope, services.i18n),
        );
        const displayLabel = el('span');
        const unitStyle = el(
            'select',
            { 'aria-label': services.i18n.t('command.unitStyle') },
            el('option', { value: 'miniatures', text: services.i18n.t('command.miniatures') }),
            el('option', { value: 'flat', text: services.i18n.t('command.flat') }),
        );
        unitStyle.value = services.preferences.read().unitStyle === 'flat' ? 'flat' : 'miniatures';
        scope.listen(unitStyle, 'change', () => {
            services.preferences.write({ ...services.preferences.read(), unitStyle: unitStyle.value });
            services.displayChanged?.();
        });
        settings.append(el('label', {}, displayLabel, unitStyle), soundSettings(scope, services));
        services.i18n.changed.subscribe(scope, () => {
            displayLabel.textContent = services.i18n.t('command.unitStyle');
            unitStyle.setAttribute('aria-label', displayLabel.textContent);
            for (const option of unitStyle.options)
                option.textContent = services.i18n.t(`command.${option.value}`);
        });
        displayLabel.textContent = services.i18n.t('command.unitStyle');
        for (const [url, key] of [
            [services.boot.urls.admin, 'admin'],
            [services.boot.urls.tools, 'tools'],
            [services.boot.urls.logout, 'logout'],
        ])
            if (url) settings.append(el('a', { href: url, 'data-hud-label': key, text: this.t(key) }));
        this.menu.content.append(this.navigation, settings);
        this.turn = el('strong', { text: services.i18n.t('world.connecting') });
        this.context = el('span', { class: 'sr-only' });
        this.resources = el('div', { class: 'hud-resources', 'aria-label': this.t('resources') });
        this.layers = el('div', { class: 'hud-layer-slot', hidden: true });
        services.attachHeaderControls = (owner, element) => {
            this.layers.replaceChildren(element);
            this.layers.hidden = false;
            owner.own(() => {
                if (element.parentNode === this.layers) {
                    element.remove();
                    this.layers.hidden = true;
                }
            });
        };
        scope.own(() => {
            delete services.attachHeaderControls;
        });
        this.readiness = new Disclosure(scope, {
            label: '—',
            className: 'hud-readiness',
            group: 'game-hud',
            onOpen: () => void this.loadReadiness(),
        });
        scope.own(() => this.readinessRequest?.dispose());
        this.ready = new Button({
            label: this.t('ready'),
            icon: 'ready',
            variant: 'primary',
            disabled: true,
        });
        this.ready.element.classList.add('hud-ready');
        this.news = new Button({ label: this.t('news'), icon: 'news', variant: 'quiet', disabled: true });
        compactLabel(this.news.element, this.t('news'));
        setButtonIcon(this.readiness.trigger, 'forces');
        this.element.append(
            el('span', { class: 'hud-mark', text: 'N', 'aria-label': 'Novus Ordo' }),
            this.menu.element,
            this.navigation,
            el(
                'div',
                { class: 'header-context' },
                this.turn,
                this.context,
                ...(services.boot.spectator ? [services.i18n.bind(scope, el('span'), 'games.watching')] : []),
            ),
            this.resources,
            this.layers,
            this.news.element,
            this.readiness.element,
            this.ready.element,
            ...(services.automation ? [watchingControls(scope, services)] : []),
        );
        this.briefing = new TurnBriefing(scope, services, (report) => {
            this.identities = report?.nations;
            this.updateReadiness();
        });
        scope.listen(this.news.element, 'click', () => this.briefing.open());
        scope.listen(this.ready.element, 'click', async () => {
            const snapshot = services.world.snapshot;
            if (!snapshot || this.ready.element.disabled) return;
            try {
                await services.gameplay.command(
                    'readyForNextTurn',
                    { turn_number: snapshot.turn_number },
                    snapshot,
                );
            } catch {
                /* Command outcome remains visible in the shell. */
            }
        });
        services.world.store.subscribe(scope, () => this.update());
        services.gameplay.changed.subscribe(scope, () => this.updateReadiness());
        services.i18n.changed.subscribe(scope, () => {
            this.menu.trigger.setAttribute('aria-label', this.t('menu'));
            this.navigation.setAttribute('aria-label', this.t('navigation'));
            for (const link of this.navigation.children) {
                const label = this.t(link.dataset.page);
                link.querySelector('.ui-visually-hidden').textContent = label;
                link.setAttribute('aria-label', label);
                link.title = label;
            }
            for (const link of settings.querySelectorAll('[data-hud-label]'))
                link.textContent = this.t(link.dataset.hudLabel);
            this.refresh.setLabel(services.i18n.t('common.refresh'));
            this.news.setLabel(this.t('news'));
            compactLabel(this.news.element, this.t('news'));
            this.update();
        });
    }
    async loadReadiness() {
        const snapshot = this.services.world.snapshot;
        if (!snapshot || !this.services.world.current) return;
        this.readinessRequest?.dispose();
        const request = new Scope();
        this.readinessRequest = request;
        try {
            const result = await this.services.gameplay.identities(snapshot, request.signal);
            if (request.closed || this.scope.closed) return;
            this.identities = result.nations;
            this.updateReadiness();
        } catch (error) {
            if (!request.closed && !this.scope.closed && ['session', 'forbidden'].includes(error.category))
                this.services.world.invalidate(error);
        } finally {
            void request.dispose();
        }
    }
    updateReadiness() {
        const { world, gameplay } = this.services;
        const snapshot = world.snapshot,
            ready = snapshot?.ready;
        const ids = ready?.ready_for_next_turn_nation_ids ?? [];
        const mine = ids.includes(snapshot?.setup.nation_id);
        this.ready.setDisabled(
            !world.current ||
                gameplay.needsReview ||
                !snapshot?.setup.nation_id ||
                !ready?.is_game_ready ||
                mine,
        );
        this.ready.setPending(gameplay.busy);
        this.ready.setLabel(this.t(gameplay.busy ? 'sending' : mine ? 'waiting' : 'ready'));
        compactLabel(this.ready.element, this.t(gameplay.busy ? 'sending' : mine ? 'waiting' : 'ready'));
        this.ready.element.title = this.t('readyHint');
        this.readiness.setLabel(
            ready ? this.t('readiness', { ready: ids.length, total: ready.nation_count }) : '—',
        );
        compactLabel(
            this.readiness.trigger,
            ready ? this.t('readiness', { ready: ids.length, total: ready.nation_count }) : '—',
            ready ? `${ids.length}/${ready.nation_count}` : '—',
        );
        const nations =
            this.identities ??
            [
                ...new Set(
                    [...(snapshot?.territories.map((t) => t.owner_nation_id) ?? []), ...ids].filter(Boolean),
                ),
            ].map((nation_id) => ({ nation_id }));
        this.readiness.content.replaceChildren(
            el('h2', { text: this.t('players') }),
            ...nations.map((nation) =>
                el('p', {
                    text: `${nation.usual_name ?? this.t('nationId', { id: nation.nation_id })} · ${this.t(ids.includes(nation.nation_id) ? 'isReady' : 'planning')}`,
                }),
            ),
            el('small', {
                text: ready?.turn_expiration
                    ? this.t('deadline', {
                          date: new Date(ready.turn_expiration).toLocaleString(this.services.i18n.locale),
                      })
                    : this.t('noDeadline'),
            }),
        );
        this.news.setDisabled(!world.current || !snapshot?.nation);
    }
    update() {
        const { world, i18n } = this.services;
        const snapshot = world.snapshot,
            data = snapshot?.nation;
        this.turn.textContent = snapshot
            ? i18n.t('world.turn', { turn: snapshot.turn_number })
            : i18n.t('world.connecting');
        this.context.textContent = snapshot
            ? i18n.t('world.context', { game: snapshot.game_id, count: snapshot.ready.nation_count })
            : '';
        this.element.dataset.freshness = world.store.value.status;
        const types = data?.definitions.resources ?? [];
        const keys = new Set(types.map((r) => r.resource_type));
        for (const [key, node] of this.nodes)
            if (!keys.has(key)) {
                node.release();
                node.disclosure.element.remove();
                this.nodes.delete(key);
            }
        for (const meta of types) {
            const type = meta.resource_type,
                name = i18n.t(`command.resource.${type}`);
            let node = this.nodes.get(type);
            if (!node) {
                const owner = new Scope();
                const release = this.scope.own(() => owner.dispose());
                const disclosure = new Disclosure(owner, { className: 'hud-resource', group: 'game-hud' });
                disclosure.element.dataset.resource = type;
                const icon = resourceIcon(type, this.services.boot.baseUrl);
                const balance = el('strong'),
                    reserve = el('span', { class: 'hud-resource-reserve' });
                const title = el('h2'),
                    rows = new Map();
                disclosure.trigger.replaceChildren(
                    icon ? el('img', { src: icon, alt: '' }) : el('span', { text: type }),
                    el('span', { class: 'hud-resource-values' }, balance, reserve),
                );
                disclosure.content.append(title);
                const list = el('dl');
                for (const field of ['balance', 'reserve', 'production', 'upkeep', 'expenses', 'available']) {
                    const label = el('dt'),
                        value = el('dd');
                    rows.set(field, { label, value });
                    list.append(label, value);
                }
                const note = el('p', { class: 'muted' });
                disclosure.content.append(list, note);
                this.resources.append(disclosure.element);
                node = { disclosure, balance, reserve, title, rows, note, release };
                this.nodes.set(type, node);
            }
            const values = resourceValues(data, type);
            const format = (value, compact = false, signed = false) =>
                value == null
                    ? '—'
                    : i18n.number(value, {
                          notation: compact ? 'compact' : 'standard',
                          maximumFractionDigits: compact ? 1 : 6,
                          ...(signed ? { signDisplay: 'always' } : {}),
                      });
            node.title.textContent = name;
            node.balance.replaceChildren(
                el('span', { class: 'hud-resource-amount', text: format(values.balance, true, true) }),
                el('span', { class: 'hud-resource-turn', text: `/${this.t('turnShort')}` }),
            );
            node.balance.dataset.tone = values.balance < 0 ? 'danger' : 'ready';
            node.reserve.textContent =
                meta.can_be_stocked === false
                    ? this.t('notStockedShort')
                    : this.t('reserveShort', { value: format(values.reserve, true) });
            node.disclosure.trigger.setAttribute(
                'aria-label',
                `${name}: ${this.t('balance')} ${format(values.balance, false, true)}, ${this.t('reserve')} ${meta.can_be_stocked === false ? this.t('notStocked') : format(values.reserve)}`,
            );
            node.disclosure.trigger.title = name;
            for (const [field, row] of node.rows) {
                row.label.textContent = this.t(field);
                row.value.textContent =
                    field === 'reserve' && meta.can_be_stocked === false
                        ? this.t('notStocked')
                        : format(values[field], false, field === 'balance');
            }
            node.note.textContent = this.t(world.current ? 'budgetHint' : 'staleNews');
        }
        this.updateReadiness();
    }
}
