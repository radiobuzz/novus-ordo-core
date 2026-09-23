import { el } from './element.js';

/** Native disclosure for a compact trigger and arbitrary content; no domain state. */
export class Disclosure {
    constructor(scope, { label, className = '', onOpen, group } = {}) {
        this.trigger = el('summary', { text: label });
        this.content = el('div', { class: 'ui-disclosure-content' });
        this.element = el(
            'details',
            { class: `ui-disclosure ${className}`.trim(), name: group },
            this.trigger,
            this.content,
        );
        scope.listen(this.element, 'toggle', () => {
            if (this.element.open) onOpen?.();
        });
        scope.listen(document, 'pointerdown', (event) => {
            if (!this.element.contains(event.target)) this.close();
        });
        scope.listen(this.element, 'keydown', (event) => {
            if (event.key !== 'Escape' || !this.element.open) return;
            event.preventDefault();
            event.stopPropagation();
            this.close(true);
        });
    }
    setLabel(label) {
        this.trigger.textContent = label;
    }
    close(focus = false) {
        this.element.open = false;
        if (focus) this.trigger.focus();
    }
}
