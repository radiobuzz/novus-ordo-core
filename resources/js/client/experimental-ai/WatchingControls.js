import { el } from '../ui/dom.js';
import { Button } from '../ui/Button.js';
import { Disclosure } from '../ui/Disclosure.js';
import { FieldShell } from '../ui/FieldShell.js';

export function watchingControls(scope, services) {
    const driver = services.automation;
    const t = (key, params) => services.i18n.t(`automation.${key}`, params);
    const disclosure = new Disclosure(scope, {
        label: t('off'),
        group: 'game-hud',
        className: 'hud-automation',
    });
    const toggle = new Button({ label: 'Enable Auto-ready' });
    const resume = new Button({ label: 'Resume automation' });
    const delay = el(
        'select',
        {},
        ...[3, 5, 10, 20, 30, 60].map((value) => el('option', { value, text: `${value} s` })),
    );
    delay.value = String(driver.delay);
    const note = el('p', { role: 'status' });
    const players = el('div');
    const help = el('p');
    const delayField = new FieldShell({ control: delay, label: t('delay') });
    disclosure.content.append(help, delayField.element, toggle.element, resume.element, note, players);
    scope.listen(toggle.element, 'click', () => driver.setAutoReady(!driver.autoReady));
    scope.listen(delay, 'change', () => {
        driver.delay = Number(delay.value);
        driver.deadline = null;
    });
    scope.listen(resume.element, 'click', () => driver.resume());
    const update = () => {
        disclosure.setLabel(
            driver.autoReady ? t('countdown', { seconds: driver.remaining ?? '…' }) : t('off'),
        );
        toggle.setLabel(t(driver.autoReady ? 'pause' : 'enable'));
        resume.setLabel(t('resume'));
        help.textContent = t('help');
        delayField.label.textContent = t('delay');
        resume.element.hidden = !driver.paused;
        note.textContent = driver.reason
            ? t(driver.reason)
            : t(services.world.snapshot?.nation?.automation?.protect_humans ? 'protected' : 'unprotected');
        const ai = services.world.snapshot?.nation?.automation;
        players.replaceChildren(
            ...(ai?.players ?? []).map((p) =>
                el('p', { text: `${p.name} · ${t(p.ready ? 'ready' : 'planning')} · AI` }),
            ),
        );
        if (ai?.paused) note.textContent = t('serverPaused');
        if (ai?.finished) note.textContent = t('finished');
        if (services.world.snapshot?.nation?.automated_nation) note.textContent = t('controlled');
    };
    driver.changed.subscribe(scope, update);
    services.world.store.subscribe(scope, update);
    services.i18n.changed.subscribe(scope, update);
    update();
    return disclosure.element;
}
