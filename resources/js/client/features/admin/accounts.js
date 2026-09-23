import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { dataTable } from '../../ui/DataTable.js';
import { confirmDialog } from '../../ui/ConfirmDialog.js';
import { Scope } from '../../runtime/Scope.js';

export async function accounts(app, scope) {
    const data = await app.service.read('/users', scope);
    scope.signal.throwIfAborted();
    const credential = el('div', { class: 'admin-credential', hidden: true });
    let credentialScope;
    scope.own(() => credentialScope?.dispose());
    const showCredential = (username, password) => {
        void credentialScope?.dispose();
        credentialScope = null;
        credential.replaceChildren();
        credential.hidden = !password;
        if (!password) return;
        credentialScope = new Scope();
        const value = el('input', { readonly: true, autocomplete: 'off' });
        value.value = password;
        credentialScope.own(() => {
            value.value = '';
        });
        credential.append(
            el('p', { text: `Generated password for ${username}. Copy it now; it is not listed again.` }),
            new FieldShell({ control: value, label: 'Generated password' }).element,
            app.button(credentialScope, 'Select password to copy', () => {
                value.focus();
                value.select();
            }),
            app.button(credentialScope, 'Dismiss credential', () => showCredential('', null)),
        );
    };
    const username = el('input', { required: true, maxlength: 100, autocomplete: 'off' });
    const password = el('input', { type: 'password', maxlength: 255, autocomplete: 'new-password' });
    const fields = el(
        'fieldset',
        { class: 'admin-form' },
        new FieldShell({ control: username, label: 'New username' }).element,
        new FieldShell({
            control: password,
            label: 'Initial password',
            help: 'Leave blank to generate a random password.',
        }).element,
        app.button(scope, 'Create user', null, { type: 'submit', variant: 'primary' }),
    );
    const form = el('form', {}, fields);
    app.lockForm(scope, fields);
    const search = el('input', { type: 'search', placeholder: 'Search users' });
    const list = el('fieldset', { class: 'admin-form' });
    app.lockForm(scope, list);
    const select = el('select');
    const resetPassword = el('input', { type: 'password', maxlength: 255, autocomplete: 'new-password' });
    const reset = async (random) => {
        const user = data.users.find((u) => u.user_id === Number(select.value));
        if (!user) return;
        const value = resetPassword.value;
        if (!random && !value) {
            app.notify('Enter a new password, or choose a random password.', true);
            resetPassword.focus();
            return;
        }
        if (
            !(await confirmDialog(scope, {
                title: 'Replace this password?',
                message: `Global account ${user.username} (#${user.user_id}). This replaces the password for all games.`,
                confirmLabel: 'Replace password',
            }))
        )
            return;
        await app.run(async () => {
            showCredential('', null);
            const result = await app.service.write(`/users/${user.user_id}/password`, {
                random,
                password: random ? null : value,
            });
            resetPassword.value = '';
            showCredential(user.username, result.generated_password);
            app.notify(`Password replaced for ${user.username}.`);
        });
    };
    const resetFields = el(
        'fieldset',
        { class: 'admin-form' },
        new FieldShell({ control: select, label: 'Account to update' }).element,
        new FieldShell({ control: resetPassword, label: 'New password' }).element,
        el(
            'div',
            { class: 'admin-actions' },
            app.button(scope, 'Set password', () => reset(false)),
            app.button(scope, 'Set random password', () => reset(true)),
        ),
    );
    app.lockForm(scope, resetFields);
    const enter = async (user, destination) => {
        if (
            !(await confirmDialog(scope, {
                title: 'Enter this user’s session?',
                message: `You will become ${user.username} (#${user.user_id}) in this browser session, including other open tabs. This is not a read-only preview. The admin inspection selection does not select a game for this account.`,
                confirmLabel: 'Switch session',
            }))
        )
            return;
        await app.run(async () => {
            const result = await app.service.write(`/users/${user.user_id}/enter`, { destination });
            location.assign(result.url);
        });
    };
    // One delegated listener avoids retaining controls when the search table is replaced.
    scope.listen(list, 'click', (event) => {
        const target = event.target.closest('[data-enter]');
        if (!target || app.busy) return;
        const user = data.users.find((u) => u.user_id === Number(target.dataset.user));
        if (user) void enter(user, target.dataset.enter);
    });
    const renderUsers = () => {
        const previous = select.value;
        select.replaceChildren(
            ...data.users.map((user) =>
                el('option', { value: user.user_id, text: `${user.username} (#${user.user_id})` }),
            ),
        );
        if (data.users.some((user) => String(user.user_id) === previous)) select.value = previous;
        const visible = data.users.filter((user) =>
            user.username.toLowerCase().includes(search.value.toLowerCase()),
        );
        list.replaceChildren(
            dataTable(
                'Global user accounts',
                ['Username', 'ID', 'Enter session'],
                visible.map((user) => [
                    user.username,
                    user.user_id,
                    el(
                        'div',
                        { class: 'admin-actions' },
                        ...[['client', 'Games']].map(([destination, label]) =>
                            el('button', {
                                type: 'button',
                                class: 'ui-button ui-button--quiet',
                                'data-enter': destination,
                                'data-user': user.user_id,
                                text: label,
                            }),
                        ),
                    ),
                ]),
            ),
        );
    };
    scope.listen(search, 'input', renderUsers);
    scope.listen(form, 'submit', (event) => {
        event.preventDefault();
        if (app.busy) return;
        const body = { username: username.value.trim(), password: password.value || null };
        void app.run(async () => {
            showCredential('', null);
            const result = await app.service.write('/users', body);
            data.users.push({ username: result.username, user_id: result.user_id });
            renderUsers();
            password.value = '';
            username.value = '';
            showCredential(result.username, result.generated_password);
            app.notify(`Account ${result.username} created.`);
        });
    });
    scope.own(() => {
        password.value = '';
        resetPassword.value = '';
        credential.replaceChildren();
    });
    renderUsers();
    return el(
        'div',
        { class: 'admin-stack' },
        el('h1', { text: 'Global accounts' }),
        el('p', {
            text: 'Accounts are shared across games. The working-game selector does not scope password or session changes.',
        }),
        credential,
        el(
            'div',
            { class: 'admin-two-columns' },
            panel({ title: 'Create an account' }, form),
            panel({ title: 'Password management' }, resetFields),
        ),
        panel(
            { title: 'Users & sessions' },
            new FieldShell({ control: search, label: 'Find a user' }).element,
            list,
        ),
    );
}
