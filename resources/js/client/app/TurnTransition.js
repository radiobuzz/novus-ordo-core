import { Scope } from '../runtime/Scope.js';
import { el } from '../ui/dom.js';
import { Button } from '../ui/Button.js';
import './turn-transition.scss';

/** Shell composition: the data service owns transition detection and recovery reads. */
export class TurnTransition {
    constructor(scope, services) {
        this.services = services;
        this.t = (key) => services.i18n.t(`turnLoading.${key}`);
        this.title = el('h2', { id: 'turn-loading-title' });
        this.message = el('p', { id: 'turn-loading-message', role: 'status', 'aria-live': 'polite' });
        this.retry = new Button({ label: this.t('retry'), icon: 'refresh' });
        this.dialog = el(
            'dialog',
            {
                class: 'turn-transition',
                'aria-labelledby': this.title.id,
                'aria-describedby': this.message.id,
                tabindex: '-1',
            },
            el('div', { class: 'turn-transition-orbit', 'aria-hidden': 'true' }, el('span', { text: 'N' })),
            el('p', { class: 'eyebrow', text: 'NOVUS ORDO' }),
            this.title,
            this.message,
            this.retry.element,
        );
        document.body.append(this.dialog);
        scope.listen(this.dialog, 'cancel', (event) => event.preventDefault());
        scope.listen(this.retry.element, 'click', () => {
            this.waitForSlowRead();
            void services.world.retryTurnTransition();
        });
        // Modal inertness blocks background controls. Also stop captured drags and
        // document-level game shortcuts, including those from already-open dialogs.
        for (const type of [
            'keydown',
            'keyup',
            'pointerdown',
            'pointerup',
            'pointermove',
            'click',
            'wheel',
            'contextmenu',
        ])
            scope.listen(
                window,
                type,
                (event) => {
                    if (!this.dialog.open || this.dialog.contains(event.target)) return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                },
                { capture: true, passive: false },
            );
        for (const type of ['keydown', 'keyup'])
            scope.listen(this.dialog, type, (event) => event.stopPropagation());
        scope.own(() => {
            this.stop();
            this.dialog.close();
            this.dialog.remove();
        });
        services.i18n.changed.subscribe(scope, () => this.render());
        services.world.store.subscribe(scope, (state) => {
            this.state = state;
            if (!state.turnTransition) {
                this.stop();
                if (this.dialog.open) this.dialog.close();
                return;
            }
            if (!this.dialog.open) {
                this.index = Math.floor(Math.random() * 4);
                this.slow = false;
                this.failed = false;
                this.lifetime = new Scope();
                const rotate = () => {
                    this.index = (this.index + 1) % 4;
                    this.render();
                    this.lifetime.timeout(rotate, 3500);
                };
                this.lifetime.timeout(rotate, 3500);
                this.waitForSlowRead();
                this.render();
                this.dialog.showModal();
                this.dialog.focus({ preventScroll: true });
            }
            this.render();
        });
    }
    stop() {
        void this.lifetime?.dispose();
        this.lifetime = null;
    }
    waitForSlowRead() {
        this.releaseSlow?.();
        this.slow = false;
        this.releaseSlow = this.lifetime.timeout(() => {
            this.slow = true;
            this.render();
        }, 15000);
    }
    render() {
        this.failed ||= Boolean(this.state?.error && this.state.error.category !== 'unavailable');
        const failed = this.failed;
        const recovery = failed || this.slow;
        this.title.textContent = this.t(recovery ? 'waiting' : 'title');
        this.message.textContent = this.t(
            failed ? 'failed' : this.slow ? 'slow' : `message${this.index ?? 0}`,
        );
        this.retry.setLabel(this.t('retry'));
        this.retry.element.hidden = !recovery;
        this.retry.setPending(
            this.state?.status === 'pending' ||
                (!this.slow && ['loading', 'refreshing'].includes(this.state?.status)),
        );
        this.dialog.dataset.recovery = String(recovery);
    }
}
