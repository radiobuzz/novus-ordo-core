import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { glassPanel } from '../../ui/GlassPanel.js';
import { FormField } from '../../ui/FormField.js';
import { FeedbackMessage } from '../../ui/FeedbackMessage.js';
import { Button } from '../../ui/Button.js';
class LoginInstance extends Component {
    async render() {
        const { i18n, session, entry } = this.services;
        const form = el('form', { class: 'login-form' });
        const user = new FormField({
            scope: this.scope,
            i18n,
            id: `${this.id}-username`,
            key: 'entry.username',
            autocomplete: 'username',
        });
        const password = new FormField({
            scope: this.scope,
            i18n,
            id: `${this.id}-password`,
            key: 'entry.password',
            type: 'password',
            autocomplete: 'current-password',
        });
        user.input.required = true;
        password.input.required = true;
        const submitControl = new Button({ type: 'submit', variant: 'primary', className: 'entry-primary' });
        const submit = submitControl.element;
        const feedback = new FeedbackMessage();
        let pending = false,
            error;
        const update = () => {
            submit.textContent = i18n.t(pending ? 'entry.signingIn' : 'entry.login');
            if (error) feedback.show(i18n.error(error));
        };
        form.append(user.element, password.element, feedback.element, submit);
        this.element.append(
            glassPanel(
                el('div', { class: 'panel-insignia', 'aria-hidden': 'true', text: 'N' }),
                i18n.bind(this.scope, el('p', { class: 'entry-eyebrow' }), 'entry.edition'),
                i18n.bind(this.scope, el('h1'), 'entry.welcome'),
                i18n.bind(this.scope, el('p', { class: 'panel-intro' }), 'entry.intro'),
                form,
                el(
                    'details',
                    { class: 'login-note' },
                    i18n.bind(this.scope, el('summary'), 'entry.install'),
                    i18n.bind(this.scope, el('p'), 'entry.installBody'),
                    el('code', { text: 'php artisan app:provision-admin ADMIN_NAME' }),
                ),
                i18n.bind(this.scope, el('p', { class: 'login-note' }), 'entry.account'),
            ),
        );
        i18n.changed.subscribe(this.scope, update);
        update();
        this.scope.own(() => {
            password.input.value = '';
        });
        this.scope.listen(form, 'submit', async (event) => {
            event.preventDefault();
            if (pending) return;
            pending = true;
            submitControl.setPending(true);
            error = null;
            feedback.show('');
            update();
            try {
                await session.login(user.input.value.trim(), password.input.value, this.scope.signal);
                password.input.value = '';
                if (!this.scope.closed) await entry.authenticated();
            } catch (failure) {
                if (this.scope.closed) return;
                error = failure;
                password.input.value = '';
                if (failure.category === 'validation') {
                    feedback.show(i18n.t('errors.validation'));
                    user.setError(failure.fields?.username?.join(' ') ?? '');
                    password.setError(failure.fields?.password?.join(' ') ?? '');
                } else feedback.show(i18n.error(failure));
            } finally {
                if (!this.scope.closed) {
                    pending = false;
                    submitControl.setPending(false);
                    update();
                }
            }
        });
    }
}
export function createInstance(options) {
    return new LoginInstance(options);
}
