import { el } from '../ui/dom.js';
import { panel } from '../ui/Panel.js';
import { confirmDialog } from '../ui/ConfirmDialog.js';
import { Button } from '../ui/Button.js';
import { FieldShell } from '../ui/FieldShell.js';

export async function aiAdminPanel(app, scope, game) {
    let report = await app.service.read(`/games/${game.game_id ?? game.id}/ai`, scope);
    if (!report.status) return null;
    const id = report.status.game_id;
    const output = el('div');
    const releaseNation = el('select', { 'aria-label': 'Passive nation to release' });
    const assignNation = el('select', { 'aria-label': 'Manual nation to automate' });
    let takeover;
    let assign;
    const replaceOptions = (select, rows, emptyLabel) => {
        const selected = Number(select.value);
        select.replaceChildren(
            ...(rows.length
                ? rows.map((row) =>
                      el('option', {
                          value: row.nation_id,
                          text: `${row.name}${row.ready ? ' · Ready' : ' · Planning'}`,
                          selected: row.nation_id === selected,
                      }),
                  )
                : [el('option', { value: '', text: emptyLabel })]),
        );
        select.disabled = !rows.length;
    };
    const draw = () => {
        output.replaceChildren(
            el('p', {
                text: `Turn ${report.status.turn_number} · ${report.status.finished ? 'Finished' : report.status.paused ? 'Paused' : 'Running'}`,
            }),
            el('p', {
                class: 'admin-muted',
                text: 'Temporary passive mode: automated nations only submit Ready. They choose no policies, production, deployments, orders, attacks or diplomacy. Ordinary seasonal simulation still applies to them.',
            }),
            ...report.reports.map((player) =>
                el('p', {
                    text: `${player.name}: ${player.ready ? 'Ready' : 'Planning'} · ${player.result?.explanation ?? 'No passive turn recorded yet'}`,
                }),
            ),
        );
        replaceOptions(releaseNation, report.status.players, 'No passive nations');
        replaceOptions(assignNation, report.manual_nations ?? [], 'No manual nations available');
        takeover?.control.setDisabled(
            !game.active || report.status.finished || !report.status.players.length,
        );
        assign?.control.setDisabled(
            !game.active ||
                report.status.finished ||
                !(report.manual_nations ?? []).length ||
                report.status.players.length >= 10,
        );
    };
    const context = () => ({
        game_id: id,
        turn_id: report.status.turn_id,
        generation: report.status.generation,
        nation_id: report.status.next_nation_id,
    });
    const act = (action) =>
        app.run(async () => {
            if (action === 'step') await app.service.write(`/games/${id}/ai/step`, context());
            else await app.service.write(`/games/${id}/ai/control`, { ...context(), action });
            report = await app.service.read(`/games/${id}/ai`, scope);
            draw();
            app.notify(
                action === 'step'
                    ? 'One passive nation became Ready. No gameplay choices were submitted.'
                    : `Passive players: ${action} completed.`,
            );
        });
    let stopped = false;
    const stop = new Button({ label: 'Stop after this nation' });
    stop.element.hidden = true;
    scope.listen(stop.element, 'click', () => {
        stopped = true;
    });
    const batch = app.button(
        scope,
        'Ready remaining passive nations',
        () =>
            app.run(async () => {
                stopped = false;
                stop.element.hidden = false;
                try {
                    for (
                        let index = 0;
                        index < 10 && !stopped && !scope.closed && report.status.next_nation_id;
                        index++
                    ) {
                        await app.service.write(`/games/${id}/ai/step`, context());
                        report = await app.service.read(`/games/${id}/ai`, scope);
                        draw();
                    }
                    app.notify('Passive batch stopped. Human readiness was not changed.');
                } finally {
                    stop.element.hidden = true;
                }
            }),
        { disabled: !game.active || report.status.finished },
    );
    takeover = app.button(
        scope,
        'Release to manual control',
        async () => {
            const target = Number(releaseNation.value);
            const savedContext = context();
            if (
                !(await confirmDialog(scope, {
                    title: `Release ${releaseNation.selectedOptions[0]?.textContent}?`,
                    message:
                        'Removes its passive controller only. Its nation, user and history remain. The nation returns to Planning.',
                    confirmLabel: 'Release controller',
                }))
            )
                return;
            await app.run(async () => {
                report = await app.service.write(`/games/${id}/ai/control`, {
                    ...savedContext,
                    action: 'takeover',
                    nation_id: target,
                });
                draw();
                app.notify('Passive controller removed; nation preserved and returned to Planning.');
            });
        },
        { disabled: !game.active },
    );
    assign = app.button(
        scope,
        'Assign passive control',
        async () => {
            const target = Number(assignNation.value);
            const savedContext = context();
            if (
                !(await confirmDialog(scope, {
                    title: `Automate ${assignNation.selectedOptions[0]?.textContent}?`,
                    message:
                        'The nation and account remain intact. The passive controller will only submit Ready on future open turns.',
                    confirmLabel: 'Assign passive control',
                }))
            )
                return;
            await app.run(async () => {
                report = await app.service.write(`/games/${id}/ai/control`, {
                    ...savedContext,
                    action: 'assign',
                    nation_id: target,
                });
                draw();
                app.notify('Passive controller assigned; nation, account and history preserved.');
            });
        },
        { disabled: !game.active },
    );
    draw();
    return panel(
        { title: 'Passive players · temporary' },
        output,
        el(
            'div',
            { class: 'admin-actions' },
            ...['step', 'pause', 'resume'].map((action) =>
                app.button(scope, action, () => act(action), {
                    disabled: !game.active || report.status.finished,
                }),
            ),
        ),
        batch,
        stop.element,
        el('p', {
            text: 'Step marks one passive nation Ready without advancing an unready human. The normal turn engine resolves when every participant is Ready.',
        }),
        new FieldShell({
            control: releaseNation,
            label: 'Passive nation',
            help: 'Release returns the nation to Planning for manual play.',
        }).element,
        takeover,
        new FieldShell({
            control: assignNation,
            label: 'Manual nation',
            help: 'Assigns the temporary pass-only controller. Maximum 10 automated nations.',
        }).element,
        assign,
    );
}
