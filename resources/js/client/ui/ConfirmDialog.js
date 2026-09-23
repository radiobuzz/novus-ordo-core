import { Scope } from '../runtime/Scope.js';
import { el } from './element.js';
import { Button } from './Button.js';

let nextId = 0;
/** Caller provides target/consequence and owns the command. Escape/cancel is always safe. */
export function confirmDialog(
    parentScope,
    { title, message, content = null, confirmLabel = 'Confirm', danger = true },
) {
    if (parentScope.closed) return Promise.resolve(false);
    return new Promise((resolve) => {
        const scope = new Scope();
        const previous = document.activeElement;
        const id = `ui-confirm-${++nextId}`;
        const cancel = new Button({ label: 'Cancel' });
        const confirm = new Button({ label: confirmLabel, variant: danger ? 'danger' : 'primary' });
        const dialog = el(
            'dialog',
            { class: 'ui-confirm', 'aria-labelledby': id, 'aria-describedby': `${id}-message` },
            el('h2', { id, text: title }),
            el('p', { id: `${id}-message`, text: message }),
            content,
            el('div', { class: 'ui-panel-actions' }, cancel.element, confirm.element),
        );
        let finished = false,
            release;
        const finish = (accepted) => {
            if (finished) return;
            finished = true;
            release?.();
            void scope.dispose();
            dialog.close();
            dialog.remove();
            if (previous?.isConnected) previous.focus();
            resolve(accepted);
        };
        release = parentScope.own(() => finish(false));
        scope.listen(cancel.element, 'click', () => finish(false));
        scope.listen(confirm.element, 'click', () => finish(true));
        scope.listen(dialog, 'cancel', (event) => {
            event.preventDefault();
            finish(false);
        });
        scope.listen(dialog, 'close', () => finish(false));
        document.body.append(dialog);
        dialog.showModal();
        cancel.element.focus();
    });
}
