import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { confirmDialog } from '../../ui/ConfirmDialog.js';

/** Global maintenance, independent of the selected game. AdminService owns all requests. */
export function maintenancePanel(app, scope) {
    if (!app.boot.canMaintainWorlds) return null;
    const reset = async () => {
        let completed = false;
        await app.run(async () => {
            const preview = await app.service.read('/maintenance', scope);
            const c = preview.counts;
            if (
                !(await confirmDialog(scope, {
                    title: 'Reset all worlds?',
                    message: `Permanently delete ALL ${c.games ?? 0} games, their nations and turn history, ${c.map_drafts ?? 0} saved maps, and all database-authored policy/resource templates. Accounts, admin access, site settings and source assets remain. This cannot be undone.`,
                    confirmLabel: 'Delete all worlds and saved maps',
                })) ||
                scope.closed
            ) {
                app.notify('Reset cancelled. Nothing was changed.');
                return;
            }
            const result = await app.service.write('/maintenance/reset-worlds', {
                token: preview.token,
                confirmation: 'RESET WORLDS',
            });
            const incomplete = result.cleanup_failed_game_ids.length || result.status_cleanup.failed.length;
            const message = incomplete
                ? 'World data reset. Some generated files could not be removed; inspect the application log and file permissions. You can retry leftover turn-status cleanup below.'
                : 'All worlds, saved maps and gameplay templates removed. Accounts preserved. You can create a fresh world.';
            try {
                await app.loadGames();
                completed = true;
                app.notify(message, Boolean(incomplete));
            } catch {
                app.notify(
                    `${message} The game list could not refresh. Use Refresh status; do not repeat the reset.`,
                    true,
                );
                app.content.replaceChildren(
                    el('p', { text: 'Reset finished. Refresh status to reload Administration.' }),
                );
                void scope.dispose();
            }
        });
        if (completed && !app.scope.closed) await app.openFromHash();
    };
    const clean = async () => {
        if (
            !(await confirmDialog(scope, {
                title: 'Clean leftover turn-status files?',
                message:
                    'Remove status files only for games that no longer exist. Existing games, maps, accounts and their status files will remain.',
                confirmLabel: 'Clean leftover files',
            })) ||
            scope.closed
        )
            return;
        await app.run(async () => {
            const result = await app.service.write('/maintenance/clean-status-files', {});
            app.notify(
                `Removed ${result.removed} leftover turn-status files.` +
                    (result.failed.length
                        ? ` Could not remove: ${result.failed.join(', ')}. Check server directory permissions.`
                        : ''),
                Boolean(result.failed.length),
            );
        });
    };
    return panel(
        { title: 'Maintenance', tone: 'warning' },
        el('p', {
            text: 'Global actions for this server, regardless of the selected game. Reset briefly pauses access and restores it when the operation ends.',
        }),
        el(
            'div',
            { class: 'admin-actions' },
            app.button(scope, 'Reset all worlds…', reset, { variant: 'danger' }),
            app.button(scope, 'Clean leftover turn-status files…', clean),
        ),
    );
}
