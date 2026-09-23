import { Component } from '../../runtime/Component.js';
import { Host } from '../../runtime/Host.js';
import { FeatureLoader } from '../../runtime/FeatureLoader.js';
import { el, button } from '../dom.js';

/** Generic wizard view. The caller owns draft, validation and workflow policy. */
export class Wizard extends Component {
    async render() {
        const { process, steps } = this.inputs,
            { i18n } = this.services;
        const progress = el('nav', { class: 'wizard-progress' });
        i18n.bind(this.scope, progress, 'wizard.progress', {}, 'aria-label');
        const chapter = el('p', { class: 'entry-eyebrow' });
        const body = el('div', { class: 'wizard-body' });
        const status = el('p', { class: 'entry-feedback', role: 'alert', hidden: true });
        const back = i18n.bind(this.scope, button('', 'text-button'), 'common.back');
        const next = button('', 'entry-primary');
        const retry = i18n.bind(this.scope, button('', 'entry-primary'), 'common.retry');
        retry.hidden = true;
        const buttons = steps.map((step, index) => {
            const node = button('', 'wizard-step');
            node.append(
                el('span', { class: 'step-number', text: String(index + 1).padStart(2, '0') }),
                i18n.bind(this.scope, el('span'), step.titleKey),
            );
            this.scope.listen(node, 'click', () => process.goTo(step.id));
            progress.append(node);
            return node;
        });
        this.element.append(
            progress,
            chapter,
            body,
            status,
            el('footer', { class: 'wizard-actions' }, back, next, retry),
        );
        this.host = new Host({
            loader: new FeatureLoader(new Map(steps.map((step) => [step.id, step.load]))),
            services: this.services,
            createSlot: () => {
                const slot = el('div');
                body.replaceChildren(slot);
                return slot;
            },
            showStatus: (state, error, reload) => {
                if (state === 'error') {
                    const again = i18n.bind(this.scope, button(''), 'common.retry');
                    again.addEventListener('click', reload, { once: true });
                    body.replaceChildren(el('p', { text: i18n.error(error) }), again);
                }
            },
        });
        this.scope.own(() => this.host.dispose());
        let current,
            generation = 0;
        const update = async () => {
            const index = steps.findIndex((step) => step.id === process.stepId);
            chapter.textContent = i18n.t('wizard.step', { number: index + 1, total: steps.length });
            buttons.forEach((node, i) => {
                node.setAttribute('aria-current', i === index ? 'step' : 'false');
                node.disabled = process.busy || process.status === 'blocked';
                node.classList.toggle('is-past', i < index);
            });
            back.hidden = index === 0;
            back.disabled = process.busy || process.status === 'blocked';
            next.disabled = process.busy;
            next.hidden = process.status === 'blocked';
            retry.hidden = process.status !== 'blocked';
            next.textContent = i18n.t(
                process.busy
                    ? 'wizard.submitting'
                    : index === steps.length - 1
                      ? 'wizard.found'
                      : 'common.continue',
            );
            status.hidden = !process.message;
            status.textContent = process.message ? i18n.t(process.message) : '';
            body.inert = process.busy || process.status === 'blocked';
            if (current !== process.stepId) {
                current = process.stepId;
                const token = ++generation;
                await this.host.open(current, { process, stepId: current });
                if (this.scope.closed || token !== generation) return;
                body.querySelector('h2')?.focus({ preventScroll: true });
            }
            if (Object.keys(process.errors).length)
                queueMicrotask(() => {
                    if (!this.scope.closed) this.host.current?.focusError?.();
                });
        };
        this.scope.listen(back, 'click', () => process.back());
        this.scope.listen(next, 'click', () =>
            process.stepId === steps.at(-1).id ? void process.submit() : process.next(),
        );
        this.scope.listen(retry, 'click', () => void process.reconcile());
        process.changed.subscribe(this.scope, () => void update());
        i18n.changed.subscribe(this.scope, () => void update());
        await update();
    }
}
