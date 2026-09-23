import { Scope } from '../runtime/Scope.js';
import { Host } from '../runtime/Host.js';
import { Signal } from '../runtime/Signal.js';
import { FeatureLoader } from '../runtime/FeatureLoader.js';
import { featureRegistry } from './registry.js';
import { FeatureSurface } from '../ui/FeatureSurface.js';
import { Router } from './Router.js';
import { localizedDom } from '../ui/localizedDom.js';
import { GameHeader } from './GameHeader.js';
import { TurnTransition } from './TurnTransition.js';
import { CompactMessage } from '../ui/CompactMessage.js';
import '../features/gameplay/gameplay.scss';
import '../features/gameplay/planner.scss';

export class GameShell {
    constructor(root, services) {
        this.scope = new Scope();
        this.root = root;
        this.services = services;
        const { el, button } = localizedDom(this.scope, services.i18n);
        services.selection = { id: null, changed: new Signal() };
        const { boot, world } = services;
        const loader = new FeatureLoader(featureRegistry);
        const hud = new GameHeader(this.scope, services);
        this.hud = hud;
        new TurnTransition(this.scope, services);
        const { element: header, navigation, turn, context } = hud;
        const workspaceElement = el('main', { class: 'workspace-host', id: 'world-workspace' });
        const panelElement = el('aside', { class: 'inspector-panel', hidden: true });
        const dialogElement = el('dialog', { class: 'inspector-dialog' });
        const statusMessage = new CompactMessage(this.scope);
        const status = statusMessage.element;
        statusMessage.show(services.i18n.t('world.loading'));
        const footer = el(
            'footer',
            { class: 'shell-footer' },
            el('span', {}, el('span', { class: 'status-dot', 'aria-hidden': 'true' }), status),
            el('span', {
                class: 'footer-detail',
                textKey: 'world.signedIn',
                textParams: { name: boot.userName },
            }),
        );
        root.replaceChildren(
            el(
                'div',
                { class: 'game-shell' },
                header,
                el('div', { class: 'shell-content' }, workspaceElement, panelElement),
                footer,
                dialogElement,
            ),
        );
        const panel = new FeatureSurface({
            element: panelElement,
            loader,
            services,
            title: 'world.inspector',
            onClose: () => this.router.select(null),
        });
        const dialog = new FeatureSurface({
            element: dialogElement,
            loader,
            services,
            title: 'world.dialog',
            dialog: true,
            onClose: () => void dialog.close(),
        });
        this.panel = panel;
        this.dialog = dialog;
        const plannerElement = el('dialog', { class: 'production-planner-dialog' });
        root.querySelector('.game-shell').append(plannerElement);
        const planner = new FeatureSurface({
            element: plannerElement,
            loader,
            services,
            title: 'planner.title',
            dialog: true,
            onClose: () => void planner.close(),
        });
        this.planner = planner;
        services.openProductionPlanner = () => {
            if (!world.snapshot?.nation || plannerElement.open) return;
            void planner.open('production-planner', {});
        };
        services.closeProductionPlanner = () => planner.close();
        services.openInspectorDialog = (id) => dialog.openDialog('territory', { id, dialog: true });
        services.selectTerritory = (id) => {
            if (services.selection.id === id) services.selection.changed.emit(id);
            else this.router.select(id);
        };
        services.inspectTerritory = (id) => (id ? panel.open('territory', { id }) : panel.close());
        const workspace = new Host({
            loader,
            services,
            createSlot: () => {
                const slot = el('div', { class: 'workspace-slot' });
                workspaceElement.replaceChildren(slot);
                return slot;
            },
            showStatus: (state, error, retry) => {
                if (state === 'loading')
                    workspaceElement.replaceChildren(
                        el('div', { class: 'workspace-message', role: 'status', textKey: 'world.opening' }),
                    );
                if (state === 'closed') workspaceElement.replaceChildren();
                if (state === 'error') this.showError(workspaceElement, error, retry);
            },
        });
        this.workspace = workspace;
        let mountedSnapshot, mountedPage;
        this.router = new Router(
            this.scope,
            (id, page = 'world') => {
                if (world.snapshot && id && !world.snapshot.territories.some((t) => t.territory_id === id))
                    id = null;
                if (services.selection.id !== id) {
                    services.selection.id = id;
                    services.selection.changed.emit(id);
                }
                for (const link of navigation.querySelectorAll('a'))
                    link.setAttribute('aria-current', link.dataset.page === page ? 'page' : 'false');
                if (!world.snapshot) return;
                const compatible =
                    world.sameScope(mountedSnapshot, world.snapshot) &&
                    mountedSnapshot.mapFingerprint === world.snapshot.mapFingerprint;
                if (!compatible || mountedPage !== page) {
                    mountedSnapshot = world.snapshot;
                    mountedPage = page;
                    void workspace.open(page === 'world' ? 'world' : 'gameplay', {
                        snapshot: world.snapshot,
                        page,
                    });
                }
                // World modes decide whether selection means territory inspection or a military tool.
                if (page !== 'world') void panel.close();
            },
            () =>
                Number(new URL(location.href).searchParams.get('game_id')) === boot.gameId &&
                (new URL(location.href).searchParams.get('mode') === 'spectator') === Boolean(boot.spectator),
        );
        services.gameplay.changed.subscribe(this.scope, () => {
            status.dataset.tone = services.gameplay.outcome?.state === 'rejected' ? 'danger' : '';
            statusMessage.show(
                [
                    world.snapshot && !world.current ? services.i18n.t('world.stale') : '',
                    services.gameplay.notice,
                ]
                    .filter(Boolean)
                    .join(' '),
            );
        });
        this.scope.listen(window, 'vite:preloadError', (event) => {
            event.preventDefault();
            statusMessage.show(services.i18n.t('world.update'));
        });
        let update = 0;
        let lastEvent;
        const translateState = () => {
            const event = lastEvent,
                i18n = services.i18n;
            if (!event) return;
            if (event.status === 'ready') {
                const snapshot = event.snapshot;
                turn.textContent = i18n.t('world.turn', { turn: snapshot.turn_number });
                context.textContent = i18n.t('world.context', {
                    game: snapshot.game_id,
                    count: snapshot.ready.nation_count,
                });
                statusMessage.show(
                    i18n.t(
                        boot.spectator
                            ? 'games.watching'
                            : snapshot.setup.nation_id
                              ? 'world.synced'
                              : 'world.noNation',
                    ),
                );
            } else
                statusMessage.show(
                    i18n.t(
                        ['loading', 'refreshing', 'pending'].includes(event.status)
                            ? 'world.syncing'
                            : event.snapshot
                              ? 'world.stale'
                              : 'world.unavailable',
                    ),
                );
        };
        services.i18n.changed.subscribe(this.scope, translateState);
        world.changed.subscribe(this.scope, (event) => {
            lastEvent = event;
            const generation = ++update;
            if (this.scope.closed) return;
            void (async () => {
                if (event.status === 'ready') {
                    const { snapshot } = event;
                    // Only incompatible scope/geography retires hosted views. Inspectors subscribe.
                    if (
                        mountedSnapshot &&
                        (!world.sameScope(mountedSnapshot, snapshot) ||
                            mountedSnapshot.mapFingerprint !== snapshot.mapFingerprint)
                    ) {
                        void panel.close();
                        void dialog.close();
                    }
                    this.hasBetaMap = Boolean(snapshot.map);
                    translateState();
                    if (!boot.spectator && !snapshot.setup.nation_id && !this.setupLink) {
                        this.setupLink = el('a', { href: boot.urls.setup, textKey: 'world.create' });
                        footer.append(this.setupLink);
                    } else if (snapshot.setup.nation_id && this.setupLink) {
                        this.setupLink.remove();
                        this.setupLink = null;
                    }
                    if (generation === update) this.router.read();
                } else if (event.snapshot) {
                    // Refreshing is data work, not navigation. Keep the last confirmed view.
                    translateState();
                } else {
                    mountedSnapshot = null;
                    services.commandView = null;
                    await Promise.all([
                        panel.host.close({ force: true }),
                        dialog.host.close({ force: true }),
                        workspace.close({ force: true }),
                    ]);
                    if (generation !== update || this.scope.closed) return;
                    translateState();
                    if (event.status === 'error')
                        this.showError(workspaceElement, event.error, () => world.refresh());
                    else
                        workspaceElement.replaceChildren(
                            el('div', {
                                class: 'workspace-message',
                                role: 'status',
                                textKey: 'world.syncing',
                            }),
                        );
                }
            })().catch((error) => this.showError(workspaceElement, error, () => world.refresh()));
        });
        this.router.read();
    }
    showError(element, error, retry) {
        if (this.scope.closed) return;
        const { el, button } = localizedDom(this.scope, this.services.i18n);
        const message = el(
            'div',
            { class: 'workspace-message', role: 'alert' },
            el('p', { class: 'eyebrow', textKey: 'world.connection' }),
            el('h2', { textKey: 'world.failed' }),
            el('p', { textKey: `errors.${error?.category ?? 'unknown'}` }),
        );
        if (error?.category === 'session')
            message.append(el('a', { href: this.services.boot.urls.login, textKey: 'world.signIn' }));
        else {
            const again = button('common.retry');
            again.addEventListener('click', retry, { once: true });
            message.append(again);
        }
        element.replaceChildren(message);
    }
    get hasEdits() {
        return Boolean(this.workspace.current?.hasDrafts?.());
    }
    async dispose() {
        await this.scope.dispose();
        await Promise.all([
            this.panel.dispose(),
            this.dialog.dispose(),
            this.planner.dispose(),
            this.workspace.dispose(),
        ]);
        await this.scope.dispose();
    }
}
