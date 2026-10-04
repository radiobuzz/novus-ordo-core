import { el } from './element.js';
import './time-series.scss';
import { ChartExpansion, chartExpandButton } from './ChartExpansion.js';

const svg = (tag, attrs = {}, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text != null) node.textContent = text;
    return node;
};
const colors = [
    'var(--chart-income)',
    'var(--chart-expense)',
    'var(--chart-capacity)',
    'var(--chart-public)',
    'var(--chart-private)',
    'var(--action-danger)',
];

/** Recorded series in, presentation only out. Exact values remain in the table. */
export class TimeSeriesChart {
    constructor(scope, i18n, { onSelect, compact = false, expandable = true } = {}) {
        Object.assign(this, { scope, i18n, onSelect, compact });
        this.hidden = new Set();
        this.title = el('h3');
        this.legend = el('div', { class: 'time-series-legend' });
        this.plot = svg('svg', {
            viewBox: compact ? '0 0 240 64' : '0 0 720 240',
            tabindex: 0,
            role: 'img',
            class: 'time-series-plot',
        });
        this.readout = el('p', { class: 'time-series-readout', 'aria-live': 'polite' });
        this.table = el('div', { class: 'time-series-table' });
        this.details = el('details', {}, el('summary', { text: i18n.t('history.exactValues') }), this.table);
        this.element = el(
            'section',
            { class: `time-series${compact ? ' time-series--compact' : ''}` },
            el('header', { class: 'time-series-heading' }, this.title),
            this.legend,
            el('div', { class: 'time-series-frame' }, this.plot),
            this.readout,
            this.details,
        );
        this.buttons = new Map();
        if (expandable) {
            this.expandButton = chartExpandButton(i18n, '');
            this.element.querySelector('.time-series-heading').append(this.expandButton);
            this.expansion = new ChartExpansion(scope, i18n, {
                title: () => this.title.textContent,
                render: (expandedScope) => {
                    this.expandedChart = new TimeSeriesChart(expandedScope, i18n, {
                        expandable: false,
                        onSelect: (season) => {
                            this.selected = season;
                            this.onSelect?.(season);
                        },
                    });
                    this.expandedChart.hidden = new Set(this.hidden);
                    this.syncExpanded();
                    return this.expandedChart.element;
                },
                onClose: () => {
                    if (!this.expandedChart) return;
                    this.hidden = this.expandedChart.hidden;
                    this.selected = this.expandedChart.selected;
                    this.expandedChart = null;
                    if (!scope.closed) this.draw();
                },
            });
            scope.listen(this.expandButton, 'click', () => this.expansion.open());
            scope.listen(this.plot, 'dblclick', () => this.expansion.open());
            scope.listen(this.plot, 'keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.expansion.open();
                }
            });
        }
        scope.listen(this.plot, 'click', (event) => {
            if (this.compact) return;
            if (!this.points?.length) return;
            // SVG coordinates account for letterboxing in larger/narrower views.
            const matrix = this.plot.getScreenCTM();
            if (!matrix) return;
            const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x;
            this.select(
                Math.max(
                    0,
                    Math.min(
                        this.points.length - 1,
                        Math.round(((x - 62) / 640) * Math.max(1, this.points.length - 1)),
                    ),
                ),
            );
        });
        scope.listen(this.plot, 'keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !this.points?.length)
                return;
            event.preventDefault();
            const index = this.points.findIndex((p) => p.season === this.selected);
            this.select(
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? this.points.length - 1
                      : Math.max(
                            0,
                            Math.min(this.points.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
                        ),
            );
        });
    }
    select(index) {
        this.selected = this.points[index]?.season;
        this.draw();
        this.onSelect?.(this.selected);
    }
    setSelection(season) {
        this.selected = season;
        this.draw();
    }
    update({ title, unit, points, series, stacked = false, markers = [], domain = null }) {
        if (
            domain &&
            (!Array.isArray(domain) ||
                domain.length !== 2 ||
                !domain.every(Number.isFinite) ||
                domain[0] >= domain[1])
        )
            throw new TypeError('Chart domain requires two increasing finite bounds.');
        Object.assign(this, { points, series, unit, stacked, markers, domain });
        this.title.textContent = title;
        if (this.expandButton) {
            const label = this.i18n.t('history.enlargeChart', { title });
            this.expandButton.setAttribute('aria-label', label);
            this.expandButton.title = label;
        }
        this.plot.setAttribute('aria-label', `${title} · ${unit} · ${this.i18n.t('history.keyboard')}`);
        this.details.firstChild.textContent = this.i18n.t('history.exactValues');
        const keys = new Set(series.map((s) => s.key));
        for (const [key, button] of this.buttons)
            if (!keys.has(key)) {
                button.remove();
                this.buttons.delete(key);
            }
        series.forEach((s, index) => {
            let button = this.buttons.get(s.key);
            if (!button) {
                button = el('button', { type: 'button', 'data-icon': 'none' });
                this.buttons.set(s.key, button);
                this.legend.append(button);
                this.scope.listen(button, 'click', () => {
                    this.hidden.has(s.key) ? this.hidden.delete(s.key) : this.hidden.add(s.key);
                    this.draw();
                });
            }
            button.textContent = s.label;
            button.style.setProperty('--series-color', colors[index % colors.length]);
        });
        if (!points.some((p) => p.season === this.selected)) this.selected = points.at(-1)?.season;
        this.draw();
    }
    draw() {
        if (!this.series) return;
        const visible = this.series.filter((s) => !this.hidden.has(s.key));
        for (const [key, button] of this.buttons)
            button.setAttribute('aria-pressed', String(!this.hidden.has(key)));
        const number = (v) => (v == null ? '—' : this.i18n.number(v, { maximumFractionDigits: 3 }));
        const values = this.points.flatMap((p) =>
            this.stacked
                ? visible.some((s) => p.values[s.key] == null)
                    ? []
                    : [visible.reduce((sum, s) => sum + Math.max(0, Number(p.values[s.key])), 0)]
                : visible
                      .map((s) => p.values[s.key])
                      .filter((v) => v != null)
                      .map(Number),
        );
        let min = Math.min(0, ...values),
            max = Math.max(0, ...values);
        if (this.domain) [min, max] = this.domain;
        if (max === min) max = min + 1;
        const left = this.compact ? 8 : 62,
            right = this.compact ? 232 : 702;
        const top = this.compact ? 8 : 28,
            bottom = this.compact ? 56 : 202;
        const x = (i) =>
            left +
            (this.points.length <= 1 ? (right - left) / 2 : (i / (this.points.length - 1)) * (right - left));
        const y = (v) => bottom - ((Number(v) - min) / (max - min)) * (bottom - top);
        const nodes = [];
        for (let i = 0; !this.compact && i <= 3; i++) {
            const v = min + ((max - min) * i) / 3;
            nodes.push(
                svg('line', { x1: 62, x2: 702, y1: y(v), y2: y(v), class: 'time-series-grid' }),
                svg('text', { x: 56, y: y(v) + 4, 'text-anchor': 'end' }, number(v)),
            );
        }
        if (!this.compact) nodes.push(svg('text', { x: 62, y: 16 }, this.unit));
        else nodes.push(svg('line', { x1: left, x2: right, y1: y(0), y2: y(0), class: 'time-series-grid' }));
        if (this.points.length) {
            if (!this.compact)
                nodes.push(
                    svg('text', { x: 62, y: 229 }, String(this.points[0].season)),
                    svg('text', { x: 702, y: 229, 'text-anchor': 'end' }, String(this.points.at(-1).season)),
                );
            for (const marker of this.compact ? [] : this.markers) {
                const index = this.points.findIndex((p) => p.season === marker.season);
                if (index >= 0)
                    nodes.push(
                        svg('line', {
                            x1: x(index),
                            x2: x(index),
                            y1: 28,
                            y2: 202,
                            class: 'time-series-marker',
                        }),
                    );
            }
            const selected = this.points.findIndex((p) => p.season === this.selected);
            if (!this.compact && selected >= 0)
                nodes.push(
                    svg('line', {
                        x1: x(selected),
                        x2: x(selected),
                        y1: 28,
                        y2: 202,
                        class: 'time-series-selection',
                    }),
                );
            if (this.stacked)
                this.points.forEach((p, i) => {
                    // A partial stack would misrepresent its total. Missing observations stay gaps.
                    if (visible.some((s) => p.values[s.key] == null)) return;
                    let base = 0;
                    visible.forEach((s) => {
                        const value = p.values[s.key];
                        if (value == null) return;
                        const v = Number(value),
                            next = base + v;
                        nodes.push(
                            svg('rect', {
                                x: x(i) - Math.min(18, 260 / Math.max(1, this.points.length)),
                                y: y(next),
                                width: Math.min(36, 520 / Math.max(1, this.points.length)),
                                height: Math.max(0, y(base) - y(next)),
                                fill: colors[this.series.indexOf(s) % colors.length],
                            }),
                        );
                        base = next;
                    });
                });
            else
                visible.forEach((s) => {
                    let path = '',
                        connected = false;
                    this.points.forEach((p, i) => {
                        const v = p.values[s.key];
                        if (v == null) {
                            connected = false;
                            return;
                        }
                        path += `${connected ? 'L' : 'M'}${x(i)} ${y(v)} `;
                        connected = true;
                    });
                    const color = colors[this.series.indexOf(s) % colors.length];
                    nodes.push(
                        svg('path', {
                            d: path,
                            fill: 'none',
                            stroke: color,
                            'stroke-width': this.compact ? 1.5 : 2.5,
                            'vector-effect': 'non-scaling-stroke',
                            ...(s.dashed ? { 'stroke-dasharray': '7 5' } : {}),
                        }),
                    );
                    this.points.forEach((p, i) => {
                        if (p.values[s.key] != null)
                            nodes.push(
                                svg('circle', {
                                    cx: x(i),
                                    cy: y(p.values[s.key]),
                                    r: this.compact ? 1.8 : 3,
                                    fill: color,
                                }),
                            );
                    });
                });
        }
        this.plot.replaceChildren(...nodes);
        const point = this.points.find((p) => p.season === this.selected);
        this.readout.textContent = point
            ? `${this.i18n.t('history.season')} ${point.season}: ${visible.map((s) => `${s.label} ${number(point.values[s.key])}`).join(' · ')}${this.markers.some((m) => m.season === point.season) ? ' · ' + this.i18n.t('history.policyChanged') : ''}`
            : this.i18n.t('history.empty');
        this.table.replaceChildren(
            el(
                'table',
                { class: 'game-table' },
                el(
                    'thead',
                    {},
                    el(
                        'tr',
                        {},
                        el('th', { scope: 'col', text: this.i18n.t('history.season') }),
                        ...this.series.map((s) => el('th', { scope: 'col', text: s.label })),
                    ),
                ),
                el(
                    'tbody',
                    {},
                    ...this.points.map((p) =>
                        el(
                            'tr',
                            {},
                            el('th', { scope: 'row', text: p.season }),
                            ...this.series.map((s) => el('td', { text: p.values[s.key] ?? '—' })),
                        ),
                    ),
                ),
            ),
        );
        this.syncExpanded();
    }
    syncExpanded() {
        if (!this.expandedChart || !this.series) return;
        this.expandedChart.selected = this.selected;
        this.expandedChart.update({
            title: this.title.textContent,
            unit: this.unit,
            points: this.points,
            series: this.series,
            stacked: this.stacked,
            markers: this.markers,
            domain: this.domain,
        });
        this.expansion.refresh();
    }
}
