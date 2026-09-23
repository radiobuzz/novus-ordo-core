import { el } from './element.js';
import { setButtonIcon } from './icons.js';

const variants = new Set(['primary', 'secondary', 'quiet', 'danger']);
function classes(variant, className) {
    if (!variants.has(variant)) throw new TypeError(`Unknown button variant: ${variant}`);
    return `ui-button ui-button--${variant} ${className}`.trim();
}

/** Presentation state only: the feature owns listeners, pending promises and command safety. */
export class Button {
    constructor({
        label = '',
        variant = 'secondary',
        type = 'button',
        disabled = false,
        className = '',
        icon = /^[+−×✕↶↷☰]$/.test(label) ? null : 'action',
    } = {}) {
        this.element = el('button', { type, class: classes(variant, className), text: label });
        setButtonIcon(this.element, icon);
        this.disabled = disabled;
        this.pending = false;
        this.updateState();
    }
    setLabel(label) {
        this.element.textContent = label;
    }
    setDisabled(disabled) {
        this.disabled = Boolean(disabled);
        this.updateState();
    }
    setPending(pending) {
        this.pending = Boolean(pending);
        this.updateState();
    }
    updateState() {
        this.element.disabled = this.disabled || this.pending;
        this.element.setAttribute('aria-busy', String(this.pending));
    }
}

/** Navigation stays a real link; it has no pretend disabled/button behavior. */
export function actionLink(label, href, { variant = 'secondary', className = '' } = {}) {
    return el('a', { href, class: classes(variant, className), text: label });
}

/** Compatibility for existing DOM-returning helpers. New stateful callers use Button. */
export function button(label, className = 'no-button') {
    const tokens = className.split(/\s+/);
    const variant = tokens.includes('entry-primary')
        ? 'primary'
        : tokens.includes('text-button') || tokens.includes('no-button--quiet')
          ? 'quiet'
          : 'secondary';
    return new Button({ label, variant, className }).element;
}
