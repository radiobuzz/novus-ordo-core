import { Signal } from '../runtime/Signal.js';

/** Browser-owned, sequential driver. Never retries a failed or uncertain mutation. */
export class TurnAutomation {
    changed = new Signal();
    autoReady = false;
    delay = 10;
    running = false;
    paused = false;
    remaining = null;
    reason = '';
    constructor(services, scope, { now = () => Date.now(), locks = globalThis.navigator?.locks } = {}) {
        Object.assign(this, { services, scope, now, locks });
        scope.own(() => this.releaseReadyLease?.());
        services.gameplay.changed.subscribe(scope, () => {
            const game = services.gameplay;
            if (game.outcome?.state === 'sending' && !this.sendingAutoReady) this.pause('manual');
        });
        const tick = async () => {
            try {
                await this.tick();
            } finally {
                if (!scope.closed) scope.timeout(tick, 1000);
            }
        };
        scope.timeout(tick, 1000);
    }
    setAutoReady(enabled) {
        this.releaseReadyLease?.();
        this.autoReady = enabled;
        this.deadline = null;
        this.reason = '';
        if (enabled && this.locks) {
            const snapshot = this.services.world.snapshot;
            const key = `${snapshot?.game_id}:${snapshot?.setup.nation_id}`;
            void this.locks.request(`novus-auto-ready-${key}`, { ifAvailable: true }, async (lock) => {
                if (!this.autoReady || this.scope.closed) return;
                if (!lock) {
                    this.pause('otherTab');
                    return;
                }
                this.readyLease = key;
                await new Promise((resolve) => {
                    this.releaseReadyLease = () => {
                        this.readyLease = null;
                        this.releaseReadyLease = null;
                        resolve();
                    };
                });
            });
        }
        this.changed.emit();
    }
    pause(reason = '') {
        this.releaseReadyLease?.();
        this.autoReady = false;
        this.deadline = null;
        this.remaining = null;
        this.reason = reason;
        this.changed.emit();
    }
    resume() {
        this.paused = false;
        this.reason = '';
        this.changed.emit();
    }
    hasDrafts(snapshot) {
        const gameplay = this.services.gameplay;
        const view = this.services.commandView;
        const movement =
            view?.key === `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}` &&
            view.tool === 'move' &&
            view.destination;
        return Boolean(
            movement ||
                Object.keys(gameplay.drafts(snapshot)).length > 0 ||
                gameplay.deploymentDraft(snapshot).entries.length > 0,
        );
    }
    async tick() {
        const { world, gameplay } = this.services;
        const snapshot = world.snapshot;
        if (this.running || this.scope.closed) return;
        if ((!snapshot || snapshot.nation?.automated_nation) && this.autoReady) this.pause('context');
        if (
            !world.current ||
            !snapshot?.nation ||
            !snapshot.ready.is_game_ready ||
            gameplay.busy ||
            gameplay.needsReview
        ) {
            this.deadline = null;
            return;
        }
        const ai = snapshot.nation.automation;
        const key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}:${ai?.generation ?? ''}`;
        if (this.key && this.gameId !== snapshot.game_id) this.pause('newGame');
        else if (
            this.key &&
            (this.nationId !== snapshot.setup.nation_id ||
                this.epoch !== ai?.generation ||
                this.turn > snapshot.turn_number)
        )
            this.pause('context');
        if (key !== this.key) {
            this.key = key;
            this.gameId = snapshot.game_id;
            this.nationId = snapshot.setup.nation_id;
            this.epoch = ai?.generation;
            this.turn = snapshot.turn_number;
            this.deadline = null;
        }
        if (ai?.finished || ai?.paused || ai?.enabled === false || this.paused) {
            this.deadline = null;
            return;
        }
        if (this.autoReady && this.hasDrafts(snapshot)) this.pause('drafts');
        const mineReady = snapshot.ready.ready_for_next_turn_nation_ids.includes(snapshot.setup.nation_id);
        const canAutoReady =
            this.autoReady &&
            (!this.locks || this.readyLease === `${snapshot.game_id}:${snapshot.setup.nation_id}`);
        if (canAutoReady && !mineReady) {
            this.deadline ??= this.now() + this.delay * 1000;
            this.remaining = Math.max(0, Math.ceil((this.deadline - this.now()) / 1000));
        } else this.remaining = null;
        this.changed.emit();
        const command =
            ai?.next_nation_id && ai.next_enabled
                ? 'experimentalAIStep'
                : canAutoReady && !mineReady && this.remaining === 0
                  ? 'readyForNextTurn'
                  : null;
        if (!command) return;
        const body =
            command === 'experimentalAIStep'
                ? {
                      game_id: ai.game_id,
                      turn_id: ai.turn_id,
                      generation: ai.generation,
                      nation_id: ai.next_nation_id,
                  }
                : { turn_number: snapshot.turn_number };
        this.running = true;
        const send = async () => {
            if (this.scope.closed) return;
            try {
                let outcome;
                if (command === 'experimentalAIStep') {
                    await this.services.aiCommands.step(body, snapshot);
                    outcome = this.services.aiCommands.outcome;
                } else {
                    this.sendingAutoReady = true;
                    try {
                        await gameplay.command(command, body, snapshot);
                        outcome = gameplay.outcome;
                    } finally {
                        this.sendingAutoReady = false;
                    }
                }
                if (outcome?.reconciled === false || !world.current) {
                    this.paused = true;
                    this.pause('stopped');
                }
            } catch {
                this.paused = true;
                this.pause('stopped');
            }
        };
        try {
            // Only one tab submits at once. Server context + unique records also guard other browsers/users.
            if (this.locks)
                await this.locks.request(
                    `novus-turn-driver-${snapshot.game_id}`,
                    { ifAvailable: true },
                    async (lock) => {
                        if (lock) await send();
                    },
                );
            else await send();
        } finally {
            this.running = false;
        }
    }
}
