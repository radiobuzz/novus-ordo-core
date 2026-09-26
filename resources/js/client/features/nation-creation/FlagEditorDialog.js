import { createFlagEditor } from '../../../identity-lab/editor.js';
import { serializeRecipe } from '../../../identity-lab/recipe.js';
import { Scope } from '../../runtime/Scope.js';
import { el } from '../../ui/element.js';
import { Button } from '../../ui/Button.js';
import './flag-editor.scss';

/** The editor owns a private copy. Only Use commits a compiled image/recipe pair to the wizard. */
export function openFlagEditor(parentScope, { i18n, recipe, onApply, opener = document.activeElement }) {
    const scope = new Scope();
    const previous = opener;
    const host = el('div', { class: 'nation-flag-editor-content' });
    const error = el('p', { class: 'field-error', role: 'alert' });
    const cancel = new Button({ label: i18n.t('common.cancel') });
    const apply = new Button({ label: i18n.t('nation.useFlag'), variant: 'primary' });
    const dialog = el(
        'dialog',
        {
            class: 'identity-lab-page nation-flag-editor',
            'aria-labelledby': 'nation-flag-editor-title',
        },
        el(
            'header',
            { class: 'nation-flag-editor-header' },
            el('h2', { id: 'nation-flag-editor-title', text: i18n.t('nation.designFlag'), tabindex: -1 }),
            el('div', { class: 'identity-actions' }, cancel.element, apply.element),
            error,
        ),
        host,
    );
    document.body.append(dialog);
    const editor = createFlagEditor(host, { locale: i18n.locale, initialRecipe: recipe });
    const release = parentScope.own(() => scope.dispose());
    scope.own(() => {
        dialog.close();
        dialog.remove();
        if (previous?.isConnected) previous.focus({ preventScroll: true });
    });
    scope.own(() => editor.dispose());
    scope.listen(cancel.element, 'click', release);
    scope.listen(dialog, 'cancel', (event) => {
        event.preventDefault();
        release();
    });
    scope.listen(apply.element, 'click', async () => {
        if (apply.pending || scope.closed) return;
        apply.setPending(true);
        host.inert = true;
        error.textContent = '';
        const revision = editor.revision;
        try {
            const result = await editor.compile();
            if (scope.closed) return;
            if (revision !== editor.revision) throw new Error('Flag changed while rendering');
            // Enforce the same transport limits before updating the wizard draft.
            serializeRecipe(result.recipe);
            if (result.png.size > 2097152) throw new Error('Flag image too large');
            onApply({
                recipe: result.recipe,
                file: new File([result.png], 'nation-flag.png', { type: 'image/png' }),
            });
            release();
        } catch {
            if (!scope.closed) error.textContent = i18n.t('nation.flagEditorFailed');
        } finally {
            if (!scope.closed) {
                apply.setPending(false);
                host.inert = false;
            }
        }
    });
    dialog.showModal();
    dialog.querySelector('h2').focus();
    return release;
}
