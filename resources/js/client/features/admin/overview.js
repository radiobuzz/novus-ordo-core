import { maintenancePanel } from './maintenance.js';
import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { MetricCard, cardStrip } from '../../ui/MetricCard.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { dataTable } from '../../ui/DataTable.js';
import { confirmDialog } from '../../ui/ConfirmDialog.js';
import { MapViewport } from '../../ui/map/MapViewport.js';
import { mapDefinitionFor } from '../../ui/map/HexMap.js';
import { createLayers } from '../../ui/map/layers.js';
import { LocalizationService } from '../../services/LocalizationService.js';
import { aiAdminPanel } from '../../experimental-ai/admin.js';

export async function overview(app, scope, id) {
    if (!id)
        return el(
            'div',
            { class: 'admin-stack' },
            panel(
                { title: 'Your first world', tone: 'accent' },
                el('p', {
                    text: 'No games exist yet. Prepare a generated world in the map workspace.',
                }),
                app.button(scope, 'Open map workspace', () => app.navigate('maps')),
            ),
            maintenancePanel(app, scope),
        );
    const [game, geography] = await Promise.all([
        app.service.read(`/games/${id}`, scope),
        app.service.read(`/games/${id}/map`, scope),
    ]);
    scope.signal.throwIfAborted();
    if (game.turn_id !== geography.turn_id)
        throw new Error(
            'The turn changed while loading this overview. Refresh status to load a consistent view.',
        );
    const act = async (action) => {
        if (
            !(await confirmDialog(scope, {
                title: action === 'rollback' ? 'Roll back this turn?' : 'Force the next turn?',
                message:
                    action === 'rollback'
                        ? `Game ${id}: delete turn ${game.turn_number} and restore turn ${game.turn_number - 1}. Data created in the deleted turn will be removed by the existing rollback rules.`
                        : `Game ${id}: resolve turn ${game.turn_number} now, even if nations are not ready. This executes upkeep, movement and battles.`,
                confirmLabel: action === 'rollback' ? `Roll back game ${id}` : `Advance game ${id}`,
            }))
        )
            return;
        let changed = false;
        await app.run(async () => {
            const result = await app.service.write(`/games/${id}/turn`, { action, turn_id: game.turn_id });
            app.notify(`Game ${id} is now at turn ${result.turn_number}.`);
            await app.loadGames();
            changed = true;
        });
        if (changed) await app.openFromHash();
    };
    const manage = async (action) => {
        const verb = { activate: 'Activate', deactivate: 'Deactivate', delete: 'Delete' }[action];
        const message =
            action === 'delete'
                ? `Permanently delete game ${id}, including its ${game.nation_count} nations, all turns, messages, AI records and uploaded flags/portraits? This cannot be undone. Accounts and saved maps will remain.`
                : action === 'deactivate'
                  ? `Deactivate game ${id}? Playing, joining, AI actions and turn advancement will stop. All game data will remain for reactivation.`
                  : `Activate game ${id}? Players and AI can resume the existing turn. Its deadline is unchanged; an expired turn may advance on the next scheduled check. Other games remain active.`;
        if (
            !(await confirmDialog(scope, {
                title: `${verb} game ${id}?`,
                message,
                confirmLabel: `${verb} game ${id}`,
                danger: action !== 'activate',
            })) ||
            scope.closed
        )
            return;
        let refreshed = false;
        await app.run(async () => {
            const result = await app.service.write(`/games/${id}/lifecycle`, {
                action,
                context_revision: game.context_revision,
            });
            const outcome =
                action === 'delete'
                    ? `Game ${id} deleted.`
                    : `Game ${id} ${action === 'activate' ? 'activated' : 'deactivated'}.`;
            try {
                await app.loadGames();
                refreshed = true;
                app.notify(
                    outcome +
                        (result.cleanup_complete === false
                            ? ' Some uploaded files could not be removed; check the server log.'
                            : ''),
                );
            } catch {
                // The write succeeded. Retry only the directory read, never the destructive command.
                app.notify(
                    `${outcome} The game list could not refresh. Use Refresh status to reload it.`,
                    true,
                );
                app.content.replaceChildren(
                    el('p', { text: 'Game state changed. Refresh status before another operation.' }),
                );
                void scope.dispose();
            }
        });
        if (refreshed && !app.scope.closed) await app.openFromHash();
    };
    const next = app.button(scope, 'Force next turn', () => act('advance'), {
        variant: 'primary',
        disabled: !game.active || game.victory_status === 'HasBeenWon',
    });
    const rollback = app.button(scope, 'Rollback last turn', () => act('rollback'), {
        variant: 'danger',
        disabled: !game.active || game.turn_number < 2,
    });
    const selected = el('p', {
        class: 'admin-map-selection',
        text: 'Select a territory to inspect its identity.',
    });
    const i18n = new LocalizationService({ read: () => ({ locale: 'en' }), write: () => {} });
    document.title = 'Novus Ordo · Administration';
    const viewport = new MapViewport({
        scope,
        i18n,
        definition: mapDefinitionFor(geography.map, geography.territories),
        territories: geography.territories,
        layers: createLayers(),
        onSelect: (territory) => {
            if (territory)
                selected.textContent = `${territory.name} · territory #${territory.territory_id} · ${territory.terrain_type} · ${territory.owner_nation_id ? `nation #${territory.owner_nation_id}` : 'Unclaimed'}`;
        },
    });
    return el(
        'div',
        { class: 'admin-stack' },
        el(
            'div',
            { class: 'admin-page-heading' },
            el(
                'div',
                {},
                el('p', { class: 'admin-eyebrow', text: 'World operations' }),
                el('h1', { text: `Game ${id} command centre` }),
            ),
            new StatusBadge({
                label: game.active ? 'Active game' : 'Inactive',
                tone: game.active ? 'accent' : 'neutral',
            }).element,
        ),
        cardStrip(
            'Game status',
            new MetricCard({
                label: 'Current turn',
                value: game.turn_number,
                detail: game.turn_ended ? 'Turn ended / resolution state' : 'Open for orders',
            }),
            new MetricCard({
                label: 'Nations ready',
                value: `${game.ready_count} / ${game.nation_count}`,
                detail: 'Force bypasses human readiness; passive players must finish first',
            }),
            new MetricCard({
                label: 'Territories',
                value: game.territory_count,
                detail: 'Generated world',
            }),
            new MetricCard({
                label: 'Victory',
                value: game.victory_status === 'HasBeenWon' ? 'Decided' : 'Contested',
                detail: game.active ? 'Live game' : 'Retained game data',
            }),
        ),
        el(
            'div',
            { class: 'admin-overview-grid' },
            panel({ title: 'World map', tone: 'accent' }, viewport.element, selected),
            el(
                'div',
                { class: 'admin-stack' },
                panel(
                    { title: 'Turn control', tone: 'warning' },
                    el('p', { text: `All actions here target game ${id}, turn ${game.turn_number}.` }),
                    el('div', { class: 'admin-actions' }, next, rollback),
                    el('p', {
                        class: 'admin-muted',
                        text: game.active
                            ? 'Next turn and force-next-turn use the same existing engine operation. Rollback is unavailable on turn 1.'
                            : 'Activate this game to resume turn controls.',
                    }),
                ),
                panel(
                    { title: 'Game management' },
                    el('p', {
                        text: `Manage game ${id}. Deactivation keeps its data; deletion is permanent.`,
                    }),
                    el(
                        'div',
                        { class: 'admin-actions' },
                        app.button(scope, game.active ? 'Deactivate game' : 'Activate game', () =>
                            manage(game.active ? 'deactivate' : 'activate'),
                        ),
                        app.button(scope, 'Delete game', () => manage('delete'), { variant: 'danger' }),
                    ),
                ),
                panel(
                    { title: 'Create another world' },
                    el('p', {
                        text: 'Creating a game adds an independent active world. Existing games remain active.',
                    }),
                    el(
                        'div',
                        { class: 'admin-actions' },
                        app.button(scope, 'Prepare generated map', () => app.navigate('maps', id)),
                    ),
                ),
            ),
        ),
        panel(
            { title: 'Nations & readiness' },
            game.nations.length
                ? dataTable(
                      'Nations in selected game',
                      ['Nation', 'User', 'Divisions', 'Readiness'],
                      game.nations.map((nation) => [
                          `${nation.name} (#${nation.nation_id})`,
                          `#${nation.user_id}`,
                          nation.divisions,
                          new StatusBadge({
                              label: nation.ready ? 'Ready' : 'Planning',
                              tone: nation.ready ? 'ready' : 'neutral',
                          }).element,
                      ]),
                  )
                : el('p', { text: 'No nations have joined this game yet.' }),
        ),
        await aiAdminPanel(app, scope, { ...game, game_id: id }),
        maintenancePanel(app, scope),
    );
}
