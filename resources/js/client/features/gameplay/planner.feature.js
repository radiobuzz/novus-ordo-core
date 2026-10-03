import { EconomicHistoryView } from './EconomicHistoryView.js';
import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { Tabs } from '../../ui/Tabs.js';
import { resourceIcon, resourceName, productionConstraint } from '../../ui/resourceVisuals.js';
import { MetricTable } from './MetricTable.js';
import {
    acquisitionPlan,
    publicInvestmentControl,
    publicInvestmentAllowed,
} from '../../services/production.js';

class ProductionPlanner extends Component {
    render() {
        this.snapshot = this.services.world.snapshot;
        this.rows = new Map();
        this.generation = 0;
        this.t = (key) => this.services.i18n.t(`planner.${key}`);
        this.hint = el('p', { class: 'planner-caption' });
        this.food = el('p', { class: 'planner-caption', 'data-food-plan': '' });
        this.resources = el('div', { class: 'planner-resources' });
        this.tabs = new Tabs(this.scope);
        this.budget = el('p', { class: 'planner-budget' });
        this.status = el('p', { role: 'status' });
        this.apply = new Button({ type: 'submit', variant: 'primary' });
        this.reset = new Button();
        this.refresh = new Button({ icon: 'refresh' });
        this.review = new Button();
        this.form = el(
            'form',
            { class: 'production-planner' },
            this.hint,
            this.tabs.element,
            el('div', { class: 'planner-scroll' }, this.resources, this.food),
            el(
                'footer',
                { class: 'planner-footer' },
                this.budget,
                this.status,
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
        this.scope.own(() => {
            clearTimeout(this.timer);
            this.request?.abort();
            this.generation++;
        });
        this.scope.listen(this.form, 'submit', (event) => {
            event.preventDefault();
            void this.submit();
        });
        this.scope.listen(this.reset.element, 'click', () => {
            const drafts = this.services.gameplay.drafts(this.snapshot);
            for (const key of this.rows.keys()) delete drafts[key];
            const policyDraft = this.services.gameplay.policyDraft(this.snapshot);
            policyDraft.changes = null;
            policyDraft.base = null;
            this.services.gameplay.notifyEconomicDraft();
            this.update();
        });
        this.scope.listen(this.refresh.element, 'click', () => void this.services.world.refresh());
        this.scope.listen(this.review.element, 'click', () => this.services.gameplay.acknowledgeOutcome());
        this.services.world.store.subscribe(this.scope, (state) => {
            if (!state.snapshot?.nation || !this.services.world.sameScope(this.snapshot, state.snapshot)) {
                void this.services.closeProductionPlanner();
                return;
            }
            this.snapshot = state.snapshot;
            this.update();
        });
        this.services.gameplay.economicDraftChanged.subscribe(this.scope, () => {
            this.syncInvestment();
            this.schedule();
        });
        this.services.gameplay.changed.subscribe(this.scope, () => this.controls());
        this.services.i18n.changed.subscribe(this.scope, () => this.update());
    }
    createRow(key) {
        const quantity = el('input', {
            type: 'text',
            inputmode: 'decimal',
            required: true,
            pattern: '[0-9]{1,14}(\\.[0-9]{1,6})?',
        });
        const spending_limit = quantity.cloneNode();
        const priority = el('input', { type: 'number', min: 0, max: 2147483647, step: 1, required: true });
        const name = el('h3'),
            forecast = el('div', { class: 'planner-comparison' });
        const q = new FieldShell({ control: quantity, label: '' });
        const p = new FieldShell({ control: spending_limit, label: '' });
        const order = new FieldShell({ control: priority, label: '' });
        const investment = el('input', {
            type: 'number',
            min: 0,
            max: 100,
            step: 1,
            required: true,
            'data-public-investment': key,
        });
        const investmentField = new FieldShell({ control: investment, label: '' });
        const investmentHelp = el('p', { class: 'planner-caption' });
        const investmentStatus = el('p', { class: 'planner-caption', 'data-public-investment-status': key });
        const investmentSection = el(
            'div',
            { class: 'planner-investment' },
            investmentField.element,
            investmentHelp,
            investmentStatus,
        );
        const icon = resourceIcon(
            this.snapshot.nation.definitions.resources.find((r) => r.resource_key === key)?.icon_key,
        );
        const historyHost = el(
            'details',
            { class: 'planner-history' },
            el('summary', { text: this.services.i18n.t('history.industryReport') }),
        );
        let historyView;
        this.scope.listen(historyHost, 'toggle', () => {
            if (!historyHost.open) return;
            if (!historyView) {
                historyView = new EconomicHistoryView(this.scope, this.services, {
                    resource: key,
                    compact: true,
                });
                historyHost.append(historyView.element);
            }
            historyView.update(this.snapshot);
        });
        this.services.world.store.subscribe(this.scope, (state) => {
            if (
                historyView &&
                state.snapshot?.nation &&
                this.services.world.sameScope(this.snapshot, state.snapshot)
            )
                historyView.update(state.snapshot, { load: historyHost.open });
        });
        const card = el(
            'section',
            { class: 'planner-row', 'data-production-resource': key },
            el('header', {}, icon ? el('img', { src: icon, width: 24, height: 24, alt: '' }) : null, name),
            q.element,
            p.element,
            order.element,
            investmentSection,
            forecast,
            historyHost,
        );
        for (const input of [quantity, spending_limit, priority])
            this.scope.listen(input, 'input', () => {
                this.services.gameplay.drafts(this.snapshot)[key] = {
                    quantity: quantity.value,
                    spending_limit: spending_limit.value,
                    priority: priority.value,
                };
                this.services.gameplay.notifyEconomicDraft();
            });
        this.resources.append(card);
        this.scope.listen(investment, 'input', () => {
            const control = publicInvestmentControl(
                this.snapshot.nation,
                key,
                this.services.gameplay.policyDraft(this.snapshot).changes,
            );
            if (!control) return;
            try {
                this.services.gameplay.setPolicyParameter(
                    this.snapshot,
                    control.policy,
                    control.parameter.key,
                    investment.value === ''
                        ? ''
                        : String(Number((Number(investment.value) / 100).toFixed(6))),
                );
            } catch (error) {
                this.error = error.message;
                this.controls();
            }
        });
        const comparison = new MetricTable();
        const current = el('p', { class: 'planner-current' });
        const reasons = el('p', { class: 'planner-caption' });
        const help = el('p', { class: 'planner-caption' });
        const progress = el('p', { class: 'planner-preview-status', role: 'status' });
        const summary = el('summary');
        const detail = el(
            'details',
            { class: 'planner-details' },
            summary,
            el('div', { class: 'game-table-scroll', tabindex: 0 }, comparison.element),
            help,
        );
        const outlook = el('p', { class: 'planner-outlook' });
        forecast.append(current, outlook, reasons, detail);
        card.insertBefore(progress, forecast);
        const row = {
            card,
            name,
            quantity,
            spending_limit,
            q,
            p,
            priority,
            order,
            forecast,
            comparison,
            current,
            reasons,
            help,
            progress,
            summary,
            detail,
            outlook,
            investment,
            investmentField,
            investmentHelp,
            investmentSection,
            investmentStatus,
        };
        this.rows.set(key, row);
        return row;
    }
    syncInvestment() {
        const draft = this.services.gameplay.policyDraft(this.snapshot);
        const allowed = publicInvestmentAllowed(this.snapshot.nation.policies, draft.changes);
        for (const [key, row] of this.rows) {
            const control = publicInvestmentControl(this.snapshot.nation, key, draft.changes);
            row.investmentControl = control;
            row.investmentSection.hidden = !control;
            row.investment.disabled = !control;
            row.investmentInactiveInvalid = false;
            if (!control) continue;
            row.investmentField.label.textContent = this.t('publicInvestment');
            row.investmentHelp.textContent = allowed
                ? this.t('publicInvestmentHelp')
                : this.services.i18n.t('economy.publicInvestmentInactive');
            row.investment.min = String(Number(control.parameter.min_value ?? 0) * 100);
            row.investment.max = String(Number(control.parameter.max_value ?? 1) * 100);
            row.investment.step = String(Number(control.parameter.step ?? 0.01) * 100);
            const value = control.value === '' ? '' : String(Number(control.value) * 100);
            if (document.activeElement !== row.investment && row.investment.value !== value)
                row.investment.value = value;
            row.investment.disabled = false;
            row.investmentInactiveInvalid = !allowed && !row.investment.validity.valid;
            row.investment.disabled = !allowed;
        }
    }
    update() {
        if (this.scope.closed || !this.snapshot?.nation) return;
        const data = this.snapshot.nation,
            drafts = this.services.gameplay.drafts(this.snapshot);
        this.hint.textContent = this.t('resourceHint');
        this.apply.setLabel(this.t('apply'));
        this.reset.setLabel(this.t('reset'));
        this.refresh.setLabel(this.services.i18n.t('common.refresh'));
        this.review.setLabel(this.t('review'));
        this.tabs.setLabel(this.t('resources'));
        for (const [key, row] of this.rows)
            if (!data.definitions.acquisition_resources.includes(key)) {
                row.card.remove();
                this.rows.delete(key);
            }
        for (const key of data.definitions.acquisition_resources) {
            const row = this.rows.get(key) ?? this.createRow(key),
                saved = data.acquisitions.find((b) => b.resource_key === key);
            const meta = data.definitions.resources.find((r) => r.resource_key === key);
            const units = meta?.unit_labels?.[this.services.i18n.locale] ?? meta?.unit_labels?.en;
            row.name.textContent = resourceName(data, key, this.services.i18n) + (units ? ` · ${units}` : '');
            row.q.label.textContent = this.t('requestedQuantity');
            row.p.label.textContent = this.t('spendingLimit');
            row.order.label.textContent = this.t('priority');
            row.priority.title = this.t('priorityHelp');
            row.summary.textContent = this.t('accountingDetails');
            const priority = String(drafts[key]?.priority ?? saved?.priority ?? 100);
            if (row.priority.value !== priority) row.priority.value = priority;
            const quantity = drafts[key]?.quantity ?? saved?.quantity ?? '0';
            const spending_limit = drafts[key]?.spending_limit ?? saved?.spending_limit ?? '0';
            if (row.quantity.value !== quantity) row.quantity.value = quantity;
            if (row.spending_limit.value !== spending_limit) row.spending_limit.value = spending_limit;
        }
        const context = this.services.gameplay.policyDraft(this.snapshot).key;
        if (context !== this.forecastContext) {
            this.forecastContext = context;
            this.displayPlan = null;
        }
        for (const [key, row] of this.rows) this.renderForecast(key, row, this.displayPlan);
        this.syncInvestment();
        this.schedule();
    }
    schedule() {
        clearTimeout(this.timer);
        this.request?.abort();
        this.generation++;
        this.plan = null;
        if (!this.displayPlan) this.food.textContent = this.t('foodPolicyManaged');
        try {
            this.acquisitions = acquisitionPlan(
                this.snapshot.nation,
                this.services.gameplay.drafts(this.snapshot),
            );
            this.valid = [...this.rows.values()].every(
                (row) =>
                    !row.investmentControl ||
                    (!row.investmentInactiveInvalid && row.investment.validity.valid),
            );
        } catch {
            this.valid = false;
        }
        this.error = '';
        this.controls();
        if (this.valid && this.services.world.current)
            this.timer = setTimeout(() => void this.preview(), 300);
    }
    async preview() {
        const generation = this.generation,
            snapshot = this.snapshot;
        this.request = new AbortController();
        try {
            const result = await this.services.gameplay.previewProduction(
                snapshot,
                this.acquisitions,
                this.request.signal,
            );
            if (generation !== this.generation || this.scope.closed) return;
            this.plan = result;
            this.displayPlan = result;
            const food = result.rows[this.snapshot.nation.definitions.roles.nutrition];
            const nutrition = food.acquisition;
            const formatFood = (v) => this.services.i18n.number(Number(v), { maximumFractionDigits: 2 });
            this.food.textContent = `${this.t('foodPolicyManaged')} ${this.t('output')}: ${formatFood(food.production)} · ${this.t('closingStock')}: ${formatFood(food.closing)} · ${this.t('foodReserveTarget')}: ${formatFood(nutrition.reserve_target)} · ${this.t('unmetDemand')}: ${formatFood(nutrition.civilian.unmet)}`;
            for (const [key, row] of this.rows) this.renderForecast(key, row, result);
        } catch (error) {
            if (generation === this.generation && !this.scope.closed && error.name !== 'AbortError')
                this.error = error.message;
        }
        if (generation === this.generation && !this.scope.closed) this.controls();
    }
    renderForecast(key, row, result) {
        const saved = this.snapshot.nation.production_planning;
        const sources = [
            saved.last_resources?.[key],
            saved.rows[key]?.acquisition,
            result?.rows[key]?.acquisition,
        ];
        const format = (value) =>
            value == null ? '—' : this.services.i18n.number(Number(value), { maximumFractionDigits: 3 });
        const fields = [
            ['effectiveRequest', (r) => r.acquisition_requested],
            ['referencePrice', (r) => r.price],
            ['publicOutput', (r) => r.production.government],
            ['privateOutput', (r) => r.production.producer],
            ['industryRequested', (r) => r.public_industry_requested],
            ['industryDelivery', (r) => r.public_industry_delivery],
            ['industryRevenue', (r) => r.public_industry_revenue],
            ['publicDelivery', (r) => r.public_delivery],
            ['privateDelivery', (r) => r.private_delivery],
            ['purchaseCost', (r) => r.purchase_spending],
            ['deliveryCost', (r) => r.public_delivery_cost],
            ['unmetDemand', (r) => r.acquisition_unmet],
            ['closingStock', (r) => r.government_closing],
            ['publicDevelopment', (r) => r.development.government],
            ['privateDevelopment', (r) => r.development.producer],
            ['publicDevelopmentBudget', (r) => r.development_budget],
        ];
        row.comparison.update(
            ['metric', 'lastActual', 'savedEstimate', 'draftEstimate'].map((k) => this.t(k)),
            fields.map(([key, value]) => ({
                key,
                label: this.t(key),
                values: sources.map((r) => {
                    const amount = r ? value(r) : null;
                    return {
                        text: format(amount),
                        tone: key === 'unmetDemand' && Number(amount) > 0 ? 'danger' : 'neutral',
                    };
                }),
            })),
        );
        const r = (result ?? saved).rows[key];
        row.investmentStatus.textContent =
            r.acquisition.public_development_permitted === false
                ? this.t('publicInvestmentBlocked')
                : r.acquisition.public_development_available != null &&
                    Number(r.acquisition.public_development_available) === 0
                  ? this.t('publicInvestmentNoCapacity')
                  : '';
        const reasons = r.acquisition.constraints.map((c) =>
            productionConstraint(this.snapshot.nation, c, this.services.i18n),
        );
        row.current.textContent = `${this.t('governmentStock')}: ${format(r.opening)} · ${this.t('committed')}: ${format(r.commands)} · ${this.t('available')}: ${format(r.available)}`;
        row.reasons.textContent = `${this.t('constraints')}: ${reasons.length ? reasons.join(' · ') : this.t('noConstraints')}`;
        row.help.textContent = this.t('costHelp');
        row.outlook.textContent = `${this.t(result ? 'draftEstimate' : 'savedEstimate')} · ${this.t('closingStock')}: ${format(r.acquisition.government_closing)} · ${this.t('unmetDemand')}: ${format(r.acquisition.acquisition_unmet)}`;
    }
    updateTabs() {
        const data = this.snapshot.nation;
        const drafts = this.services.gameplay.drafts(this.snapshot);
        // Compare exact decimal text without losing precision to Number conversion.
        const canonical = (value) =>
            String(value)
                .replace(/^0+(?=\d)/, '')
                .replace(/(\.\d*?)0+$/, '$1')
                .replace(/\.$/, '');
        this.tabs.setItems(
            data.definitions.acquisition_resources.map((key) => {
                const row = this.rows.get(key);
                const saved = data.acquisitions.find((r) => r.resource_key === key);
                const draft = drafts[key];
                const investmentDirty =
                    row.investmentControl &&
                    Object.hasOwn(
                        this.services.gameplay.policyDraft(this.snapshot).changes ?? {},
                        row.investmentControl.policy,
                    );
                const dirty =
                    investmentDirty ||
                    (draft &&
                        ['quantity', 'spending_limit', 'priority'].some(
                            (field) =>
                                canonical(draft[field]) !==
                                canonical(saved?.[field] ?? (field === 'priority' ? 100 : '0')),
                        ));
                const invalid =
                    row.investmentInactiveInvalid ||
                    !/^\d+$/.test(row.priority.value) ||
                    [row.quantity, row.spending_limit, row.priority, row.investment].some(
                        (input) => !input.disabled && !input.validity.valid,
                    );
                // Only a current valid preview can classify the proposed order as short.
                const short = Number(this.plan?.rows[key]?.acquisition.acquisition_unmet) > 0;
                const labels = [
                    invalid ? this.t('invalidResource') : short ? this.t('orderShortfall') : '',
                    dirty ? this.t('unsaved') : '',
                ].filter(Boolean);
                return {
                    key,
                    panel: row.card,
                    label: resourceName(data, key, this.services.i18n),
                    icon: resourceIcon(
                        data.definitions.resources.find((r) => r.resource_key === key)?.icon_key,
                    ),
                    iconOnly: true,
                    badge: labels.length
                        ? {
                              text: invalid || short ? '!' : '•',
                              tone: invalid ? 'danger' : short ? 'warning' : 'accent',
                              label: labels.join(' · '),
                          }
                        : null,
                };
            }),
        );
    }
    controls() {
        if (this.scope.closed) return;
        const { gameplay, world } = this.services;
        this.apply.setPending(gameplay.busy);
        this.apply.setDisabled(!world.current || gameplay.needsReview || !this.valid || !this.plan);
        this.reset.setDisabled(gameplay.busy);
        this.refresh.setDisabled(gameplay.busy);
        this.review.element.hidden = !gameplay.needsReview;
        this.review.setDisabled(!world.current || gameplay.busy);
        this.updateTabs();
        const report = this.plan?.forecast?.expected;
        const format = (value) =>
            value == null ? '—' : this.services.i18n.number(Number(value), { maximumFractionDigits: 3 });
        this.budget.textContent = `${this.t('wholePlan')} · ${this.t('totalSpending')}: ${format(report?.treasury_outflows)} · ${this.t('treasuryAfter')}: ${format(report?.closing_treasury)}`;
        for (const row of this.rows.values()) {
            row.forecast.setAttribute(
                'aria-busy',
                String(!this.plan && this.valid && !this.error && world.current),
            );
            row.progress.textContent = this.plan
                ? ''
                : this.displayPlan
                  ? this.t('previousEstimate')
                  : this.t('calculating');
            row.progress.dataset.tone = this.error || !this.valid || !world.current ? 'danger' : 'warning';
        }
        this.status.textContent =
            this.error ||
            (!this.valid
                ? this.t('invalid')
                : !world.current
                  ? this.t('stale')
                  : !this.plan
                    ? this.t('calculating')
                    : gameplay.lastCommand === 'applyProductionPlan'
                      ? gameplay.notice
                      : '');
    }
    async submit() {
        if (!this.valid || !this.plan || !this.services.world.current || this.services.gameplay.busy) return;
        try {
            await this.services.gameplay.command(
                'applyProductionPlan',
                { acquisitions: this.acquisitions },
                this.snapshot,
            );
        } catch {
            /* GameplayService retains rejected drafts and reconciles accepted commands. */
        }
    }
}
export function createInstance(options) {
    return new ProductionPlanner(options);
}
