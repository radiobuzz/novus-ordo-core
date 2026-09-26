import { Scope } from '../client/runtime/Scope.js';
import { el } from '../client/ui/element.js';
import { Button } from '../client/ui/Button.js';
import { FieldShell } from '../client/ui/FieldShell.js';
import { HARMONIES, paletteFromBase } from './palettes.js';
import { renderFlag } from './renderer.js';

/** Local preview is staged until Apply; closing never edits the recipe. */
export function openPaletteDialog(parentScope, recipe, t, onApply) {
    const scope = new Scope(),
        previous = document.activeElement;
    let base = recipe.palette.primary,
        variation = 0,
        palette,
        finished = false,
        release;
    const picker = el('input', { type: 'color', id: 'identity-base-picker', value: base });
    const hex = el('input', {
        type: 'text',
        id: 'identity-base-hex',
        value: base,
        maxlength: 7,
        spellcheck: false,
        autocomplete: 'off',
    });
    const method = el(
        'select',
        { id: 'identity-harmony' },
        HARMONIES.map((key) => el('option', { value: key, text: t(key) })),
    );
    method.value = 'complementary';
    const hexField = new FieldShell({ label: t('baseHex'), control: hex });
    const swatches = el('div', { class: 'identity-palette-swatches', 'aria-live': 'polite' });
    const preview = el('canvas', {
        width: 450,
        height: 300,
        class: 'identity-palette-preview',
        role: 'img',
        'aria-label': t('palettePreview'),
    });
    const again = new Button({ label: t('paletteVariation') }),
        cancel = new Button({ label: t('paletteCancel') }),
        apply = new Button({ label: t('paletteApply'), variant: 'primary' });
    const dialog = el(
        'dialog',
        { class: 'identity-palette-dialog', 'aria-labelledby': 'identity-palette-title' },
        el('h2', { id: 'identity-palette-title', text: t('buildPalette') }),
        el('p', { class: 'identity-note', text: t('basePaletteHelp') }),
        el(
            'div',
            { class: 'identity-palette-base' },
            new FieldShell({ label: t('baseColour'), control: picker }).element,
            hexField.element,
        ),
        new FieldShell({ label: t('harmonyMethod'), control: method }).element,
        swatches,
        preview,
        el('div', { class: 'identity-actions' }, again.element, cancel.element, apply.element),
    );
    const finish = (accepted) => {
        if (finished) return;
        finished = true;
        release?.();
        void scope.dispose();
        dialog.close();
        dialog.remove();
        if (previous?.isConnected) previous.focus();
        if (accepted) onApply(palette);
    };
    const update = () => {
        const valid = /^#[0-9a-f]{6}$/i.test(hex.value);
        hexField.setError(valid ? '' : t('invalidBaseHex'));
        apply.setDisabled(!valid);
        again.setDisabled(!valid);
        if (!valid) return;
        base = hex.value.toLowerCase();
        picker.value = base;
        palette = paletteFromBase(base, method.value, variation);
        swatches.replaceChildren(
            ...Object.entries(palette).map(([key, value]) =>
                el(
                    'div',
                    {},
                    el('span', {
                        class: 'identity-palette-chip',
                        style: `background:${value}`,
                        'aria-hidden': 'true',
                    }),
                    el('span', { text: t(key) }),
                    el('code', { text: value }),
                ),
            ),
        );
        renderFlag(preview, { ...recipe, palette });
    };
    scope.listen(picker, 'input', () => {
        hex.value = picker.value;
        variation = 0;
        update();
    });
    scope.listen(hex, 'input', () => {
        variation = 0;
        update();
    });
    scope.listen(method, 'change', () => {
        variation = 0;
        update();
    });
    scope.listen(again.element, 'click', () => {
        variation++;
        update();
    });
    scope.listen(cancel.element, 'click', () => finish(false));
    scope.listen(apply.element, 'click', () => {
        if (!apply.element.disabled) finish(true);
    });
    scope.listen(dialog, 'cancel', (event) => {
        event.preventDefault();
        finish(false);
    });
    scope.listen(dialog, 'close', () => finish(false));
    release = parentScope.own(() => finish(false));
    document.body.append(dialog);
    update();
    dialog.showModal();
    picker.focus();
}
