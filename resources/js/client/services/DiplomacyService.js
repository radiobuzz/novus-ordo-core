import { createStore } from '../runtime/Store.js';
import { ApiError } from '../api/ApiError.js';

/** One private communication read owner per selected-game lifetime. No optimistic game state. */
export class DiplomacyService {
    #publish;
    #work;
    #generation = 0;
    constructor(api, world, gameplay, document = globalThis.document) {
        Object.assign(this, { api, world, gameplay, document });
        this.scope = world.scope;
        this.drafts = new Map();
        this.requestKeys = new Map();
        this.other = null;
        this.before = null;
        this.open = false;
        const { store, publish } = createStore({
            status: 'empty',
            inbox: [],
            conversation: null,
            error: null,
        });
        this.store = store;
        this.#publish = publish;
        this.scope.own(() => {
            ++this.#generation;
            this.drafts.clear();
            this.requestKeys.clear();
            this.other = null;
            this.before = null;
            this.open = false;
            this.#publish({ status: 'empty', inbox: [], conversation: null, error: null });
        });
        let context = null;
        world.store.subscribe(this.scope, ({ snapshot, status }) => {
            const next = snapshot
                ? `${snapshot.game_id}:${snapshot.setup.nation_id}:${snapshot.turn_context_revision ?? snapshot.turn_number}`
                : null;
            if (!snapshot) {
                this.#generation++;
                this.drafts.clear();
                this.requestKeys.clear();
                this.other = null;
                this.before = null;
                this.#publish({ status: 'empty', inbox: [], conversation: null, error: null });
            }
            if (status !== 'ready') ++this.#generation;
            if (next !== context) {
                context = next;
                this.#generation++;
                if (next) this.#publish({ ...this.store.value, status: 'stale' });
            }
            if (status === 'ready' && this.enabled) queueMicrotask(() => void this.refresh());
        });
        const poll = () => {
            if (this.scope.closed) return;
            void this.refresh();
            this.scope.timeout(poll, 20000);
        };
        this.scope.timeout(poll, 20000);
        if (document?.defaultView) {
            this.scope.listen(document.defaultView, 'focus', () => void this.refresh());
            this.scope.listen(document.defaultView, 'online', () => void this.refresh());
            this.scope.listen(document, 'visibilitychange', () => {
                if (!document.hidden) void this.refresh();
            });
        }
        gameplay.reconcileCommunication = async () => {
            ++this.#generation; // A pre-command response must not overwrite a resulting offer state.
            if (this.#work) await this.#work;
            return this.refresh(true);
        };
    }
    get enabled() {
        return Boolean(this.world.snapshot?.nation?.diplomacy?.enabled);
    }
    get dirty() {
        return [...this.drafts.values()].some((draft) => draft.text.trim() || draft.quantity);
    }
    draft(id) {
        if (!this.drafts.has(id)) this.drafts.set(id, { text: '', resource: this.world.snapshot.nation.definitions.resources.find(r => r.grantable)?.resource_key ?? '', quantity: '' });
        return this.drafts.get(id);
    }
    select(id, before = null) {
        this.other = id;
        this.before = before;
        ++this.#generation;
        const wait = this.#work ?? Promise.resolve();
        return wait.then(() => this.refresh());
    }
    matches(result, snapshot) {
        return (
            result.game_id === snapshot.game_id &&
            result.nation_id === snapshot.setup.nation_id &&
            result.turn_number === snapshot.turn_number &&
            result.turn_context_revision === snapshot.turn_context_revision
        );
    }
    refresh(reconciling = false) {
        if (this.scope.closed || !this.enabled || !this.world.current || (this.gameplay.busy && !reconciling))
            return Promise.resolve(false);
        if (this.#work) return this.#work;
        const generation = this.#generation,
            snapshot = this.world.snapshot,
            other = this.open ? this.other : null,
            before = this.before;
        this.#work = Promise.resolve()
            .then(async () => {
                try {
                    const signal = this.scope.signal;
                    const [inbox, conversation] = await Promise.all([
                        this.api.getDiplomacyInbox({ signal }),
                        other
                            ? this.api.getNationConversation({
                                  params: { nationId: other },
                                  query: before ? { before } : {},
                                  signal,
                              })
                            : null,
                    ]);
                    if (
                        this.scope.closed ||
                        generation !== this.#generation ||
                        !this.world.same(snapshot, this.world.snapshot)
                    )
                        return false;
                    if (
                        !this.matches(inbox, snapshot) ||
                        (conversation && !this.matches(conversation, snapshot))
                    )
                        throw new ApiError(
                            'conflict',
                            'The conversation belongs to a changed turn. Refresh first.',
                        );
                    const previousActions = new Map(
                        this.store.value.inbox.map((row) => [
                            row.other_nation_id,
                            row.last_action_message_id,
                        ]),
                    );
                    const actionChanged = inbox.conversations.some(
                        (row) => row.last_action_message_id !== previousActions.get(row.other_nation_id),
                    );
                    this.#publish({
                        status: 'ready',
                        inbox: inbox.conversations,
                        conversation: conversation ?? this.store.value.conversation,
                        error: null,
                    });
                    // Incoming offers/notices can change budgets, orders and permissions this turn.
                    // Their authoritative read stays owned by the world service.
                    if (actionChanged && !reconciling) void this.world.refreshAfterActivity?.();
                    return true;
                } catch (error) {
                    if (this.scope.closed || generation !== this.#generation) return false;
                    if (['session', 'forbidden'].includes(error.category)) this.world.invalidate(error);
                    else this.#publish({ ...this.store.value, status: 'stale', error });
                    return false;
                }
            })
            .finally(() => {
                this.#work = null;
            });
        return this.#work;
    }
    async markRead(id) {
        if (!this.open || !this.other || this.document?.hidden || this.scope.closed) return;
        try {
            await this.api.readNationMessages({
                body: { nation_id: this.other, message_id: id },
                signal: this.scope.signal,
            });
            // Confirm the badge from the server after advancing our private read position.
            await this.refresh();
        } catch {
            /* Monotonic metadata only; keep the badge until a later confirmed read. */
        }
    }
}
