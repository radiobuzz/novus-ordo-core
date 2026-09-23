import { el, button } from './dom.js';
export class ImageField {
    constructor({ scope, i18n, id, key, file, portrait = false, onChange }) {
        this.file = file;
        const preview = el('div', { class: `image-preview${portrait ? ' is-portrait' : ''}` });
        const input = el('input', {
            type: 'file',
            id,
            accept: 'image/png,image/jpeg,image/webp',
            class: 'image-input',
            'aria-describedby': `${id}-help ${id}-error`,
        });
        const label = i18n.bind(scope, el('label', { for: id, class: 'image-pick' }), 'nation.chooseImage');
        const remove = i18n.bind(scope, button('', 'text-button'), 'common.remove');
        const name = el('span', { class: 'file-name' });
        this.error = el('span', { id: `${id}-error`, class: 'field-error', 'aria-live': 'polite' });
        this.input = input;
        this.element = el(
            'div',
            { class: 'entry-field image-field' },
            i18n.bind(scope, el('span', { class: 'field-label' }), key),
            el(
                'div',
                { class: 'image-field-content' },
                preview,
                el('div', { class: 'image-field-actions' }, input, label, name, remove),
            ),
            i18n.bind(scope, el('span', { id: `${id}-help`, class: 'field-help' }), 'nation.upload'),
            this.error,
        );
        let objectUrl;
        const update = () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            preview.replaceChildren();
            if (this.file) {
                objectUrl = URL.createObjectURL(this.file);
                preview.append(el('img', { src: objectUrl, alt: '' }));
            } else
                preview.append(
                    el('span', { class: 'image-empty', text: portrait ? '◈' : '⚑', 'aria-hidden': 'true' }),
                );
            name.textContent = this.file?.name ?? '';
            remove.hidden = !this.file;
        };
        scope.own(() => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        });
        scope.listen(input, 'change', () => {
            const value = input.files[0];
            if (!value) return;
            if (value.size > 2097152 || !['image/png', 'image/jpeg', 'image/webp'].includes(value.type)) {
                this.setError(i18n.t('errors.image'));
                input.value = '';
                return;
            }
            this.setError('');
            this.file = value;
            onChange(value);
            update();
        });
        scope.listen(remove, 'click', () => {
            this.file = null;
            input.value = '';
            onChange(null);
            this.setError('');
            update();
        });
        update();
    }
    setError(text) {
        this.error.textContent = text;
        this.input.setAttribute('aria-invalid', String(Boolean(text)));
    }
}
