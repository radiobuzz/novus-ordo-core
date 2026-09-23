import { selectedPower, territorialDefense } from '../../services/forceSummary.js';
import { Scope } from '../../runtime/Scope.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { CompactMessage } from '../../ui/CompactMessage.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { panel } from '../../ui/Panel.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { EdgeDrawer } from '../../ui/EdgeDrawer.js';
import { unitVisual } from '../../ui/unitVisuals.js';
import { confirmDialog } from '../../ui/ConfirmDialog.js';
import { Minimap } from '../../ui/map/Minimap.js';
import { militaryOverlay } from '../../ui/map/militaryOverlay.js';
import { draftMoveOrders, deploymentDraft, moveOrderPreview } from '../../services/militaryCommands.js';
import { resourceIcon } from '../../ui/resourceVisuals.js';
import { layoutUnits, hitUnits, unitsInBox } from '../../ui/map/unitLayout.js';
import { UnitSprites } from '../../ui/map/UnitSprites.js';
import { nationPalette } from '../../services/nationColors.js';
import { renderDeploymentBrush } from './DeploymentBrush.js';
import { renderPendingOrders } from './PendingOrders.js';
import './commands.scss';

/** Feature composition: one map, contextual tools, existing authoritative command service. */
export class WorldCommands {
    constructor({
        scope,
        services,
        snapshot,
        root,
        map,
        directory,
        camera,
        context,
        renderer,
        saved,
        onModeChange,
    }) {
        Object.assign(this, {
            scope,
            services,
            snapshot,
            root,
            map,
            directory,
            camera,
            context,
            renderer,
            saved,
            onModeChange,
        });
        this.t = (key, params) => services.i18n.t(`command.${key}`, params);
        this.number = (value) => services.i18n.number(value, { maximumFractionDigits: 2 });
        this.key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}`;
        const previous = services.commandView?.key === this.key ? services.commandView : {};
        this.mode = ['geopolitical', 'military', 'economic'].includes(saved.read().mode)
            ? saved.read().mode
            : 'geopolitical';
        this.tool = previous.tool ?? null;
        this.selected = new Set(previous.selected ?? []);
        this.type = previous.type ?? 'Infantry';
        this.quantity = previous.quantity ?? 1;
        this.destination = previous.destination ?? null;
        this.deploymentState = services.gameplay.deploymentDraft(snapshot);
        this.palette = nationPalette(snapshot.nation_colors, snapshot.setup.nation_id);
        this.unitStyle = services.preferences?.read().unitStyle === 'flat' ? 'flat' : 'miniatures';
        services.displayChanged = () => {
            this.unitStyle = services.preferences.read().unitStyle === 'flat' ? 'flat' : 'miniatures';
            renderer.invalidate();
        };
        scope.own(() => {
            delete services.displayChanged;
        });
        this.sprites = new UnitSprites(scope, () => renderer.invalidate());
        this.selectionBox = el('div', { class: 'map-selection-box', hidden: true, 'aria-hidden': 'true' });
        map.append(this.selectionBox);
        this.territoryId = services.selection.id;
        this.controls = [];
        this.data = snapshot.nation;
        this.rail = el('nav', { class: 'world-mode-rail', 'aria-label': this.t('modes') });
        this.modeButtons = new Map();
        for (const mode of ['geopolitical', 'military', 'economic']) {
            const control = new Button({
                label: this.t(mode),
                icon: mode === 'geopolitical' ? 'world' : mode,
                className: 'mode-button',
            });
            control.element.dataset.mode = mode;
            scope.listen(control.element, 'click', () => this.setMode(mode));
            this.modeButtons.set(mode, control);
            this.rail.append(control.element);
        }
        this.finder = new Button({ label: this.t('find'), icon: 'search', variant: 'quiet' });
        this.finder.element.setAttribute('aria-expanded', 'false');
        directory.hidden = true;
        this.finderClose = new Button({ label: this.t('close'), variant: 'quiet' });
        scope.listen(this.finderClose.element, 'click', () => this.toggleFinder(false));
        directory.prepend(this.finderClose.element);
        directory.id = `${root.id || 'world'}-finder`;
        this.finder.element.setAttribute('aria-controls', directory.id);
        scope.listen(this.finder.element, 'click', () => this.toggleFinder());
        this.rail.append(this.finder.element);
        this.militaryTools = el('div', { class: 'world-mode-tools' });
        for (const tool of ['selection', 'deploy', 'forces', 'orders']) {
            const control = new Button({ label: this.t(tool), icon: tool });
            scope.listen(control.element, 'click', () => this.openTool(tool));
            control.element.dataset.tool = tool;
            this.militaryTools.append(control.element);
        }
        this.rail.append(this.militaryTools);
        this.drawer = new EdgeDrawer(scope, { content: this.rail, label: this.t('modes') });
        root.prepend(this.drawer.element);
        scope.listen(this.rail, 'click', (event) => {
            if (event.target.closest('[data-tool]') || this.finder.element.contains(event.target))
                this.drawer.setOpen(false);
        });
        this.message = el('p', {
            class: 'world-command-message',
            role: 'status',
            text: services.gameplay.notice,
        });
        this.message.hidden = !this.message.textContent;
        this.messageContent = new CompactMessage(scope);
        this.messageText = this.messageContent.element;
        this.review = new Button({ label: this.t('reviewed'), variant: 'quiet' });
        this.review.element.hidden = true;
        scope.listen(this.review.element, 'click', () => services.gameplay.acknowledgeOutcome());
        this.message.replaceChildren(this.messageText, this.review.element);
        this.dock = el('aside', {
            class: 'world-command-dock',
            hidden: true,
            'aria-label': this.t('commands'),
        });
        this.mini = new Minimap({
            scope,
            context,
            camera,
            images: services.boot.mapImages,
            label: this.t('minimapHelp'),
            onNavigate: (point) => {
                camera.x = point.x;
                camera.y = point.y;
                camera.constrain();
                renderer.invalidate();
            },
        });
        this.miniToggle = new Button({ label: '−', variant: 'quiet' });
        this.mini.element.id = `${root.id || 'world'}-minimap`;
        this.miniToggle.element.setAttribute('aria-controls', this.mini.element.id);
        this.miniCollapsed = saved.read().minimapCollapsed === true;
        this.miniPanel = panel(
            { title: this.t('minimap'), className: 'world-minimap', actions: this.miniToggle.element },
            this.mini.element,
        );
        scope.listen(this.miniToggle.element, 'click', () => {
            this.miniCollapsed = !this.miniCollapsed;
            saved.write({ ...saved.read(), minimapCollapsed: this.miniCollapsed });
            this.updateMinimap();
        });
        this.updateMinimap();
        map.append(this.message, this.miniPanel, this.dock);
        map.querySelector('.map-caption').hidden = true;
        map.querySelector('.map-legend').hidden = true;
        scope.own(() => this.viewScope?.dispose());
        scope.listen(root, 'keydown', (event) => {
            if (event.key !== 'Escape' || event.target.closest('dialog')) return;
            if (!directory.hidden) this.toggleFinder(false);
            else this.closeContext();
            event.stopPropagation();
        });
        services.gameplay.changed.subscribe(scope, () => {
            if (!services.gameplay.busy) {
                this.refreshDock?.();
                this.updateOverlay();
            }
            this.updateBusy();
        });
        services.i18n.changed.subscribe(scope, () => {
            for (const [mode, control] of this.modeButtons) control.setLabel(this.t(mode));
            this.finder.setLabel(this.t('find'));
            this.drawer.setLabel(this.t('modes'));
            this.finderClose.setLabel(this.t('close'));
            for (const button of this.militaryTools.children)
                button.textContent = this.t(button.dataset.tool);
            this.miniPanel.querySelector('h2').textContent = this.t('minimap');
            this.mini.element.setAttribute('aria-label', this.t('minimapHelp'));
            this.updateMinimap();
            this.renderDock();
        });
        this.updateMode();
        this.select(this.territoryId, true);
        this.updateBusy();
    }
    get deploymentEntries() {
        return this.deploymentState.entries;
    }
    set deploymentEntries(entries) {
        this.deploymentState.entries = entries;
    }
    get nextDraftId() {
        return this.deploymentState.nextId;
    }
    set nextDraftId(value) {
        this.deploymentState.nextId = value;
    }
    remember() {
        this.services.commandView = {
            key: this.key,
            tool: this.tool,
            selected: [...this.selected],
            type: this.type,
            quantity: this.quantity,
            destination: this.destination,
        };
    }
    async load() {
        await this.services.world.refresh();
    }
    updateData(snapshot) {
        const changed =
            this.data !== snapshot.nation ||
            this.snapshot.ownTerritories !== snapshot.ownTerritories ||
            this.snapshot.territories !== snapshot.territories;
        const newTurn = !this.services.world.same(this.snapshot, snapshot);
        this.snapshot = snapshot;
        this.data = snapshot.nation;
        this.palette = nationPalette(snapshot.nation_colors, snapshot.setup.nation_id);
        if (newTurn) {
            this.deploymentState = this.services.gameplay.deploymentDraft(snapshot);
            this.key = `${snapshot.game_id}:${snapshot.turn_number}:${snapshot.setup.nation_id}`;
            this.selected.clear();
            this.destination = null;
            this.quantity = 1;
            this.deploymentEntries = [];
            this.tool = null;
            this.localNotice = this.t('newTurn');
        }
        const selectedCount = this.selected.size;
        this.selected = new Set(
            [...this.selected].filter((id) => this.data?.divisions.some((d) => d.division_id === id)),
        );
        if (!newTurn && selectedCount !== this.selected.size) this.localNotice = this.t('unitsChanged');
        this.remember();
        if (changed) {
            if (!newTurn && this.refreshDock) this.refreshDock();
            else this.renderDock();
            this.updateOverlay();
        }
        this.updateBusy();
    }
    toggleFinder(open = this.directory.hidden) {
        this.directory.hidden = !open;
        this.finder.element.setAttribute('aria-expanded', String(open));
        (open ? this.directory.querySelector('input') : this.finder.element).focus({ preventScroll: true });
    }
    setMode(mode) {
        if (mode === 'economic') {
            void this.services.inspectTerritory(null);
            this.services.openProductionPlanner();
        }
        if (this.mode === mode) return;
        this.mode = mode;
        this.tool = null;
        this.destination = null;
        this.selected.clear();
        this.saved.write({ ...this.saved.read(), mode });
        this.remember();
        this.updateMode();
        this.select(this.territoryId);
    }
    updateMode() {
        this.onModeChange?.(this.mode);
        for (const [mode, control] of this.modeButtons)
            control.element.setAttribute('aria-pressed', String(mode === this.mode));
        this.militaryTools.hidden = this.mode !== 'military';
        this.root.dataset.mode = this.mode;
        this.renderer.canvas.setAttribute(
            'aria-label',
            this.mode === 'military' ? this.t('militaryMapLabel') : this.services.i18n.t('map.label'),
        );
        this.updateOverlay();
    }
    openTool(tool) {
        this.tool = tool;
        if (tool === 'selection' && !this.selected.size) this.territoryId = null;
        if (tool === 'deploy')
            this.destination = this.snapshot.ownTerritories.some(
                (t) => t.territory_id === this.territoryId && t.can_deploy,
            )
                ? this.territoryId
                : null;
        if (tool === 'move') this.destination = null;
        void this.services.inspectTerritory(null);
        this.remember();
        this.renderDock();
        this.updateOverlay();
        this.dock.querySelector('button')?.focus({ preventScroll: true });
    }
    canBoxSelect() {
        return this.mode === 'military' && !['deploy', 'move'].includes(this.tool) && Boolean(this.data);
    }
    layout() {
        return this.data
            ? layoutUnits(
                  this.context,
                  this.camera,
                  this.data.divisions,
                  this.data.deployments,
                  this.deploymentEntries,
              )
            : [];
    }
    previewBox(box) {
        this.selectionBox.hidden = !box;
        if (!box) return;
        Object.assign(this.selectionBox.style, {
            left: `${Math.min(box.a.x, box.b.x)}px`,
            top: `${Math.min(box.a.y, box.b.y)}px`,
            width: `${Math.abs(box.b.x - box.a.x)}px`,
            height: `${Math.abs(box.b.y - box.a.y)}px`,
        });
    }
    selectBox(box, event) {
        if (!this.canBoxSelect()) return;
        this.selectUnits(unitsInBox(this.layout(), box), event.shiftKey, false);
    }
    selectUnits(ids, additive = false, toggle = true) {
        if (ids.length) this.services.sound?.play('select');
        if (!additive) this.selected.clear();
        for (const id of ids) {
            if (additive && toggle && this.selected.has(id)) this.selected.delete(id);
            else this.selected.add(id);
        }
        this.tool = this.selected.size ? 'selection' : null;
        this.territoryId = null;
        this.context.selectedId = null;
        void this.services.inspectTerritory(null);
        this.remember();
        this.renderDock();
        this.updateOverlay();
    }
    mapClick(territory, point, event) {
        if (this.mode === 'military' && this.tool === 'deploy') {
            if (territory) this.stageDeployment(territory.territory_id);
            return;
        }
        if (this.canBoxSelect()) {
            const hit = hitUnits(this.layout(), point);
            const units = hit?.state === 'stack' ? hit.units : hit ? [hit] : [];
            this.selectUnits(
                units.filter((u) => u.state === 'active').map((u) => u.division_id),
                event?.shiftKey,
            );
            return;
        }
        this.services.selectTerritory(territory?.territory_id ?? null);
    }
    stageDeployment(territoryId, quantity = 1) {
        if (!this.data) return;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
            this.localNotice = this.t('invalidPlacement');
            this.updateBusy();
            return;
        }
        const entries = Array.from({ length: quantity }, (_, index) => ({
            division_type: this.type,
            territory_id: territoryId,
            draft_id: this.nextDraftId + index,
        }));
        const next = [...this.deploymentEntries, ...entries];
        if (!deploymentDraft(this.data, this.snapshot, next).valid) {
            this.localNotice = this.t('invalidPlacement');
            this.updateBusy();
            return;
        }
        this.nextDraftId += quantity;
        this.deploymentEntries = next;
        this.services.sound?.play('place');
        this.localNotice = null;
        this.remember();
        this.refreshDock?.();
        this.updateOverlay();
        this.updateBusy();
    }
    closeContext() {
        if (this.tool) {
            this.tool = null;
            this.destination = null;
            this.remember();
            this.select(this.territoryId, true);
        } else {
            this.selected.clear();
            this.services.selectTerritory(null);
        }
        this.renderer.canvas.focus({ preventScroll: true });
    }
    select(id, preserve = false) {
        if (this.scope.closed) return;
        this.territoryId = id;
        this.context.selectedId = id;
        if (this.tool === 'deploy' || this.tool === 'move') {
            this.services.automation?.pause();
            const target = this.snapshot.territories.find((t) => t.territory_id === id);
            const valid =
                this.tool === 'deploy'
                    ? this.snapshot.ownTerritories.some((t) => t.territory_id === id && t.can_deploy)
                    : target && target.terrain_type !== 'Water';
            this.destination = valid ? id : null;
        } else if (this.mode === 'military' && !preserve) {
            this.tool = null;
            this.selected.clear();
            const stack = this.data?.divisions.filter((d) => d.territory_id === id) ?? [];
            if (stack.length === 1) this.selected.add(stack[0].division_id);
        }
        if (this.mode === 'geopolitical' && !this.tool) void this.services.inspectTerritory(id);
        else void this.services.inspectTerritory(null);
        this.remember();
        this.renderDock();
        this.updateOverlay();
    }
    updateOverlay() {
        this.context.underlays = [];
        if (!this.data || this.mode !== 'military') this.context.overlays = [];
        else
            this.context.overlays = [
                (ctx, renderer) => {
                    if (this.tool !== 'deploy') return;
                    const color = getComputedStyle(this.root).getPropertyValue('--status-ready').trim();
                    for (const own of this.snapshot.ownTerritories.filter((t) => t.can_deploy)) {
                        if (renderer.highlight) renderer.highlight(ctx, own.territory_id, color, 0.25, true);
                        else {
                            const t = this.snapshot.territories.find(
                                    (t) => t.territory_id === own.territory_id,
                                ),
                                d = this.context.definition;
                            ctx.save();
                            ctx.fillStyle = color;
                            ctx.globalAlpha = 0.3;
                            ctx.fillRect(t.x * d.tileWidth, t.y * d.tileHeight, d.tileWidth, d.tileHeight);
                            ctx.restore();
                        }
                    }
                },
                militaryOverlay(
                    this.data.divisions,
                    this.data.deployments,
                    this.selected,
                    () => (this.tool === 'move' ? this.buildOrders() : []),
                    {
                        layout: () => this.layout(),
                        sprites: this.sprites,
                        palette: () => this.palette,
                        style: () => this.unitStyle,
                    },
                ),
            ];
        if (this.context.overlays.length > 1) this.context.underlays = [this.context.overlays.shift()];
        this.renderer.invalidate();
    }
    buildOrders() {
        return this.data ? draftMoveOrders(this.snapshot, this.data, this.selected, this.destination) : [];
    }
    name(id) {
        return this.snapshot.territories.find((t) => t.territory_id === id)?.name ?? `#${id}`;
    }
    unit(type) {
        return unitVisual(type) ? this.t(`unit.${type}`) : type;
    }
    costs(values, quantity = 1) {
        return (
            Object.entries(values)
                .map(
                    ([resource, value]) =>
                        `${this.number(value * quantity)} ${this.t(`resource.${resource}`)}`,
                )
                .join(' · ') || this.t('none')
        );
    }
    updateMinimap() {
        this.miniPanel.dataset.collapsed = String(this.miniCollapsed);
        this.mini.element.hidden = this.miniCollapsed;
        this.miniToggle.setLabel(this.miniCollapsed ? '+' : '−');
        this.miniToggle.element.setAttribute(
            'aria-label',
            this.services.i18n.t(`hud.${this.miniCollapsed ? 'expandMap' : 'collapseMap'}`),
        );
        this.miniToggle.element.setAttribute('aria-expanded', String(!this.miniCollapsed));
        if (!this.miniCollapsed) this.mini.invalidate();
    }
    action(
        label,
        callback,
        { disabled = false, command = false, variant = 'secondary', icon, iconOnly = false } = {},
    ) {
        const control = new Button({ label, disabled, variant, icon });
        if (iconOnly) {
            control.element.classList.add('world-icon-action');
            control.element.textContent = '';
            control.element.setAttribute('aria-label', label);
            control.element.title = label;
        }
        if (command) {
            control.element.dataset.command = '';
            this.controls.push(control);
        }
        this.viewScope.listen(control.element, 'click', callback);
        return control.element;
    }
    field(label, control) {
        return new FieldShell({ label, control }).element;
    }
    groupDivisions(divisions) {
        const groups = new Map();
        for (const division of divisions) {
            const key = [division.division_type, division.territory_id].join('|');
            if (!groups.has(key)) groups.set(key, { key, divisions: [], division });
            groups.get(key).divisions.push(division);
        }
        return [...groups.values()];
    }
    unitStack(group) {
        const stack = el('span', {
            class: 'world-unit-card-stack',
            'aria-hidden': 'true',
            'data-count': group.divisions.length,
        });
        for (let index = 0; index < Math.min(group.divisions.length, 3); index++)
            stack.append(el('img', { src: unitVisual(group.division.division_type), alt: '' }));
        if (group.divisions.length > 1)
            stack.append(el('strong', { class: 'world-unit-count', text: group.divisions.length }));
        return stack;
    }
    renderDock() {
        if (this.scope.closed) return;
        const focusKey = this.dock.contains(document.activeElement)
            ? document.activeElement.dataset.focusKey
            : null;
        const scroll = this.dock.scrollTop;
        void this.viewScope?.dispose();
        this.viewScope = new Scope();
        this.controls = [];
        this.refreshDock = null;
        this.dock.replaceChildren();
        this.dock.dataset.picking = String(this.tool === 'move' && !this.destination);
        if (this.mode === 'economic') {
            this.dock.hidden = true;
            return;
        }
        this.dock.hidden =
            this.mode !== 'military' ||
            (!this.territoryId && (!this.tool || this.tool === 'selection') && !this.selected.size);
        if (this.dock.hidden) return;
        const heading = this.tool ? this.t(this.tool) : this.name(this.territoryId);
        const close = this.action(this.t('close'), () => this.closeContext(), { variant: 'quiet' });
        close.textContent = '×';
        close.setAttribute('aria-label', this.t('close'));
        close.dataset.icon = 'none';
        close.dataset.focusKey = 'close';
        const body = el('div', { class: 'world-command-body' });
        this.dock.append(panel({ title: heading, actions: close, tone: 'accent' }, body));
        if (!this.snapshot.setup.nation_id) {
            body.append(
                el('p', { text: this.t('noNation') }),
                el('a', { href: this.services.boot.urls.setup, text: this.t('createNation') }),
            );
        } else if (!this.data) {
            body.append(el('p', { role: 'status', text: this.loadError || this.t('loading') }));
            if (this.loadError)
                body.append(
                    this.action(this.t('retry'), () => {
                        this.loadError = null;
                        void this.load();
                        this.renderDock();
                    }),
                );
        } else if (this.tool === 'deploy') renderDeploymentBrush(this, body);
        else if (this.tool === 'orders') this.renderOrders(body);
        else if (this.tool === 'move') this.renderMove(body);
        else this.renderForces(body);
        this.updateBusy();
        if (focusKey)
            [...this.dock.querySelectorAll('[data-focus-key]')]
                .find((n) => n.dataset.focusKey === focusKey)
                ?.focus({ preventScroll: true });
        this.dock.scrollTop = scroll;
    }
    renderForces(body) {
        body.append(
            new Tooltip({
                scope: this.viewScope,
                text: this.t('selectionHelp'),
                label: this.services.i18n.t('common.helpFor', { name: this.t('forces') }),
            }).element,
        );
        const getDivisions = () =>
            this.tool === 'forces'
                ? this.data.divisions
                : this.data.divisions.filter((d) =>
                      this.tool === 'selection'
                          ? this.selected.has(d.division_id)
                          : d.territory_id === this.territoryId,
                  );
        const list = el('div', { class: 'world-unit-groups' });
        const rows = new Map();
        const empty = el('p', { text: this.t('noForces') });
        const count = el('p');
        const strength = el('p', { class: 'force-summary', 'aria-live': 'polite' });
        const defense = el('p', { class: 'defense-summary' });
        const defenseDetail = el('small');
        const all = el('input', { type: 'checkbox', 'aria-label': this.t('selectAll') });
        body.append(
            this.field(this.t('selectAll'), all),
            list,
            empty,
            count,
            strength,
            defense,
            defenseDetail,
        );
        const change = () => {
            this.remember();
            update();
            this.updateOverlay();
        };
        this.viewScope.listen(all, 'change', () => {
            for (const d of getDivisions())
                all.checked ? this.selected.add(d.division_id) : this.selected.delete(d.division_id);
            change();
        });
        this.viewScope.listen(list, 'change', (event) => {
            for (const id of event.target.dataset.divisionIds.split(',').map(Number))
                event.target.checked ? this.selected.add(id) : this.selected.delete(id);
            change();
        });
        const actions = el(
            'div',
            { class: 'world-command-actions world-command-toolbar', role: 'toolbar' },
            this.action(this.t('move'), () => this.openTool('move'), {
                disabled: !this.selected.size,
                icon: 'move',
                iconOnly: true,
            }),
            this.action(
                this.t('cancelSelected'),
                () => void this.command('cancelOrders', { division_ids: [...this.selected] }),
                {
                    command: true,
                    disabled: !this.selected.size,
                    icon: 'cancel',
                    iconOnly: true,
                },
            ),
            this.action(this.t('deploy'), () => this.openTool('deploy'), {
                icon: 'deploy',
                iconOnly: true,
            }),
        );
        const advanced = el('details', {}, el('summary', { text: this.t('more') }));
        advanced.append(
            this.action(
                this.t('disband'),
                async () => {
                    const ids = [...this.selected];
                    const snapshot = this.snapshot;
                    if (
                        await confirmDialog(this.scope, {
                            title: this.t('disband'),
                            message: this.t('disbandConfirm', {
                                count: ids.length,
                                turn: this.snapshot.turn_number,
                            }),
                            confirmLabel: this.t('confirm'),
                        })
                    )
                        void this.command(
                            'sendDisbandOrders',
                            {
                                orders: ids.map((division_id) => ({ division_id })),
                            },
                            snapshot,
                        );
                },
                { command: true, disabled: !this.selected.size, variant: 'danger' },
            ),
        );
        body.append(actions, advanced);
        if (this.territoryId)
            body.append(
                this.action(this.t('territoryDetails'), () =>
                    this.services.openInspectorDialog(this.territoryId),
                ),
            );
        const update = () => {
            const divisions = getDivisions();
            const groups = this.groupDivisions(divisions);
            const keys = new Set(groups.map((group) => group.key));
            for (const [key, row] of rows)
                if (!keys.has(key)) {
                    row.element.remove();
                    rows.delete(key);
                }
            for (const group of groups) {
                const d = group.division;
                let row = rows.get(group.key);
                if (!row) {
                    const check = el('input', {
                        type: 'checkbox',
                        'data-division-ids': group.divisions.map((unit) => unit.division_id).join(','),
                        'aria-label':
                            group.divisions.length === 1
                                ? this.t('selectDivision', { id: d.division_id })
                                : this.t('selectGroup', {
                                      count: group.divisions.length,
                                      unit: this.unit(d.division_type),
                                  }),
                        'data-focus-key': 'unit-' + d.division_id,
                    });
                    const label = el('span');
                    const detail = el('small');
                    const element = el(
                        'label',
                        { class: 'world-unit-row world-unit-group' },
                        check,
                        this.unitStack(group),
                        el('span', {}, label, detail),
                    );
                    row = {
                        element,
                        check,
                        stack: element.querySelector('.world-unit-card-stack'),
                        label,
                        detail,
                    };
                    rows.set(group.key, row);
                    list.append(element);
                }
                row.check.checked = group.divisions.every((unit) => this.selected.has(unit.division_id));
                row.check.indeterminate =
                    !row.check.checked && group.divisions.some((unit) => this.selected.has(unit.division_id));
                row.check.dataset.divisionIds = group.divisions.map((unit) => unit.division_id).join(',');
                row.check.setAttribute(
                    'aria-label',
                    group.divisions.length === 1
                        ? this.t('selectDivision', { id: d.division_id })
                        : this.t('selectGroup', {
                              count: group.divisions.length,
                              unit: this.unit(d.division_type),
                          }),
                );
                if (row.stack.dataset.count !== String(group.divisions.length)) {
                    const replacement = this.unitStack(group);
                    replacement.dataset.count = String(group.divisions.length);
                    row.stack.replaceWith(replacement);
                    row.stack = replacement;
                }
                row.label.textContent =
                    group.divisions.length === 1
                        ? this.unit(d.division_type) + ' #' + d.division_id
                        : this.t('unitGroup', {
                              count: group.divisions.length,
                              unit: this.unit(d.division_type),
                          });
                const orders = new Set(group.divisions.map((unit) => this.orderText(unit)));
                row.detail.textContent =
                    this.name(d.territory_id) +
                    ' · ' +
                    (orders.size === 1 ? [...orders][0] : this.t('mixedOrders'));
            }
            all.checked =
                Boolean(divisions.length) && divisions.every((d) => this.selected.has(d.division_id));
            all.indeterminate = !all.checked && divisions.some((d) => this.selected.has(d.division_id));
            empty.hidden = Boolean(divisions.length);
            count.textContent = this.t('selected', { count: this.selected.size });
            strength.textContent = this.powerText();
            const projected = territorialDefense(this.snapshot, this.territoryId);
            defense.textContent = projected
                ? this.services.i18n.t('forces.projected', { value: this.number(projected.total) })
                : '';
            defenseDetail.textContent = projected
                ? this.services.i18n.t(
                      'forces.breakdown',
                      Object.fromEntries(Object.entries(projected).map(([k, v]) => [k, this.number(v)])),
                  )
                : '';
            actions.firstChild.disabled = !this.selected.size;
            for (const control of this.controls) control.setDisabled(!this.selected.size);
            this.updateBusy();
        };
        this.refreshDock = update;
        update();
    }
    destinationSelect(tool) {
        const select = el('select', {
            required: true,
            'aria-label': this.t('destination'),
            'data-focus-key': 'destination',
        });
        this.updateDestinations(select, tool);
        return select;
    }
    updateDestinations(select, tool) {
        const territories =
            tool === 'deploy'
                ? this.snapshot.ownTerritories.filter((t) => t.can_deploy)
                : this.snapshot.territories.filter((t) => t.terrain_type !== 'Water');
        const signature = JSON.stringify(territories.map((t) => [t.territory_id, this.name(t.territory_id)]));
        if (select.dataset.options !== signature)
            select.replaceChildren(
                el('option', { value: '', text: this.t('chooseDestination') }),
                ...territories.map((t) =>
                    el('option', { value: t.territory_id, text: this.name(t.territory_id) }),
                ),
            );
        select.dataset.options = signature;
        if (this.destination && !territories.some((t) => t.territory_id === this.destination)) {
            const invalid = el('option', {
                value: this.destination,
                text: this.t('invalidDestination'),
                disabled: true,
            });
            if (![...select.options].some((o) => Number(o.value) === this.destination))
                select.append(invalid);
        }
        select.value = this.destination ?? '';
    }
    powerText() {
        const power = selectedPower(this.data, this.selected);
        return power
            ? this.services.i18n.t('forces.selected', {
                  attack: this.number(power.attack),
                  defense: this.number(power.defense),
              })
            : '—';
    }
    renderMove(body) {
        const selected = this.data.divisions.filter((division) => this.selected.has(division.division_id));
        const stacks = el(
            'div',
            {
                class: 'world-selected-unit-stacks',
                'aria-label': this.t('selected', { count: selected.length }),
            },
            ...this.groupDivisions(selected).map((group) =>
                el(
                    'div',
                    { class: 'world-selected-unit-stack' },
                    this.unitStack(group),
                    el('span', {
                        text: this.t('unitGroup', {
                            count: group.divisions.length,
                            unit: this.unit(group.division.division_type),
                        }),
                    }),
                ),
            ),
        );
        const strength = el('p', { class: 'force-summary' });
        const mobilePrompt = el('p', { class: 'mobile-pick-prompt', text: this.t('pickOnMap') });
        body.append(mobilePrompt, stacks, strength);
        const destination = this.destinationSelect('move');
        const destinationField = this.field(this.t('destination'), destination);
        const destinationList = el(
            'details',
            { class: 'world-destination-list' },
            el('summary', { text: this.t('chooseFromList') }),
            destinationField,
        );
        const preview = el('div', { class: 'world-route-preview', 'aria-live': 'polite' });
        const budgetPreview = el('div', { class: 'move-cost-preview', 'aria-live': 'polite' });
        const submit = new Button({ label: this.t('sendOrders'), variant: 'primary' });
        const pick = new Button({ label: this.t('pickAnother'), icon: 'selection', variant: 'quiet' });
        submit.element.dataset.command = '';
        this.controls.push(submit);
        const update = () => {
            this.destination = Number(destination.value) || null;
            const orders = this.buildOrders();
            const estimate = moveOrderPreview(this.snapshot, this.data, orders);
            strength.textContent = this.powerText();
            budgetPreview.replaceChildren();
            if (this.destination && orders.length) {
                budgetPreview.append(el('strong', { text: this.t('orderCosts') }));
                for (const resource of new Set(['Oil', 'Capital', ...Object.keys(estimate.costs)])) {
                    const cost = estimate.costs[resource] ?? 0;
                    const available = this.data.budget.available_production[resource];
                    const short = estimate.shortages[resource];
                    const number = (n) =>
                        Number.isFinite(n) ? this.services.i18n.number(n, { maximumFractionDigits: 4 }) : '—';
                    budgetPreview.append(
                        el(
                            'p',
                            { 'data-resource-cost': resource, 'data-tone': short ? 'danger' : '' },
                            el('img', { src: resourceIcon(resource), alt: '' }),
                            el('span', {
                                text: this.t('costAvailable', {
                                    resource: this.t(`resource.${resource}`),
                                    cost: number(cost),
                                    available: number(available),
                                }),
                            }),
                            ...(short
                                ? [el('strong', { text: this.t('costShort', { amount: number(short) }) })]
                                : []),
                        ),
                    );
                }
                budgetPreview.append(
                    el('small', {
                        text: this.t(Object.keys(estimate.shortages).length ? 'costBlocked' : 'costRules'),
                    }),
                );
            }
            const reachable = orders.filter((order) => order.path_territory_ids !== null);
            const routes = new Map();
            for (const order of reachable) {
                const route = order.path_territory_ids.length
                    ? [
                          ...order.path_territory_ids.map((id) => this.name(id)),
                          this.name(this.destination),
                      ].join(' → ')
                    : `${this.t('direct')} → ${this.name(this.destination)}`;
                routes.set(route, (routes.get(route) ?? 0) + 1);
            }
            const unreachable = orders.length - reachable.length;
            const summary = this.destination
                ? this.t('routeSummary', {
                      reachable: reachable.length,
                      count: orders.length,
                      destination: this.name(this.destination),
                  })
                : this.t('pickOnMap');
            const detail = el(
                'details',
                { class: 'world-route-details' },
                el('summary', { text: this.t('routeDetails') }),
                ...[...routes].map(([route, count]) =>
                    el('p', { text: this.t('routeGroup', { count, route }) }),
                ),
                ...(unreachable
                    ? [el('p', { text: this.t('unreachableGroup', { count: unreachable }) })]
                    : []),
            );
            preview.replaceChildren(el('p', { text: summary }), ...(this.destination ? [detail] : []));
            submit.setDisabled(!this.destination || !estimate.valid);
            this.remember();
            this.context.selectedId = this.destination;
            this.renderer.invalidate();
        };
        this.viewScope.listen(destination, 'change', update);
        this.viewScope.listen(pick.element, 'click', () => {
            this.destination = null;
            this.remember();
            this.renderDock();
            this.renderer.canvas.focus({ preventScroll: true });
        });
        this.viewScope.listen(submit.element, 'click', () => {
            const orders = this.buildOrders();
            if (this.destination && moveOrderPreview(this.snapshot, this.data, orders).valid)
                void this.command('sendMoveOrders', { orders });
        });
        body.append(pick.element, destinationList, preview, budgetPreview, submit.element);
        this.refreshDock = () => {
            this.updateDestinations(destination, 'move');
            update();
        };
        update();
    }
    orderText(division) {
        if (!division.order) return this.t('noOrders');
        const id = division.order.destination_territory_id ?? division.order.target_territory_id;
        return `${division.order.order_type}${id ? ' → ' + this.name(id) : ''}`;
    }
    renderOrders(body) {
        renderPendingOrders(this, body);
    }
    updateBusy() {
        const { gameplay, world } = this.services;
        this.message.dataset.tone = gameplay.outcome?.state === 'rejected' ? 'danger' : '';
        for (const control of this.controls)
            control.setPending(gameplay.busy || !world.current || gameplay.needsReview);
        const text = this.localNotice || gameplay.notice;
        this.messageContent.show(
            this.localNotice === this.t('invalidPlacement') ? this.t('invalidPlacementShort') : text,
            text,
        );
        this.review.element.hidden = !gameplay.needsReview;
        this.review.setDisabled(gameplay.busy || !world.current);
        this.message.hidden = !this.messageText.textContent && !gameplay.needsReview;
    }
    async command(name, body, snapshot = this.snapshot) {
        if (this.services.gameplay.busy || !this.services.world.current || this.scope.closed) return;
        this.localNotice = null;
        const draft = () =>
            JSON.stringify([this.tool, this.type, this.quantity, this.destination, [...this.selected]]);
        const submitted = draft();
        const submittedIds =
            name === 'deploy' ? new Set(this.deploymentEntries.map((d) => d.draft_id)) : null;
        try {
            await this.services.gameplay.command(name, body, snapshot, {
                deploymentDraftIds: [...(submittedIds ?? [])],
            });
            if (submittedIds && !this.scope.closed && this.services.world.same(snapshot, this.snapshot)) {
                this.deploymentEntries = this.deploymentEntries.filter((d) => !submittedIds.has(d.draft_id));
                this.remember();
                this.refreshDock?.();
                this.updateOverlay();
            }
            if (
                !this.scope.closed &&
                this.services.world.same(snapshot, this.snapshot) &&
                submitted === draft() &&
                (!submittedIds || !this.deploymentEntries.length)
            ) {
                const alreadyShowingOrders = this.tool === 'orders';
                this.tool = 'orders';
                this.destination = null;
                this.remember();
                if (!alreadyShowingOrders) this.renderDock();
                this.updateOverlay();
            }
        } catch (error) {
            if (!this.scope.closed)
                this.messageContent.show(this.services.gameplay.notice || this.services.i18n.error(error));
        }
    }
}
