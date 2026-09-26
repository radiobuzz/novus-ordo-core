import { Scope } from '../runtime/Scope.js';
import { el } from '../ui/dom.js';
import { Button } from '../ui/Button.js';
import { OwnershipMap } from '../ui/map/OwnershipMap.js';
import './ownership-comparison.scss';

/** The two news consumers delegate intent here; historical frames never enter the world store. */
export function ownershipNewsAction(scope, services, host, context) {
    let close;
    const label = () => services.i18n.t('ownership.view');
    scope.listen(host, 'click', (event) => {
        const action = event.target.closest('[data-ownership-view]');
        if (!action || !host.contains(action)) return;
        const { snapshot } = context();
        if (!snapshot || !services.world.current) return;
        close?.();
        close = openComparison(scope, services, snapshot);
    });
    services.i18n.changed.subscribe(scope, () => {
        for (const action of host.querySelectorAll('[data-ownership-view]')) action.textContent = label();
    });
    return () => {
        if ((context().snapshot?.turn_number ?? 0) < 2) return null;
        const action = new Button({ label: label(), variant: 'quiet' }).element;
        action.dataset.ownershipView = '';
        return action;
    };
}

function openComparison(parent, services, snapshot) {
    const scope = new Scope();
    const close = parent.own(() => scope.dispose());
    const previousFocus = document.activeElement;
    const t = (key, params) => services.i18n.t(`ownership.${key}`, params);
    const title = el('h2', { text: t('title') });
    const notice = el('p', { role: 'status', text: t('loading') });
    const stage = el('div', { class: 'ownership-stage' });
    const phase = el('p', { class: 'ownership-phase' });
    const before = new Button();
    const after = new Button();
    const play = new Button();
    const done = new Button({ label: t('done'), variant: 'primary' });
    const retry = new Button({ label: t('retry') });
    retry.element.hidden = true;
    const controls = el(
        'div',
        { class: 'ownership-controls', hidden: true },
        before.element,
        after.element,
        play.element,
    );
    const dialog = el(
        'dialog',
        { class: 'ownership-comparison', 'aria-label': t('title') },
        title,
        notice,
        stage,
        phase,
        controls,
        el('footer', {}, retry.element, done.element),
    );
    document.body.append(dialog);
    scope.own(() => {
        dialog.close();
        dialog.remove();
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
    scope.listen(done.element, 'click', close);
    scope.listen(dialog, 'cancel', (event) => {
        event.preventDefault();
        close();
    });
    scope.listen(dialog, 'keydown', (event) => event.stopPropagation());
    services.world.store.subscribe(scope, (state) => {
        if (!services.world.same(snapshot, state.snapshot) || state.turnTransition) close();
    });
    if (scope.closed) return close;
    dialog.showModal();
    done.element.focus();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let changedCount = 0,
        frames,
        map,
        mapScope,
        request,
        timer,
        showingAfter = false,
        playing = !motion.matches;
    scope.own(() => mapScope?.dispose());
    scope.own(() => request?.dispose());
    const render = () => {
        dialog.setAttribute('aria-label', t('title'));
        title.textContent = t('title');
        done.setLabel(t('done'));
        retry.setLabel(t('retry'));
        if (!frames) return;
        before.setLabel(t('before', { turn: frames.before.turn }));
        after.setLabel(t('after', { turn: frames.after.turn }));
        before.element.setAttribute('aria-pressed', String(!showingAfter));
        after.element.setAttribute('aria-pressed', String(showingAfter));
        play.setLabel(t(playing ? 'pause' : 'play'));
        const frame = showingAfter ? frames.after : frames.before;
        phase.textContent = t(showingAfter ? 'after' : 'before', { turn: frame.turn });
        notice.textContent = t(changedCount ? 'scope' : 'unchanged', { count: changedCount });
    };
    const schedule = () => {
        timer?.();
        if (playing && frames && !document.hidden)
            timer = scope.timeout(() => {
                showingAfter = !showingAfter;
                map.show(showingAfter, !motion.matches);
                render();
                schedule();
            }, 3200);
    };
    const select = (value) => {
        playing = false;
        showingAfter = value;
        map.show(value, !motion.matches);
        render();
        schedule();
    };
    scope.listen(before.element, 'click', () => select(false));
    scope.listen(after.element, 'click', () => select(true));
    scope.listen(play.element, 'click', () => {
        playing = !playing;
        if (!playing) map?.stopHighlight();
        render();
        schedule();
    });
    scope.listen(document, 'visibilitychange', schedule);
    scope.listen(motion, 'change', () => {
        if (motion.matches) {
            playing = false;
            map?.show(showingAfter, false);
            render();
            schedule();
        }
    });
    services.i18n.changed.subscribe(scope, render);
    const load = async () => {
        request?.dispose();
        request = new Scope();
        const signal = AbortSignal.any([scope.signal, request.signal]);
        notice.textContent = t('loading');
        retry.element.hidden = true;
        try {
            const result = await services.gameplay.ownershipComparison(snapshot, signal);
            signal.throwIfAborted();
            mapScope?.dispose();
            mapScope = new Scope();
            const beforeOwners = new Map(
                result.before.territories.map((item) => [item.territory_id, item.owner_nation_id]),
            );
            changedCount = result.after.territories.filter(
                (item) => beforeOwners.get(item.territory_id) !== item.owner_nation_id,
            ).length;
            const terrain = (frame) => {
                const owners = new Map(
                    frame.territories.map((item) => [item.territory_id, item.owner_nation_id]),
                );
                return snapshot.territories.map((item) => ({
                    ...item,
                    owner_nation_id: owners.get(item.territory_id),
                }));
            };
            map = new OwnershipMap({
                scope: mapScope,
                i18n: services.i18n,
                map: snapshot.map,
                before: terrain(result.before),
                after: terrain(result.after),
                nationColors: snapshot.nation_colors,
                images: services.boot.mapImages,
            });
            stage.replaceChildren(map.element);
            await map.ready;
            signal.throwIfAborted();
            frames = result;
            controls.hidden = false;
            playing = !motion.matches && changedCount > 0;
            play.setDisabled(changedCount === 0);
            render();
            schedule();
        } catch (error) {
            if (signal.aborted) return;
            mapScope?.dispose();
            stage.replaceChildren();
            notice.textContent = t('failed');
            retry.element.hidden = false;
        }
    };
    scope.listen(retry.element, 'click', () => void load());
    void load();
    return close;
}
