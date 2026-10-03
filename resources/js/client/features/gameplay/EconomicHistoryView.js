import { el } from '../../ui/dom.js';
import { TimeSeriesChart } from '../../ui/TimeSeriesChart.js';
import { resourceName } from '../../ui/resourceVisuals.js';
import { nationalPoint, industryPoint, spendingKeys } from './historySeries.js';

/** Reusable report composition; GameplayService owns history, this view only owns selection. */
export class EconomicHistoryView {
    constructor(scope, services, { resource = null, compact = false, onData } = {}) {
        Object.assign(this, { scope, services, resource, compact, onData });
        this.t = (key, params) => services.i18n.t(`history.${key}`, params);
        this.industry = el('select', { 'aria-label': this.t('industrySelector') });
        this.view = el('select', { 'aria-label': this.t('view') });
        this.period = el(
            'select',
            { 'aria-label': this.t('period') },
            ...[12, 24, 96].map((n) => el('option', { value: n, text: this.t('seasons', { count: n }) })),
        );
        this.status = el('p', { class: 'economic-history-status', role: 'status' });
        this.note = el('p', { class: 'economy-help' });
        this.retry = el('button', { type: 'button', text: this.t('retry'), hidden: true });
        this.element = el(
            'div',
            { class: 'economic-history' },
            el(
                'div',
                { class: 'economic-history-controls' },
                this.wrap('industrySelector', this.industry),
                this.wrap('view', this.view),
                this.wrap('period', this.period),
            ),
            this.status,
            this.retry,
            this.note,
        );
        this.charts = [0, 1].map(
            () =>
                new TimeSeriesChart(scope, services.i18n, {
                    onSelect: (season) => this.charts.forEach((c) => c.setSelection(season)),
                }),
        );
        this.element.append(...this.charts.map((c) => c.element));
        scope.listen(this.industry, 'change', () => {
            this.resource = this.industry.value || null;
            this.setViews();
            this.paint();
        });
        scope.listen(this.view, 'change', () => this.paint());
        scope.listen(this.period, 'change', () => void this.load());
        scope.listen(this.retry, 'click', () => void this.load());
        services.i18n.changed.subscribe(scope, () => {
            if (this.snapshot) {
                this.labels();
                this.paint();
            }
        });
        scope.own(() => {
            this.sequence++;
        });
        this.sequence = 0;
    }
    wrap(key, input) {
        return el('label', {}, el('span', { 'data-history-label': key, text: this.t(key) }), input);
    }
    labels() {
        for (const label of this.element.querySelectorAll('[data-history-label]'))
            label.textContent = this.t(label.dataset.historyLabel);
        for (const [key, control] of [
            ['industrySelector', this.industry],
            ['view', this.view],
            ['period', this.period],
        ])
            control.setAttribute('aria-label', this.t(key));
        this.period
            .querySelectorAll('option')
            .forEach((o) => (o.textContent = this.services.i18n.t('history.seasons', { count: o.value })));
        this.retry.textContent = this.t('retry');
        const definitions = this.snapshot?.nation?.definitions?.resources ?? [];
        const selected = this.resource;
        this.industry.replaceChildren(
            ...(!this.compact ? [el('option', { value: '', text: this.t('national') })] : []),
            ...definitions
                .filter((r) => r.kind === 'stock' && r.rules?.['production.territorial_labor'])
                .map((r) =>
                    el('option', {
                        value: r.resource_key,
                        text: resourceName(this.snapshot.nation, r.resource_key, this.services.i18n),
                    }),
                ),
        );
        // The public catalogue may omit rule payloads; acquisition resources identify the same priced industries.
        if (this.industry.options.length <= (this.compact ? 0 : 1))
            this.industry.append(
                ...definitions
                    .filter((r) => r.kind === 'stock')
                    .map((r) =>
                        el('option', {
                            value: r.resource_key,
                            text: resourceName(this.snapshot.nation, r.resource_key, this.services.i18n),
                        }),
                    ),
            );
        this.industry.value = selected ?? '';
        this.industry.parentElement.hidden = this.compact;
        this.setViews();
    }
    setViews() {
        const current = this.view.value;
        const keys = this.resource
            ? ['supply', 'development', 'acquisitions']
            : ['budget', 'cash', 'spending', 'activity'];
        this.view.replaceChildren(...keys.map((key) => el('option', { value: key, text: this.t(key) })));
        if (keys.includes(current)) this.view.value = current;
    }
    update(snapshot, { load = true } = {}) {
        const context = this.services.gameplay.economicHistoryKey(snapshot);
        const changed = context !== this.context;
        this.snapshot = snapshot;
        if (changed) {
            this.context = context;
            this.history = null;
            this.loaded = false;
            this.sequence++;
            this.labels();
            this.paint();
            this.onData?.({ seasons: [] });
        }
        if (load && (changed || !this.loaded)) void this.load();
    }
    async load() {
        if (!this.snapshot) return;
        const sequence = ++this.sequence,
            context = this.context;
        this.loaded = true;
        this.status.textContent = this.t('loading');
        this.retry.hidden = true;
        try {
            const history = await this.services.gameplay.economicHistory(
                this.snapshot,
                Number(this.period.value),
            );
            if (this.scope.closed || sequence !== this.sequence || context !== this.context) return;
            this.history = history;
            this.status.textContent = '';
            this.paint();
            this.onData?.(history);
        } catch (error) {
            if (this.scope.closed || sequence !== this.sequence) return;
            this.status.textContent = this.t(this.history ? 'stale' : 'failed');
            this.retry.hidden = false;
        }
    }
    paint() {
        const records = this.history?.seasons ?? [],
            i18n = this.services.i18n;
        const markers = records
            .filter((r) => Object.keys(r.policy_changes ?? {}).length)
            .map((r) => ({ season: r.season }));
        const points = records.map((r) =>
            this.resource ? industryPoint(r, this.resource) : nationalPoint(r),
        );
        const currency = this.snapshot?.nation?.definitions?.resources?.find((r) => r.kind === 'currency');
        const units = currency?.unit_labels?.[i18n.locale] ?? currency?.unit_labels?.en ?? this.t('currency');
        const resourceDef = this.snapshot?.nation?.definitions?.resources?.find(
            (r) => r.resource_key === this.resource,
        );
        const physical =
            resourceDef?.unit_labels?.[i18n.locale] ?? resourceDef?.unit_labels?.en ?? this.t('units');
        const series = (keys, dashed) =>
            keys.map((key) => ({ key, label: this.t(key), dashed: key === dashed }));
        const view = this.view.value;
        let plots = [];
        if (view === 'budget')
            plots = [
                { keys: ['receipts', 'spending'], unit: units, title: 'budget' },
                { keys: ['balance'], unit: units, title: 'balance' },
            ];
        if (view === 'activity')
            plots = [
                { keys: ['earnedIncome', 'disposableIncome'], unit: units, title: 'activity' },
                { keys: ['economicStrength', 'dynamism'], unit: '%', title: 'conditions' },
            ];
        if (view === 'cash')
            plots = [
                { keys: ['treasury'], unit: units, title: 'treasury' },
                { keys: ['debt'], unit: units, title: 'debt' },
            ];
        if (view === 'spending')
            plots = [{ keys: spendingKeys, unit: units, title: 'spending', stacked: true }];
        if (view === 'supply')
            plots = [
                {
                    keys: ['production', 'civilian', 'industry', 'usable'],
                    unit: physical,
                    title: 'supply',
                    dashed: 'usable',
                },
            ];
        if (view === 'development')
            plots = [
                {
                    keys: ['publicInvestment', 'privateInvestment'],
                    unit: units,
                    title: 'investment',
                    stacked: true,
                },
                { keys: ['capacity'], unit: physical, title: 'capacity' },
            ];
        if (view === 'acquisitions')
            plots = [
                { keys: ['acquisitions'], unit: physical, title: 'acquisitions' },
                { keys: ['acquisitionSpending'], unit: units, title: 'acquisitionSpending' },
            ];
        this.note.textContent = this.t(
            this.resource
                ? view === 'supply'
                    ? 'supplyHelp'
                    : view === 'acquisitions'
                      ? 'acquisitionHelp'
                      : 'developmentHelp'
                : 'nationalHelp',
        );
        this.charts.forEach((chart, index) => {
            const plot = plots[index];
            chart.element.hidden = !plot;
            if (plot)
                chart.update({
                    title: this.t(plot.title),
                    unit: plot.unit,
                    points,
                    series: series(plot.keys, plot.dashed),
                    stacked: plot.stacked,
                    markers,
                });
        });
    }
}
