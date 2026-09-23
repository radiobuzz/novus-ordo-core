import { el } from './element.js';
import { Tooltip } from './Tooltip.js';

/** A short visible message, with the complete detail on hover, focus or tap. */
export class CompactMessage {
    constructor(scope, { className = '', role = 'status' } = {}) {
        this.text = el('span', { class: 'ui-message-text' });
        this.tooltip = new Tooltip({ scope, trigger: this.text });
        this.element = el(
            'span',
            { class: `ui-compact-message ${className}`.trim(), role, hidden: true },
            this.tooltip.element,
        );
    }
    show(message = '', detail = '') {
        // Prefer a caller-written summary; otherwise retain the first short sentence.
        const full = detail || message;
        const first = message.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? message;
        const summary = first.length <= 110 ? first : `${first.slice(0, 107).trimEnd()}…`;
        if (this.text.textContent !== summary) this.text.textContent = summary;
        const hasDetail = Boolean(full && full !== summary);
        this.tooltip.setText(hasDetail ? full : '');
        if (hasDetail) this.text.setAttribute('tabindex', '0');
        else this.text.removeAttribute('tabindex');
        this.text.classList.toggle('has-detail', hasDetail);
        this.element.hidden = !message;
    }
}
