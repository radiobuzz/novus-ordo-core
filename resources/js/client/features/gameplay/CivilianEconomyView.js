import { el } from '../../ui/dom.js';
import { resourceName, productionConstraint } from '../../ui/resourceVisuals.js';
import { MetricTable } from './MetricTable.js';

/** Feature-local presentation. All outcomes come from the shared server forecast/history. */
export class CivilianEconomyView {
    constructor(i18n) {
        this.i18n = i18n;
        this.t = (key) => i18n.t(`economy.${key}`);
        this.note = el('p', { class: 'economy-help' });
        this.headline = el('p', { class: 'economy-civilian-headline' });
        this.metrics = new MetricTable();
        this.accounts = new MetricTable();
        this.detailsLabel = el('summary');
        this.element = el(
            'div',
            { class: 'economy-civilian' },
            this.headline,
            this.note,
            el('div', { class: 'game-table-scroll', tabindex: 0 }, this.metrics.element),
            el(
                'details',
                {},
                this.detailsLabel,
                el('div', { class: 'game-table-scroll', tabindex: 0 }, this.accounts.element),
            ),
        );
    }

    update(nation, reports) {
        const active = reports.some((r) => r?.civilian?.enabled);
        this.element.hidden = !active;
        if (!active) return;
        const number = (v, digits = Number(v) !== 0 && Math.abs(Number(v)) < 0.01 ? 6 : 2) =>
            v == null ? '—' : this.i18n.number(v, { maximumFractionDigits: digits });
        const ratio = (have, need) => {
            if (have == null || need == null) return '—';
            const digits =
                Number(have) !== Number(need) && Math.abs(Number(have) - Number(need)) < 0.01 ? 6 : 2;
            return `${number(have, digits)} / ${number(need, digits)}`;
        };
        const last = reports[0]?.civilian?.enabled ? reports[0] : reports[1];
        const shortage = Object.values(last?.civilian?.consumption ?? {}).some((r) => Number(r.unmet) > 0);
        const upkeep =
            Number(last?.civilian?.maintenance_delivered) < Number(last?.civilian?.maintenance_required);
        this.headline.textContent = `${this.t(reports[0]?.civilian?.enabled ? 'lastActual' : 'savedEstimate')}: ${this.t(shortage ? 'civilianNeedsMissed' : upkeep ? 'civilianUpkeepMissed' : 'civilianNeedsMet')}`;
        this.headline.dataset.tone = shortage || upkeep ? 'danger' : 'ready';
        this.note.textContent = this.t('civilianHelp');
        this.detailsLabel.textContent = this.t('civilianDetails');
        const headers = [
            this.t('civilianMeasure'),
            this.t('lastActual'),
            this.t('savedEstimate'),
            this.t('draftEstimate'),
        ];
        const consumption = [...new Set(reports.flatMap((r) => Object.keys(r?.civilian?.consumption ?? {})))];
        const summary = consumption.map((key) => ({
            key: `civilian:${key}`,
            label: `${resourceName(nation, key, this.i18n)} · ${this.t('needsMet')}`,
            values: reports.map((r) => {
                const c = r?.civilian?.consumption?.[key];
                return {
                    text: ratio(c?.fulfilled, c?.requested),
                    tone: Number(c?.unmet) > 0 ? 'danger' : 'neutral',
                };
            }),
        }));
        for (const key of consumption) {
            if (!reports.some((r) => Number(r?.civilian?.consumption?.[key]?.unmet) > 0)) continue;
            summary.push({
                key: `civilian:cause:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('civilianConstraints')}`,
                values: reports.map((r) => ({
                    text:
                        Number(r?.civilian?.consumption?.[key]?.unmet) > 0
                            ? (r?.civilian?.constraints?.[key] ?? [])
                                  .map((c) => productionConstraint(nation, c, this.i18n))
                                  .join(' · ') || this.t('civilianCauseUnknown')
                            : '—',
                })),
            });
        }
        summary.push({
            key: 'civilian:workers',
            label: this.t('civilianWorkers'),
            values: reports.map((r) => ({ text: ratio(r?.civilian?.workers_used, r?.civilian?.workforce) })),
        });
        const maintenance = [...new Set(reports.flatMap((r) => Object.keys(r?.civilian?.upkeep ?? {})))];
        for (const key of maintenance)
            summary.push({
                key: `upkeep:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('civilianUpkeep')}`,
                values: reports.map((r) => {
                    const m = r?.civilian?.upkeep?.[key];
                    return {
                        text: ratio(m?.delivered, m?.required),
                        tone: Number(m?.delivered) < Number(m?.required) ? 'danger' : 'neutral',
                    };
                }),
            });
        this.metrics.update(headers, summary);
        const detail = [];
        detail.push({
            key: 'civilian:condition',
            label: this.t('civilianCondition'),
            values: reports.map((r) => ({
                text:
                    r?.civilian?.minimum_condition == null
                        ? '—'
                        : `${number(Number(r.civilian.minimum_condition) * 100)}%`,
            })),
        });
        for (const key of consumption)
            for (const field of ['unaffordable', 'unavailable'])
                detail.push({
                    key: `civilian:${key}:${field}`,
                    label: `${resourceName(nation, key, this.i18n)} · ${this.t(`civilian_${field}`)}`,
                    values: reports.map((r) => {
                        const v = r?.civilian?.consumption?.[key]?.[field];
                        return { text: number(v), tone: Number(v) > 0 ? 'danger' : 'neutral' };
                    }),
                });
        for (const key of [...new Set(reports.flatMap((r) => Object.keys(r?.civilian?.subsistence ?? {})))])
            detail.push({
                key: `subsistence:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('civilianSubsistence')}`,
                values: reports.map((r) => ({ text: number(r?.civilian?.subsistence?.[key]) })),
            });
        for (const key of ['household_cash', 'producer_cash'])
            detail.push({
                key: `civilian:${key}`,
                label: this.t(`civilian_${key}`),
                values: reports.map((r) => ({ text: number(r?.civilian?.[key]) })),
            });
        const goods = [...new Set(reports.flatMap((r) => Object.keys(r?.civilian?.production ?? {})))];
        for (const key of goods)
            detail.push({
                key: `civilian:production:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('civilianOutput')}`,
                values: reports.map((r) => ({ text: number(r?.civilian?.production?.[key]) })),
            });
        for (const key of [
            ...new Set(reports.flatMap((r) => Object.keys(r?.civilian?.public_industry ?? {}))),
        ]) {
            if (!reports.some((r) => Number(r?.civilian?.public_industry?.[key]?.requested) > 0)) continue;
            detail.push({
                key: `civilian:public-industry:${key}`,
                label: `${resourceName(nation, key, this.i18n)} · ${this.t('publicIndustrySupply')}`,
                values: reports.map((r) => ({
                    text: ratio(
                        r?.civilian?.public_industry?.[key]?.delivered,
                        r?.civilian?.public_industry?.[key]?.requested,
                    ),
                })),
            });
        }
        this.accounts.update(headers, detail);
    }
}
