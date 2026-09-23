import { el } from '../../ui/dom.js';
import { panel } from '../../ui/Panel.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { dataTable } from '../../ui/DataTable.js';
import { actionLink } from '../../ui/Button.js';
import { MapStudio } from '../map-generation/MapStudio.js';

export async function maps(app, scope) {
    if (!app.boot.canCreateMaps)
        return panel(
            { title: 'Map workspace' },
            el('p', {
                text: 'Map generation keeps its existing administrator-only access check. Other administration tools retain their existing development-panel access.',
            }),
            actionLink('Open the public development map laboratory', app.boot.urls.lab),
        );
    const response = await app.service.read('/maps', scope);
    scope.signal.throwIfAborted();
    const name = el('input', { maxlength: 100, placeholder: 'Northern archipelago' });
    const library = el('fieldset', { class: 'admin-form' });
    let selected = null,
        selectedSnapshot = null,
        studio,
        save,
        start,
        download;
    const update = () => {
        if (!studio || !save) return;
        library.disabled = app.busy || studio.busy;
        save.control.setDisabled(!studio.snapshot);
        download.control.setDisabled(!studio.snapshot);
        start.control.setDisabled(!selected || studio.snapshot !== selectedSnapshot);
    };
    studio = new MapStudio({ scope, onChange: update });
    const renderLibrary = () => {
        library.replaceChildren(
            response.maps.length
                ? dataTable(
                      'Saved map library',
                      ['Name', 'Seed', 'Saved', 'Action'],
                      response.maps.map((draft) => [
                          `${draft.name} (#${draft.id})`,
                          draft.seed,
                          new Date(draft.created_at).toLocaleDateString(),
                          el('button', {
                              type: 'button',
                              class: 'ui-button ui-button--quiet',
                              text: 'Load exact map',
                              'data-draft': draft.id,
                              'aria-label': `Load ${draft.name} map ${draft.id}`,
                          }),
                      ]),
                  )
                : el('p', {
                      text: 'No saved maps yet. Generate a landscape, name it and save it here without starting a game.',
                  }),
        );
    };
    scope.listen(library, 'click', (event) => {
        const target = event.target.closest('[data-draft]');
        if (!target || app.busy || studio.busy) return;
        void app.run(async () => {
            const draft = await app.service.read(`/maps/${target.dataset.draft}`, scope);
            studio.load(draft.map);
            selected = draft;
            selectedSnapshot = draft.map;
            name.value = draft.name;
            app.notify(`Loaded exact saved map “${draft.name}”. Existing games were not changed.`);
            update();
        });
    });
    save = app.button(
        scope,
        'Save map to library',
        async () => {
            const snapshot = studio.snapshot;
            if (!snapshot) return;
            if (!name.value.trim()) {
                app.notify('Give this map a name before saving.', true);
                name.focus();
                return;
            }
            const mapName = name.value.trim();
            await app.run(async () => {
                const draft = await app.service.write('/maps', { name: mapName, map: snapshot });
                response.maps.unshift(draft);
                selected = draft;
                selectedSnapshot = snapshot;
                renderLibrary();
                app.notify(`Map “${draft.name}” saved independently of any game.`);
                update();
            });
        },
        { variant: 'primary', disabled: true },
    );
    start = app.button(
        scope,
        'Start game from this map',
        () => {
            if (selected && studio.snapshot === selectedSnapshot) return app.startGame(scope, selected);
        },
        { disabled: true },
    );
    download = app.button(
        scope,
        'Export preview JSON',
        () => {
            if (!studio.snapshot) return;
            const url = URL.createObjectURL(
                new Blob([JSON.stringify(studio.snapshot)], { type: 'application/json' }),
            );
            const release = scope.own(() => URL.revokeObjectURL(url));
            const link = el('a', { href: url, download: 'novus-ordo-map.json' });
            link.click();
            scope.timeout(release, 1000);
        },
        { variant: 'quiet', disabled: true },
    );
    const actions = el(
        'fieldset',
        { class: 'admin-form' },
        new FieldShell({
            control: name,
            label: 'Map name',
            help: 'Each save creates a new immutable entry; existing maps and running games are never overwritten.',
        }).element,
        el('div', { class: 'admin-actions' }, save, start, download),
    );
    app.lockForm(scope, actions);
    app.busyChanged.subscribe(scope, () => studio.setBusy(app.busy));
    renderLibrary();
    update();
    const previous = app.mapWorkspaceDraft;
    if (previous)
        scope.timeout(() => {
            selected = previous.selected;
            selectedSnapshot = previous.selectedSnapshot;
            name.value = previous.name;
            studio.restore(previous.studio);
            update();
        }, 0);
    scope.own(() => {
        app.mapWorkspaceDraft = { name: name.value, selected, selectedSnapshot, studio: studio.capture() };
    });
    return el(
        'div',
        { class: 'admin-stack' },
        el('h1', { text: 'Map workspace' }),
        el('p', {
            text: 'Global map preparation. Generate → save an exact map → optionally create a game. These are separate actions. Running-game geography stays immutable.',
        }),
        panel({ title: 'Saved map library', tone: 'accent' }, library),
        studio.element,
        panel({ title: 'Keep this landscape' }, actions),
    );
}
