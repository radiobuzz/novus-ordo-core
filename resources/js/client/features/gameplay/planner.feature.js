import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { resourceIcon, resourceName } from '../../ui/resourceVisuals.js';
import { MetricTable } from './MetricTable.js';
import { acquisitionPlan } from '../../services/production.js';

class ProductionPlanner extends Component {
    render() {
        this.snapshot = this.services.world.snapshot;
        this.rows = new Map();
        this.generation = 0;
        this.t = (key) => this.services.i18n.t(`planner.${key}`);
        this.hint = el('p', { class: 'planner-caption' });
        this.food = el('p', { class: 'planner-caption', 'data-food-plan': '' });
        this.resources = el('div', { class: 'planner-resources' });
        this.status = el('p', { role: 'status' });
        this.apply = new Button({ type: 'submit', variant: 'primary' });
        this.reset = new Button();
        this.refresh = new Button({ icon: 'refresh' });
        this.review = new Button();
        this.form = el(
            'form',
            { class: 'production-planner' },
            this.hint,
            this.food,
            this.resources,
            this.status,
            el(
                'footer',
                { class: 'ui-panel-actions' },
                this.refresh.element,
                this.review.element,
                this.reset.element,
                this.apply.element,
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
        this.services.gameplay.economicDraftChanged.subscribe(this.scope, () => this.schedule());
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
        const icon = resourceIcon(
            this.snapshot.nation.definitions.resources.find((r) => r.resource_key === key)?.icon_key,
        );
        const card = el(
            'section',
            { class: 'planner-row', 'data-production-resource': key },
            el('header', {}, icon ? el('img', { src: icon, width: 24, height: 24, alt: '' }) : null, name),
            q.element,
            p.element,
            order.element,
            forecast,
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
        const comparison = new MetricTable();
        const current = el('p', { class: 'planner-current' });
        const reasons = el('p', { class: 'planner-caption' });
        const help = el('p', { class: 'planner-caption' });
        const progress = el('p', { class: 'planner-preview-status', role: 'status' });
        forecast.append(
            current,
            el('div', { class: 'game-table-scroll' }, comparison.element),
            reasons,
            help,
        );
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
        };
        this.rows.set(key, row);
        return row;
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
            this.valid = true;
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
            ['publicDelivery', (r) => r.public_delivery],
            ['privateDelivery', (r) => r.private_delivery],
            ['purchaseCost', (r) => r.purchase_spending],
            ['deliveryCost', (r) => r.public_delivery_cost],
            ['unmetDemand', (r) => r.acquisition_unmet],
            ['closingStock', (r) => r.government_closing],
            ['publicDevelopment', (r) => r.development.government],
            ['privateDevelopment', (r) => r.development.producer],
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
        const reasons = r.acquisition.constraints.map((c) => this.t(`constraint_${c}`));
        row.current.textContent = `${this.t('governmentStock')}: ${format(r.opening)} · ${this.t('committed')}: ${format(r.commands)} · ${this.t('available')}: ${format(r.available)}`;
        row.reasons.textContent = `${this.t('constraints')}: ${reasons.length ? reasons.join(' · ') : this.t('noConstraints')}`;
        row.help.textContent = this.t('costHelp');
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
