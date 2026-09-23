import { ApiError } from '../api/ApiError.js';

/** Disposable participant command lane; never borrows the human's busy/outcome state. */
export class AICommands {
    busy = false;
    outcome = null;
    constructor(api, world, boot) {
        Object.assign(this, { api, world, boot });
    }
    async step(body, snapshot) {
        if (
            this.busy ||
            this.world.scope.closed ||
            !this.world.current ||
            !this.world.same(snapshot, this.world.snapshot) ||
            snapshot.nation?.automation?.generation !== this.world.snapshot.nation?.automation?.generation
        )
            throw new ApiError('conflict', 'The AI context changed. Refresh before continuing.');
        this.busy = true;
        this.outcome = { state: 'sending', reconciled: false };
        try {
            // The normal transport and server context/turn locks remain authoritative.
            await this.api.experimentalAIStep({
                body: {
                    ...body,
                    ai_context: snapshot.nation.automation,
                    client_context: {
                        game_id: snapshot.game_id,
                        turn_number: snapshot.turn_number,
                        nation_id: snapshot.setup.nation_id,
                        user_id: this.boot.userId,
                    },
                },
            });
            this.outcome = { state: 'accepted', reconciled: false };
        } catch (error) {
            this.outcome = { state: error.uncertain ? 'uncertain' : 'rejected', reconciled: false };
            if (['session', 'forbidden'].includes(error.category)) this.world.invalidate(error);
            throw error;
        } finally {
            // Never retry a mutation, including a lost response. Refresh is service-owned.
            try {
                this.outcome = { ...this.outcome, reconciled: await this.world.refreshAfterActivity() };
            } finally {
                this.busy = false;
            }
        }
    }
}
