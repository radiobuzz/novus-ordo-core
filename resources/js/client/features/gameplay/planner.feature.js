import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { RangeField } from '../../ui/RangeField.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { CompactMessage } from '../../ui/CompactMessage.js';
import { resourceIcon } from '../../ui/resourceVisuals.js';
import {
    productionPlanBids,
    productionPlanPreview,
    productionProductivity,
} from '../../services/production.js';

class ProductionPlanner extends Component {
    render() {
        this.snapshot = this.services.world.snapshot;
        this.t = (key, params) => this.services.i18n.t(`planner.${key}`, params);
        this.number = (value) => this.services.i18n.number(value, { maximumFractionDigits: 3 });
        this.rows = new Map();
        this.metrics = new Map();
        this.help = new Tooltip({ scope: this.scope });
        this.context = el('span');
        const overview = el('dl', { class: 'planner-overview' });
        for (const key of ['workforce', 'automatic', 'discretionary', 'demand', 'capital']) {
            const label = el('dt'),
                value = el('dd');
            this.metrics.set(key, { label, value });
            overview.append(el('div', { 'data-planner-metric': key }, label, value));
        }
        this.hint = el('span');
        this.resources = el('div', { class: 'planner-resources' });
        this.materialSummary = el('summary');
        this.material = el('details', { class: 'planner-secondary' }, this.materialSummary);
        this.advancedSummary = el('summary');
        this.advanced = el('details', { class: 'planner-advanced' }, this.advancedSummary);
        this.breakdownSummary = el('summary');
        this.breakdownBody = el('tbody');
        this.breakdownHead = el('thead');
        this.breakdown = el(
            'details',
            { class: 'planner-breakdown' },
            this.breakdownSummary,
            el(
                'div',
                { class: 'game-table-scroll', tabindex: 0 },
                el('table', { class: 'game-table' }, this.breakdownHead, this.breakdownBody),
            ),
        );
        this.scope.listen(this.breakdown, 'toggle', () => this.updateBreakdown());
        this.warning = new CompactMessage(this.scope);
        this.status = new CompactMessage(this.scope);
        this.apply = new Button({ type: 'submit', variant: 'primary', icon: 'save' });
        this.reset = new Button({ icon: 'reset' });
        this.refresh = new Button({ icon: 'refresh' });
        this.review = new Button({ variant: 'quiet' });
        this.form = el(
            'form',
            { class: 'production-planner', novalidate: true },
            el('div', { class: 'planner-context' }, this.context, this.help.element),
            overview,
            el('p', { class: 'planner-caption' }, this.hint),
            this.resources,
            this.material,
            this.advanced,
            this.breakdown,
            this.warning.element,
            el(
                'footer',
                { class: 'planner-footer' },
                this.status.element,
                el(
                    'div',
                    { class: 'ui-panel-actions' },
                    this.refresh.element,
                    this.review.element,
                    this.reset.element,
                    this.apply.element,
                ),
            ),
        );
        this.element.append(this.form);
        this.scope.listen(this.form, 'submit', (event) => {
            event.preventDefault();
            void this.submit();
        });
        this.scope.listen(this.reset.element, 'click', () => {
            if (!this.snapshot || this.services.gameplay.busy) return;
            const drafts = this.services.gameplay.drafts(this.snapshot);
            for (const resource of this.rows.keys()) delete drafts[resource];
            this.update();
        });
        this.scope.listen(this.refresh.element, 'click', () => void this.services.world.refresh());
        this.scope.listen(this.review.element, 'click', () => this.services.gameplay.acknowledgeOutcome());
        this.services.world.store.subscribe(this.scope, (state) => {
            if (!state.snapshot?.nation || !this.services.world.sameScope(this.snapshot, state.snapshot)) {
                void this.services.closeProductionPlanner();
                return;
            }
            if (!this.services.world.same(this.snapshot, state.snapshot)) this.contextChanged = true;
            this.snapshot = state.snapshot;
            this.update();
        });
        this.services.gameplay.changed.subscribe(this.scope, () => this.update());
        this.services.i18n.changed.subscribe(this.scope, () => this.update());
    }
    createRow(resource) {
        const name = el('h3'),
            current = el('span'),
            forecast = el('strong'),
            balance = el('strong'),
            labor = el('span');
        const productionLabel = el('span'),
            balanceLabel = el('span'),
            laborLabel = el('span');
        const quantity = new RangeField({
            scope: this.scope,
            label: '',
            value: 0,
            min: 0,
            max: 10,
            step: 0.01,
            helpLabel: this.services.i18n.t('common.help'),
            onChange: () => this.remember(resource),
        });
        const productivity = new RangeField({
            scope: this.scope,
            label: '',
            value: 0,
            min: 0,
            max: 4,
            step: 0.1,
            helpLabel: this.services.i18n.t('common.help'),
            onChange: () => this.remember(resource),
        });
        const warning = new CompactMessage(this.scope);
        const card = el(
            'section',
            { class: 'planner-row', 'data-production-resource': resource },
            el(
                'header',
                {},
                el('img', { src: resourceIcon(resource), alt: '', width: 24, height: 24 }),
                name,
            ),
            el('div', { class: 'planner-figure' }, productionLabel, el('div', {}, current, ' → ', forecast)),
            quantity.element,
            el('div', { class: 'planner-figure' }, laborLabel, labor),
            el('div', { class: 'planner-figure' }, balanceLabel, balance),
            warning.element,
        );
        (resource === 'Material' ? this.material : this.resources).append(card);
        this.advanced.append(productivity.element);
        const row = {
            card,
            name,
            current,
            forecast,
            balance,
            labor,
            quantity,
            productivity,
            productionLabel,
            balanceLabel,
            laborLabel,
            warning,
        };
        this.rows.set(resource, row);
        return row;
    }
    remember(resource) {
        const row = this.rows.get(resource);
        this.services.gameplay.drafts(this.snapshot)[resource] = {
            quantity: row.quantity.input.value,
            productivity: row.productivity.input.value,
        };
        this.preview();
    }
    update() {
        if (this.scope.closed || !this.snapshot?.nation) return;
        const data = this.snapshot.nation,
            drafts = this.services.gameplay.drafts(this.snapshot);
        const unit = data.definitions.labor_per_unit;
        this.context.textContent = this.t('context', { turn: this.snapshot.turn_number });
        this.help.setText(this.t('help'));
        this.help.setLabel(this.services.i18n.t('common.helpFor', { name: this.t('title') }));
        this.hint.textContent = this.t('hint');
        this.advancedSummary.textContent = this.t('advanced');
        this.breakdownSummary.textContent = this.t('territories');
        this.materialSummary.textContent = this.t('materials', {
            value: this.number(
                Number(
                    drafts.Material?.quantity ??
                        (data.bids.find((bid) => bid.resource_type === 'Material')?.max_quantity ?? 0) / unit,
                ),
            ),
        });
        this.apply.setLabel(this.t('apply'));
        this.reset.setLabel(this.t('reset'));
        this.refresh.setLabel(this.services.i18n.t('common.retry'));
        this.review.setLabel(this.t('review'));
        for (const resource of [...data.definitions.bid_resources].sort(
            (a, b) => (a === 'Material') - (b === 'Material'),
        )) {
            const row = this.rows.get(resource) ?? this.createRow(resource);
            const name = this.services.i18n.t(`command.resource.${resource}`);
            const bid = data.bids.find((candidate) => candidate.resource_type === resource);
            const quantity = drafts[resource]?.quantity ?? (bid?.max_quantity ?? 0) / unit;
            const productivity =
                drafts[resource]?.productivity ?? productionProductivity(bid, data.definitions);
            const facilities =
                data.production_planning?.facilities.filter((f) => f.resource_type === resource) ?? [];
            const ceiling = facilities.reduce((sum, f) => sum + (f.capacity * f.productivity) / unit, 0);
            row.name.textContent = name;
            row.productionLabel.textContent = this.t('production');
            row.balanceLabel.textContent = this.t('net');
            row.laborLabel.textContent = this.t('labor');
            row.quantity.setLabel(this.t('target', { resource: name }), this.t('slider', { resource: name }));
            row.quantity.setBounds({
                min: 0,
                max: Math.max(1, Math.ceil(ceiling), Number(quantity) || 0),
                step: 0.01,
                help: this.t('targetHelp'),
            });
            row.quantity.input.max = Number.MAX_SAFE_INTEGER / unit;
            row.quantity.input.step = 'any';
            row.productivity.setLabel(this.t('cutoff', { resource: name }));
            row.productivity.setBounds({
                min: 0,
                max: Math.max(4, ...facilities.map((f) => f.productivity), Number(productivity) || 0),
                step: 0.1,
                help: this.t('cutoffHelp'),
            });
            row.productivity.input.step = 'any';
            // Setting the same input value can disturb a caret; ordinary refreshes leave it alone.
            if (row.quantity.input.value !== String(quantity)) row.quantity.setValue(quantity);
            if (row.productivity.input.value !== String(productivity))
                row.productivity.setValue(productivity);
            row.current.textContent = this.number(data.budget.production[resource]);
        }
        this.preview();
    }
    preview() {
        const { gameplay, world } = this.services,
            data = this.snapshot.nation,
            unit = data.definitions.labor_per_unit;
        this.valid = [...this.rows.values()].every(
            (row) => row.quantity.input.validity.valid && row.productivity.input.validity.valid,
        );
        try {
            this.bids = productionPlanBids(data, gameplay.drafts(this.snapshot));
            this.plan = this.valid ? productionPlanPreview(data, this.bids) : null;
        } catch {
            this.valid = false;
            this.plan = null;
        }
        const plan = this.plan;
        const materialBid = this.bids?.find((bid) => bid.resource_type === 'Material');
        this.materialSummary.textContent = this.t('materials', {
            value: materialBid ? this.number(materialBid.max_quantity / unit) : '—',
        });
        const values = plan && {
            workforce: plan.total,
            automatic: plan.automatic + plan.reserved,
            discretionary: plan.discretionary,
            demand: plan.requested,
            capital: plan.rows.Capital.balance,
        };
        for (const [key, metric] of this.metrics) {
            metric.label.textContent = this.t(key);
            metric.value.textContent = values ? this.number(values[key] / unit) : '—';
            metric.value.dataset.tone =
                plan &&
                ((key === 'capital' && values.capital < 0) ||
                    (key === 'demand' && plan.requested > plan.discretionary))
                    ? 'warning'
                    : '';
        }
        for (const [resource, row] of this.rows) {
            const estimate = plan?.rows[resource];
            row.forecast.textContent = estimate ? this.number(estimate.production / unit) : '—';
            row.balance.textContent = estimate ? this.number(estimate.balance / unit) : '—';
            row.labor.textContent = estimate ? this.number(estimate.labor / unit) : '—';
            row.balance.dataset.tone = estimate?.balance < 0 ? 'warning' : 'ready';
            row.warning.show(
                estimate?.shortfall > 1
                    ? this.t('shortfall', { value: this.number(estimate.shortfall / unit) })
                    : '',
                this.t('shortfallHelp'),
            );
        }
        const short = !this.valid
            ? 'invalid'
            : !plan
              ? 'unavailable'
              : !world.current
                ? 'stale'
                : this.contextChanged
                  ? 'newTurn'
                  : plan.usesReserves
                    ? 'reserves'
                    : '';
        this.warning.show(short ? this.t(short) : '');
        const isPlanOutcome = gameplay.lastCommand === 'applyProductionPlan' || gameplay.needsReview;
        this.status.show(isPlanOutcome ? gameplay.notice : '');
        this.apply.setPending(gameplay.busy);
        this.apply.setDisabled(!world.current || gameplay.needsReview || !this.valid || !plan);
        this.reset.setDisabled(gameplay.busy);
        this.refresh.element.hidden = world.current && Boolean(plan || !this.valid);
        this.refresh.setDisabled(gameplay.busy);
        this.review.element.hidden = !gameplay.needsReview;
        this.review.setDisabled(!world.current || gameplay.busy);
        this.updateBreakdown();
    }
    updateBreakdown() {
        if (!this.breakdown.open || !this.plan) return;
        this.breakdownHead.replaceChildren(
            el(
                'tr',
                {},
                ['territory', 'resource', 'productivity', 'labor', 'output'].map((key) =>
                    el('th', { scope: 'col', text: this.t(key) }),
                ),
            ),
        );
        this.breakdownBody.replaceChildren(
            ...this.plan.facilities.map((f) =>
                el(
                    'tr',
                    {},
                    [
                        this.snapshot.territories.find((t) => t.territory_id === f.territory_id)?.name ??
                            `#${f.territory_id}`,
                        this.services.i18n.t(`command.resource.${f.resource_type}`),
                        this.number(f.productivity),
                        this.number(f.allocation / this.snapshot.nation.definitions.labor_per_unit),
                        this.number(
                            (f.allocation * f.productivity) / this.snapshot.nation.definitions.labor_per_unit,
                        ),
                    ].map((text) => el('td', { text })),
                ),
            ),
        );
    }
    async submit() {
        if (!this.valid || !this.plan || !this.services.world.current || this.services.gameplay.busy) return;
        this.contextChanged = false;
        try {
            await this.services.gameplay.command('applyProductionPlan', { bids: this.bids }, this.snapshot);
        } catch {
            /* Service owns rejection/uncertainty, draft retention and reconciliation. */
        }
    }
}

export function createInstance(options) {
    return new ProductionPlanner(options);
}
