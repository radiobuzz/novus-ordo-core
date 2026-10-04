import { el } from './element.js';
import { MetricCard, cardStrip } from './MetricCard.js';
import { TimeSeriesChart } from './TimeSeriesChart.js';
import { Tooltip } from './Tooltip.js';
import { Scope } from '../runtime/Scope.js';
import './indicator-trends.scss';

/** Display-only grouped indicators. Callers supply labels and percentage observations. */
export class IndicatorTrends {
    constructor(scope, i18n) {
        Object.assign(this, { scope, i18n });
        this.element = el('div', { class: 'indicator-trends' });
        this.groups = new Map();
        this.selected = null;
    }
    update({
        groups,
        current = {},
        previous = {},
        points = [],
        markers = [],
        currentLabel,
        changeLabel,
        changeUnit,
        higherLabel,
        lowerLabel,
    }) {
        const number = (value) => this.i18n.number(value, { maximumFractionDigits: 2 });
        const wanted = new Set(groups.map((group) => group.key));
        for (const [key, group] of this.groups)
            if (!wanted.has(key)) {
                void group.release();
                group.element.remove();
                this.groups.delete(key);
            }
        for (const definition of groups) {
            let group = this.groups.get(definition.key);
            const roster = definition.indicators.map((i) => i.key).join(':');
            if (group && group.roster !== roster) {
                void group.release();
                group.element.remove();
                this.groups.delete(definition.key);
                group = null;
            }
            if (!group) {
                const owned = new Scope();
                const release = this.scope.own(() => owned.dispose());
                const chart = new TimeSeriesChart(owned, this.i18n, {
                    onSelect: (season) => {
                        this.selected = season;
                        for (const entry of this.groups.values()) entry.chart.setSelection(season);
                    },
                });
                group = {
                    scope: owned,
                    release,
                    roster,
                    chart,
                    metrics: new Map(),
                    cards: cardStrip(definition.title),
                    element: el('section', {
                        class: 'indicator-trends-group',
                        'data-indicator-group': definition.key,
                    }),
                };
                group.element.append(group.cards, chart.element);
                this.groups.set(definition.key, group);
                this.element.append(group.element);
            }
            group.cards.setAttribute('aria-label', `${definition.title} · ${currentLabel}`);
            for (const indicator of definition.indicators) {
                let view = group.metrics.get(indicator.key);
                if (!view) {
                    const metric = new MetricCard({ label: indicator.label });
                    const help = new Tooltip({
                        scope: group.scope,
                        label: indicator.label,
                        text: indicator.help,
                    });
                    metric.element.dataset.indicatorKey = indicator.key;
                    view = { metric, help, label: el('span', { text: indicator.label }) };
                    metric.label.replaceChildren(view.label, help.element);
                    group.metrics.set(indicator.key, view);
                    group.cards.append(metric.element);
                }
                view.label.textContent = indicator.label;
                view.help.setText(indicator.help);
                view.help.setLabel(indicator.label);
                const value = current[indicator.key],
                    before = previous[indicator.key];
                const change =
                    value == null || before == null ? null : Math.round((value - before) * 1e6) / 1e6;
                const favourable = change != null && (indicator.prefer === 'lower' ? change < 0 : change > 0);
                const direction = indicator.prefer === 'lower' ? lowerLabel : higherLabel;
                const delta =
                    change == null
                        ? '—'
                        : `${change > 0 ? '↑ +' : change < 0 ? '↓ ' : ''}${number(change)} ${changeUnit}`;
                view.metric.update({
                    value: value == null ? '—' : `${number(value)}%`,
                    detail: `${direction} · ${changeLabel}: ${delta}`,
                });
                view.metric.detail.dataset.tone =
                    change == null || change === 0 ? 'neutral' : favourable ? 'ready' : 'danger';
            }
            group.chart.selected = this.selected;
            group.chart.update({
                title: definition.title,
                unit: '%',
                points,
                markers,
                domain: [0, 100],
                series: definition.indicators.map(({ key, label }) => ({ key, label })),
            });
        }
    }
}
