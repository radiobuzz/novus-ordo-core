import { el } from './element.js';

let nextField = 0;
/** Decorates one native control. Value parsing, validation rules and submission belong to callers. */
export class FieldShell {
    constructor({ control, label, help = '', optional = '', className = '' }) {
        this.input = control;
        if (!control.id) control.id = `ui-field-${++nextField}`;
        this.label = el('label', { for: control.id }, label);
        this.help = el('span', { id: `${control.id}-help`, class: 'ui-field-help', text: help });
        this.error = el('span', {
            id: `${control.id}-error`,
            class: 'ui-field-error',
            'aria-live': 'polite',
        });
        this.element = el(
            'div',
            { class: `ui-field ${className}`.trim() },
            el(
                'div',
                { class: 'ui-field-label' },
                this.label,
                optional ? el('span', { class: 'ui-field-optional' }, optional) : null,
            ),
            control,
            this.help,
            this.error,
        );
        control.classList.add('ui-control');
        this.extraDescriptions = (control.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .filter(Boolean);
        this.setHelp(help);
        this.setError('');
    }
    describe() {
        const ids = [
            ...this.extraDescriptions,
            ...(this.help.textContent ? [this.help.id] : []),
            ...(this.error.textContent ? [this.error.id] : []),
        ];
        if (ids.length) this.input.setAttribute('aria-describedby', [...new Set(ids)].join(' '));
        else this.input.removeAttribute('aria-describedby');
    }
    setHelp(message) {
        this.help.textContent = message;
        this.help.hidden = !message;
        this.describe();
    }
    setError(message) {
        this.error.textContent = message;
        this.input.setAttribute('aria-invalid', String(Boolean(message)));
        this.describe();
    }
}
