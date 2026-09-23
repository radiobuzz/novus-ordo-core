import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { glassPanel } from '../../ui/GlassPanel.js';
import { Wizard } from '../../ui/wizard/Wizard.js';
import { NationCreationProcess } from './NationCreationProcess.js';

export const steps = [
    { id: 'identity', titleKey: 'wizard.identity', load: () => import('./steps/identity.js') },
    { id: 'leader', titleKey: 'wizard.leader', load: () => import('./steps/identity.js') },
    { id: 'homeland', titleKey: 'wizard.homeland', load: () => import('./steps/homeland.js') },
    { id: 'review', titleKey: 'wizard.review', load: () => import('./steps/review.js') },
];
class NationCreationInstance extends Component {
    async render() {
        const { i18n, setup, entry } = this.services;
        this.process = new NationCreationProcess(this.inputs.options, setup, () =>
            entry.reauthenticate(this.process),
        );
        this.scope.own(() => this.process.dispose());
        const resume = this.inputs.resume;
        if (resume) {
            this.process.draft = resume.draft;
            this.process.dirty = true;
            this.process.camera = resume.camera;
            this.process.goTo(resume.stepId);
        }
        const body = el('div');
        const panel = glassPanel(body);
        panel.classList.add('nation-panel');
        if (this.inputs.options.pending_name)
            panel.prepend(i18n.bind(this.scope, el('p', { class: 'resume-note' }), 'entry.resume'));
        this.element.append(panel);
        const wizard = new Wizard({ inputs: { process: this.process, steps }, services: this.services });
        this.scope.own(() => wizard.destroy());
        await wizard.mount(body);
        this.process.changed.subscribe(this.scope, () => {
            this.element
                .closest('.entry-screen')
                ?.classList.toggle('is-wide', this.process.stepId === 'homeland');
            entry.router.write(this.process.stepId);
            if (this.process.status === 'complete') void entry.finished(true);
        });
        entry.router.attach(this.process);
        this.element
            .closest('.entry-screen')
            ?.classList.toggle('is-wide', this.process.stepId === 'homeland');
        this.scope.own(() => entry.router.detach(this.process));
        this.scope.listen(window, 'beforeunload', (event) => {
            if (this.process.dirty || this.process.busy) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
    }
    async canClose() {
        if (this.services.entry.transitioning) return true;
        if (this.process?.busy) return false;
        return !this.process?.dirty || confirm(this.services.i18n.t('wizard.leave'));
    }
}
export function createInstance(options) {
    return new NationCreationInstance(options);
}
