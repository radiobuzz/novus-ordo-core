import { Scope } from '../runtime/Scope.js';
import { SavedState } from '../services/SavedState.js';
import { LocalizationService } from '../services/LocalizationService.js';
import { createTransport } from '../api/createTransport.js';
import { createEndpointClient } from '../api/createEndpointClient.js';
import { endpoints } from '../api/generated.js';
import { GameInstance } from './GameInstance.js';
import { ToolsDirectory } from './ToolsDirectory.js';
import { GameSelector } from './GameSelector.js';

export function gameSelection(url) {
    const raw = url.searchParams.get('game_id');
    const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
    return {
        id: Number.isSafeInteger(id) ? id : null,
        spectator: url.searchParams.get('mode') === 'spectator',
    };
}

/** One visible instance per tab. Selection is URL-local, never a session/localStorage pointer. */
export class GameApplication {
    scope = new Scope();
    constructor(root, boot) {
        this.root = root;
        this.boot = boot;
        let storage;
        try {
            storage = localStorage;
        } catch {
            /* Preferences are optional. */
        }
        this.saved = new SavedState(storage, `user-${boot.userId}`);
        this.i18n = new LocalizationService(new SavedState(storage, 'device'));
        this.api = createEndpointClient(endpoints, createTransport({ ...boot, gameId: null }));
        this.currentUrl = location.href;
        this.scope.listen(window, 'popstate', () => {
            const target = location.href;
            const selected = gameSelection(new URL(target));
            if (this.sameSelection(selected)) {
                this.currentUrl = target;
                this.saveRoute();
                return;
            }
            void this.navigate(target, true);
        });
        this.scope.listen(window, 'hashchange', () => {
            if (this.sameSelection(gameSelection(new URL(location.href)))) {
                this.currentUrl = location.href;
                this.saveRoute();
            }
        });
        this.scope.listen(window, 'pagehide', () => this.saveRoute());
        this.scope.listen(window, 'beforeunload', (event) => {
            if (this.current?.pending || this.current?.dirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
    }
    sameSelection(selected) {
        return this.selection?.id === selected.id && this.selection?.spectator === selected.spectator;
    }
    gameUrl(id, spectator = false) {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        if (id) {
            url.searchParams.set('game_id', id);
            if (spectator) url.searchParams.set('mode', 'spectator');
            url.hash =
                this.saved
                    .child(`game-${id}`)
                    .child(spectator ? 'spectator-route' : 'route')
                    .read().hash || '#/world';
        }
        return url.href;
    }
    saveRoute() {
        if (!this.selection?.id) return;
        this.saved
            .child(`game-${this.selection.id}`)
            .child(this.selection.spectator ? 'spectator-route' : 'route')
            .write({ hash: new URL(this.currentUrl).hash });
    }
    start() {
        return this.navigate(location.href, true, true);
    }
    async navigate(target, fromHistory = false, initial = false) {
        if (this.changing || this.scope.closed) {
            if (fromHistory) history.replaceState(null, '', this.currentUrl);
            return false;
        }
        this.changing = true;
        try {
            if (this.current && !(await this.current.canClose())) {
                if (fromHistory) history.replaceState(null, '', this.currentUrl);
                return false;
            }
            this.saveRoute();
            await this.current?.destroy();
            if (this.scope.closed) return false;
            this.current = null;
            if (!fromHistory) history.pushState(null, '', target);
            else if (initial) history.replaceState(null, '', target);
            this.selection = gameSelection(new URL(target));
            this.currentUrl = target;
            const { id, spectator } = this.selection;
            if (this.boot.destination === 'tools') {
                this.current = new ToolsDirectory({ services: { boot: this.boot, i18n: this.i18n } });
            } else if (id) {
                const urls = { ...this.boot.urls };
                for (const key of ['setup', 'login']) {
                    const url = new URL(urls[key], location.href);
                    url.searchParams.set('game_id', id);
                    urls[key] = url.href;
                }
                this.current = new GameInstance({
                    inputs: {
                        boot: { ...this.boot, gameId: id, spectator, urls },
                        i18n: this.i18n,
                        chooseGame: () => this.navigate(this.gameUrl(null)),
                    },
                });
            } else {
                this.current = new GameSelector({
                    services: { api: this.api, i18n: this.i18n, boot: this.boot },
                    inputs: {
                        gameUrl: (game, watch) => this.gameUrl(game, watch),
                        choose: (game, watch) => this.navigate(this.gameUrl(game, watch)),
                    },
                });
            }
            await this.current.mount(this.root);
            this.currentUrl = location.href;
            return true;
        } finally {
            this.changing = false;
        }
    }
    async dispose() {
        await this.scope.dispose();
        await this.current?.destroy();
    }
}
