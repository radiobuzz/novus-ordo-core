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
    const create = app.button(scope, 'Start classic-map game', () => app.startGame(scope));
    if (!id)
        return panel(
            { title: 'Your first world', tone: 'accent' },
            el('p', {
                text: 'No games exist yet. Create an original-map game or prepare a generated map in the map workspace.',
            }),
            create,
            app.button(scope, 'Open map workspace', () => app.navigate('maps')),
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
        images: app.boot.mapImages,
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
                label: game.active ? 'Active game' : 'Archived · read-only',
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
                detail: 'Force bypasses human readiness; AI steps must finish first',
            }),
            new MetricCard({
                label: 'Territories',
                value: game.territory_count,
                detail: game.map_type === 'classic' ? 'Original map' : 'Generated map · beta',
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
                            : 'Archived games can be inspected but are not reactivated or changed here.',
                    }),
                ),
                panel(
                    { title: 'Create another world' },
                    el('p', {
                        text: 'Creating a game adds an independent active world. Existing games remain active.',
                    }),
                    el(
                        'div',
                        { class: 'admin-actions' },
                        create,
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
    );
}
