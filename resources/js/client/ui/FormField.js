import { el } from './dom.js';
import { FieldShell } from './FieldShell.js';

export class FormField {
    constructor({
        scope,
        i18n,
        id,
        key,
        value = '',
        type = 'text',
        optional = false,
        maxLength,
        onChange,
        autocomplete,
        placeholder,
    }) {
        this.input = el('input', {
            id,
            name: id,
            type,
            autocomplete,
            maxlength: maxLength,
        });
        this.input.value = value;
        this.shell = new FieldShell({
            control: this.input,
            label: i18n.bind(scope, el('span'), key),
            optional: optional ? i18n.bind(scope, el('span'), 'common.optional') : '',
            className: 'entry-field',
        });
        this.element = this.shell.element;
        this.error = this.shell.error;
        if (placeholder) i18n.bind(scope, this.input, placeholder, {}, 'placeholder');
        scope.listen(this.input, 'input', () => {
            this.setError('');
            onChange?.(this.input.value);
        });
    }
    setError(message) {
        this.shell.setError(message);
    }
}
