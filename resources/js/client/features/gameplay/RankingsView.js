import { Button } from '../../ui/Button.js';
import { dataTable } from '../../ui/DataTable.js';
import { formatStat } from '../../ui/dom.js';
import { el } from '../../ui/element.js';
import { panel } from '../../ui/Panel.js';
import { nationPalette } from '../../services/nationColors.js';

const chartWidth = 960;
const chartHeight = 420;
const plot = { left: 78, right: 28, top: 26, bottom: 58 };
const dashPatterns = ['', '10 5', '3 4', '12 4 3 4', '2 3 8 3'];

const metricKey = (ranking, index) =>
    ranking.key ?? ranking.title?.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_') ?? `ranking_${index}`;

function svgElement(name, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
}

function formatted(value, unit, i18n) {
    return formatStat({ value, unit }, i18n);
}

function currentChart(ranking, names, colors, i18n) {
    const values = ranking.ranked_nation_ids.map((nationId, index) => ({
        nationId,
        value: Number(ranking.data[index]),
        rank: index + 1,
    }));
    const maximum = Math.max(0, ...values.map(({ value }) => (Number.isFinite(value) ? value : 0)));
    return el(
        'article',
        { class: 'ranking-current-chart' },
        el('h3', { text: ranking.title }),
        values.length
            ? el(
                  'ol',
                  { class: 'ranking-bars', 'aria-label': `${ranking.title} ranking` },
                  values.map(({ nationId, value, rank }) => {
                      const width =
                          maximum > 0 && Number.isFinite(value) ? Math.max(0, value / maximum) * 100 : 0;
                      const color = nationPalette(colors, nationId).paint;
                      return el(
                          'li',
                          { class: 'ranking-bar' },
                          el('span', { class: 'ranking-position', text: `#${rank}` }),
                          el('span', {
                              class: 'ranking-name',
                              text: names.get(nationId) ?? `Nation ${nationId}`,
                          }),
                          el('span', {
                              class: 'ranking-value',
                              text: formatted(value, ranking.data_unit, i18n),
                          }),
                          el(
                              'span',
                              { class: 'ranking-bar-track', 'aria-hidden': 'true' },
                              el('span', {
                                  class: 'ranking-bar-fill',
                                  style: `--ranking-width:${width}%;--ranking-color:${color}`,
                              }),
                          ),
                      );
                  }),
              )
            : el('p', { class: 'ranking-empty', text: 'No nations are ranked yet.' }),
    );
}

function lineChart(metric, selectedNationIds, names, colors, throughTurn, i18n) {
    const selected = metric.series.filter((series) => selectedNationIds.has(series.nation_id));
    const allTurns = metric.series.flatMap((series) => series.points.map((point) => point.turn_number));
    const values = selected.flatMap((series) => series.points.map((point) => Number(point.value)));
    if (!selected.length || !values.length)
        return el('p', {
            class: 'ranking-empty',
            text: 'Select at least one nation with recorded observations.',
        });

    const firstTurn = Math.min(...allTurns);
    const lastTurn = Math.max(throughTurn, ...allTurns);
    let minimum = Math.min(...values);
    let maximum = Math.max(...values);
    if (minimum >= 0) minimum = 0;
    if (minimum === maximum) {
        const padding = Math.max(1, Math.abs(maximum) * 0.1);
        minimum -= padding;
        maximum += padding;
    }
    const innerWidth = chartWidth - plot.left - plot.right;
    const innerHeight = chartHeight - plot.top - plot.bottom;
    const x = (turn) =>
        firstTurn === lastTurn
            ? plot.left + innerWidth / 2
            : plot.left + ((turn - firstTurn) / (lastTurn - firstTurn)) * innerWidth;
    const y = (value) => plot.top + ((maximum - value) / (maximum - minimum)) * innerHeight;
    const svg = svgElement('svg', {
        class: 'ranking-history-chart',
        viewBox: `0 0 ${chartWidth} ${chartHeight}`,
        'aria-hidden': 'true',
        focusable: 'false',
    });

    for (let tick = 0; tick <= 4; tick++) {
        const ratio = tick / 4;
        const value = maximum - ratio * (maximum - minimum);
        const py = plot.top + ratio * innerHeight;
        svg.append(
            svgElement('line', {
                class: 'ranking-grid-line',
                x1: plot.left,
                x2: chartWidth - plot.right,
                y1: py,
                y2: py,
            }),
        );
        const label = svgElement('text', { class: 'ranking-axis-label', x: plot.left - 12, y: py + 4 });
        label.textContent = formatted(value, metric.data_unit, i18n);
        svg.append(label);
    }
    const xTickCount = Math.min(6, lastTurn - firstTurn);
    const tickTurns =
        firstTurn === lastTurn
            ? [firstTurn]
            : Array.from({ length: xTickCount + 1 }, (_, tick) =>
                  Math.round(firstTurn + (tick / xTickCount) * (lastTurn - firstTurn)),
              );
    for (const turn of tickTurns) {
        const label = svgElement('text', {
            class: 'ranking-axis-label ranking-axis-turn',
            x: x(turn),
            y: chartHeight - plot.bottom + 28,
        });
        label.textContent = `Turn ${turn}`;
        svg.append(label);
    }

    selected.forEach((series, index) => {
        let previousTurn = null;
        const commands = [];
        for (const point of series.points) {
            const command = previousTurn === null || point.turn_number !== previousTurn + 1 ? 'M' : 'L';
            commands.push(
                `${command}${x(point.turn_number).toFixed(2)},${y(Number(point.value)).toFixed(2)}`,
            );
            previousTurn = point.turn_number;
        }
        const color = nationPalette(colors, series.nation_id).paint;
        const path = svgElement('path', {
            class: 'ranking-series-line',
            d: commands.join(' '),
            stroke: color,
            'stroke-dasharray': dashPatterns[index % dashPatterns.length],
        });
        svg.append(path);
        const last = series.points.at(-1);
        if (last)
            svg.append(
                svgElement('circle', {
                    class: 'ranking-series-point',
                    cx: x(last.turn_number),
                    cy: y(Number(last.value)),
                    r: 4,
                    fill: color,
                }),
            );
    });
    return el(
        'div',
        { class: 'ranking-chart-frame' },
        svg,
        el('p', {
            class: 'ui-visually-hidden',
            text: `${metric.title} history from turn ${firstTurn} through turn ${lastTurn}. Exact observations follow in the data table.`,
        }),
    );
}

function historyTable(metric, selectedNationIds, names, i18n) {
    const series = metric.series.filter((entry) => selectedNationIds.has(entry.nation_id));
    const turns = [
        ...new Set(series.flatMap((entry) => entry.points.map((point) => point.turn_number))),
    ].sort((a, b) => a - b);
    const points = new Map(
        series.flatMap((entry) =>
            entry.points.map((point) => [`${entry.nation_id}:${point.turn_number}`, point]),
        ),
    );
    return dataTable(
        `${metric.title} exact history`,
        ['Turn', ...series.map((entry) => names.get(entry.nation_id) ?? `Nation ${entry.nation_id}`)],
        turns.map((turn) => [
            String(turn),
            ...series.map((entry) => {
                const point = points.get(`${entry.nation_id}:${turn}`);
                return point ? `${formatted(point.value, metric.data_unit, i18n)} · rank ${point.rank}` : '—';
            }),
        ]),
    );
}

export class RankingsView {
    constructor({ scope, i18n, loadHistory }) {
        Object.assign(this, { scope, i18n, loadHistory });
        this.historyRequest = 0;
        this.names = new Map();
        this.selectedNationIds = new Set();
        this.currentButton = new Button({
            label: 'Current',
            variant: 'quiet',
            className: 'ranking-tab',
            icon: null,
        });
        this.historyButton = new Button({
            label: 'History',
            variant: 'quiet',
            className: 'ranking-tab',
            icon: null,
        });
        this.retryButton = new Button({ label: 'Retry history', variant: 'secondary' });
        this.currentPanel = el('div', { class: 'ranking-tab-panel', role: 'tabpanel' });
        this.historyPanel = el('div', { class: 'ranking-tab-panel', role: 'tabpanel', hidden: true });
        const tabList = el(
            'div',
            { class: 'ranking-tabs', role: 'tablist', 'aria-label': 'World ranking view' },
            this.currentButton.element,
            this.historyButton.element,
        );
        const id = `rankings-${Math.random().toString(36).slice(2)}`;
        [
            [this.currentButton.element, this.currentPanel, 'current'],
            [this.historyButton.element, this.historyPanel, 'history'],
        ].forEach(([button, target, name]) => {
            button.setAttribute('role', 'tab');
            button.id = `${id}-${name}-tab`;
            target.id = `${id}-${name}-panel`;
            button.setAttribute('aria-controls', target.id);
            target.setAttribute('aria-labelledby', button.id);
        });
        this.element = panel(
            { title: 'World rankings', className: 'game-card rankings-view' },
            tabList,
            this.currentPanel,
            this.historyPanel,
        );
        this.selectTab('current');
        scope.listen(this.currentButton.element, 'click', () => this.selectTab('current'));
        scope.listen(this.historyButton.element, 'click', () => this.selectTab('history'));
        scope.listen(this.retryButton.element, 'click', () => {
            this.loadingContext = null;
            void this.ensureHistory();
        });
        scope.listen(tabList, 'keydown', (event) => {
            const tabs = [this.currentButton.element, this.historyButton.element];
            const index = tabs.indexOf(event.target);
            if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].focus();
            this.selectTab(next ? 'history' : 'current');
        });
    }

    update({ rankings, nations, snapshot, nationColors }) {
        this.rankings = rankings;
        this.names = new Map(nations.map((nation) => [nation.nation_id, nation.usual_name]));
        this.nationColors = nationColors;
        const nextContext = `${snapshot.game_id}:${snapshot.turn_number}`;
        if (nextContext !== this.context) {
            this.context = nextContext;
            this.snapshot = snapshot;
            this.history = null;
            this.historyError = null;
            this.selectedMetric = null;
            this.selectedNationIds.clear();
            this.historyRequest++;
            if (this.activeTab === 'history') void this.ensureHistory();
        } else this.snapshot = snapshot;
        this.currentPanel.replaceChildren(
            el(
                'div',
                { class: 'ranking-current-grid' },
                rankings.map((ranking, index) =>
                    currentChart(
                        { ...ranking, key: metricKey(ranking, index) },
                        this.names,
                        this.nationColors,
                        this.i18n,
                    ),
                ),
            ),
        );
        if (this.history) this.renderHistory();
    }

    selectTab(name) {
        this.activeTab = name;
        const current = name === 'current';
        this.currentButton.element.setAttribute('aria-selected', String(current));
        this.historyButton.element.setAttribute('aria-selected', String(!current));
        this.currentButton.element.tabIndex = current ? 0 : -1;
        this.historyButton.element.tabIndex = current ? -1 : 0;
        this.currentPanel.hidden = !current;
        this.historyPanel.hidden = current;
        if (!current) void this.ensureHistory();
    }

    async ensureHistory() {
        if (!this.snapshot || this.history || this.loadingContext === this.context) return;
        const context = this.context;
        const request = (this.historyRequest ?? 0) + 1;
        this.historyRequest = request;
        this.loadingContext = context;
        this.historyError = null;
        this.historyPanel.setAttribute('aria-busy', 'true');
        this.historyPanel.replaceChildren(
            el('p', { class: 'ranking-empty', text: 'Loading ranking history…' }),
        );
        try {
            const history = await this.loadHistory(this.snapshot);
            if (this.scope.closed || this.context !== context || this.historyRequest !== request) return;
            this.history = history;
            this.selectedMetric ??= history.rankings[0]?.key;
            for (const metric of history.rankings)
                for (const series of metric.series) this.selectedNationIds.add(series.nation_id);
            this.renderHistory();
        } catch (error) {
            if (this.scope.closed || this.context !== context || this.historyRequest !== request) return;
            this.historyError = error;
            this.historyPanel.replaceChildren(
                el('p', {
                    class: 'ranking-history-error',
                    role: 'alert',
                    text: 'Ranking history could not be confirmed. Current rankings remain available.',
                }),
                this.retryButton.element,
            );
        } finally {
            if (this.loadingContext === context) this.loadingContext = null;
            if (!this.scope.closed && this.context === context)
                this.historyPanel.setAttribute('aria-busy', 'false');
        }
    }

    renderHistory() {
        const activeMetric = document.activeElement?.dataset.rankingMetric;
        const activeNation = document.activeElement?.dataset.rankingNation;
        const exactWasOpen = this.historyPanel.querySelector('.ranking-history-data')?.open;
        const exactScroll = this.historyPanel.querySelector(
            '.ranking-history-data .ui-table-scroll',
        )?.scrollTop;
        const metrics = this.history.rankings;
        const metric = metrics.find((entry) => entry.key === this.selectedMetric) ?? metrics[0];
        if (!metric) {
            this.historyPanel.replaceChildren(
                el('p', { class: 'ranking-empty', text: 'No historical observations are available yet.' }),
            );
            return;
        }
        this.selectedMetric = metric.key;
        const metricControls = el('div', { class: 'ranking-metrics', 'aria-label': 'Historical index' });
        metrics.forEach((entry) => {
            const control = new Button({
                label: entry.title,
                variant: 'quiet',
                className: 'ranking-metric',
                icon: null,
            });
            control.element.setAttribute('aria-pressed', String(entry.key === metric.key));
            control.element.addEventListener('click', () => {
                this.selectedMetric = entry.key;
                this.renderHistory();
                this.historyPanel.querySelector(`[data-ranking-metric="${entry.key}"]`)?.focus();
            });
            control.element.dataset.rankingMetric = entry.key;
            metricControls.append(control.element);
        });
        const filters = el(
            'fieldset',
            { class: 'ranking-nation-filters' },
            el('legend', { text: 'Nations shown' }),
        );
        metric.series.forEach((series, index) => {
            const input = el('input', {
                type: 'checkbox',
                checked: this.selectedNationIds.has(series.nation_id),
                'data-ranking-nation': series.nation_id,
            });
            const color = nationPalette(this.nationColors, series.nation_id).paint;
            const sample = el('span', {
                class: 'ranking-line-sample',
                style: `--ranking-color:${color};--ranking-dash:${dashPatterns[index % dashPatterns.length] || 'none'}`,
                'aria-hidden': 'true',
            });
            input.addEventListener('change', () => {
                if (input.checked) this.selectedNationIds.add(series.nation_id);
                else this.selectedNationIds.delete(series.nation_id);
                this.renderHistoryVisual(metric, visual);
            });
            filters.append(
                el(
                    'label',
                    { class: 'ranking-nation-filter' },
                    input,
                    sample,
                    el('span', { text: this.names.get(series.nation_id) ?? `Nation ${series.nation_id}` }),
                ),
            );
        });
        const visual = el('div', { class: 'ranking-history-visual' });
        this.historyPanel.replaceChildren(
            el('p', {
                class: 'ranking-history-summary',
                text: `Recorded through turn ${this.history.through_turn}. Missing observations are shown as gaps, not zero.`,
            }),
            metricControls,
            filters,
            visual,
        );
        this.renderHistoryVisual(metric, visual);
        const exact = this.historyPanel.querySelector('.ranking-history-data');
        if (exact && exactWasOpen) {
            exact.open = true;
            const scroll = exact.querySelector('.ui-table-scroll');
            if (scroll && exactScroll != null) scroll.scrollTop = exactScroll;
        }
        if (activeMetric)
            this.historyPanel.querySelector(`[data-ranking-metric="${activeMetric}"]`)?.focus({
                preventScroll: true,
            });
        else if (activeNation)
            this.historyPanel.querySelector(`[data-ranking-nation="${activeNation}"]`)?.focus({
                preventScroll: true,
            });
    }

    renderHistoryVisual(metric, visual) {
        const exactWasOpen = visual.querySelector('.ranking-history-data')?.open;
        const exactScroll = visual.querySelector('.ranking-history-data .ui-table-scroll')?.scrollTop;
        const exact = el(
            'details',
            { class: 'ranking-history-data' },
            el('summary', { text: 'View exact historical data' }),
            historyTable(metric, this.selectedNationIds, this.names, this.i18n),
        );
        visual.replaceChildren(
            lineChart(
                metric,
                this.selectedNationIds,
                this.names,
                this.nationColors,
                this.history.through_turn,
                this.i18n,
            ),
            exact,
        );
        if (exactWasOpen) {
            exact.open = true;
            const scroll = exact.querySelector('.ui-table-scroll');
            if (scroll && exactScroll != null) scroll.scrollTop = exactScroll;
        }
    }
}
