import { Host } from '../runtime/Host.js';
import { Scope } from '../runtime/Scope.js';
import { button, el } from './dom.js';
import { localizedDom } from './localizedDom.js';

let nextSurface = 0;

/** Host chrome adapts in CSS; hosted instances never receive a device flag. */
export class FeatureSurface {
    #settle;
    constructor({ element, loader, services, title, dialog = false, onClose = () => {} }) {
        this.element = element;
        this.scope = new Scope();
        this.i18n = services.i18n;
        const { el, button } = localizedDom(this.scope, this.i18n);
        this.dialog = dialog;
        this.closeButton = button('common.close', 'no-button no-button--quiet');
        const headingId = `${dialog ? 'dialog' : 'panel'}-heading-${++nextSurface}`;
        const heading = el('h2', { id: headingId, textKey: title });
        const header = el('header', { class: 'surface-header' }, heading, this.closeButton);
        this.body = el('div', { class: 'surface-body' });
        element.append(header, this.body);
        element.setAttribute('aria-labelledby', headingId);
        this.host = new Host({
            loader,
            services,
            createSlot: () => {
                const slot = el('div', { class: 'feature-slot' });
                this.body.replaceChildren(slot);
                return slot;
            },
            showStatus: (status, error, retry) => this.status(status, error, retry),
        });
        this.scope.listen(this.closeButton, 'click', () => onClose());
        if (dialog)
            this.scope.listen(element, 'cancel', (event) => {
                event.preventDefault();
                onClose();
            });
        else {
            this.scope.listen(element, 'keydown', (event) => {
                if (event.key === 'Escape') onClose();
            });
            // Only the header captures the dismiss swipe; body scrolling remains native.
            let down;
            this.scope.listen(header, 'pointerdown', (event) => {
                if (event.target.closest('button')) return;
                down = { x: event.clientX, y: event.clientY };
                header.setPointerCapture(event.pointerId);
            });
            this.scope.listen(header, 'pointerup', (event) => {
                if (
                    down &&
                    getComputedStyle(element).position === 'fixed' &&
                    event.clientY - down.y > 70 &&
                    Math.abs(event.clientX - down.x) < 60
                )
                    onClose();
                down = null;
            });
            this.scope.listen(header, 'pointercancel', () => {
                down = null;
            });
        }
    }
    status(status, error, retry) {
        this.statusScope?.dispose();
        this.statusScope = new Scope();
        const { el, button } = localizedDom(this.statusScope, this.i18n);
        this.element.setAttribute('aria-busy', String(status === 'loading'));
        if (status === 'closed') {
            if (this.dialog && this.element.open) this.element.close();
            else this.element.hidden = true;
            this.body.replaceChildren();
            this.#settle?.({ status: 'cancelled' });
            this.#settle = null;
            if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
            return;
        }
        this.element.hidden = false;
        if (this.dialog && !this.element.open) this.element.showModal();
        if (status === 'loading')
            this.body.replaceChildren(
                el('p', { class: 'surface-message', role: 'status', textKey: 'surface.reading' }),
            );
        if (status === 'ready' && this.moveFocus) {
            this.closeButton.focus({ preventScroll: true });
            this.moveFocus = false;
        }
        if (status === 'error') {
            const again = button('common.retry');
            again.addEventListener('click', retry, { once: true });
            this.body.replaceChildren(
                el(
                    'div',
                    { class: 'surface-message', role: 'alert' },
                    el('p', { textKey: error?.category ? `errors.${error.category}` : 'surface.failed' }),
                    again,
                    el('p', {}, el('a', { href: location.href, textKey: 'surface.reload' })),
                ),
            );
        }
    }
    open(featureId, inputs) {
        if (this.element.hidden || (this.dialog && !this.element.open)) {
            this.returnFocus = document.activeElement;
            this.moveFocus = true;
        }
        this.body.scrollTop = 0;
        return this.host.open(featureId, inputs);
    }
    async openDialog(featureId, inputs) {
        this.#settle?.({ status: 'cancelled' });
        const result = new Promise((resolve) => {
            this.#settle = resolve;
        });
        void this.open(featureId, inputs);
        return result;
    }
    async resolve(value) {
        const settle = this.#settle;
        this.#settle = null;
        settle?.({ status: 'resolved', value });
        await this.host.close();
    }
    close() {
        return this.host.close();
    }
    async dispose() {
        await this.host.dispose();
        await this.statusScope?.dispose();
        await this.scope.dispose();
    }
}
