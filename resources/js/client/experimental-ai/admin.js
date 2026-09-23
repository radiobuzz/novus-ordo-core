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
    const preview = el('pre', { style: 'white-space:pre-wrap' });
    const releaseNation = el('select', { 'aria-label': 'AI nation to release' });
    const assignNation = el('select', { 'aria-label': 'Manual nation to assign to AI' });
    const script = el('select');
    for (const entry of report.scripts ?? [])
        script.append(el('option', { value: entry.id, text: entry.name }));
    script.value = 'experimental-v1';
    const snapshotNation = el('select');
    const aggression = el(
        'select',
        { 'aria-label': 'Assigned AI aggressiveness' },
        el('option', { value: 20, text: 'Cautious' }),
        el('option', { value: 50, text: 'Balanced', selected: true }),
        el('option', { value: 85, text: 'Aggressive' }),
    );
    let takeover;
    let assign;
    let changeScript;
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
                text: `Turn ${report.status.turn_number} · ${report.status.finished ? 'Finished' : report.status.paused ? 'Paused' : 'Running'} · Human protection ${report.status.protect_humans ? 'on' : 'off'}`,
            }),
            ...report.reports.map((p) =>
                el('p', {
                    text: `${p.name}: ${p.ready ? 'Ready' : 'Planning'} · ${p.script ?? 'experimental-v1'} · ${p.result?.fallback ? 'Fallback from ' + p.result.fallback.script + ' (' + p.result.fallback.reason + ') · ' : ''}${p.result?.explanation ?? 'No decision yet'}`,
                }),
            ),
        );
        replaceOptions(releaseNation, report.status.players, 'No AI-controlled nations');
        replaceOptions(assignNation, report.manual_nations ?? [], 'No manual nations available');
        replaceOptions(
            snapshotNation,
            [...report.status.players, ...(report.manual_nations ?? [])],
            'No nations',
        );
        takeover?.control.setDisabled(
            !game.active || report.status.finished || !report.status.players.length,
        );
        changeScript?.control.setDisabled(
            !game.active || report.status.finished || !report.status.players.length || !script.value,
        );
        assign?.control.setDisabled(
            !game.active ||
                report.status.finished ||
                !(report.manual_nations ?? []).length ||
                report.status.players.length >= 10 ||
                !script.value,
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
            if (action === 'preview' || action === 'step') {
                const result = await app.service.write(`/games/${id}/ai/step`, {
                    ...context(),
                    preview: action === 'preview',
                });
                preview.textContent = JSON.stringify(result, null, 2);
            } else await app.service.write(`/games/${id}/ai/control`, { ...context(), action });
            report = await app.service.read(`/games/${id}/ai`, scope);
            draw();
            app.notify(`AI ${action} completed. Step never forces unready human players.`);
        });
    let stopped = false;
    const stop = new Button({ label: 'Stop after this AI' });
    stop.element.hidden = true;
    scope.listen(stop.element, 'click', () => {
        stopped = true;
    });
    const batch = app.button(
        scope,
        'Play remaining AI this turn',
        () =>
            app.run(async () => {
                stopped = false;
                stop.element.hidden = false;
                try {
                    for (
                        let i = 0;
                        i < 10 && !stopped && !scope.closed && report.status.next_nation_id;
                        i++
                    ) {
                        await app.service.write(`/games/${id}/ai/step`, context());
                        report = await app.service.read(`/games/${id}/ai`, scope);
                        draw();
                    }
                    app.notify('AI batch stopped. No human readiness was changed.');
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
                        'Removes its experimental controller only. Its nation, user, existing orders and history remain. The nation returns to Planning so it can be played immediately.',
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
                app.notify('Controller removed; nation preserved and returned to Planning.');
            });
        },
        { disabled: !game.active },
    );
    assign = app.button(
        scope,
        'Assign AI control',
        async () => {
            const target = Number(assignNation.value);
            const selectedScript = script.value;
            const selectedAggression = Number(aggression.value);
            const savedContext = context();
            if (
                !(await confirmDialog(scope, {
                    title: `Give ${assignNation.selectedOptions[0]?.textContent} to ${selectedScript}?`,
                    message:
                        'The nation and account remain intact. Existing orders and readiness are preserved; if it is still Planning, the AI can act this turn. Manual commands are blocked until the controller is released again.',
                    confirmLabel: 'Assign controller',
                }))
            )
                return;
            await app.run(async () => {
                report = await app.service.write(`/games/${id}/ai/control`, {
                    ...savedContext,
                    action: 'assign',
                    nation_id: target,
                    aggression: selectedAggression,
                    script: selectedScript,
                });
                draw();
                app.notify('AI controller assigned; nation, account, orders and readiness preserved.');
            });
        },
        { disabled: !game.active },
    );
    changeScript = app.button(scope, 'Change AI script', async () => {
        const target = Number(releaseNation.value);
        const selectedScript = script.value;
        const savedContext = context();
        if (
            !(await confirmDialog(scope, {
                title: `Switch ${releaseNation.selectedOptions[0]?.textContent} to ${selectedScript}?`,
                message:
                    'Orders and readiness stay as they are. Each script keeps separate notes. A Ready nation uses the new script next turn.',
                confirmLabel: 'Change script',
            }))
        )
            return;
        await app.run(async () => {
            report = await app.service.write(`/games/${id}/ai/control`, {
                ...savedContext,
                action: 'script',
                nation_id: target,
                script: selectedScript,
            });
            draw();
            app.notify('AI script changed. Current orders and readiness preserved.');
        });
    });
    scope.listen(script, 'change', draw);
    const download = app.button(
        scope,
        'Download player snapshot',
        () =>
            app.run(async () => {
                const target = Number(snapshotNation.value);
                const data = await app.service.read(`/games/${id}/ai/snapshot?nation_id=${target}`, scope);
                const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                );
                const link = el('a', { href: url, download: `game-${id}-nation-${target}-snapshot.json` });
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                app.notify(
                    'Player snapshot downloaded. It includes this nation’s private information and script notes.',
                );
            }),
        { disabled: !game.nations?.length },
    );
    draw();
    return panel(
        { title: 'AI Players · experimental · disposable' },
        output,
        el(
            'div',
            { class: 'admin-actions' },
            ...['preview', 'step', 'pause', 'resume'].map((action) =>
                app.button(scope, action, () => act(action), {
                    disabled: !game.active || report.status.finished,
                }),
            ),
        ),
        batch,
        stop.element,
        el('p', {
            text: 'Step plays one AI without advancing the turn. Preview sends no orders. Open the player interface with Auto-ready to watch a continuous game.',
        }),
        new FieldShell({
            control: releaseNation,
            label: 'AI-controlled nation',
            help: 'Release makes the nation Planning so it can be played manually immediately.',
        }).element,
        takeover,
        new FieldShell({
            control: script,
            label: 'AI script',
            help: 'Installed PHP scripts. Used for assignment or changing the selected AI nation.',
        }).element,
        changeScript,
        new FieldShell({
            control: assignNation,
            label: 'Manual nation',
            help: 'Any nation in this game can be assigned, including your own. Maximum 10 AI players.',
        }).element,
        new FieldShell({ control: aggression, label: 'New AI aggressiveness' }).element,
        assign,
        new FieldShell({
            control: snapshotNation,
            label: 'Snapshot nation',
            help: 'Export player information and notes for the standalone author kit.',
        }).element,
        download,
        el('a', { href: app.service.base + '/ai/author-kit', text: 'Download AI author kit (.zip)' }),
        preview,
    );
}
