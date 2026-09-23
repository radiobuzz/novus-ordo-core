import { Scope } from '../runtime/Scope.js';
import { EntryRouter } from './EntryRouter.js';
export class EntryProcess {
    scope = new Scope();
    transitioning = false;
    generation = 0;
    constructor(services) {
        this.services = services;
        const destination = new URL(location.href).searchParams.get('destination');
        this.destination = ['admin', 'tools'].includes(destination) ? destination : 'client';
        this.router = new EntryRouter(this.scope);
    }
    async start(shell) {
        this.shell = shell;
        if (this.services.boot.userId) await this.authenticated();
        else await this.login();
    }
    async login() {
        this.shell.atmosphere.setSlideshow(true);
        this.services.audio.setEligible(true);
        history.replaceState(null, '', '#/login');
        await this.shell.host.open('login');
    }
    async authenticated() {
        if (!this.services.boot.gameId) {
            location.assign(this.services.boot.urls[this.destination] || this.services.boot.urls.client);
            return;
        }
        this.shell.atmosphere.setSlideshow(false);
        this.shell.syncSession();
        const generation = ++this.generation;
        this.services.audio.setEligible(false);
        this.transitioning = true;
        try {
            await this.shell.host.close({ force: true });
            this.shell.message('common.loading');
            const options = await this.services.setup.load(this.scope.signal);
            if (generation !== this.generation || this.scope.closed) return;
            if (options.status === 'FinishedSetup') {
                this.resume = null;
                await this.finished(false);
                return;
            }
            if (options.suitable_ids.length < options.required_territories) {
                this.shell.message(
                    'entry.unavailable',
                    this.services.i18n.t('errors.notEnough'),
                    () => void this.authenticated(),
                );
                return;
            }
            const resume =
                this.resume?.userId === options.user_id && this.resume?.gameId === options.game_id
                    ? this.resume
                    : null;
            this.resume = null;
            await this.shell.host.open('nation-creation', { options, resume });
        } catch (error) {
            if (this.scope.closed) return;
            if (error.category === 'session') await this.login();
            else
                this.shell.message(
                    'entry.unavailable',
                    this.services.i18n.error(error),
                    () => void this.authenticated(),
                );
        } finally {
            this.transitioning = false;
        }
    }
    reauthenticate(process) {
        this.resume = {
            userId: process.options.user_id,
            gameId: process.options.game_id,
            stepId: process.stepId,
            camera: process.camera,
            draft: {
                identity: { ...process.draft.identity },
                leader: { ...process.draft.leader },
                homeland: [...process.draft.homeland],
            },
        };
        this.transitioning = true;
        void this.login().finally(() => {
            this.transitioning = false;
        });
    }
    async finished(founded) {
        this.transitioning = true;
        this.services.audio.setEligible(false);
        await this.shell.host.close({ force: true });
        this.shell.ready(founded);
        history.replaceState(null, '', '#/ready');
        this.transitioning = false;
    }
    dispose() {
        this.resume = null;
        return this.scope.dispose();
    }
}
