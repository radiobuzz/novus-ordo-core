import { resourceName } from '../../ui/resourceVisuals.js';
import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { Scope } from '../../runtime/Scope.js';
import './economy.scss';
import { MetricTable } from './MetricTable.js';
import { CivilianEconomyView } from './CivilianEconomyView.js';

const copy = (value) => structuredClone(value);
const signature = (value) => JSON.stringify(value);
const supported = new Set([
    'finance.income_tax',
    'budget.program_funding',
    'allocation.infrastructure_priority',
    'production.development_funding',
    'allocation.production_priority',
    'food.emergency_release',
    'institutions.development_ownership',
    'food.reserve_target',
]);

/** A composition over the shared owner snapshot. Inputs persist through routine refreshes. */
export class EconomyPanel {
    constructor(scope, services) {
        Object.assign(this, { scope, services });
        this.t = (key) => services.i18n.t(`economy.${key}`);
        this.localize = (labels) => labels?.[services.i18n.locale] ?? labels?.en ?? '';
        const label = (tag, key, attrs = {}) => {
            const node = el(tag, attrs);
            services.i18n.bind(scope, node, `economy.${key}`);
            return node;
        };
        const surface = (key, attrs, ...children) => {
            const node = panel({ title: this.t(key), ...attrs }, ...children);
            services.i18n.bind(scope, node.querySelector('.ui-panel-title'), `economy.${key}`);
            return node;
        };
        this.element = el('div', { class: 'economy-workspace' });
        this.summary = el('div', { class: 'economy-summary' });
        this.civilian = new CivilianEconomyView(services.i18n);
        this.civilianPanel = surface('civilianTitle', {}, this.civilian.element);
        this.warning = el('p', { class: 'economy-warning', role: 'status' });
        this.table = el('div', { class: 'economy-budget' });
        this.reportTables = new Map();
        this.previewNote = el('p', { class: 'economy-preview-status', role: 'status' });
        this.colourKey = el(
            'p',
            { class: 'economy-colour-key' },
            label('span', 'colourIncome', { 'data-tone': 'ready' }),
            label('span', 'colourExpense', { 'data-tone': 'warning' }),
            label('span', 'colourProblem', { 'data-tone': 'danger' }),
        );
        this.policyRows = el('div');
        this.outlook = el('div', { class: 'economy-indicators' });
        this.food = el('div', { class: 'game-table-scroll' });
        this.territories = el('div', { class: 'game-table-scroll' });
        this.feedback = el('p', { role: 'status', 'aria-live': 'polite' });
        this.reviewContent = el('div', { hidden: true });
        this.review = new Button({ label: this.t('review'), variant: 'primary' });
        this.save = new Button({ label: this.t('save'), variant: 'primary' });
        this.discard = new Button({ label: this.t('discard') });
        this.continue = new Button({ label: this.t('keepEditing') });
        this.reviewList = el('ul');
        this.reviewContent.append(
            this.reviewList,
            label('p', 'timing'),
            this.save.element,
            this.continue.element,
        );
        this.footer = surface(
            'changes',
            { className: 'economy-actions' },
            this.feedback,
            this.review.element,
            this.discard.element,
            this.reviewContent,
        );
        this.element.append(
            this.summary,
            this.warning,
            this.civilianPanel,
            el(
                'div',
                { class: 'economy-columns' },
                surface(
                    'budget',
                    {},
                    this.colourKey,
                    this.previewNote,
                    this.table,
                    label('p', 'forecastHelp', { class: 'economy-help' }),
                ),
                surface('policies', {}, this.policyRows),
            ),
            surface('foodSecurity', {}, this.food, label('p', 'foodHelp', { class: 'economy-help' })),
            surface(
                'outlook',
                {},
                this.outlook,
                label('p', 'outlookHelp', { class: 'economy-help' }),
                el('details', {}, label('summary', 'territories'), this.territories),
            ),
            this.footer,
        );
        scope.listen(this.review.element, 'click', () => {
            this.reviewContent.hidden = false;
            const choices = { ...this.policies.current, ...this.draft.changes };
            this.reviewList.replaceChildren(
                ...Object.keys(this.draft.changes ?? {}).map((key) =>
                    el('li', {
                        text: `${this.localize(this.definitions.find((p) => p.key === key)?.labels)}: ${this.choiceLabel(key, this.policies.current[key])} → ${this.choiceLabel(key, choices[key])}`,
                    }),
                ),
            );
            const acquisitions = this.services.gameplay.drafts(this.snapshot);
            for (const [key, choice] of Object.entries(acquisitions))
                this.reviewList.append(
                    el('li', {
                        text: `${resourceName(this.snapshot.nation, key, this.services.i18n)}: ${choice.quantity} · ${this.services.i18n.t('planner.spendingLimit')}: ${choice.spending_limit} · ${this.services.i18n.t('planner.priority')}: ${choice.priority}`,
                    }),
                );
            if (!this.reviewList.childNodes.length)
                this.reviewList.append(el('li', { text: this.t('cancelPending') }));
            this.save.element.focus();
        });
        scope.listen(this.continue.element, 'click', () => {
            this.reviewContent.hidden = true;
            this.review.element.focus();
        });
        scope.listen(this.discard.element, 'click', () => {
            this.draft.changes = null;
            this.draft.base = null;
            const acquisitions = this.services.gameplay.drafts(this.snapshot);
            for (const key of Object.keys(acquisitions)) delete acquisitions[key];
            this.services.gameplay.notifyEconomicDraft();
            this.preview = null;
            this.previewSequence++;
            this.reviewContent.hidden = true;
            this.buildInputs();
            this.paint();
        });
        scope.listen(this.save.element, 'click', () => void this.submit());
        services.gameplay.economicDraftChanged.subscribe(scope, () => {
            if (this.snapshot) {
                const choices = {
                    ...this.policies.current,
                    ...(this.draft.changes ?? this.policies.pending),
                };
                for (const control of this.inputs) {
                    if (document.activeElement === control.input) continue;
                    const choice = choices[control.key];
                    if (!choice) continue;
                    if (control.option) control.input.value = choice.option;
                    else if (control.param.value_type === 'boolean')
                        control.input.checked = choice.parameters[control.param.key];
                    else {
                        const value = choice.parameters[control.param.key];
                        control.input.value =
                            value === '' ? '' : String(Number(value) * (control.percent ? 100 : 1));
                    }
                }
                this.preview = null;
                this.schedulePreview();
                this.paint();
            }
        });
        services.gameplay.changed.subscribe(scope, () => this.snapshot && this.paint());
        scope.own(() => {
            this.cancelTimer?.();
            this.request?.abort();
            return this.inputsScope?.dispose();
        });
        services.i18n.changed.subscribe(scope, () => {
            for (const [button, key] of [
                [this.review, 'review'],
                [this.save, 'save'],
                [this.discard, 'discard'],
                [this.continue, 'keepEditing'],
            ])
                button.setLabel(this.t(key));
            // Keep edits in the service while rebuilding translated field labels.
            if (this.snapshot) {
                this.buildInputs();
                this.paint();
            }
        });
        this.previewSequence = 0;
    }
    update(snapshot) {
        this.snapshot = snapshot;
        this.policies = snapshot.nation?.policies;
        this.element.hidden = !this.policies?.enabled;
        if (!this.policies?.enabled) return;
        const old = this.draft;
        this.draft = this.services.gameplay.policyDraft(snapshot);
        this.definitions = this.policies.catalogue.policies.filter((p) => p.status === 'active');
        this.confirmedSignature = signature([this.policies.current, this.policies.pending]);
        const context = `${this.draft.key}:${this.services.i18n.locale}`;
        if (
            this.inputContext !== context ||
            (this.draft.changes === null && this.inputSignature !== this.confirmedSignature)
        ) {
            this.inputContext = context;
            this.preview = null;
            this.displayPreview = null;
            this.reviewContent.hidden = true;
            this.buildInputs();
        }
        if (old !== this.draft) {
            this.preview = null;
            this.previewSequence++;
        }
        this.paint();
        if (
            (this.draft.changes !== null || Object.keys(this.services.gameplay.drafts(snapshot)).length) &&
            !this.conflict
        )
            this.schedulePreview();
    }
    choiceLabel(key, choice) {
        if (!choice) return '—';
        const p = this.definitions.find((p) => p.key === key);
        const option = p?.options.find((o) => o.key === choice.option);
        return (
            [
                p?.options.length > 1 ? this.localize(option?.labels) : '',
                ...Object.entries(choice.parameters).map(([k, v]) => {
                    const param = p?.parameters.find((x) => x.key === k);
                    return param?.unit_key?.startsWith('fraction_')
                        ? `${Math.round(Number(v) * 100)}%`
                        : String(v);
                }),
            ]
                .filter(Boolean)
                .join(' · ') || this.localize(option?.labels)
        );
    }
    buildInputs() {
        void this.inputsScope?.dispose();
        this.inputsScope = new Scope();
        this.inputs = [];
        this.policyRows.replaceChildren();
        this.inputSignature = this.confirmedSignature;
        const choices = { ...this.policies.current, ...(this.draft.changes ?? this.policies.pending) };
        for (const p of this.definitions) {
            const choice = choices[p.key];
            if (!choice) continue;
            const group = el(
                'fieldset',
                { class: 'economy-policy' },
                el('legend', { text: this.localize(p.labels) }),
                el('p', {
                    class: 'economy-help',
                    text: `${this.t('inForce')}: ${this.choiceLabel(p.key, this.policies.current[p.key])}`,
                }),
            );
            const unsupported = p.options.some((o) => o.effects.some((e) => !supported.has(e.effect_type)));
            if (unsupported)
                group.append(el('p', { class: 'economy-help', text: this.t('configurationOnly') }));
            if (p.options.length > 1) {
                const select = el(
                    'select',
                    { 'aria-label': this.localize(p.labels) },
                    p.options
                        .filter((o) => !o.retired)
                        .map((o) => el('option', { value: o.key, text: this.localize(o.labels) })),
                );
                select.value = choice.option;
                this.inputs.push({ key: p.key, option: true, input: select });
                this.inputsScope.listen(select, 'change', () => this.edit());
                group.append(new FieldShell({ label: this.localize(p.labels), control: select }).element);
            }
            for (const param of p.parameters) {
                const percent = param.unit_key?.startsWith('fraction_');
                const input = el('input', {
                    type: param.value_type === 'boolean' ? 'checkbox' : 'number',
                    min: param.min_value != null ? Number(param.min_value) * (percent ? 100 : 1) : null,
                    max: param.max_value != null ? Number(param.max_value) * (percent ? 100 : 1) : null,
                    step: param.step != null ? Number(param.step) * (percent ? 100 : 1) : 'any',
                    required: param.value_type !== 'boolean',
                });
                if (param.value_type === 'boolean') input.checked = choice.parameters[param.key];
                else input.value = Number(choice.parameters[param.key]) * (percent ? 100 : 1);
                this.inputs.push({ key: p.key, param, percent, input });
                this.inputsScope.listen(input, 'input', () => this.edit());
                group.append(
                    new FieldShell({
                        label: `${this.localize(param.labels)}${percent ? ' (%)' : ''}`,
                        control: input,
                    }).element,
                );
            }
            const description = this.localize(p.descriptions);
            if (description) group.append(el('p', { class: 'economy-help', text: description }));
            this.policyRows.append(group);
        }
    }
    edit() {
        if (this.draft.changes === null) this.draft.base = this.confirmedSignature;
        const all = copy({ ...this.policies.current, ...(this.draft.changes ?? this.policies.pending) });
        for (const control of this.inputs) {
            if (control.option) all[control.key].option = control.input.value;
            else {
                const { param, input, percent } = control;
                all[control.key].parameters[param.key] =
                    param.value_type === 'boolean'
                        ? input.checked
                        : param.value_type === 'integer'
                          ? Number(input.value)
                          : String(Number((Number(input.value) / (percent ? 100 : 1)).toFixed(6)));
            }
        }
        this.draft.changes = Object.fromEntries(
            Object.entries(all).filter(
                ([key, value]) => signature(value) !== signature(this.policies.current[key]),
            ),
        );
        this.preview = null;
        this.previewError = null;
        this.reviewContent.hidden = true;
        this.paint();
        this.services.gameplay.notifyEconomicDraft();
    }
    schedulePreview() {
        this.cancelTimer?.();
        this.request?.abort();
        this.previewError = null;
        const seq = ++this.previewSequence;
        if (!this.validInputs() || this.conflict) return;
        this.cancelTimer = this.scope.timeout(async () => {
            this.request = new AbortController();
            try {
                const result = await this.services.gameplay.previewPolicies(
                    this.snapshot,
                    copy(this.draft.changes ?? this.policies.pending),
                    AbortSignal.any([this.scope.signal, this.request.signal]),
                );
                if (seq !== this.previewSequence || this.scope.closed) return;
                this.preview = result;
                this.displayPreview = result;
                this.previewError = null;
                this.paint();
            } catch (error) {
                if (seq !== this.previewSequence || this.scope.closed || this.request.signal.aborted) return;
                this.previewError = error.message;
                this.paint();
            }
        }, 350);
    }
    validInputs() {
        return this.inputs.every(({ input }) => input.checkValidity());
    }
    async submit() {
        if (!this.canSave) return;
        try {
            await this.services.gameplay.command(
                'savePendingPolicies',
                {
                    turn_id: this.policies.turn_id,
                    edit_counter: this.policies.edit_counter,
                    changes: copy(this.draft.changes ?? this.policies.pending),
                },
                this.snapshot,
            );
            if (!this.scope.closed) {
                this.reviewContent.hidden = true;
                this.preview = null;
                this.update(this.services.world.snapshot);
            }
        } catch {
            /* Shared command feedback preserves rejected and uncertain drafts. */
        }
    }
    number(value, digits = 2) {
        return value == null ? '—' : this.services.i18n.number(value, { maximumFractionDigits: digits });
    }
    grid(headers, rows) {
        return el(
            'table',
            { class: 'game-table' },
            el(
                'thead',
                {},
                el(
                    'tr',
                    {},
                    headers.map((text) => el('th', { scope: 'col', text })),
                ),
            ),
            el(
                'tbody',
                {},
                rows.map((row) =>
                    el(
                        'tr',
                        {},
                        row.map((value) => el('td', {}, value)),
                    ),
                ),
            ),
        );
    }
    paint() {
        if (!this.policies?.enabled) return;
        const economy = this.snapshot.nation.economy;
        const dirty =
            this.draft.changes !== null ||
            Object.keys(this.services.gameplay.drafts(this.snapshot)).length > 0;
        this.conflict = this.draft.changes !== null && this.draft.base !== this.confirmedSignature;
        const baseline = economy?.forecast;
        const proposed = dirty
            ? ((this.preview ?? this.displayPreview)?.indicator_forecast ?? baseline)
            : baseline;
        this.previewNote.textContent =
            dirty && !this.preview
                ? this.previewError ||
                  this.t(baseline || this.displayPreview ? 'previousEstimate' : 'calculating')
                : '';
        this.previewNote.dataset.tone = this.previewError || !this.validInputs() ? 'danger' : 'warning';
        this.table.setAttribute(
            'aria-busy',
            String(dirty && !this.preview && !this.previewError && this.validInputs()),
        );
        const busy = this.services.gameplay.busy;
        for (const { input } of this.inputs)
            input.setAttribute('aria-invalid', String(!input.checkValidity()));
        this.canSave =
            dirty &&
            this.validInputs() &&
            this.preview?.valid &&
            !this.conflict &&
            this.services.world.current &&
            !busy &&
            !this.services.gameplay.needsReview;
        this.review.element.disabled = !this.canSave;
        this.save.element.disabled = !this.canSave;
        this.discard.element.hidden = !dirty;
        this.discard.element.disabled = busy;
        this.policyRows.querySelectorAll('fieldset').forEach((f) => {
            f.disabled = busy || !this.services.world.current || this.services.gameplay.needsReview;
        });
        this.feedback.textContent = this.conflict
            ? this.t('conflict')
            : !this.validInputs()
              ? this.t('invalid')
              : (this.previewError ??
                (this.preview?.violations?.length
                    ? this.preview.violations.map((v) => this.localize(v.message)).join(' ')
                    : dirty
                      ? this.t(this.preview ? 'unsaved' : 'calculating')
                      : Object.keys(this.policies.pending).length
                        ? this.t('pending')
                        : this.t('noChanges')));
        if (!economy) {
            this.summary.textContent = this.t('notEnabled');
            this.table.textContent = this.t('notEnabled');
            return;
        }
        const forecast = proposed?.expected;
        this.summary.replaceChildren(
            ...[
                ['availableCash', economy.available_cash],
                ['committed', economy.committed_cash],
                ['debt', economy.state.debt],
                ['credit', baseline?.expected.fiscal.credit_limit],
            ].map(([key, value]) =>
                el(
                    'div',
                    {},
                    el('span', { text: this.t(key) }),
                    el('strong', {
                        text: this.number(value),
                        'data-tone':
                            key === 'debt' && Number(value) > 0
                                ? 'warning'
                                : key === 'availableCash' && Number(value) <= 0
                                  ? 'danger'
                                  : 'neutral',
                    }),
                ),
            ),
        );
        this.warning.textContent = (proposed?.warnings ?? [])
            .map((warning) => this.t(warning.type))
            .join(' ');
        this.warning.hidden = !this.warning.textContent;
        this.warning.dataset.tone = (proposed?.warnings ?? []).some((w) =>
            ['default', 'food_shortage', 'payroll_shortfall', 'maintenance_shortfall'].includes(w.type),
        )
            ? 'danger'
            : 'warning';
        const columns = [
            this.t('credits'),
            this.t('lastActual'),
            this.t('savedEstimate'),
            this.t('draftEstimate'),
        ];
        const reports = [economy.last_season, baseline?.expected, proposed?.expected];
        this.civilian.update(this.snapshot.nation, reports);
        this.civilianPanel.hidden = this.civilian.element.hidden;
        const value = (report, key) =>
            key === 'balance'
                ? report
                    ? Number(report.closing_treasury) - Number(report.opening_treasury)
                    : null
                : key === 'infrastructure_paid'
                  ? report
                      ? Object.values(report.infrastructure ?? {}).reduce(
                            (total, row) => total + Number(row.paid),
                            0,
                        )
                      : null
                  : key.split('.').reduce((v, part) => v?.[part], report);
        const inflows = new Set(['tax_receipts', 'public_sales', 'treasury_inflows']);
        const outflows = new Set([
            'command_costs',
            'public_payroll_paid',
            'public_operations',
            'government_purchases',
            'public_development',
            'support_paid',
            'infrastructure_paid',
            'treasury_outflows',
            'fiscal.interest_due',
            'fiscal.principal_repaid',
        ]);
        const section = (title, keys, help) => {
            let view = this.reportTables.get(title);
            if (!view) {
                view = {
                    table: new MetricTable(),
                    title: el('h3'),
                    help: el('p', { class: 'economy-help' }),
                };
                this.reportTables.set(title, view);
                this.table.append(
                    view.title,
                    el('div', { class: 'game-table-scroll' }, view.table.element),
                    view.help,
                );
            }
            view.title.textContent = this.t(title);
            view.help.textContent = help ? this.t(help) : '';
            view.help.hidden = !help;
            view.table.update(
                columns,
                keys.map((key) => ({
                    key,
                    label: this.t(key),
                    values: reports.map((r) => {
                        const amount = value(r, key);
                        const n = Number(amount);
                        let tone = 'neutral';
                        if (amount != null && n !== 0) {
                            if (key === 'fiscal.arrears' || n < 0) tone = 'danger';
                            else if (
                                outflows.has(key) ||
                                ['fiscal.borrowing', 'fiscal.closing_debt'].includes(key)
                            )
                                tone = 'warning';
                            else if (
                                inflows.has(key) ||
                                ['balance', 'wages', 'realized_profit', 'earned_income'].includes(key)
                            )
                                tone = 'ready';
                        }
                        if (key === 'closing_treasury' && amount != null)
                            tone =
                                n < Number(r.opening_treasury)
                                    ? 'danger'
                                    : n > Number(r.opening_treasury)
                                      ? 'ready'
                                      : 'neutral';
                        const prefix =
                            amount != null && n > 0
                                ? outflows.has(key)
                                    ? '−'
                                    : inflows.has(key) || key === 'balance'
                                      ? '+'
                                      : ''
                                : '';
                        return { text: prefix + this.number(amount), tone };
                    }),
                })),
            );
        };
        section(
            'cashFlows',
            [
                'opening_treasury',
                'tax_receipts',
                'public_sales',
                'command_costs',
                'public_payroll_paid',
                'public_operations',
                'government_purchases',
                'public_development',
                'support_paid',
                'infrastructure_paid',
                'treasury_inflows',
                'treasury_outflows',
                'balance',
                'closing_treasury',
            ],
            'cashFlowsHelp',
        );
        section('financing', [
            'fiscal.borrowing',
            'fiscal.interest_due',
            'fiscal.arrears',
            'fiscal.principal_repaid',
            'fiscal.relief',
            'fiscal.closing_debt',
        ]);
        section(
            'nationalActivity',
            ['wages', 'realized_profit', 'earned_income', 'private_development'],
            'nationalActivityHelp',
        );
        const nutrition = this.snapshot.nation.definitions?.roles?.nutrition;
        const foodDefinition = this.snapshot.nation.definitions?.resources?.find(
            (r) => r.resource_key === nutrition,
        );
        const foodKeys = [
            'government_opening',
            'civilian_requested',
            'civilian.fulfilled',
            'civilian.unmet',
            'reserve_target',
            'government_closing',
            'reserve_shortfall',
        ];
        if (!this.foodTable) {
            this.foodTable = new MetricTable();
            this.food.append(this.foodTable.element);
        }
        this.foodTable.update(
            [
                this.localize(foodDefinition?.unit_labels),
                this.t('lastActual'),
                this.t('savedEstimate'),
                this.t('draftEstimate'),
            ],
            foodKeys.map((key) => ({
                key,
                label: this.t(`food_${key}`),
                values: reports.map((r) => {
                    const amount = value(r?.food, key);
                    return {
                        text: this.number(amount),
                        tone:
                            Number(amount) > 0 && ['civilian.unmet', 'reserve_shortfall'].includes(key)
                                ? 'danger'
                                : 'neutral',
                    };
                }),
            })),
        );
        const indicatorKeys = [
            'civilian_income',
            'income_per_person',
            'infrastructure',
            'unrest',
            'informal',
        ];
        const indicatorText = (key, v) =>
            v == null
                ? '—'
                : this.number(
                      v *
                          (key === 'income_per_person'
                              ? 1e6
                              : ['infrastructure', 'unrest', 'informal', 'agriculture'].includes(key)
                                ? 100
                                : 1),
                  ) + (['infrastructure', 'unrest', 'informal', 'agriculture'].includes(key) ? '%' : '');
        this.outlook.replaceChildren(
            ...indicatorKeys.map((key) => {
                const before = baseline?.expected.indicators[key],
                    after = forecast?.indicators[key];
                return el(
                    'div',
                    { class: 'economy-indicator' },
                    el('span', { text: this.t(key) }),
                    el('strong', { text: indicatorText(key, economy.current[key]) }),
                    el('span', { text: `${this.t('next')}: ${indicatorText(key, after)}` }),
                    el('small', {
                        text: `${this.t('editEffect')}: ${indicatorText(key, after == null || before == null ? null : after - before)}`,
                    }),
                );
            }),
        );
        const names = new Map(this.snapshot.territories.map((t) => [t.territory_id, t.name]));
        const territorySignature = signature([this.services.i18n.locale, economy.territories, [...names]]);
        if (this.territorySignature === territorySignature) return;
        this.territorySignature = territorySignature;
        this.territories.replaceChildren(
            this.grid(
                [this.t('territory'), this.t('infrastructure'), this.t('unrest'), this.t('informal')],
                economy.territories.map((cell) => [
                    el('a', {
                        href: `#/world?territory=${cell.id}`,
                        text: names.get(cell.id) ?? `#${cell.id}`,
                    }),
                    ...['infrastructure', 'unrest', 'informal'].map((k) => indicatorText(k, cell.state[k])),
                ]),
            ),
        );
    }
}
