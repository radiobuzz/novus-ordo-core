import { endpoints } from '../api/generated.js';
import { createEndpointClient } from '../api/createEndpointClient.js';
import { createTransport } from '../api/createTransport.js';
import { createTurnStatusReader } from '../api/createTurnStatusReader.js';
import { TurnAttention } from '../services/TurnAttention.js';
import { GameDataService } from '../services/GameDataService.js';
import { GameplayService } from '../services/GameplayService.js';
import { SavedState } from '../services/SavedState.js';
import { GameShell } from '../app/GameShell.js';
import { Instance } from '../runtime/Instance.js';
import { LocalizationService } from '../services/LocalizationService.js';
import { SoundService } from '../services/SoundService.js';
import { TurnAutomation } from '../experimental-ai/TurnAutomation.js';
import { AICommands } from '../experimental-ai/AICommands.js';

export class GameInstance extends Instance {
    async onMount(root) {
        const boot = this.inputs.boot;
        const transport = createTransport(boot);
        const api = createEndpointClient(
            {
                ...endpoints,
                experimentalAIStep: { method: 'POST', path: '/nation/experimental-ai-step' },
            },
            transport,
        );
        const world = new GameDataService(api, boot, createTurnStatusReader(boot.baseUrl));
        let storage;
        try {
            storage = window.localStorage;
        } catch {
            /* Private browsing may disable storage. */
        }
        const services = {
            boot,
            world,
            gameplay: new GameplayService(api, world, boot),
            aiCommands: new AICommands(api, world, boot),
            saved: new SavedState(storage, `user-${boot.userId}`),
            i18n: this.inputs.i18n ?? new LocalizationService(new SavedState(storage, 'device')),
        };
        services.preferences = new SavedState(storage, 'device').child('display');
        services.sound = new SoundService(new SavedState(storage, 'device').child('sound'), world.scope);
        services.sound.bind(document.body);
        services.automation = new TurnAutomation(services, world.scope);
        new TurnAttention(world);
        let lastTurn = null;
        world.store.subscribe(world.scope, (state) => {
            if (!state.snapshot) {
                lastTurn = null;
                return;
            }
            if (state.status !== 'ready') return;
            const current = { game: state.snapshot.game_id, turn: state.snapshot.turn_number };
            if (lastTurn?.game === current.game && current.turn > lastTurn.turn) services.sound.play('turn');
            lastTurn = current;
        });
        let lastOutcome = null;
        services.gameplay.changed.subscribe(world.scope, () => {
            const outcome = services.gameplay.outcome?.state;
            if (lastOutcome === 'sending' && outcome === 'accepted')
                services.sound.play(
                    services.gameplay.lastCommand === 'readyForNextTurn' ? 'ready' : 'accepted',
                );
            if (lastOutcome === 'sending' && ['rejected', 'uncertain'].includes(outcome))
                services.sound.play(outcome === 'rejected' ? 'rejected' : 'error');
            lastOutcome = outcome;
        });
        services.chooseGame = this.inputs.chooseGame;
        this.gameServices = services;
        this.scope.own(async () => {
            await world.scope.dispose();
            await this.shell?.dispose();
            await world.dispose();
        });
        this.shell = new GameShell(root, services);
        world.startPolling(document);
        void world.refresh();
    }
    get pending() {
        return Boolean(this.gameServices?.gameplay.busy || this.gameServices?.aiCommands.busy);
    }
    get dirty() {
        const s = this.gameServices;
        return Boolean(
            s?.gameplay.needsReview ||
                (s?.gameplay.outcome &&
                    !s.gameplay.outcome.reconciled &&
                    ['uncertain', 'accepted'].includes(s.gameplay.outcome.state)) ||
                (s?.world.snapshot && s.automation.hasDrafts(s.world.snapshot)) ||
                this.shell?.hasEdits,
        );
    }
    async canClose() {
        if (this.pending) {
            alert(this.gameServices.i18n.t('games.pending'));
            return false;
        }
        return !this.dirty || confirm(this.gameServices.i18n.t('games.leave'));
    }
}
