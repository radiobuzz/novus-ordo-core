import { Scope } from '../runtime/Scope.js';
import { Button } from './Button.js';
import { el } from './element.js';
import './chart-expansion.scss';

let nextId = 0;

/** Presentation-only enlargement. Callers supply the existing chart data/view; no reads. */
export class ChartExpansion {
    constructor(scope, i18n, { title, render, onClose } = {}) {
        Object.assign(this, { scope, i18n, title, render, onClose });
        scope.own(() => this.close());
    }
    open() {
        if (this.scope.closed || this.dialog) return;
        this.returnFocus = document.activeElement;
        this.childScope = new Scope();
        const id = `chart-expanded-${++nextId}`;
        this.heading = el('h2', { id });
        this.closeButton = new Button({ label: '', variant: 'quiet', icon: 'close' });
        this.body = el('div', { class: 'chart-dialog-body' });
        this.dialog = el(
            'dialog',
            { class: 'chart-dialog', 'aria-labelledby': id },
            el('header', { class: 'chart-dialog-heading' }, this.heading, this.closeButton.element),
            this.body,
        );
        this.childScope.listen(this.closeButton.element, 'click', () => this.close());
        this.childScope.listen(this.dialog, 'cancel', (event) => {
            event.preventDefault();
            this.close();
        });
        this.childScope.listen(this.dialog, 'close', () => this.close());
        try {
            this.refresh({ render: true });
            document.body.append(this.dialog);
            this.dialog.showModal();
            this.closeButton.element.focus({ preventScroll: true });
        } catch (error) {
            this.close();
            throw error;
        }
    }
    refresh({ render = false } = {}) {
        if (!this.dialog) return;
        this.heading.textContent = this.title();
        this.closeButton.element.setAttribute('aria-label', this.i18n.t('common.close'));
        if (render) this.body.replaceChildren(this.render(this.childScope));
    }
    close() {
        if (!this.dialog) return;
        const dialog = this.dialog;
        this.dialog = null;
        try {
            this.onClose?.();
        } finally {
            void this.childScope.dispose();
            dialog.close();
            dialog.remove();
            if (!this.scope.closed && this.returnFocus?.isConnected)
                this.returnFocus.focus({ preventScroll: true });
        }
    }
}

export function chartExpandButton(i18n, title) {
    const button = new Button({ label: '', variant: 'quiet', icon: 'fit', className: 'chart-expand-button' })
        .element;
    const label = i18n.t('history.enlargeChart', { title });
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    return button;
}
