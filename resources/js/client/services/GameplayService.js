import { ApiError } from '../api/ApiError.js';
import { Signal } from '../runtime/Signal.js';

const commands = new Set([
    'placeProductionBid',
    'applyProductionPlan',
    'deploy',
    'cancelDeployments',
    'sendMoveOrders',
    'sendDisbandOrders',
    'cancelOrders',
    'readyForNextTurn',
]);

/** No automatic mutation retries. Every command carries the identity it was drafted against. */
export class GameplayService {
    constructor(api, world, boot) {
        Object.assign(this, { api, world, boot });
        this.busy = false;
        this.notice = '';
        this.changed = new Signal();
        this.outcome = null;
        this.needsReview = false;
        world.store?.subscribe(world.scope, (state) => {
            if (!state.snapshot) {
                this.bidDrafts = {};
                this.draftKey = null;
                this.deploymentState = null;
                this.rankingHistoryState = null;
                this.identityRead = null;
            } else if (
                this.rankingHistoryState &&
                this.rankingHistoryState.key !== `${state.snapshot.game_id}:${state.snapshot.turn_number}`
            ) {
                this.rankingHistoryState = null;
            }
            if (
                state.status === 'ready' &&
                !this.busy &&
                this.outcome?.state === 'accepted' &&
                !this.outcome.reconciled &&
                world.same(this.commandContext, state.snapshot)
            ) {
                this.outcome = { ...this.outcome, reconciled: true };
                this.notice = 'Command accepted. The latest server state is shown below.';
                this.changed.emit();
            }
        });
    }
    drafts(snapshot) {
        const key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}`;
        if (key !== this.draftKey) {
            this.draftKey = key;
            this.bidDrafts = {};
        }
        return this.bidDrafts;
    }
    deploymentDraft(snapshot) {
        const key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}`;
        if (this.deploymentState?.key !== key) this.deploymentState = { key, entries: [], nextId: 1 };
        return this.deploymentState;
    }
    async check(snapshot, signal) {
        const generation = this.world.generation;
        const marker = await this.world.marker(signal ?? this.world.scope?.signal);
        signal?.throwIfAborted();
        this.world.scope?.signal.throwIfAborted();
        if (
            !snapshot ||
            !this.world.same(snapshot, this.world.snapshot) ||
            generation !== this.world.generation ||
            !this.world.same(snapshot, marker)
        )
            throw new ApiError('conflict', 'The game changed. Refresh before continuing.');
    }
    async load(snapshot, signal) {
        signal?.throwIfAborted();
        if (!this.world.same(snapshot, this.world.snapshot) || !this.world.snapshot.nation)
            throw new ApiError('conflict', 'The nation snapshot changed. Refresh to continue.');
        return this.world.snapshot.nation;
    }
    async identities(snapshot, signal) {
        signal?.throwIfAborted();
        const generation = this.world.generation;
        if (!this.world.same(snapshot, this.world.snapshot) || this.world.scope.closed)
            throw new ApiError('conflict', 'The nation directory changed. Refresh to continue.');
        if (this.identityRead?.generation !== generation) {
            const read = { generation };
            read.promise = (async () => {
                // The service owns this shared read; closing one inspector cannot cancel it.
                const ownerSignal = this.world.scope.signal;
                await this.check(snapshot, ownerSignal);
                const result = await this.api.getGameIdentities({ signal: ownerSignal });
                await this.check(snapshot, ownerSignal);
                if (
                    generation !== this.world.generation ||
                    result.game_id !== snapshot.game_id ||
                    result.turn_number !== snapshot.turn_number
                )
                    throw new ApiError('conflict', 'The nation directory changed. Refresh to continue.');
                return result;
            })().catch((error) => {
                if (this.identityRead === read) this.identityRead = null;
                throw error;
            });
            this.identityRead = read;
        }
        const result = await this.identityRead.promise;
        signal?.throwIfAborted();
        this.world.scope.signal.throwIfAborted();
        if (generation !== this.world.generation || !this.world.same(snapshot, this.world.snapshot))
            throw new ApiError('conflict', 'The nation directory changed. Refresh to continue.');
        return result;
    }
    async briefing(snapshot, signal) {
        await this.check(snapshot, signal);
        const generation = this.world.generation;
        const [news, battles, identities] = await Promise.all([
            this.api.getGameNews({ signal }),
            this.api.getNationBattleLogs({ query: { turn_number: snapshot.turn_number }, signal }),
            this.identities(snapshot, signal),
        ]);
        await this.check(snapshot, signal);
        if (
            generation !== this.world.generation ||
            identities.game_id !== snapshot.game_id ||
            identities.turn_number !== snapshot.turn_number
        )
            throw new ApiError('conflict', 'The briefing changed. Refresh to continue.');
        return { news, battles, nations: identities.nations, leaders: identities.leaders };
    }
    async reports(snapshot, turn, signal) {
        await this.check(snapshot, signal);
        const [news, rankings, victory, battles, identities] = await Promise.all([
            this.api.getGameNews({ signal }),
            this.api.getGameRankings({ signal }),
            this.api.getGameVictoryStatus({ signal }),
            snapshot.setup.nation_id
                ? this.api.getNationBattleLogs({ query: { turn_number: turn }, signal })
                : [],
            this.identities(snapshot, signal),
        ]);
        await this.check(snapshot, signal);
        if (identities.game_id !== snapshot.game_id || identities.turn_number !== snapshot.turn_number)
            throw new ApiError('conflict', 'The report snapshot changed. Refresh to continue.');
        return { news, rankings, victory, battles, nations: identities.nations, leaders: identities.leaders };
    }
    async rankingHistory(snapshot) {
        const key = `${snapshot.game_id}:${snapshot.turn_number}`;
        if (this.rankingHistoryState?.key === key) {
            if (this.rankingHistoryState.value) return this.rankingHistoryState.value;
            return this.rankingHistoryState.promise;
        }
        const generation = this.world.generation;
        const signal = this.world.scope?.signal;
        const promise = (async () => {
            await this.check(snapshot, signal);
            const result = await this.api.getGameRankingHistory({
                query: { game_id: snapshot.game_id, turn_number: snapshot.turn_number },
                signal,
            });
            await this.check(snapshot, signal);
            if (
                generation !== this.world.generation ||
                result.game_id !== snapshot.game_id ||
                result.through_turn !== snapshot.turn_number
            )
                throw new ApiError('conflict', 'The ranking history changed. Refresh to continue.');
            if (this.rankingHistoryState?.key === key)
                this.rankingHistoryState = { key, value: result, promise: null };
            return result;
        })();
        this.rankingHistoryState = { key, value: null, promise };
        try {
            return await promise;
        } catch (error) {
            if (this.rankingHistoryState?.promise === promise) this.rankingHistoryState = null;
            throw error;
        }
    }
    async command(name, body, snapshot, { deploymentDraftIds = [] } = {}) {
        if (!commands.has(name)) throw new Error('Unknown gameplay command.');
        if (this.busy) throw new ApiError('conflict', 'Another command is still pending.');
        if (this.needsReview)
            throw new ApiError('conflict', 'Review the uncertain command outcome before submitting again.');
        this.busy = true;
        this.lastCommand = name;
        this.notice = 'Submitting…';
        this.outcome = { state: 'sending', reconciled: false };
        this.commandContext = snapshot;
        this.changed.emit();
        let started = false;
        const bidDraft =
            name === 'placeProductionBid' ? JSON.stringify(this.drafts(snapshot)[body.resource_type]) : null;
        const planKey = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}`;
        const planDrafts =
            name === 'applyProductionPlan'
                ? Object.fromEntries(
                      body.bids.map((bid) => [
                          bid.resource_type,
                          JSON.stringify(this.drafts(snapshot)[bid.resource_type]),
                      ]),
                  )
                : null;
        try {
            this.world.beginCommand(snapshot);
            started = true;
            await this.check(snapshot);
            await this.api[name]({
                body: {
                    ...body,
                    ...(snapshot.nation?.automation ? { ai_context: snapshot.nation.automation } : {}),
                    client_context: {
                        game_id: snapshot.game_id,
                        turn_number: snapshot.turn_number,
                        nation_id: snapshot.setup.nation_id,
                        user_id: this.boot.userId,
                    },
                },
            });
            this.outcome = { state: 'accepted', reconciled: false };
            // Accepted preview cleanup belongs to the service, even if World was closed/reopened.
            // IDs are local metadata, never sent to the API; unrelated/newer placements survive.
            if (name === 'deploy' && deploymentDraftIds.length) {
                const key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}`;
                if (this.deploymentState?.key === key) {
                    const submitted = new Set(deploymentDraftIds);
                    this.deploymentState.entries = this.deploymentState.entries.filter(
                        (d) => !submitted.has(d.draft_id),
                    );
                }
            }
            this.notice = 'Command accepted. Checking the latest server state…';
            if (
                name === 'placeProductionBid' &&
                this.draftKey === planKey &&
                JSON.stringify(this.bidDrafts[body.resource_type]) === bidDraft
            )
                delete this.bidDrafts[body.resource_type];
        } catch (error) {
            const rejected = {
                deploy: 'Deployment rejected. Check the available resources, quantity and territory loyalty.',
                sendMoveOrders:
                    'Orders rejected. Check movement range, ownership and resources for attack costs.',
                placeProductionBid: 'Production bid rejected. Check quantity and productivity.',
                applyProductionPlan: 'Production plan rejected. Check the targets and advanced settings.',
            };
            this.outcome = { state: error.uncertain ? 'uncertain' : 'rejected', reconciled: false };
            this.needsReview = Boolean(error.uncertain);
            if (['session', 'forbidden'].includes(error.category)) this.world.invalidate(error);
            this.notice = error.uncertain
                ? 'The command outcome is uncertain. Check the refreshed orders and budget before submitting again; nothing was retried.'
                : [
                      error.category === 'validation' ? (rejected[name] ?? error.message) : error.message,
                      ...Object.values(error.fields ?? {}).flat(),
                  ].join(' ');
            // Rejection feedback should not wait behind a slow reconciliation read.
            this.changed.emit();
            throw error;
        } finally {
            // Reconcile even after a lost response or partial server failure, without resending.
            const reconciled = started ? await this.world.reconcile() : await this.world.refresh();
            // Keep the submitted fields visible while reconciling; never repaint old saved bids.
            if (planDrafts && reconciled && this.outcome.state === 'accepted' && this.draftKey === planKey)
                for (const [resource, submitted] of Object.entries(planDrafts))
                    if (JSON.stringify(this.bidDrafts[resource]) === submitted)
                        delete this.bidDrafts[resource];
            this.outcome = { ...this.outcome, reconciled };
            if (this.outcome.state === 'accepted')
                this.notice = reconciled
                    ? 'Command accepted. The latest server state is shown below.'
                    : 'Command accepted, but the display could not be refreshed. Retry refresh, not the command.';
            this.busy = false;
            this.changed.emit();
        }
    }
    acknowledgeOutcome() {
        if (this.busy || !this.world.current) return;
        this.needsReview = false;
        this.changed.emit();
    }
}
