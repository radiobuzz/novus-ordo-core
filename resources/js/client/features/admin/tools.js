import { el } from '../../ui/dom.js';
import { actionLink } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { panel } from '../../ui/Panel.js';
import { dataTable } from '../../ui/DataTable.js';

export async function tools(app, scope, gameId) {
    const kind = el(
        'select',
        {},
        el('option', { value: 'division', text: 'Division' }),
        el('option', { value: 'deployment', text: 'Deployment' }),
    );
    const id = el('input', { type: 'number', min: 1, step: 1, required: true });
    const result = el('div', { role: 'status' });
    const fields = el(
        'fieldset',
        { class: 'admin-form' },
        new FieldShell({ control: kind, label: 'Object type' }).element,
        new FieldShell({ control: id, label: 'Object ID' }).element,
        app.button(scope, 'Inspect object', null, { type: 'submit', disabled: !gameId }),
    );
    const form = el('form', {}, fields);
    app.lockForm(scope, fields);
    scope.listen(form, 'submit', (event) => {
        event.preventDefault();
        if (!gameId || app.busy) return;
        void app.run(async () => {
            result.replaceChildren();
            const data = await app.service.read(
                `/games/${gameId}/inspect?kind=${kind.value}&id=${id.valueAsNumber}`,
                scope,
            );
            result.append(
                dataTable(
                    'Object inspection',
                    ['Field', 'Value'],
                    Object.entries(data).map(([key, value]) => [key, String(value)]),
                ),
            );
            app.notify(`Object inspected in game ${gameId}.`);
        });
    });
    return el(
        'div',
        { class: 'admin-stack' },
        el('h1', { text: 'Object inspector' }),
        panel(
            { title: `Object inspector · ${gameId ? `Game ${gameId}` : 'select a game'}`, tone: 'accent' },
            el('p', {
                text: 'Lookups are limited to the selected game, including archived games. An object from another game is not returned.',
            }),
            form,
            result,
        ),
        actionLink('Tools & experiments', app.boot.urls.tools),
    );
}
