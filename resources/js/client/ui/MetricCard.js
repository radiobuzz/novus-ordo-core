import { el } from './element.js';

/** Caller formats values/units and owns any live announcements. Zero is a real value. */
export class MetricCard {
    constructor({ label, value, detail = '' }) {
        this.label = el('dt', { class: 'ui-metric-label', text: label });
        this.value = el('dd', { class: 'ui-metric-value' });
        this.detail = el('dd', { class: 'ui-metric-detail' });
        this.element = el('dl', { class: 'ui-metric' }, this.label, this.value, this.detail);
        this.update({ value, detail });
    }
    update({ value, detail = '' }) {
        this.value.textContent = value ?? '—';
        this.detail.textContent = detail;
        this.detail.hidden = !detail;
    }
}

export function cardStrip(label, ...cards) {
    return el(
        'div',
        { class: 'ui-card-strip', role: 'group', 'aria-label': label },
        ...cards.flat().map((card) => card.element ?? card),
    );
}
