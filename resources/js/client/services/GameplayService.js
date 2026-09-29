import { ApiError } from '../api/ApiError.js';
import { acquisitionPlan } from './production.js';
import { Signal } from '../runtime/Signal.js';

const commands = new Set([
    'savePendingPolicies',
    'applyProductionPlan',
    'deploy',
    'cancelDeployments',
    'sendMoveOrders',
    'sendDisbandOrders',
    'sendGuardOrders',
    'cancelOrders',
    'readyForNextTurn',
    'sendNationMessage',
    'proposeNationOffer',
    'respondNationOffer',
    'cancelNationTreaty',
]);

/** No automatic mutation retries. Every command carries the identity it was drafted against. */
export class GameplayService {
    constructor(api, world, boot) {
        Object.assign(this, { api, world, boot });
        this.busy = false;
        this.notice = '';
        this.changed = new Signal();
        this.economicDraftChanged = new Signal();
        this.economicRevision = 0;
        this.outcome = null;
        this.needsReview = false;
        world.store?.subscribe(world.scope, (state) => {
            if (!state.snapshot) {
                this.policyState = null;
                this.acquisitionDrafts = {};
                this.draftKey = null;
                this.deploymentState = null;
                this.rankingHistoryState = null;
                this.identityRead = null;
                this.ownershipRead = null;
                this.militaryHistoryRead = null;
                this.defenseCoverageRead = null;
            } else if (
                this.rankingHistoryState &&
                this.rankingHistoryState.key !== `${state.snapshot.game_id}:${state.snapshot.turn_number}`
            ) {
                this.rankingHistoryState = null;
            }
            if (
                this.militaryHistoryRead &&
                (this.militaryHistoryRead.key !== `${state.snapshot.game_id}:${state.snapshot.turn_number}` ||
                    this.militaryHistoryRead.generation !== world.generation)
            )
                this.militaryHistoryRead = null;
            if (
                this.defenseCoverageRead &&
                (this.defenseCoverageRead.key !==
                    `${state.snapshot.game_id}:${state.snapshot.turn_number}:${state.snapshot.setup.nation_id}` ||
                    this.defenseCoverageRead.generation !== world.generation)
            )
                this.defenseCoverageRead = null;
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
        const key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.turn_context_revision}:${snapshot.setup.nation_id}:${snapshot.nation?.definitions?.edit_counter}`;
        if (key !== this.draftKey) {
            this.draftKey = key;
            this.acquisitionDrafts = {};
        }
        return this.acquisitionDrafts;
    }
    policyDraft(snapshot) {
        const key = `${snapshot.game_id}:${snapshot.setup.nation_id}:${snapshot.turn_context_revision}:${snapshot.nation?.policies?.edit_counter}`;
        if (this.policyState?.key !== key) this.policyState = { key, changes: null, base: null };
        return this.policyState;
    }
    notifyEconomicDraft() {
        this.economicRevision++;
        this.economicDraftChanged.emit();
    }
    economicPlan(snapshot, overrides = {}) {
        const policies = snapshot.nation.policies;
        const draft = this.policyDraft(snapshot);
        if (draft.changes !== null && draft.base !== JSON.stringify([policies.current, policies.pending]))
            throw new ApiError('conflict', 'The saved policy plan changed. Review your draft first.');
        return {
            turn_id: policies.turn_id,
            edit_counter: policies.edit_counter,
            changes: draft.changes ?? policies.pending,
            acquisitions: acquisitionPlan(snapshot.nation, this.drafts(snapshot)),
            ...overrides,
        };
    }
    async previewPolicies(snapshot, changes, signal, acquisitions = null) {
        const revision = this.economicRevision;
        const generation = this.world.generation;
        const result = await this.api.previewPolicies({
            signal,
            body: {
                ...this.economicPlan(snapshot, { changes, ...(acquisitions ? { acquisitions } : {}) }),
                client_context: {
                    game_id: snapshot.game_id,
                    nation_id: snapshot.setup.nation_id,
                    user_id: this.boot.userId,
                    resource_edit_counter: snapshot.nation.definitions.edit_counter,
                    turn_number: snapshot.turn_number,
                    turn_context_revision: snapshot.turn_context_revision,
                },
            },
        });
        if (
            revision !== this.economicRevision ||
            generation !== this.world.generation ||
            !this.world.same(snapshot, this.world.snapshot) ||
            snapshot.nation.policies.edit_counter !== this.world.snapshot.nation.policies.edit_counter ||
            snapshot.nation.definitions.edit_counter !== this.world.snapshot.nation.definitions.edit_counter
        )
            throw new ApiError('conflict', 'The economic plan changed. Refresh the estimate.');
        return result;
    }
    async previewProduction(snapshot, acquisitions, signal) {
        const changes = this.economicPlan(snapshot).changes;
        const result = await this.previewPolicies(snapshot, changes, signal, acquisitions);
        if (!result.valid)
            throw new ApiError('validation', 'Review the policy draft before saving the seasonal plan.');
        return result.production_planning;
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
    async ownershipComparison(snapshot, signal) {
        signal?.throwIfAborted();
        const generation = this.world.generation;
        if (snapshot.turn_number < 2 || !this.world.same(snapshot, this.world.snapshot))
            throw new ApiError('conflict', 'No previous ownership snapshot is available.');
        if (this.ownershipRead?.generation !== generation) {
            const read = { generation };
            read.promise = (async () => {
                // Shared public history belongs to the game service, not an individual news dialog.
                const ownerSignal = this.world.scope.signal;
                await this.check(snapshot, ownerSignal);
                const frames = await Promise.all(
                    [snapshot.turn_number - 1, snapshot.turn_number].map(async (turn) => {
                        const result = await this.api.getAllTerritoriesTurnInfo({
                            query: { turn_number: turn },
                            signal: ownerSignal,
                        });
                        const rows = Array.isArray(result) ? result : result.data;
                        const owners = new Map();
                        if (!Array.isArray(rows))
                            throw new ApiError('malformed', 'Ownership history is unavailable.');
                        for (const row of rows) {
                            if (
                                row.turn_number !== turn ||
                                owners.has(row.territory_id) ||
                                !(row.owner_nation_id === null || Number.isInteger(row.owner_nation_id))
                            )
                                throw new ApiError('malformed', 'Ownership history is incomplete.');
                            owners.set(row.territory_id, row.owner_nation_id);
                        }
                        // Missing records are unknown, never silently painted as neutral.
                        const territories = snapshot.territories.map(({ territory_id }) => {
                            if (!owners.has(territory_id))
                                throw new ApiError('malformed', 'Ownership history is incomplete.');
                            return Object.freeze({ territory_id, owner_nation_id: owners.get(territory_id) });
                        });
                        return Object.freeze({ turn, territories: Object.freeze(territories) });
                    }),
                );
                await this.check(snapshot, ownerSignal);
                if (generation !== this.world.generation) throw new ApiError('conflict', 'The game changed.');
                return Object.freeze({ before: frames[0], after: frames[1] });
            })().catch((error) => {
                if (this.ownershipRead === read) this.ownershipRead = null;
                throw error;
            });
            this.ownershipRead = read;
        }
        const result = await this.ownershipRead.promise;
        signal?.throwIfAborted();
        this.world.scope.signal.throwIfAborted();
        if (generation !== this.world.generation || !this.world.same(snapshot, this.world.snapshot))
            throw new ApiError('conflict', 'The game changed.');
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
    async militaryHistory(snapshot, signal) {
        const key = `${snapshot.game_id}:${snapshot.turn_number}`;
        if (
            this.militaryHistoryRead?.key === key &&
            this.militaryHistoryRead.generation === this.world.generation
        ) {
            const value = await this.militaryHistoryRead.promise;
            signal?.throwIfAborted();
            return value;
        }
        const generation = this.world.generation;
        const ownerSignal = this.world.scope.signal;
        const read = { key, generation };
        read.promise = (async () => {
            await this.check(snapshot, ownerSignal);
            const [news, battles] = await Promise.all([
                this.api.getGameNews({ signal: ownerSignal }),
                snapshot.setup.nation_id
                    ? this.api.getNationBattleLogs({
                          query: { turn_number: snapshot.turn_number },
                          signal: ownerSignal,
                      })
                    : [],
            ]);
            await this.check(snapshot, ownerSignal);
            if (generation !== this.world.generation)
                throw new ApiError('conflict', 'The military history changed. Refresh to continue.');
            return { news, battles };
        })().catch((error) => {
            if (this.militaryHistoryRead === read) this.militaryHistoryRead = null;
            throw error;
        });
        this.militaryHistoryRead = read;
        const value = await read.promise;
        signal?.throwIfAborted();
        return value;
    }
    async defenseCoverage(snapshot, signal) {
        const nationId = snapshot?.setup.nation_id;
        const key = `${snapshot?.game_id}:${snapshot?.turn_number}:${nationId}`;
        if (!nationId || !snapshot.nation || !this.world.same(snapshot, this.world.snapshot))
            throw new ApiError('conflict', 'No current nation defence is available.');
        if (
            this.defenseCoverageRead?.key === key &&
            this.defenseCoverageRead.generation === this.world.generation
        ) {
            const value = await this.defenseCoverageRead.promise;
            signal?.throwIfAborted();
            return value;
        }
        const generation = this.world.generation;
        const ownerSignal = this.world.scope.signal;
        const read = { key, generation };
        read.promise = (async () => {
            await this.check(snapshot, ownerSignal);
            const result = await this.api.getNationDefenseCoverage({ signal: ownerSignal });
            await this.check(snapshot, ownerSignal);
            if (
                generation !== this.world.generation ||
                result?.game_id !== snapshot.game_id ||
                result?.turn_number !== snapshot.turn_number ||
                !Array.isArray(result?.territories)
            )
                throw new ApiError('conflict', 'The defence coverage changed. Refresh to continue.');
            const expected = new Set(
                snapshot.territories
                    .filter((territory) => territory.owner_nation_id === nationId)
                    .map((territory) => territory.territory_id),
            );
            const seen = new Set();
            const territories = result.territories.map((row) => {
                if (
                    !Number.isInteger(row?.territory_id) ||
                    !expected.has(row.territory_id) ||
                    seen.has(row.territory_id) ||
                    !Number.isFinite(row.guard_defense) ||
                    row.guard_defense < 0 ||
                    !Number.isInteger(row.guard_divisions) ||
                    row.guard_divisions < 0
                )
                    throw new ApiError('malformed', 'The defence coverage is incomplete.');
                seen.add(row.territory_id);
                return Object.freeze({ ...row });
            });
            if (seen.size !== expected.size)
                throw new ApiError('malformed', 'The defence coverage is incomplete.');
            return Object.freeze({ ...result, territories: Object.freeze(territories) });
        })().catch((error) => {
            if (this.defenseCoverageRead === read) this.defenseCoverageRead = null;
            throw error;
        });
        this.defenseCoverageRead = read;
        const value = await read.promise;
        signal?.throwIfAborted();
        return value;
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
        const economic = ['savePendingPolicies', 'applyProductionPlan'].includes(name);
        if (economic) body = this.economicPlan(snapshot, body);
        this.busy = true;
        this.lastCommand = name;
        this.notice = 'Submitting…';
        this.outcome = { state: 'sending', reconciled: false };
        this.commandContext = snapshot;
        this.changed.emit();
        let started = false;
        let response;
        const policyKey = `${snapshot.game_id}:${snapshot.setup.nation_id}:${snapshot.turn_context_revision}:${snapshot.nation?.policies?.edit_counter}`;
        const planKey = this.draftKey;
        const planDrafts = economic
            ? Object.fromEntries(
                  body.acquisitions.map((bid) => [
                      bid.resource_key,
                      JSON.stringify(this.drafts(snapshot)[bid.resource_key]),
                  ]),
              )
            : null;
        try {
            this.world.beginCommand(snapshot);
            started = true;
            // These endpoints validate player/game/turn/revision under GameMutation.
            // beginCommand already fences the local snapshot; a preliminary GET batch adds no write safety.
            if (!['sendMoveOrders', 'sendDisbandOrders', 'sendGuardOrders', 'cancelOrders'].includes(name))
                await this.check(snapshot);
            response = await this.api[name]({
                body: {
                    ...body,
                    ...(snapshot.nation?.automation ? { ai_context: snapshot.nation.automation } : {}),
                    client_context: {
                        game_id: snapshot.game_id,
                        turn_number: snapshot.turn_number,
                        ...(snapshot.turn_context_revision
                            ? { turn_context_revision: snapshot.turn_context_revision }
                            : {}),
                        nation_id: snapshot.setup.nation_id,
                        user_id: this.boot.userId,
                        resource_edit_counter: snapshot.nation?.definitions.edit_counter,
                    },
                },
            });
            this.outcome = { state: 'accepted', reconciled: false };
            if (
                economic &&
                this.policyState?.key === policyKey &&
                JSON.stringify(this.policyState.changes) === JSON.stringify(body.changes)
            ) {
                this.policyState.changes = null;
                this.policyState.base = null;
            }
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
        } catch (error) {
            const rejected = {
                deploy: 'Deployment rejected. Check the available resources, quantity and territory loyalty.',
                sendMoveOrders:
                    'Orders rejected. Check movement range, ownership and resources for attack costs.',
                sendGuardOrders:
                    'Guard orders rejected. Select idle units in territory you control and check operation costs.',
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
            let reconciled = started ? await this.world.reconcile() : await this.world.refresh();
            if (
                this.reconcileCommunication &&
                [
                    'sendNationMessage',
                    'proposeNationOffer',
                    'respondNationOffer',
                    'cancelNationTreaty',
                ].includes(name)
            ) {
                // Keep the human command gate held; communication refresh may run during reconciliation.
                const communication = await this.reconcileCommunication();
                reconciled = reconciled && communication;
            }
            // Keep the submitted fields visible while reconciling; never repaint old saved bids.
            if (planDrafts && reconciled && this.outcome.state === 'accepted' && this.draftKey === planKey)
                for (const [resource, submitted] of Object.entries(planDrafts))
                    if (JSON.stringify(this.acquisitionDrafts[resource]) === submitted)
                        delete this.acquisitionDrafts[resource];
            this.outcome = { ...this.outcome, reconciled };
            if (this.outcome.state === 'accepted')
                this.notice = reconciled
                    ? 'Command accepted. The latest server state is shown below.'
                    : 'Command accepted, but the display could not be refreshed. Retry refresh, not the command.';
            this.busy = false;
            this.changed.emit();
        }
        return response;
    }
    acknowledgeOutcome() {
        if (this.busy || !this.world.current) return;
        this.needsReview = false;
        this.changed.emit();
    }
}
