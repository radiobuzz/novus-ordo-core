import { el } from '../../ui/element.js';
import { MetricCard, cardStrip } from '../../ui/MetricCard.js';
import { IndicatorTrends } from '../../ui/IndicatorTrends.js';
import {
    indicatorGroups,
    lowerIsBetter,
    indicatorValues,
    indicatorPoint,
    precedingIndicators,
} from './demographySeries.js';
import './demography.scss';

/** Nation composition; the existing gameplay service owns recorded history. */
export class DemographyView {
    constructor(scope, services) {
        Object.assign(this, { scope, services, sequence: 0 });
        this.t = (key) => services.i18n.t(`demography.${key}`);
        this.population = new MetricCard({ label: this.t('population') });
        this.growth = new MetricCard({ label: this.t('growth') });
        this.facts = cardStrip(this.t('facts'), this.population, this.growth);
        this.period = el(
            'select',
            { 'aria-label': services.i18n.t('history.period') },
            ...[12, 24, 96].map((n) => el('option', { value: n })),
        );
        this.periodLabel = el('span');
        this.note = el('p', { class: 'economy-help' });
        this.status = el('p', { role: 'status' });
        this.retry = el('button', { type: 'button', class: 'ui-button', hidden: true });
        this.trends = new IndicatorTrends(scope, services.i18n);
        this.element = el(
            'div',
            { class: 'demography-view' },
            this.facts,
            el('div', { class: 'demography-controls' }, el('label', {}, this.periodLabel, this.period)),
            this.note,
            this.status,
            this.retry,
            this.trends.element,
        );
        scope.listen(this.period, 'change', () => void this.load());
        scope.listen(this.retry, 'click', () => void this.load());
        services.i18n.changed.subscribe(scope, () => this.paint());
        scope.own(() => {
            this.sequence++;
        });
    }
    update(snapshot, { load = false } = {}) {
        const context = this.services.gameplay.economicHistoryKey(snapshot);
        this.snapshot = snapshot;
        if (context !== this.context) {
            this.context = context;
            this.sequence++;
            this.history = null;
            this.loaded = false;
            this.state = '';
            this.retry.hidden = true;
        }
        this.paint();
        if (load && !this.loaded) void this.load();
    }
    async load() {
        if (!this.snapshot || this.scope.closed) return;
        const sequence = ++this.sequence,
            context = this.context;
        this.loaded = true;
        this.state = 'loading';
        this.retry.hidden = true;
        this.paint();
        try {
            const history = await this.services.gameplay.economicHistory(
                this.snapshot,
                Number(this.period.value),
            );
            if (this.scope.closed || sequence !== this.sequence || context !== this.context) return;
            this.history = history;
            this.state = history.seasons.length ? '' : 'empty';
            this.paint();
        } catch {
            if (this.scope.closed || sequence !== this.sequence || context !== this.context) return;
            this.state = this.history ? 'stale' : 'failed';
            this.retry.hidden = false;
            this.paint();
        }
    }
    paint() {
        const i18n = this.services.i18n;
        const number = (n) => i18n.number(n, { maximumFractionDigits: 2 });
        this.population.label.textContent = this.t('population');
        this.growth.label.textContent = this.t('growth');
        this.facts.setAttribute('aria-label', this.t('facts'));
        const facts = this.snapshot?.nation?.demography;
        this.population.update({ value: facts?.population == null ? '—' : number(facts.population) });
        this.growth.update({
            value: facts?.growth_rate == null ? '—' : `${number(facts.growth_rate * 100)}%`,
            detail: this.t('growthHelp'),
        });
        this.periodLabel.textContent = i18n.t('history.period');
        this.period.setAttribute('aria-label', i18n.t('history.period'));
        for (const option of this.period.options)
            option.textContent = i18n.t('history.seasons', { count: option.value });
        this.note.textContent = this.t('note');
        this.status.textContent = this.state
            ? this.state === 'failed'
                ? this.t('failed')
                : i18n.t(`history.${this.state}`)
            : '';
        this.status.hidden = !this.state;
        this.retry.textContent = i18n.t('history.retry');
        const records = this.history?.seasons ?? [];
        this.trends.update({
            groups: indicatorGroups.map(({ key, keys }) => ({
                key,
                title: this.t(key),
                indicators: keys.map((key) => ({
                    key,
                    label: i18n.t(`economy.${key}`),
                    prefer: lowerIsBetter.has(key) ? 'lower' : 'higher',
                    help: this.t(`help_${key}`),
                })),
            })),
            current: indicatorValues(this.snapshot?.nation?.economy?.current),
            previous: precedingIndicators(this.history, this.snapshot?.turn_number),
            points: records.map(indicatorPoint),
            markers: records
                .filter((r) => Object.keys(r.policy_changes ?? {}).length)
                .map((r) => ({ season: r.season })),
            currentLabel: this.t('current'),
            changeLabel: this.t('change'),
            changeUnit: this.t('points'),
            higherLabel: this.t('higher'),
            lowerLabel: this.t('lower'),
        });
    }
}
