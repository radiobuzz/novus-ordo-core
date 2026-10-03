import { el } from '../../ui/dom.js';
import { resourceName } from '../../ui/resourceVisuals.js';
import { MetricTable } from './MetricTable.js';

/** Actual needs and indicator-led prosperity; no simulated household or company accounts. */
export class CivilianEconomyView {
    constructor(i18n) {
        this.i18n = i18n;
        this.t = (key) => i18n.t(`economy.${key}`);
        this.note = el('p', { class: 'economy-help' });
        this.headline = el('p', { class: 'economy-civilian-headline' });
        this.metrics = new MetricTable();
        this.element = el(
            'div',
            { class: 'economy-civilian' },
            this.headline,
            this.note,
            el('div', { class: 'game-table-scroll', tabindex: 0 }, this.metrics.element),
        );
    }
    update(nation, reports) {
        const active = reports.some((r) => r?.civilian);
        this.element.hidden = !active;
        if (!active) return;
        const number = (v) =>
            v == null
                ? '—'
                : this.i18n.number(v, {
                      maximumFractionDigits: Math.abs(Number(v)) < 0.01 && Number(v) !== 0 ? 6 : 2,
                  });
        const ratio = (a, b) => (a == null || b == null ? '—' : `${number(a)} / ${number(b)}`);
        const last = reports[0]?.civilian ? reports[0] : reports[1];
        const missed = Object.values(last?.civilian?.consumption ?? {}).some((r) => Number(r.unmet) > 0);
        this.headline.textContent = `${this.t(reports[0]?.civilian ? 'lastActual' : 'savedEstimate')}: ${this.t(missed ? 'civilianNeedsMissed' : 'civilianNeedsMet')}`;
        this.headline.dataset.tone = missed ? 'danger' : 'ready';
        this.note.textContent = this.t('civilianHelp');
        const keys = [...new Set(reports.flatMap((r) => Object.keys(r?.civilian?.consumption ?? {})))];
        const rows = keys.flatMap((key) => [
            {
                key: `needs:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('needsMet')}`,
                values: reports.map((r) => {
                    const c = r?.civilian?.consumption?.[key];
                    return {
                        text: ratio(c?.fulfilled, c?.requested),
                        tone: Number(c?.unmet) > 0 ? 'danger' : 'neutral',
                    };
                }),
            },
            {
                key: `unmet:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('civilianUnmet')}`,
                values: reports.map((r) => ({
                    text: number(r?.civilian?.consumption?.[key]?.unmet),
                    tone: Number(r?.civilian?.consumption?.[key]?.unmet) > 0 ? 'danger' : 'neutral',
                })),
            },
        ]);
        rows.push({
            key: 'workers',
            label: this.t('civilianWorkers'),
            values: reports.map((r) => ({ text: ratio(r?.civilian?.workers_used, r?.civilian?.workforce) })),
        });
        this.metrics.update(
            [
                this.t('civilianMeasure'),
                this.t('lastActual'),
                this.t('savedEstimate'),
                this.t('draftEstimate'),
            ],
            rows,
        );
    }
}
