import { resourceName } from '../../ui/resourceVisuals.js';
import { publicInvestmentAllowed } from '../../services/production.js';
import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { Tabs } from '../../ui/Tabs.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { policyGroup, seasonFinance } from './economyGroups.js';
import { Scope } from '../../runtime/Scope.js';
import './economy.scss';
import { FinanceControls } from './FinanceControls.js';
import { EconomicHistoryView } from './EconomicHistoryView.js';
import { TimeSeriesChart } from '../../ui/TimeSeriesChart.js';
import { nationalPoint } from './historySeries.js';
import { treasuryChange } from '../../ui/financeProjection.js';
import { MetricTable } from './MetricTable.js';
import { CivilianEconomyView } from './CivilianEconomyView.js';
import { economicWarning } from '../../services/economicWarnings.js';

const copy = (value) => structuredClone(value);
const signature = (value) => JSON.stringify(value);
const supported = new Set([
    'finance.income_tax',
    'finance.treasury_reserve',
    'budget.program_funding',
    'budget.income_support',
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
        this.balanceHelp = new Tooltip({
            scope,
            text: this.t('seasonBalanceHelp'),
            label: this.t('seasonBalance'),
        });
        this.treasuryHelp = new Tooltip({
            scope,
            text: this.t('treasuryChangeHelp'),
            label: this.t('balance'),
        });
        this.civilian = new CivilianEconomyView(services.i18n);
        this.civilianPanel = surface('civilianTitle', {}, this.civilian.element);
        this.warning = el('button', {
            type: 'button',
            class: 'economy-warning',
            'data-icon': 'none',
            'aria-expanded': 'false',
        });
        this.warningList = el('ul', { class: 'economy-warning-list', hidden: true });
        scope.listen(this.warning, 'click', () => {
            this.warningList.hidden = !this.warningList.hidden;
            this.warning.setAttribute('aria-expanded', String(!this.warningList.hidden));
        });
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
        this.policyRows = el('div', { class: 'economy-policy-panels' });
        this.outlook = el('div', { class: 'economy-indicators' });
        this.food = el('div', { class: 'game-table-scroll' });
        this.territories = el('div', { class: 'game-table-scroll' });
        this.feedback = el('p', { class: 'economy-action-status', role: 'status', 'aria-live': 'polite' });
        this.reviewContent = el('div', { class: 'economy-review', hidden: true });
        this.review = new Button({ label: this.t('review'), variant: 'primary' });
        this.save = new Button({ label: this.t('save'), variant: 'primary' });
        this.discard = new Button({ label: this.t('discard') });
        this.continue = new Button({ label: this.t('keepEditing') });
        this.reviewList = el('ul');
        this.reviewContent.append(this.reviewList, label('p', 'timing'), this.continue.element);
        this.footer = surface(
            'changes',
            { className: 'economy-actions' },
            this.feedback,
            this.review.element,
            this.discard.element,
            this.reviewContent,
        );
        this.save.element.hidden = false;
        this.save.element.dataset.saveStage = 'review';
        this.footer.insertBefore(this.save.element, this.reviewContent);
        this.review.element.hidden = true;
        this.top = el(
            'div',
            { class: 'economy-top' },
            el('div', { class: 'economy-overview' }, this.summary),
            this.footer,
            el(
                'div',
                { class: 'economy-statuses' },
                this.warning,
                this.warningList,
                this.previewNote,
                this.feedback,
            ),
            this.reviewContent,
        );
        this.budgetPanels = new Map(
            ['spending', 'revenue', 'finance', 'civilian', 'history', 'territories'].map((key) => [
                key,
                el('div', { class: 'economy-tab-content', 'data-budget-group': key }),
            ]),
        );
        this.policyPanels = new Map(
            [
                'taxation',
                'support',
                'infrastructure',
                'production',
                'food',
                'institutions',
                'finance',
                'other',
            ].map((key) => [key, el('div', { class: 'economy-tab-content', 'data-policy-group': key })]),
        );
        this.budgetTabs = new Tabs(scope, { label: this.t('budget') });
        this.policyTabs = new Tabs(scope, { label: this.t('policies') });
        this.budgetPanels.get('civilian').append(this.civilianPanel, surface('foodSecurity', {}, this.food));
        this.budgetPanels.get('territories').append(this.outlook, this.territories);
        this.budgetPanels.get('spending').append(this.colourKey);
        this.budgetColumn = surface(
            'budget',
            { className: 'economy-column' },
            this.budgetTabs.element,
            ...this.budgetPanels.values(),
        );
        this.policyColumn = surface(
            'policies',
            { className: 'economy-column' },
            this.policyTabs.element,
            this.policyRows,
        );
        this.policyRows.append(...this.policyPanels.values());
        this.mobileTabs = new Tabs(scope, { label: this.t('workspaceSides') });
        this.mobileTabs.setItems([
            { key: 'budget', label: this.t('budget'), panel: el('div') },
            { key: 'policies', label: this.t('policies'), panel: el('div') },
        ]);
        this.mobileTabs.onSelect = (key) => (this.element.dataset.side = key);
        this.element.dataset.side = 'budget';
        this.columns = el('div', { class: 'economy-columns' }, this.budgetColumn, this.policyColumn);
        this.element.append(this.top, this.mobileTabs.element, this.columns);
        this.trend = new TimeSeriesChart(scope, services.i18n, { compact: true });
        this.trend.element.classList.add('economy-mini-trend');
        this.trend.plot.setAttribute('tabindex', '-1');
        this.top.querySelector('.economy-overview').append(this.trend.element);
        this.history = new EconomicHistoryView(scope, services, {
            onData: (data) => {
                this.trend.update({
                    title: this.t('seasonBalance'),
                    unit: this.t('credits'),
                    points: data.seasons.map(nationalPoint),
                    series: [{ key: 'balance', label: this.t('seasonBalance') }],
                });
            },
        });
        this.budgetPanels.get('history').append(this.history.element);
        this.financeControls = new FinanceControls(scope, services);
        this.budgetPanels.get('finance').append(this.financeControls.element);
        this.updateTabs();
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
            this.save.setLabel(this.t('save'));
            this.save.element.focus();
        });
        scope.listen(this.continue.element, 'click', () => {
            this.reviewContent.hidden = true;
            this.save.setLabel(this.t('reviewSave'));
            this.save.element.focus();
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
        scope.listen(this.save.element, 'click', () => {
            if (this.reviewContent.hidden) this.review.element.click();
            else void this.submit();
        });
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
        this.history.update(snapshot);
        this.financeControls.update(snapshot);
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
        this.investmentNotices = new Map();
        for (const group of this.policyPanels.values()) group.replaceChildren();
        this.inputSignature = this.confirmedSignature;
        const choices = { ...this.policies.current, ...(this.draft.changes ?? this.policies.pending) };
        for (const p of this.definitions) {
            const choice = choices[p.key];
            if (!choice) continue;
            const group = el(
                'fieldset',
                { class: 'economy-policy', 'aria-label': this.localize(p.labels) },
                el('legend', { text: this.localize(p.labels) }),
                el('p', {
                    class: 'economy-help',
                    text: `${this.t('inForce')}: ${this.choiceLabel(p.key, this.policies.current[p.key])}`,
                }),
            );
            const unsupported = p.options.some((o) => o.effects.some((e) => !supported.has(e.effect_type)));
            if (unsupported)
                group.append(el('p', { class: 'economy-help', text: this.t('configurationOnly') }));
            if (
                p.options.some((o) =>
                    o.effects.some((e) => e.effect_type === 'production.development_funding'),
                )
            ) {
                const notice = el('p', {
                    class: 'economy-investment-notice',
                    'data-tone': 'warning',
                    hidden: true,
                });
                this.investmentNotices.set(p.key, notice);
                group.append(notice);
            }
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
            if (description)
                group.querySelector('legend').append(
                    new Tooltip({
                        scope: this.inputsScope,
                        text: description,
                        label: this.services.i18n.t('common.helpFor', { name: this.localize(p.labels) }),
                    }).element,
                );
            group.dataset.policyKey = p.key;
            this.policyPanels.get(policyGroup(p)).append(group);
        }
    }
    updateTabs() {
        // Empty groups have no tab, so Tabs cannot hide them. Keep them out of layout.
        for (const panel of this.policyPanels.values()) if (!panel.childNodes.length) panel.hidden = true;
        this.budgetTabs.setItems(
            [...this.budgetPanels].map(([key, panel]) => ({ key, label: this.t(`tab_${key}`), panel })),
        );
        this.policyTabs.setItems(
            [...this.policyPanels]
                .filter(([, panel]) => panel.childNodes.length)
                .map(([key, panel]) => {
                    const controls = (this.inputs ?? []).filter((c) => panel.contains(c.input));
                    const invalid = controls.some((c) => c.inactiveInvalid || !c.input.checkValidity());
                    const changed = new Set(
                        controls.filter((c) => this.draft?.changes?.[c.key]).map((c) => c.key),
                    ).size;
                    return {
                        key,
                        label: this.t(`tab_${key}`),
                        panel,
                        badge: invalid
                            ? { text: '!', label: this.t('invalid'), tone: 'danger' }
                            : changed
                              ? { text: String(changed), label: this.t('unsaved') }
                              : null,
                    };
                }),
        );
        this.mobileTabs.setItems(
            [...this.mobileTabs.items].map(([key, item]) => ({ key, label: this.t(key), panel: item.panel })),
        );
    }
    updateInvestmentAvailability() {
        const inactive = !publicInvestmentAllowed(this.policies, this.draft.changes);
        for (const [key, notice] of this.investmentNotices ?? []) {
            notice.hidden = !inactive;
            notice.textContent = this.t('publicInvestmentInactive');
            for (const control of this.inputs.filter((c) => c.key === key)) {
                // Disabling an inactive lever must not hide invalid retained draft values.
                control.input.disabled = false;
                control.inactiveInvalid = inactive && !control.input.checkValidity();
                control.input.disabled = inactive;
            }
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
        return this.inputs.every(({ input, inactiveInvalid }) => !inactiveInvalid && input.checkValidity());
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
        const busy = this.services.gameplay.busy;
        this.policyRows.querySelectorAll('fieldset').forEach((f) => {
            f.disabled = busy || !this.services.world.current || this.services.gameplay.needsReview;
        });
        this.updateInvestmentAvailability();
        this.updateTabs();
        this.save.setLabel(this.t(this.reviewContent.hidden ? 'reviewSave' : 'save'));
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
                : dirty
                  ? this.t('draftActive')
                  : this.t('savedEstimate');
        this.previewNote.dataset.tone = this.previewError || !this.validInputs() ? 'danger' : 'warning';
        this.element.setAttribute(
            'aria-busy',
            String(dirty && !this.preview && !this.previewError && this.validInputs()),
        );
        for (const { input, inactiveInvalid } of this.inputs)
            input.setAttribute('aria-invalid', String(Boolean(inactiveInvalid) || !input.checkValidity()));
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
        this.feedback.textContent = this.conflict
            ? this.t('conflict')
            : !this.validInputs()
              ? this.t('invalid')
              : (this.previewError ??
                (this.preview?.violations?.length
                    ? this.preview.violations.map((v) => this.localize(v.message)).join(' ')
                    : dirty
                      ? this.t(this.preview ? 'unsavedShort' : 'calculating')
                      : Object.keys(this.policies.pending).length
                        ? this.t('pendingShort')
                        : this.t('noChanges')));
        if (!economy) {
            this.summary.textContent = this.t('notEnabled');
            this.table.textContent = this.t('notEnabled');
            return;
        }
        const forecast = proposed?.expected;
        const finances = seasonFinance(forecast);
        this.balanceHelp.setText(this.t('seasonBalanceHelp'));
        this.balanceHelp.setLabel(this.t('seasonBalance'));
        this.treasuryHelp.setText(this.t('treasuryChangeHelp'));
        this.treasuryHelp.setLabel(this.t('balance'));
        this.summary.replaceChildren(
            ...[
                ['balance', finances.treasuryChange],
                ['seasonBalance', finances.balance],
                ['receipts', finances.receipts],
                ['spending', finances.spending],
                ['availableCash', economy.available_cash],
                ['closing_treasury', forecast?.closing_treasury],
                ['debt', economy.state.debt],
                ['fiscal.closing_debt', forecast?.fiscal.closing_debt],
            ].map(([key, value]) =>
                el(
                    'div',
                    {
                        class: key === 'balance' ? 'economy-primary-balance' : '',
                        'data-summary-metric': key,
                    },
                    el(
                        'span',
                        {},
                        this.t(key),
                        key === 'balance'
                            ? this.treasuryHelp.element
                            : key === 'seasonBalance'
                              ? this.balanceHelp.element
                              : null,
                    ),
                    el('strong', {
                        text: (key === 'balance' && value > 0 ? '+' : '') + this.number(value),
                        'data-tone':
                            key === 'balance' || key === 'seasonBalance'
                                ? value < 0
                                    ? 'danger'
                                    : value > 0
                                      ? 'ready'
                                      : 'neutral'
                                : key.includes('debt') && Number(value) > 0
                                  ? 'warning'
                                  : 'neutral',
                    }),
                ),
            ),
        );
        const warnings = proposed?.warnings ?? [];
        const severity = (type) =>
            [
                'default',
                'food_shortage',
                'payroll_shortfall',
                'maintenance_shortfall',
                'annexed_maintenance_no_workforce',
            ].includes(type)
                ? 1
                : 0;
        const ordered = [...warnings].sort((a, b) => severity(b.type) - severity(a.type));
        this.warning.textContent = ordered.length
            ? `${economicWarning(this.services.i18n, ordered[0])}${ordered.length > 1 ? ` (+${ordered.length - 1})` : ''}`
            : '';
        this.warningList.replaceChildren(
            ...ordered.map((w) => el('li', { text: economicWarning(this.services.i18n, w) })),
        );
        if (!ordered.length) this.warningList.hidden = true;
        this.warning.hidden = !this.warning.textContent;
        this.warning.dataset.tone = (proposed?.warnings ?? []).some((w) =>
            [
                'default',
                'food_shortage',
                'payroll_shortfall',
                'maintenance_shortfall',
                'annexed_maintenance_no_workforce',
            ].includes(w.type),
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
                ? treasuryChange(report)
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
                    caption: el('span'),
                    help: new Tooltip({ scope: this.scope, text: '', label: this.t(title) }),
                };
                view.title = el('h3', {}, view.caption, view.help.element);
                this.reportTables.set(title, view);
                const target = this.budgetPanels.get(
                    title === 'revenue'
                        ? 'revenue'
                        : title === 'financing'
                          ? 'finance'
                          : title === 'nationalActivity'
                            ? 'civilian'
                            : 'spending',
                );
                const table = el('div', { class: 'game-table-scroll' }, view.table.element);
                if (title === 'financing') this.financeControls.element.before(view.title, table);
                else target.append(view.title, table);
            }
            view.caption.textContent = this.t(title);
            view.title.setAttribute('aria-label', this.t(title));
            view.help.setText(help ? this.t(help) : '');
            view.help.setLabel(this.t(title));
            view.help.element.hidden = !help;
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
            'spending',
            [
                'command_costs',
                'public_payroll_paid',
                'public_operations',
                'government_purchases',
                'public_development',
                'support_requested',
                'support_paid',
                'infrastructure_paid',
                'fiscal.interest_due',
            ],
            'cashFlowsHelp',
        );
        section('revenue', ['tax_receipts', 'public_sales'], 'nationalActivityHelp');
        section(
            'financing',
            [
                'balance',
                'opening_treasury',
                'closing_treasury',
                'fiscal.borrowing',
                'fiscal.interest_due',
                'fiscal.arrears',
                'fiscal.principal_repaid',
                'fiscal.relief',
                'fiscal.closing_debt',
                'treasury_inflows',
                'treasury_outflows',
            ],
            'financingHelp',
        );
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
