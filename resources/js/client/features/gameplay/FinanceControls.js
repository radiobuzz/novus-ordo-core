import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { Tooltip } from '../../ui/Tooltip.js';

export class FinanceControls {
    constructor(scope, services) {
        Object.assign(this, { scope, services });
        this.t = (key, args) => services.i18n.t(`finance.${key}`, args);
        this.reserve = el('strong');
        this.reserveLabel = el('span');
        this.help = new Tooltip({ scope, text: this.t('reserveHelp'), label: this.t('reserve') });
        this.input = el('input', {
            type: 'text',
            inputmode: 'decimal',
            pattern: '(?:0|[1-9][0-9]{0,13})(?:\\.[0-9]{1,6})?',
            required: true,
            value: '',
        });
        this.field = new FieldShell({ control: this.input, label: this.t('amount') });
        this.review = new Button({ label: this.t('review') });
        this.confirm = new Button({ label: this.t('confirm'), variant: 'primary' });
        this.cancel = new Button({ label: this.t('cancel') });
        this.preview = el('p', { role: 'status' });
        this.confirmation = el(
            'div',
            { hidden: true },
            this.preview,
            this.confirm.element,
            this.cancel.element,
        );
        this.status = el('p', { role: 'status' });
        this.element = el(
            'section',
            { class: 'finance-controls' },
            el('p', {}, this.reserveLabel, this.reserve, this.help.element),
            this.field.element,
            this.review.element,
            this.confirmation,
            this.status,
        );
        scope.listen(this.input, 'input', () => {
            this.confirmation.hidden = true;
            this.paint();
        });
        scope.listen(this.review.element, 'click', () => {
            if (this.valid()) {
                this.confirmation.hidden = false;
                this.paint();
                this.confirm.element.focus();
            }
        });
        scope.listen(this.cancel.element, 'click', () => {
            this.confirmation.hidden = true;
            this.review.element.focus();
        });
        scope.listen(this.confirm.element, 'click', () => void this.submit());
        services.gameplay.changed.subscribe(scope, () => this.paint());
        services.i18n.changed.subscribe(scope, () => this.paint());
    }
    update(snapshot) {
        const key = `${snapshot.game_id}:${snapshot.setup.nation_id}:${snapshot.turn_context_revision}:${snapshot.nation?.economy?.available_cash}:${snapshot.nation?.economy?.state?.debt}`;
        if (this.key !== key) {
            this.confirmation.hidden = true;
            this.key = key;
        }
        this.snapshot = snapshot;
        this.paint();
    }
    valid() {
        const e = this.snapshot?.nation?.economy,
            n = Number(this.input.value);
        return (
            this.input.checkValidity() &&
            n > 0 &&
            n <= Number(e?.available_cash) &&
            n <= Number(e?.state?.debt)
        );
    }
    paint() {
        const e = this.snapshot?.nation?.economy;
        if (!e) return;
        const fmt = (v) => (v == null ? '—' : this.services.i18n.number(v, { maximumFractionDigits: 3 }));
        this.reserveLabel.textContent = this.t('reserve') + ': ';
        this.reserve.textContent = fmt(e.reserve_target);
        this.help.setText(this.t('reserveHelp'));
        this.help.setLabel(this.t('reserve'));
        this.field.label.textContent = this.t('amount');
        this.review.setLabel(this.t('review'));
        this.confirm.setLabel(this.t('confirm'));
        this.cancel.setLabel(this.t('cancel'));
        const disabled =
            !this.services.world.current || this.services.gameplay.busy || this.services.gameplay.needsReview;
        this.input.disabled = disabled;
        this.review.element.disabled = disabled || !this.valid();
        this.confirm.element.disabled = disabled || !this.valid();
        this.preview.textContent = this.t('preview', {
            cash: fmt(Number(e.available_cash) - Number(this.input.value)),
            debt: fmt(Number(e.state.debt) - Number(this.input.value)),
        });
        this.status.textContent = this.input.value && !this.valid() ? this.t('invalid') : '';
    }
    async submit() {
        if (this.confirm.element.disabled || this.confirmation.hidden) return;
        try {
            await this.services.gameplay.command('repayDebt', { amount: this.input.value }, this.snapshot);
            if (!this.scope.closed) {
                this.input.value = '';
                this.confirmation.hidden = true;
                this.paint();
            }
        } catch {
            if (!this.scope.closed) this.status.textContent = this.services.gameplay.notice;
        }
    }
}
