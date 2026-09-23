import { destinationNav } from '../ui/DestinationNav.js';
import { SavedState } from '../services/SavedState.js';
import { LocalizationService } from '../services/LocalizationService.js';
import { Scope } from '../runtime/Scope.js';
import { Signal } from '../runtime/Signal.js';
import { AdminService } from '../services/AdminService.js';
import { el } from '../ui/dom.js';
import { Button, actionLink } from '../ui/Button.js';
import { FieldShell } from '../ui/FieldShell.js';
import { StatusBadge } from '../ui/StatusBadge.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import { overview } from '../features/admin/overview.js';
import { accounts } from '../features/admin/accounts.js';
import { tools } from '../features/admin/tools.js';
import { aiSetupFields } from '../experimental-ai/setup.js';

const sections = {
    overview: 'Overview',
    maps: 'Map workspace',
    accounts: 'Accounts',
    tools: 'Object inspector',
};
export class AdminApp {
    scope = new Scope();
    controls = new Set();
    busyChanged = new Signal();
    busy = false;
    sequence = 0;
    games = [];
    constructor(root, boot) {
        this.boot = boot;
        let storage;
        try {
            storage = localStorage;
        } catch {
            /* Optional preferences. */
        }
        const i18n = new LocalizationService(new SavedState(storage, 'device'));
        this.root = root;
        this.service = new AdminService(boot);
        this.select = el('select', { 'aria-label': 'Working game' });
        this.scopeBadge = new StatusBadge({ label: 'Loading games' });
        this.notice = el('p', { class: 'admin-notice', role: 'status' });
        this.content = el('section', { class: 'admin-content', 'aria-label': 'Administration module' });
        this.nav = el(
            'nav',
            { class: 'admin-nav', 'aria-label': 'Administration modules' },
            ...Object.entries(sections).map(([key, label]) =>
                el('a', { href: `#/${key}`, 'data-section': key, text: label }),
            ),
        );
        const refresh = this.button(this.scope, 'Refresh status', () => this.refresh(), { variant: 'quiet' });
        root.append(
            el(
                'div',
                { class: 'admin-shell' },
                el(
                    'header',
                    { class: 'admin-header' },
                    el(
                        'div',
                        { class: 'admin-brand' },
                        el('div', { class: 'admin-insignia', text: 'N', 'aria-hidden': true }),
                        el(
                            'div',
                            {},
                            el('div', { class: 'admin-wordmark', text: 'NOVUS ORDO' }),
                            el('div', { class: 'admin-subtitle', text: 'Administration · experimental' }),
                        ),
                    ),
                    el(
                        'div',
                        { class: 'admin-header-actions' },
                        destinationNav(boot.destinations, 'admin', (key) => i18n.t(key)),
                    ),
                ),
                el(
                    'div',
                    { class: 'admin-scope-bar' },
                    new FieldShell({ control: this.select, label: 'Working game' }).element,
                    this.scopeBadge.element,
                    el('p', { text: 'Selection is inspection—not activation.' }),
                    refresh,
                ),
                this.nav,
                this.notice,
                this.content,
                el(
                    'footer',
                    { class: 'admin-footer' },
                    el('span', { text: `Signed in as ${boot.userName} · Development environment` }),
                    el('span', { text: 'Existing game rules · Shared game UI' }),
                ),
            ),
        );
        this.scope.listen(this.select, 'change', () =>
            this.navigate(this.section, Number(this.select.value)),
        );
        this.scope.listen(this.nav, 'click', (event) => {
            const link = event.target.closest('[data-section]');
            if (!link) return;
            event.preventDefault();
            this.navigate(link.dataset.section, this.gameId);
        });
        this.scope.listen(window, 'hashchange', () => {
            if (this.busy) {
                history.replaceState(null, '', this.lastHash);
                this.notify('Wait for the current operation before changing scope.');
                return;
            }
            void this.openFromHash();
        });
        this.scope.own(() => this.viewScope?.dispose());
        this.scope.listen(window, 'pagehide', () => void this.dispose());
        Object.defineProperty(window, 'novusAdminDiagnostics', {
            value: () => Scope.diagnostics(),
            configurable: true,
        });
        this.scope.own(() => {
            delete window.novusAdminDiagnostics;
        });
    }
    button(scope, label, action, options = {}) {
        const control = new Button({ label, ...options });
        this.controls.add(control);
        control.setPending(this.busy);
        scope.own(() => this.controls.delete(control));
        if (action)
            scope.listen(control.element, 'click', () => {
                if (!this.busy) void action();
            });
        control.element.control = control;
        return control.element;
    }
    lockForm(scope, fieldset) {
        fieldset.disabled = this.busy;
        this.busyChanged.subscribe(scope, () => {
            fieldset.disabled = this.busy;
        });
    }
    notify(message, error = false) {
        this.notice.textContent = message;
        this.notice.dataset.error = String(error);
    }
    error(error) {
        if (error.category === 'abort') return;
        this.notify(
            Object.values(error.fields ?? {})
                .flat()
                .join(' ') || error.message,
            true,
        );
        if (error.uncertain)
            this.notify(
                'The result is uncertain. Refresh and inspect the target before trying again; this command was not automatically retried.',
                true,
            );
    }
    async run(work) {
        if (this.busy) return;
        this.notify('Working… Keep this page open until the operation finishes.');
        this.busy = true;
        this.select.disabled = true;
        for (const control of this.controls) control.setPending(true);
        this.busyChanged.emit();
        try {
            return await work();
        } catch (error) {
            this.error(error);
        } finally {
            this.busy = false;
            this.select.disabled = !this.games.length;
            for (const control of this.controls) control.setPending(false);
            this.busyChanged.emit();
        }
    }
    async start() {
        try {
            await this.loadGames();
            await this.openFromHash();
        } catch (error) {
            this.error(error);
        }
    }
    async loadGames() {
        const result = await this.service.read('/games', this.scope);
        this.games = result.games;
        this.activeGameIds = result.active_game_ids ?? [];
        this.select.replaceChildren(
            ...this.games.map((game) =>
                el('option', {
                    value: game.game_id,
                    text: `Game ${game.game_id} · Turn ${game.turn_number} · ${game.active ? 'ACTIVE' : 'Archived'}`,
                }),
            ),
        );
        if (!this.games.length) this.select.append(el('option', { value: '', text: 'No games yet' }));
        this.select.disabled = this.busy || !this.games.length;
        if (this.gameId) this.select.value = this.gameId;
    }
    navigate(section = 'overview', gameId = this.gameId) {
        if (this.busy) return;
        const hash = `#/${section}${gameId ? `?game=${gameId}` : ''}`;
        if (location.hash === hash) void this.openFromHash();
        else location.hash = hash;
    }
    async openFromHash() {
        const [path, query] = location.hash.slice(2).split('?');
        const section = Object.hasOwn(sections, path) ? path : 'overview';
        const requested = Number(new URLSearchParams(query).get('game'));
        const gameId = this.games.some((game) => game.game_id === requested)
            ? requested
            : (this.activeGameIds[0] ?? this.games[0]?.game_id ?? null);
        this.section = section;
        this.gameId = gameId;
        this.lastHash = `#/${section}${gameId ? `?game=${gameId}` : ''}`;
        history.replaceState(null, '', this.lastHash);
        this.select.value = gameId ?? '';
        const game = this.games.find((g) => g.game_id === gameId);
        this.scopeBadge.update({
            label: ['accounts', 'tools', 'maps'].includes(section)
                ? section === 'accounts'
                    ? 'Global accounts'
                    : section === 'maps'
                      ? 'Global map library'
                      : 'Tools · explicit targets'
                : game
                  ? `Game ${gameId} · ${game.active ? 'Active' : 'Archived / read-only'}`
                  : 'No active game',
            tone: game?.active ? 'accent' : 'neutral',
        });
        for (const link of this.nav.children) {
            link.href = `#/${link.dataset.section}${gameId ? `?game=${gameId}` : ''}`;
            if (link.dataset.section === section) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        const sequence = ++this.sequence;
        await this.viewScope?.dispose();
        if (sequence !== this.sequence || this.scope.closed) return;
        const scope = (this.viewScope = new Scope());
        this.content.replaceChildren(el('p', { text: 'Loading module…' }));
        try {
            const render =
                section === 'maps'
                    ? (await import('../features/admin/maps.js')).maps
                    : { overview, accounts, tools }[section];
            if (scope.closed) return;
            const content = await render(this, scope, gameId);
            if (!scope.closed) this.content.replaceChildren(content);
        } catch (error) {
            if (!scope.closed) {
                this.content.replaceChildren(
                    el('p', { text: 'This module could not load. Use Refresh status to retry.' }),
                );
                this.error(error);
            }
        }
    }
    async refresh() {
        if (this.busy) return;
        try {
            await this.loadGames();
            await this.openFromHash();
            this.notify('Status refreshed.');
        } catch (error) {
            this.error(error);
        }
    }
    async startGame(scope, draft = null) {
        const ai = aiSetupFields(scope);
        if (
            !(await confirmDialog(scope, {
                title: 'Start a new game?',
                content: ai.element,
                message: `${draft ? `Map: ${draft.name} (#${draft.id}).` : 'Map: original classic world.'} Existing games remain active.`,
                confirmLabel: 'Create and activate game',
            }))
        )
            return;
        let id;
        await this.run(async () => {
            const result = await this.service.write('/games', {
                map_draft_id: draft?.id ?? null,
                ai: ai.value(),
            });
            id = result.game_id;
            await this.loadGames();
            this.notify(`Game ${id} created and activated.`);
        });
        if (id) this.navigate('overview', id);
    }
    dispose() {
        return this.scope.dispose();
    }
}
