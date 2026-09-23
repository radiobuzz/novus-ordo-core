import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { RangeField } from '../../ui/RangeField.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { CompactMessage } from '../../ui/CompactMessage.js';
import { resourceIcon } from '../../ui/resourceVisuals.js';
import { productionBid } from '../../services/movement.js';
import { productionPreview, productionProductivity } from '../../services/production.js';
import './production.scss';

/** Persistent production editor shared by the map dock and Economy workspace. */
export class ProductionPanel {
    constructor(scope, services, snapshot, territoryId = null) {
        Object.assign(this, { scope, services, snapshot, territoryId });
        this.t = (key, params) => services.i18n.t(`production.${key}`, params);
        this.number = (n) => services.i18n.number(n, { maximumFractionDigits: 3 });
        this.rows = new Map();
        this.title = el('h3');
        this.help = new Tooltip({ scope });
        this.labor = el('p');
        this.territory = el('div', { class: 'production-territory' });
        this.cards = el('div', { class: 'production-cards' });
        this.status = new CompactMessage(scope);
        this.element = el(
            'section',
            { class: 'production-panel' },
            el('div', { class: 'ui-help-heading' }, this.title, this.help.element),
            this.labor,
            this.territory,
            this.cards,
            this.status.element,
        );
        services.world.store.subscribe(scope, (state) => {
            if (state.snapshot && services.world.sameScope(this.snapshot, state.snapshot)) {
                const changed =
                    !this.rows.size ||
                    !services.world.same(this.snapshot, state.snapshot) ||
                    this.snapshot.nation !== state.snapshot.nation ||
                    this.snapshot.territories !== state.snapshot.territories;
                this.snapshot = state.snapshot;
                if (changed) this.update();
                else this.updateBusy();
            } else if (!state.snapshot) {
                this.snapshot = null;
                this.cards.replaceChildren();
                this.rows.clear();
            }
        });
        services.gameplay.changed.subscribe(scope, () => this.update());
        services.i18n.changed.subscribe(scope, () => this.update());
    }
    setTerritory(id) {
        this.territoryId = id;
        this.update();
    }
    updateBusy() {
        for (const row of this.rows.values())
            if (row.save) {
                row.save.setDisabled(!this.services.world.current || this.services.gameplay.needsReview);
                row.save.setPending(this.services.gameplay.busy);
            }
    }
    remember(row, resource) {
        if (!this.snapshot) return;
        this.services.gameplay.drafts(this.snapshot)[resource] = {
            quantity: row.quantity.input.value,
            productivity: row.productivity.input.value,
        };
        this.updatePreview(row, resource);
    }
    updatePreview(row, resource) {
        const data = this.snapshot?.nation;
        if (!data) return;
        const plan = productionPreview(resource, row.quantity.value, row.productivity.value, data);
        const name = this.services.i18n.t(`command.resource.${resource}`);
        let tone = 'ready',
            status = this.t('planReady', {
                demand: this.number(plan.laborDemand),
                available: this.number(plan.freeLabor),
            });
        if (plan.target === 0) {
            tone = 'muted';
            status = this.t('planOff');
        } else if (!plan.eligibleCount) {
            tone = 'danger';
            status = this.t('planNoTerritories', { productivity: this.number(plan.cutoff) });
        } else if (plan.target > plan.facilityCeiling) {
            tone = 'warning';
            status = this.t('planCapacityLimited', {
                target: this.number(plan.target),
                ceiling: this.number(plan.facilityCeiling),
            });
        } else if (plan.laborDemand > plan.freeLabor) {
            tone = 'warning';
            status = this.t('planLaborLimited', {
                demand: this.number(plan.laborDemand),
                available: this.number(plan.freeLabor),
            });
        }
        row.planStatus.dataset.tone = tone;
        row.planMessage.show(status);
        row.planStats.replaceChildren(
            this.planStat(this.t('planDemand'), this.number(plan.laborDemand)),
            this.planStat(this.t('planAvailable'), this.number(plan.freeLabor)),
            this.planStat(this.t('planAllocated'), this.number(plan.allocatedLabor)),
            this.planStat(this.t('planTerritories'), `${plan.eligibleCount} / ${plan.facilities.length}`),
            this.planStat(this.t('planCeiling'), this.number(plan.facilityCeiling)),
        );
        row.planNote.setText(this.t('planNote'));
        row.planNote.setLabel(this.services.i18n.t('common.helpFor', { name: this.t('planDemand') }));
        row.territorySummary.textContent = this.t('territorySummary', {
            count: plan.facilities.length,
            resource: name,
        });
        row.territoryList.replaceChildren(
            ...(plan.facilities.length
                ? plan.facilities.map((facility) => {
                      const territory = this.snapshot.territories.find(
                          (candidate) => candidate.territory_id === facility.territory_id,
                      );
                      return el('li', {
                          'data-eligible': String(facility.eligible),
                          text: this.t('territoryRow', {
                              territory: territory?.name ?? `#${facility.territory_id}`,
                              productivity: this.number(facility.productivity),
                              available: this.number(facility.freeLabor),
                              allocated: this.number(facility.allocatedLabor),
                              size: this.number(facility.poolLabor),
                              ceiling: this.number(facility.outputCeiling),
                              state: facility.eligible
                                  ? this.t('territoryEligible')
                                  : this.t('territoryExcluded'),
                          }),
                      });
                  })
                : [el('li', { text: this.t('territoryNone') })]),
        );
    }
    planStat(label, value) {
        return el('div', {}, el('dt', { text: label }), el('dd', { text: value }));
    }
    update() {
        const data = this.snapshot?.nation;
        if (!data || this.scope.closed) return;
        const { definitions, budget, bids } = data;
        const unit = definitions.labor_per_unit;
        const drafts = this.services.gameplay.drafts(this.snapshot);
        this.title.textContent = this.t('title');
        this.help.setText(this.t('hint'));
        this.help.setLabel(this.services.i18n.t('common.helpFor', { name: this.t('title') }));
        this.labor.textContent = this.t('labor', { value: this.number(budget.free_labor / unit) });
        const eligible = new Set(definitions.bid_resources);
        for (const meta of definitions.resources) {
            const resource = meta.resource_type;
            const facilities = budget.labor_facility_allocations.filter(
                (facility) => facility.resource_type === resource,
            );
            let row = this.rows.get(resource);
            if (!row) {
                const name = el('h4'),
                    figures = el('p'),
                    details = el('p', { class: 'muted' });
                const card = el(
                    'div',
                    { class: 'production-card', 'data-production-resource': resource },
                    el(
                        'header',
                        {},
                        el('img', { src: resourceIcon(resource), alt: '', width: 24, height: 24 }),
                        name,
                    ),
                    figures,
                    details,
                );
                row = { name, figures, details, card };
                if (eligible.has(resource)) {
                    const quantity = new RangeField({
                        scope: this.scope,
                        label: this.t('quantity'),
                        value: 0,
                        min: 0,
                        max: 10,
                        step: 0.01,
                        help: this.t('quantityHelp'),
                        helpLabel: this.services.i18n.t('common.helpFor', { name: this.t('quantity') }),
                        onChange: () => this.remember(row, resource),
                    });
                    const productivity = new RangeField({
                        scope: this.scope,
                        label: this.t('productivity'),
                        value: 0,
                        min: 0,
                        max: 4,
                        step: 0.1,
                        help: this.t('productivityHelp'),
                        helpLabel: this.services.i18n.t('common.helpFor', { name: this.t('productivity') }),
                        onChange: () => this.remember(row, resource),
                    });
                    const planMessage = new CompactMessage(this.scope, {
                        className: 'production-plan-status',
                    });
                    const planStatus = planMessage.element;
                    const planStats = el('dl', { class: 'production-plan-stats' });
                    const planNote = new Tooltip({
                        scope: this.scope,
                        label: this.services.i18n.t('common.help'),
                    });
                    const territorySummary = el('summary');
                    const territoryList = el('ul');
                    const territoryBreakdown = el(
                        'details',
                        { class: 'production-territories' },
                        territorySummary,
                        territoryList,
                    );
                    const plan = el(
                        'div',
                        { class: 'production-plan' },
                        el('div', { class: 'ui-help-heading' }, planStatus, planNote.element),
                        planStats,
                        territoryBreakdown,
                    );
                    const save = new Button({ type: 'submit', icon: 'save' });
                    save.element.dataset.command = '';
                    const form = el('form', {}, quantity.element, productivity.element, plan, save.element);
                    Object.assign(row, {
                        quantity,
                        productivity,
                        planStatus,
                        planMessage,
                        planStats,
                        planNote,
                        territorySummary,
                        territoryList,
                        save,
                    });
                    this.scope.listen(form, 'submit', async (event) => {
                        event.preventDefault();
                        let body;
                        try {
                            body = productionBid(
                                resource,
                                quantity.input.value,
                                productivity.input.value,
                                this.snapshot.nation.definitions,
                            );
                        } catch (error) {
                            this.status.show(error.message);
                            return;
                        }
                        try {
                            await this.services.gameplay.command('placeProductionBid', body, this.snapshot);
                        } catch {
                            // The shared service owns the command outcome and reconciliation notice.
                        }
                        this.update();
                    });
                    card.append(form);
                }
                this.rows.set(resource, row);
                this.cards.append(card);
            }
            const name = this.services.i18n.t(`command.resource.${resource}`);
            const bid = bids.find((b) => b.resource_type === resource);
            row.name.textContent = name;
            row.figures.textContent = this.t('figures', {
                production: this.number(budget.production[resource]),
                balance: this.number(budget.balances[resource]),
            });
            row.figures.dataset.tone = budget.balances[resource] < 0 ? 'danger' : 'ready';
            const allocated = facilities.reduce((sum, f) => sum + f.allocation, 0) / unit;
            row.details.textContent = eligible.has(resource)
                ? this.t('requested', {
                      requested: this.number((bid?.max_quantity ?? 0) / unit),
                      labor: this.number(allocated),
                  })
                : this.t('automatic');
            if (row.quantity) {
                const draft = drafts[resource];
                const quantity = draft?.quantity ?? String((bid?.max_quantity ?? 0) / unit);
                const productivity = draft?.productivity ?? String(productionProductivity(bid, definitions));
                const potential = facilities.reduce(
                    (sum, facility) => sum + (facility.capacity / unit) * facility.productivity,
                    0,
                );
                const maximumProductivity = Math.max(
                    0,
                    ...facilities.map((facility) => facility.productivity),
                );
                row.quantity.setBounds({
                    min: 0,
                    max: Math.max(10, Math.ceil(potential), Math.ceil(Number(quantity) || 0)),
                    step: 0.01,
                    help: this.t('quantityHelp'),
                });
                row.productivity.setBounds({
                    min: 0,
                    max: Math.max(4, Math.ceil(maximumProductivity), Math.ceil(Number(productivity) || 0)),
                    step: 0.1,
                    help: this.t('productivityHelp'),
                });
                row.quantity.setLabel(this.t('quantity'), `${name}: ${this.t('quantity')} slider`);
                row.quantity.tooltip.setLabel(
                    this.services.i18n.t('common.helpFor', { name: this.t('quantity') }),
                );
                row.productivity.tooltip.setLabel(
                    this.services.i18n.t('common.helpFor', { name: this.t('productivity') }),
                );
                row.productivity.setLabel(
                    this.t('productivity'),
                    `${name}: ${this.t('productivity')} slider`,
                );
                row.quantity.input.setAttribute('aria-label', `${name}: ${this.t('quantity')}`);
                row.productivity.input.setAttribute('aria-label', `${name}: ${this.t('productivity')}`);
                if (row.quantity.input.value !== quantity) row.quantity.setValue(quantity);
                if (row.productivity.input.value !== productivity) row.productivity.setValue(productivity);
                row.save.setLabel(this.t('save', { resource: name }));
                row.save.setDisabled(!this.services.world.current || this.services.gameplay.needsReview);
                row.save.setPending(this.services.gameplay.busy);
                this.updatePreview(row, resource);
            }
        }
        const selected = this.snapshot.territories.find((t) => t.territory_id === this.territoryId);
        this.territory.hidden = !selected;
        if (selected) {
            const facilities = budget.labor_facility_allocations.filter(
                (f) => f.territory_id === selected.territory_id,
            );
            this.territory.replaceChildren(
                el('h4', { text: selected.name }),
                ...(facilities.length
                    ? facilities.map((f) =>
                          el('p', {
                              text: this.t('facility', {
                                  resource: this.services.i18n.t(`command.resource.${f.resource_type}`),
                                  capacity: this.number(f.capacity / unit),
                                  productivity: this.number(f.productivity),
                                  allocated: this.number(f.allocation / unit),
                                  output: this.number(f.production / unit),
                              }),
                          }),
                      )
                    : [el('p', { text: this.t('private') })]),
            );
        }
        this.status.show(this.services.gameplay.notice);
    }
}
