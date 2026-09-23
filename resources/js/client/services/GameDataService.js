import { ApiError } from '../api/ApiError.js';
import { Scope } from '../runtime/Scope.js';
import { createStore, freezeValue } from '../runtime/Store.js';

function collection(value) {
    if (!Array.isArray(value?.data)) throw new ApiError('malformed', 'The world data is incomplete.');
    return value.data;
}
// Explicit payload-section comparison; unchanged sections retain their reference for consumers.
function reuse(previous, next) {
    return previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

/** One confirmed game bundle. This service owns reads; views borrow data and subscriptions. */
export class GameDataService {
    #generation = 0;
    #request;
    #turnRequest;
    #staticRequest;
    #fallbackWork;
    #inFlight;
    #command = false;
    #commandWork;
    #finishCommand;
    #activityWork;
    #activityRevision = 0;
    #map = null;
    #publish;
    #pollingStarted = false;
    #refreshWasCurrent = false;
    #hint = null;
    #appliedHint = null;
    #lastFallback = 0;
    constructor(api, boot, readTurnStatus = null) {
        Object.assign(this, { api, boot, readTurnStatus });
        this.scope = new Scope();
        const { store, publish } = createStore({
            status: 'empty',
            snapshot: null,
            error: null,
            revision: 0,
            confirmedAt: null,
            turnTransition: false,
        });
        this.store = store;
        this.#publish = publish;
        // Compatibility subscription name. There is no second cache or snapshot writer.
        this.changed = store;
    }
    get snapshot() {
        return this.store.value.snapshot;
    }
    get current() {
        return (
            !this.store.value.turnTransition &&
            (this.store.value.status === 'ready' ||
                (this.store.value.status === 'refreshing' && this.#refreshWasCurrent))
        );
    }
    get generation() {
        return this.#generation;
    }
    #state(status, changes = {}) {
        this.#publish({ ...this.store.value, status, error: null, ...changes });
    }
    sameScope(a, b) {
        return Boolean(a && b && a.game_id === b.game_id && a.setup.nation_id === b.setup.nation_id);
    }
    same(a, b) {
        return this.sameScope(a, b) && a.turn_number === b.turn_number;
    }
    async marker(signal) {
        const generation = this.#generation;
        const [game, ready, user, setup] = await Promise.all([
            this.api.getGameInfo({ signal }),
            this.api.getGameReadyStatus({ signal }),
            this.api.getUserInfo({ signal }),
            this.api.getUserNationSetupStatus({ signal }),
        ]);
        if (user.user_name !== this.boot.userName)
            throw new ApiError('session', 'The signed-in user changed. Reload to continue.');
        if (
            !signal?.aborted &&
            generation === this.#generation &&
            this.snapshot?.game_id === game.game_id &&
            this.snapshot?.setup.nation_id === setup.nation_id &&
            (game.turn_number !== this.snapshot.turn_number || ready.is_game_ready === false)
        )
            this.#startTurnTransition();
        if (!ready.is_game_ready || game.turn_number !== ready.turn_number || setup.game_id !== game.game_id)
            throw new ApiError('unavailable', 'The world is advancing. Refresh when the new turn is ready.');
        return { ...game, ready, setup: this.boot.spectator ? { ...setup, nation_id: null } : setup };
    }
    async mapForGame(gameId, signal) {
        if (this.#map?.game_id === gameId) return this.#map;
        const result = await this.api.getGameMap({ query: { game_id: gameId }, signal });
        signal.throwIfAborted();
        if (result?.game_id !== gameId) throw new ApiError('stale', 'The map belongs to another game.');
        this.#map = freezeValue(result);
        return this.#map;
    }
    #cancelReads() {
        ++this.#generation;
        this.#request?.abort();
        this.#turnRequest?.abort();
        this.#staticRequest?.abort();
        this.#inFlight = null;
    }
    invalidate(error) {
        this.#cancelReads();
        this.#map = null;
        this.#hint = null;
        this.#appliedHint = null;
        this.#state('error', { snapshot: null, error, confirmedAt: null, turnTransition: false });
    }
    beginCommand(snapshot) {
        if (!this.current || this.#command || !this.same(snapshot, this.snapshot))
            throw new ApiError('conflict', 'Refresh the current game before submitting a command.');
        this.#command = true;
        this.#commandWork = new Promise((resolve) => {
            this.#finishCommand = resolve;
        });
        this.#cancelReads();
        this.#state('pending');
    }
    async reconcile() {
        this.#command = false;
        try {
            return await this.refresh();
        } finally {
            this.#finishCommand?.();
            this.#commandWork = null;
            this.#finishCommand = null;
        }
    }
    refreshAfterActivity() {
        ++this.#activityRevision;
        this.#activityWork ??= this.#refreshActivity().finally(() => {
            this.#activityWork = null;
        });
        return this.#activityWork;
    }
    async #refreshActivity() {
        // Other participants do not own our pending state. Read after their outcome,
        // without interrupting our own submission/check/reconciliation if it overlaps.
        while (!this.scope.closed) {
            if (this.#commandWork) await this.#commandWork;
            if (this.scope.closed) return false;
            const activityRevision = this.#activityRevision;
            this.#cancelReads();
            const work = this.refresh();
            const generation = this.#generation;
            const refreshed = await work;
            if (
                activityRevision !== this.#activityRevision ||
                this.#commandWork ||
                (!refreshed && generation !== this.#generation && this.current)
            )
                continue;
            return refreshed;
        }
        return false;
    }
    retryTurnTransition() {
        // Explicit recovery may replace a stalled read, never an in-flight mutation.
        if (!this.store.value.turnTransition || this.#command || this.scope.closed)
            return Promise.resolve(false);
        this.#cancelReads();
        return this.refresh();
    }
    refresh() {
        if (this.scope.closed || this.#command) return Promise.resolve(false);
        if (this.#inFlight) return this.#inFlight;
        this.#turnRequest?.abort();
        this.#staticRequest?.abort();
        // An ordinary poll does not disable controls. A command cancels that read and
        // still checks its context before writing. Recovery/reconciliation stays gated.
        this.#refreshWasCurrent = this.current;
        const request = new AbortController();
        this.#request = request;
        const signal = AbortSignal.any([this.scope.signal, request.signal]);
        const generation = ++this.#generation;
        // Install the promise before publishing loading; subscribers may request refresh too.
        const work = Promise.resolve().then(() => this.#read(generation, signal));
        this.#inFlight = work.finally(() => {
            request.abort(); // Stop any sibling reads still running after a failed batch.
            if (generation === this.#generation) this.#inFlight = null;
        });
        this.#state(this.snapshot ? 'refreshing' : 'loading');
        return this.#inFlight;
    }
    #observeScope(marker) {
        if (this.snapshot && !this.sameScope(this.snapshot, marker)) {
            this.#hint = null;
            this.#appliedHint = null;
            this.#state('loading', { snapshot: null, confirmedAt: null, turnTransition: false });
        }
    }
    #startTurnTransition() {
        if (!this.store.value.turnTransition) this.#state(this.store.value.status, { turnTransition: true });
    }
    async #read(generation, signal) {
        const observedHint = this.#hint?.key;
        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                const before = await this.marker(signal);
                signal.throwIfAborted();
                this.#observeScope(before);
                const query = { turn_number: before.turn_number };
                const [base, turn, own, map, nation] = await Promise.all([
                    this.api.getAllTerritoriesBaseInfo({ signal }),
                    this.api.getAllTerritoriesTurnInfo({ query, signal }),
                    before.setup.nation_id
                        ? this.api.getNationTerritoriesTurnInfo({ query, signal })
                        : { data: [] },
                    this.mapForGame(before.game_id, signal),
                    before.setup.nation_id ? this.api.getClientGameplay({ signal }) : null,
                ]);
                const after = await this.marker(signal);
                signal.throwIfAborted();
                if (generation !== this.#generation) return false;
                this.#observeScope(after);
                if (!this.same(before, after)) continue;
                const turns = new Map(collection(turn).map((t) => [t.territory_id, t]));
                const territories = collection(base).map((t) => {
                    const current = turns.get(t.territory_id);
                    if (!current || current.turn_number !== before.turn_number)
                        throw new ApiError(
                            'malformed',
                            'The territory snapshot does not match the current turn.',
                        );
                    return { ...t, ...current, stats: [...t.stats, ...current.stats] };
                });
                if (
                    before.setup.nation_id &&
                    (nation?.game_id !== before.game_id ||
                        nation?.turn_number !== before.turn_number ||
                        nation?.nation?.nation_id !== before.setup.nation_id ||
                        nation?.budget?.turn_number !== before.turn_number ||
                        nation?.identity?.turn_number !== before.turn_number ||
                        !Array.isArray(nation?.divisions) ||
                        !Array.isArray(nation?.deployments) ||
                        !Array.isArray(nation?.definitions?.divisions) ||
                        !Array.isArray(nation?.definitions?.resources))
                )
                    throw new ApiError('conflict', 'The nation snapshot changed. Refresh to continue.');
                const previous = this.same(this.snapshot, after) ? this.snapshot : null;
                this.#appliedHint = observedHint;
                this.#state('ready', {
                    turnTransition: false,
                    snapshot: {
                        ...after,
                        ready: reuse(previous?.ready, after.ready),
                        territories: reuse(previous?.territories, territories),
                        ownTerritories: reuse(previous?.ownTerritories, collection(own)),
                        nation: reuse(previous?.nation, nation),
                        nation_colors: reuse(previous?.nation_colors, after.nation_colors),
                        map: map.map,
                        mapFingerprint: map.fingerprint,
                    },
                    confirmedAt: Date.now(),
                    revision: this.store.value.revision + 1,
                });
                return true;
            }
            throw new ApiError('unavailable', 'The turn changed while loading. Refresh to try again.');
        } catch (error) {
            if (signal.aborted || generation !== this.#generation) return false;
            if (['session', 'forbidden'].includes(error.category)) this.invalidate(error);
            else this.#state(this.snapshot ? 'stale' : 'error', { error });
            return false;
        }
    }
    async territory(id, signal) {
        const snapshot = this.snapshot,
            generation = this.#generation;
        try {
            const base = snapshot?.territories.find((t) => t.territory_id === id);
            if (!base) throw new ApiError('not-found', 'This territory is not in the current world.');
            const query = { turn_number: snapshot.turn_number };
            const turn = await this.api.getTerritoryTurnInfo({ params: { territoryId: id }, query, signal });
            const nation = turn.owner_nation_id
                ? await this.api.getPublicNationInfo({ params: { nationId: turn.owner_nation_id }, signal })
                : null;
            const after = await this.marker(signal);
            signal.throwIfAborted();
            if (
                generation !== this.#generation ||
                !this.same(snapshot, this.snapshot) ||
                !this.same(snapshot, after) ||
                turn.turn_number !== snapshot.turn_number ||
                (nation && nation.turn_number !== snapshot.turn_number)
            )
                throw new ApiError('stale', 'The world changed. Refresh before inspecting this territory.');
            return freezeValue({
                territory: { ...base, ...turn, stats: base.stats },
                nation,
                ownerInfo: snapshot.ownTerritories.find((t) => t.territory_id === id) ?? null,
                isOwn: turn.owner_nation_id != null && turn.owner_nation_id === snapshot.setup.nation_id,
            });
        } catch (error) {
            if (['session', 'forbidden'].includes(error.category)) this.invalidate(error);
            throw error;
        }
    }
    async #pollStaticTurn(fullInterval) {
        if (this.scope.closed) return true;
        if (!this.snapshot) {
            if (
                !this.#command &&
                !this.#inFlight &&
                (Date.now() - this.#lastFallback >= 6000 || !this.#lastFallback)
            ) {
                this.#lastFallback = Date.now();
                void this.refresh();
            }
            return true;
        }
        const scopeSnapshot = this.snapshot,
            generation = this.#generation;
        const request = new AbortController();
        this.#staticRequest = request;
        const signal = AbortSignal.any([request.signal, this.scope.signal, AbortSignal.timeout(5000)]);
        try {
            const status = await this.readTurnStatus(scopeSnapshot.game_id, signal);
            if (
                signal.aborted ||
                generation !== this.#generation ||
                !this.sameScope(scopeSnapshot, this.snapshot)
            )
                return true;
            const snapshot = this.snapshot;
            const key = `${status.game_id}:${status.revision}:${status.state}`;
            const first = !this.#hint;
            const previousTurn = this.#hint?.turn;
            this.#hint = { key, turn: status.turn_number };
            // First observation establishes the baseline only for an already confirmed ready turn.
            if (
                (first ||
                    previousTurn !== snapshot.turn_number ||
                    this.#appliedHint === `${status.game_id}:${status.revision}:processing`) &&
                status.state === 'ready' &&
                status.turn_number === snapshot.turn_number &&
                !this.store.value.turnTransition
            )
                this.#appliedHint = key;
            const changed = key !== this.#appliedHint;
            if (changed) {
                // Stop old full reads from republishing a pre-transition display. Never cancel a command.
                if (status.state === 'processing' && !this.store.value.turnTransition && this.#inFlight)
                    this.#cancelReads();
                this.#startTurnTransition();
            }
            if (this.#command) return true; // Keep polling, including during the last player's Ready POST.
            const processing = changed && status.state === 'processing';
            const age = Date.now() - status.updated_at;
            if (processing && age >= 0 && age < 60000) return true;
            // A stale/failed signal needs authoritative recovery, not indefinite UI blocking.
            // Do not await PHP: static observations must continue while a full batch is waiting.
            if (changed || !this.current || Date.now() - this.store.value.confirmedAt >= fullInterval) {
                if (Date.now() - this.#lastFallback >= 3000 || !this.#lastFallback) {
                    this.#lastFallback = Date.now();
                    void this.refresh();
                }
            }
            return true;
        } catch {
            if (request.signal.aborted || this.scope.closed || generation !== this.#generation) return true;
            // Missing/malformed files and deployment write failures keep the old guarded HTTP fallback.
            // Run it without blocking subsequent static polls on a slow PHP response.
            if (
                !this.#command &&
                !this.#inFlight &&
                !this.#fallbackWork &&
                (Date.now() - this.#lastFallback >= 6000 || !this.#lastFallback)
            ) {
                this.#lastFallback = Date.now();
                this.#fallbackWork = this.#pollTurn(fullInterval).finally(() => {
                    this.#fallbackWork = null;
                });
            }
            return true;
        } finally {
            request.abort();
            if (this.#staticRequest === request) this.#staticRequest = null;
        }
    }
    async #pollTurn(fullInterval) {
        if (this.scope.closed || this.#command) return true;
        if (this.#inFlight) return this.#inFlight;
        if (!this.current || Date.now() - this.store.value.confirmedAt >= fullInterval) return this.refresh();
        const snapshot = this.snapshot,
            generation = this.#generation,
            request = new AbortController();
        this.#turnRequest = request;
        const signal = AbortSignal.any([request.signal, this.scope.signal, AbortSignal.timeout(10000)]);
        try {
            // This existing public endpoint is only a change hint, never a partial snapshot.
            const game = await this.api.getGameInfo({ signal });
            if (request.signal.aborted || this.scope.closed || generation !== this.#generation) return true;
            if (!Number.isInteger(game?.game_id) || !Number.isInteger(game?.turn_number))
                throw new ApiError('malformed', 'The game status is incomplete.');
            if (game.game_id === snapshot.game_id && game.turn_number === snapshot.turn_number) return true;
            const error = new ApiError('conflict', 'The game changed. Refreshing the current turn.');
            if (game.game_id !== snapshot.game_id) this.invalidate(error);
            else this.#state('stale', { turnTransition: true });
            return this.refresh();
        } catch (error) {
            if (request.signal.aborted || this.scope.closed || generation !== this.#generation) return true;
            if (['session', 'forbidden'].includes(error.category)) this.invalidate(error);
            else this.#state('stale', { error });
            return false;
        } finally {
            request.abort();
            if (this.#turnRequest === request) this.#turnRequest = null;
        }
    }
    startPolling(
        document,
        window = document.defaultView,
        interval = 30000,
        turnInterval = this.readTurnStatus ? 3000 : 2000,
    ) {
        if (this.#pollingStarted) return;
        this.#pollingStarted = true;
        let failures = 0,
            scheduleVersion = 0,
            releaseTimer,
            releaseWake;
        const schedule = () => {
            releaseTimer?.();
            if (this.scope.closed) return;
            const version = ++scheduleVersion;
            releaseTimer = this.scope.timeout(
                async () => {
                    const ok = await (this.readTurnStatus
                        ? this.#pollStaticTurn(interval)
                        : this.#pollTurn(interval));
                    if (version !== scheduleVersion) return;
                    failures = ok ? 0 : Math.min(failures + 1, 3);
                    schedule();
                },
                Math.min(interval, turnInterval) * 2 ** failures,
            );
        };
        const wake = () => {
            // Hiding the tab does not stop the timer. Returning also catches up promptly
            // after browser-imposed throttling, sleep or a restored page.
            if (document.hidden || this.scope.closed) return;
            releaseTimer?.();
            releaseWake?.();
            const version = ++scheduleVersion;
            releaseWake = this.scope.timeout(async () => {
                // Static scheduling must not wait behind a PHP refresh, including on tab return.
                const ok = this.readTurnStatus ? (void this.refresh(), true) : await this.refresh();
                if (version !== scheduleVersion) return;
                failures = ok ? 0 : Math.min(failures + 1, 3);
                if (!this.scope.closed) schedule();
            }, 100);
        };
        this.scope.listen(document, 'visibilitychange', wake);
        if (window) {
            this.scope.listen(window, 'focus', wake);
            this.scope.listen(window, 'online', wake);
            this.scope.listen(window, 'pageshow', (event) => {
                // Normal navigation already starts its initial refresh. Only restored
                // pages need this extra wakeup, otherwise it can interrupt initial news.
                if (event.persisted) wake();
            });
        }
        schedule();
    }
    async dispose() {
        this.#cancelReads();
        this.#finishCommand?.();
        await this.scope.dispose();
        this.#map = null;
        this.#state('empty', { snapshot: null, confirmedAt: null, turnTransition: false });
    }
}
