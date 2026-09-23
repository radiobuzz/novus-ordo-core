import { el } from './element.js';

export class StatusBadge {
    constructor({ label, tone = 'neutral' }) {
        this.element = el('span', { class: 'ui-badge' });
        this.update({ label, tone });
    }
    update({ label, tone = 'neutral' }) {
        if (!['neutral', 'accent', 'ready', 'warning', 'danger'].includes(tone))
            throw new TypeError('Unknown status tone.');
        this.element.dataset.tone = tone;
        this.element.textContent = label;
    }
}
