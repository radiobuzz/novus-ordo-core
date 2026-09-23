import { el } from './dom.js';

let sequence = 0;
/** Named, constrained colour choices. Caller owns availability and persistence. */
export class PaletteField {
    constructor(scope, { label, onChange }) {
        this.legend = el('legend', { text: label });
        this.grid = el('div', { class: 'ui-palette-grid' });
        this.element = el('fieldset', { class: 'ui-palette-field' }, this.legend, this.grid);
        this.name = `palette-${++sequence}`;
        this.error = el('p', { id: `${this.name}-error`, class: 'field-error', hidden: true });
        this.element.append(this.error);
        this.rows = new Map();
        scope.listen(this.element, 'change', (event) => {
            if (event.target.matches('input[type="radio"]')) onChange(Number(event.target.value));
        });
    }
    setError(message = '') {
        this.error.textContent = message;
        this.error.hidden = !message;
        for (const { input } of this.rows.values()) {
            input.setAttribute('aria-invalid', String(Boolean(message)));
            if (message) input.setAttribute('aria-describedby', this.error.id);
            else input.removeAttribute('aria-describedby');
        }
    }
    update({ label, choices, value, disabled = false }) {
        this.legend.textContent = label;
        const ids = new Set(choices.map((choice) => choice.id));
        for (const [id, row] of this.rows)
            if (!ids.has(id)) {
                row.element.remove();
                this.rows.delete(id);
            }
        for (const choice of choices) {
            let row = this.rows.get(choice.id);
            if (!row) {
                const input = el('input', { type: 'radio', name: this.name, value: choice.id });
                const chip = el('span', { class: 'ui-palette-chip', 'aria-hidden': 'true' });
                const text = el('span', { class: 'ui-visually-hidden' });
                const element = el('label', {}, input, chip, text);
                row = { input, chip, text, element };
                this.rows.set(choice.id, row);
                this.grid.append(element);
            }
            row.input.checked = choice.id === value;
            row.input.disabled = disabled || Boolean(choice.disabled);
            row.text.textContent = choice.label;
            row.element.title = choice.label;
            row.chip.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(choice.hex) ? choice.hex : 'transparent';
        }
    }
}
