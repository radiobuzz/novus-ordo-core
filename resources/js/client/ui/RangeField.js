import { el } from './element.js';
import { FieldShell } from './FieldShell.js';
import { Tooltip } from './Tooltip.js';

/** Native range + exact value. Emits local change intent, never a server command. */
export class RangeField {
    constructor({ scope, label, value, min, max, step = 1, unit = '', help = '', helpLabel, onChange }) {
        this.unit = unit;
        this.customHelp = help;
        this.input = el('input', { type: 'number', min, max, step, required: true, value });
        this.range = el('input', { type: 'range', min, max, step, value, 'aria-label': `${label} slider` });
        this.shell = new FieldShell({ control: this.input, label, help: this.help(min, max) });
        if (helpLabel) {
            this.tooltip = new Tooltip({ scope, label: helpLabel, text: this.help(min, max) });
            this.shell.label.parentElement.append(this.tooltip.element);
            this.shell.help.classList.add('ui-visually-hidden');
        }
        this.range.classList.add('ui-range');
        this.range.setAttribute('aria-describedby', this.shell.help.id);
        this.element = this.shell.element;
        this.element.classList.add('ui-range-field');
        this.element.insertBefore(this.range, this.input);
        scope.listen(this.range, 'input', () => {
            this.input.value = this.range.value;
            onChange?.(this.value);
        });
        scope.listen(this.input, 'input', () => {
            if (this.input.validity.valid) this.range.value = this.input.value;
            onChange?.(this.value);
        });
    }
    get value() {
        return this.input.valueAsNumber;
    }
    setValue(value) {
        this.input.value = value;
        this.range.value = value;
    }
    setLabel(label, rangeLabel = `${label} slider`) {
        this.shell.label.textContent = label;
        this.range.setAttribute('aria-label', rangeLabel);
    }
    setBounds({ min, max, step = this.input.step, unit = this.unit, help = this.customHelp }) {
        this.unit = unit;
        this.customHelp = help;
        for (const control of [this.input, this.range]) {
            control.min = min;
            control.max = max;
            control.step = step;
        }
        this.shell.setHelp(this.help(min, max));
        this.tooltip?.setText(this.help(min, max));
    }
    help(min, max) {
        const bounds = `${min}–${max}${this.unit}`;
        return this.customHelp ? `${this.customHelp} ${bounds}` : bounds;
    }
}
