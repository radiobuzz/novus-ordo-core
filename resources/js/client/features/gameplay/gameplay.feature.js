import { selectedPower } from '../../services/forceSummary.js';
import { Component } from '../../runtime/Component.js';
import { Scope } from '../../runtime/Scope.js';
import { el, button, formatStat } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { panel } from '../../ui/Panel.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { MetricCard, cardStrip } from '../../ui/MetricCard.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { CompactMessage } from '../../ui/CompactMessage.js';
import { battleParticipants, reportEvent } from '../../ui/ReportEvent.js';
import { draftMoveOrders } from '../../services/militaryCommands.js';
import { reportText } from '../../services/reportText.js';
import { MapViewport } from '../../ui/map/MapViewport.js';
import { mapDefinitionFor } from '../../ui/map/HexMap.js';
import { createLayers } from '../../ui/map/layers.js';
import { militaryOverlay } from '../../ui/map/militaryOverlay.js';
import { RankingsView } from './RankingsView.js';
import '../world/world.scss';

const title = (value) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
function table(headers, rows) {
    const root = el(
        'div',
        { class: 'game-table-scroll' },
        el(
            'table',
            { class: 'game-table' },
            el(
                'thead',
                {},
                el(
                    'tr',
                    {},
                    headers.map((h) => el('th', { scope: 'col', text: h })),
                ),
            ),
            el(
                'tbody',
                {},
                rows.map((row) =>
                    el(
                        'tr',
                        {},
                        row.map((value) => el('td', {}, value ?? '—')),
                    ),
                ),
            ),
        ),
    );
    const body = root.querySelector('tbody');
    const keyedRows = new Map();
    // These small report tables keep cells/links mounted while values change.
    root.updateRows = (next, keys = next.map((_, index) => index)) => {
        const active = document.activeElement;
        const wanted = new Set(keys);
        for (const [key, row] of keyedRows)
            if (!wanted.has(key)) {
                row.remove();
                keyedRows.delete(key);
            }
        next.forEach((values, index) => {
            const row = keyedRows.get(keys[index]) ?? el('tr');
            keyedRows.set(keys[index], row);
            if (body.rows[index] !== row) body.insertBefore(row, body.rows[index] ?? null);
            values.forEach((value, column) => {
                const cell = row.cells[column] ?? row.insertCell();
                if (value instanceof Node) {
                    const current = cell.firstChild;
                    if (current === value) return;
                    if (current?.nodeName === 'A' && value.nodeName === 'A') {
                        current.href = value.href;
                        if (current.textContent !== value.textContent)
                            current.textContent = value.textContent;
                    } else cell.replaceChildren(value);
                } else if (cell.textContent !== String(value ?? '—')) cell.textContent = value ?? '—';
            });
        });
        if (active?.isConnected && root.contains(active) && document.activeElement !== active)
            active.focus({ preventScroll: true });
    };
    return root;
}
function section(heading, ...content) {
    return panel({ title: heading, className: 'game-card' }, ...content);
}
function field(label, input) {
    return new FieldShell({ control: input, label, className: 'game-field' }).element;
}
function numeric(value, attributes = {}) {
    return el('input', { type: 'number', min: 0, step: 'any', value, required: true, ...attributes });
}
function updateOptions(select, entries, placeholder) {
    const signature = JSON.stringify(entries);
    if (select.dataset.options === signature) return;
    select.dataset.options = signature;
    const value = select.value;
    select.replaceChildren(
        ...(placeholder ? [el('option', { value: '', text: placeholder })] : []),
        ...entries.map(([id, text]) => el('option', { value: id, text })),
    );
    if (value && !entries.some(([id]) => String(id) === value))
        select.append(el('option', { value, text: `#${value} · unavailable`, disabled: true }));
    if (value) select.value = value;
}

class GameplayWorkspace extends Component {
    commandButtons = [];
    updates = [];
    async render() {
        this.snapshot = this.inputs.snapshot;
        this.territories = new Map(this.snapshot.territories.map((t) => [t.territory_id, t]));
        this.number = (value) => this.services.i18n.number(value ?? 0, { maximumFractionDigits: 2 });
        const page = this.inputs.page;
        this.feedback = new CompactMessage(this.scope, { className: 'game-message' });
        this.message = this.feedback.element;
        this.feedback.show(this.services.gameplay.notice);
        let lastNotice = this.services.gameplay.notice;
        this.contextLabel = el('p', { class: 'eyebrow' });
        this.content = el('div', { class: 'game-cards' });
        const root = el(
            'div',
            { class: 'game-workspace' },
            el(
                'header',
                { class: 'game-heading' },
                this.contextLabel,
                el('h1', {
                    text: {
                        nation: 'Your nation',
                        economy: 'Economy & production',
                        military: 'Military command',
                        reports: 'World reports',
                    }[page],
                }),
            ),
            this.message,
            this.content,
        );
        this.element.append(root);
        if (!this.snapshot.setup.nation_id && page !== 'reports') {
            this.content.append(
                section(
                    'Establish your nation',
                    el('p', { text: 'Create a nation before managing its economy or armies.' }),
                    el('a', { href: this.services.boot.urls.setup, text: 'Create a nation' }),
                ),
            );
            return;
        }
        if (page === 'reports') {
            await this.reports();
        } else {
            this.data = await this.services.gameplay.load(this.snapshot, this.scope.signal);
            this.scope.signal.throwIfAborted();
            this[page]();
        }
        const updateBusy = () => {
            for (const control of this.commandButtons)
                control.setPending(
                    this.services.gameplay.busy ||
                        !this.services.world.current ||
                        this.services.gameplay.needsReview,
                );
            if (lastNotice !== this.services.gameplay.notice) {
                lastNotice = this.services.gameplay.notice;
                this.feedback.show(lastNotice);
            }
        };
        this.services.gameplay.changed.subscribe(this.scope, updateBusy);
        let initialized = false;
        this.services.world.store.subscribe(this.scope, (state) => {
            if (state.status === 'ready' && this.services.world.sameScope(this.snapshot, state.snapshot)) {
                const prior = this.snapshot;
                this.snapshot = state.snapshot;
                this.data = state.snapshot.nation;
                this.territories = new Map(this.snapshot.territories.map((t) => [t.territory_id, t]));
                this.contextLabel.textContent = `Experimental client · Game ${this.snapshot.game_id} · Turn ${this.snapshot.turn_number}`;
                const changed =
                    !initialized ||
                    !this.services.world.same(prior, this.snapshot) ||
                    prior.nation !== this.snapshot.nation ||
                    prior.territories !== this.snapshot.territories ||
                    prior.ownTerritories !== this.snapshot.ownTerritories ||
                    prior.nation_colors !== this.snapshot.nation_colors;
                if (changed || page === 'reports') for (const update of this.updates) update(prior);
                initialized = true;
            }
            updateBusy();
        });
        updateBusy();
    }
    liveTable(headers, rows, keys) {
        const view = table(headers, []);
        const update = () => view.updateRows(rows(), keys?.());
        this.updates.push(update);
        update();
        return view;
    }
    help(name, text) {
        return new Tooltip({
            scope: this.scope,
            text,
            label: this.services.i18n.t('common.helpFor', { name }),
        }).element;
    }
    territoryName(id) {
        return this.territories.get(id)?.name ?? `Territory ${id}`;
    }
    territoryLink(id) {
        return el('a', { href: `#/world?territory=${id}`, text: this.territoryName(id) });
    }
    stats(stats = []) {
        return el(
            'dl',
            { class: 'game-stats' },
            stats.map((s) =>
                el(
                    'div',
                    {},
                    el('dt', { text: s.title }),
                    el('dd', { text: formatStat(s, this.services.i18n) }),
                ),
            ),
        );
    }
    async command(name, body) {
        this.feedback.show('Submitting to the game server…');
        try {
            await this.services.gameplay.command(name, body, this.snapshot);
            return true;
        } catch (error) {
            if (!this.scope.closed) this.feedback.show(this.services.gameplay.notice || error.message);
            return false;
        }
    }
    commandButton(label, { type = 'button', variant = 'secondary' } = {}) {
        const control = new Button({ label, type, variant });
        control.element.setAttribute('data-command', '');
        this.commandButtons.push(control);
        return control.element;
    }
    action(label, callback, variant = 'secondary') {
        const control = this.commandButton(label, { variant });
        this.scope.listen(control, 'click', callback);
        return control;
    }
    nation() {
        const { identity, nation } = this.data;
        const formal = el('p');
        const stats = el('div');
        const ready = new StatusBadge({ label: '', tone: 'accent' });
        const guidance = el('p');
        const leaders = el('div');
        const flag = el('img', { class: 'nation-flag' });
        const identityCard = section(
            identity.usual_name,
            flag,
            formal,
            stats,
            ready.element,
            guidance,
            leaders,
        );
        const metrics = ['Territories', 'Active divisions', 'Pending deployments'].map(
            (label) => new MetricCard({ label, value: '' }),
        );
        let identityKey;
        this.updates.push(() => {
            const { identity, nation, leaders: people, divisions, deployments } = this.data;
            identityCard.querySelector('.ui-panel-title').textContent = identity.usual_name;
            formal.textContent = identity.formal_name;
            ready.update({
                label: nation.is_ready_for_next_turn ? 'Ready for next turn' : 'Planning orders',
                tone: nation.is_ready_for_next_turn ? 'ready' : 'accent',
            });
            guidance.textContent = nation.is_ready_for_next_turn
                ? 'You are ready. Waiting for the other nations.'
                : 'Plan your turn, then use Ready for next turn above.';
            flag.hidden = !identity.flag_src;
            if (identity.flag_src) flag.setAttribute('src', identity.flag_src);
            flag.alt = `${identity.usual_name} flag`;
            const key = JSON.stringify([identity.stats, nation.stats, people]);
            if (key !== identityKey) {
                identityKey = key;
                stats.replaceChildren(this.stats([...(identity.stats ?? []), ...(nation.stats ?? [])]));
                leaders.replaceChildren(
                    ...(people ?? []).map((leader) =>
                        section(
                            'Leadership',
                            el('p', { text: `${leader.title} ${leader.name}` }),
                            ...(leader.picture_src
                                ? [
                                      el('img', {
                                          class: 'leader-portrait',
                                          src: leader.picture_src,
                                          alt: leader.name,
                                      }),
                                  ]
                                : []),
                        ),
                    ),
                );
            }
            [this.snapshot.ownTerritories.length, divisions.length, deployments.length].forEach((value, i) =>
                metrics[i].update({ value: this.number(value) }),
            );
        });
        this.content.append(
            identityCard,
            section(
                'Command summary',
                cardStrip('Command summary', ...metrics),
                el('p', {}, el('a', { href: '#/economy', text: 'Review resources and production' })),
                el('p', {}, el('a', { href: '#/military', text: 'Deploy divisions and issue orders' })),
                el('p', {}, el('a', { href: '#/reports', text: 'Read news, battles and victory progress' })),
            ),
            section(
                'Your territories',
                this.liveTable(['Territory', 'Terrain', 'Usable land', 'Deployment'], () =>
                    this.snapshot.ownTerritories.map((own) => {
                        const t = this.territories.get(own.territory_id);
                        return [
                            this.territoryLink(own.territory_id),
                            title(t.terrain_type),
                            `${this.number(t.usable_land_ratio * 100)}%`,
                            own.can_deploy ? 'Available' : 'Insufficient loyalty',
                        ];
                    }),
                ),
            ),
        );
    }
    economy() {
        const planner = new Button({
            label: this.services.i18n.t('planner.open'),
            variant: 'primary',
            icon: 'economic',
        });
        this.scope.listen(planner.element, 'click', () => this.services.openProductionPlanner());
        this.services.i18n.changed.subscribe(this.scope, () =>
            planner.setLabel(this.services.i18n.t('planner.open')),
        );
        this.content.append(planner.element);
        this.content.append(
            section(
                'Resource budget',
                this.help(
                    'Resource budget',
                    'Commands reserve resources now; the turn resolves production and upkeep.',
                ),
                this.liveTable(
                    ['Resource', 'Production', 'Reserves', 'Upkeep', 'Expenses', 'Available', 'Balance'],
                    () =>
                        this.data.definitions.resources.map((r) => [
                            r.description ?? this.services.i18n.t(`command.resource.${r.resource_type}`),
                            ...[
                                'production',
                                'stockpiles',
                                'upkeep',
                                'expenses',
                                'available_production',
                                'balances',
                            ].map((key) =>
                                key === 'stockpiles' && !r.can_be_stocked
                                    ? 'Not stockpiled'
                                    : this.number(this.data.budget[key][r.resource_type]),
                            ),
                        ]),
                ),
            ),
        );
        this.content.append(
            section(
                'Labor pools',
                this.liveTable(['Territory', 'Labor', 'Free labor'], () =>
                    this.data.budget.labor_pools.map((p) => [
                        this.territoryLink(p.territory_id),
                        this.number(p.size / this.data.definitions.labor_per_unit),
                        this.number(p.free_labor / this.data.definitions.labor_per_unit),
                    ]),
                ),
            ),
            section(
                'Facility allocation',
                this.liveTable(
                    ['Territory', 'Resource', 'Capacity', 'Productivity', 'Allocated', 'Production'],
                    () =>
                        this.data.budget.labor_facility_allocations.map((f) => [
                            this.territoryLink(f.territory_id),
                            title(f.resource_type),
                            this.number(f.capacity / this.data.definitions.labor_per_unit),
                            this.number(f.productivity),
                            this.number(f.allocation / this.data.definitions.labor_per_unit),
                            this.number(f.production / this.data.definitions.labor_per_unit),
                        ]),
                ),
            ),
        );
    }
    military() {
        const { divisions, deployments, definitions } = this.data;
        const ownId = this.snapshot.setup.nation_id;
        const selected = new Set();
        const destination = el(
            'select',
            { 'aria-label': 'Order destination' },
            el('option', { value: '', text: 'Select a destination…' }),
            this.snapshot.territories
                .filter((t) => t.terrain_type !== 'Water')
                .map((t) =>
                    el('option', {
                        value: t.territory_id,
                        text: `${t.name}${t.owner_nation_id === ownId ? ' · yours' : t.owner_nation_id ? ' · foreign' : ' · unclaimed'}`,
                    }),
                ),
        );
        const preview = el('div', { class: 'order-preview', 'aria-live': 'polite' });
        let deploymentEdited = false;
        this.hasDrafts = () => deploymentEdited || (selected.size > 0 && Boolean(destination.value));
        const buildOrders = () =>
            draftMoveOrders(this.snapshot, this.data, selected, Number(destination.value));
        const orderText = (d) => {
            if (!d.order) return 'No orders';
            const target = d.order.destination_territory_id ?? d.order.target_territory_id;
            return `${title(d.order.order_type)}${target ? ` → ${this.territoryName(target)}` : ''}`;
        };
        const updatePreview = () => {
            const orders = buildOrders();
            const power = selectedPower(this.data, selected);
            preview.replaceChildren(
                el('p', {
                    text: `${selected.size} divisions selected. ${destination.value ? `Destination: ${this.territoryName(Number(destination.value))}.` : 'Choose a destination on the map or in the list.'}`,
                }),
            );
            if (power)
                preview.append(
                    el('p', { class: 'force-summary', text: this.services.i18n.t('forces.selected', power) }),
                );
            for (const order of orders)
                preview.append(
                    el('p', {
                        text: `#${order.division_id}: ${order.path_territory_ids === null ? 'Cannot reach this destination in one turn.' : order.path_territory_ids.length ? `Via ${order.path_territory_ids.map((id) => this.territoryName(id)).join(' → ')}` : 'Direct move (including existing coastal transport rule).'}`,
                    }),
                );
            viewport.context.selectedId = Number(destination.value) || null;
            viewport.invalidate();
        };
        const mapState = this.services.saved.child(`game-${this.snapshot.game_id}`).child('military');
        const viewport = new MapViewport({
            scope: this.scope,
            i18n: this.services.i18n,
            definition: mapDefinitionFor(this.snapshot.map, this.snapshot.territories),
            territories: this.snapshot.territories,
            layers: createLayers(),
            images: this.services.boot.mapImages,
            savedCamera: mapState.read().camera,
            context: {
                ownNationId: ownId,
                selectedId: null,
                overlays: [militaryOverlay(divisions, deployments, selected, buildOrders)],
            },
            onSelect: (territory) => {
                if (territory && territory.terrain_type !== 'Water') {
                    destination.value = territory.territory_id;
                    updatePreview();
                }
            },
        });
        this.scope.own(() => mapState.write({ camera: viewport.camera.snapshot() }));
        const focus = button('Focus your forces');
        this.scope.listen(focus, 'click', () => {
            const division =
                this.data.divisions.find((d) => selected.has(d.division_id)) ?? this.data.divisions[0];
            const territory = this.territories.get(
                division?.territory_id ?? this.snapshot.ownTerritories[0]?.territory_id,
            );
            if (!territory) return;
            const point = viewport.picker.center?.(territory) ?? {
                x: (territory.x + 0.5) * viewport.context.definition.tileWidth,
                y: (territory.y + 0.5) * viewport.context.definition.tileHeight,
            };
            viewport.camera.x = point.x;
            viewport.camera.y = point.y;
            viewport.camera.zoom = viewport.camera.fitZoom * 5;
            viewport.camera.constrain();
            viewport.invalidate();
        });
        const mapCard = section(
            'Order destination',
            this.help(
                'Order destination',
                'Select divisions below, then choose a territory. Moves into foreign territory become attacks or raids according to the existing unit rules. The server validates all orders.',
            ),
            viewport.element,
            focus,
            this.help(
                'Map legend',
                'Markers: active divisions + pending deployments. Green lines: accepted orders. Dashed gold: draft routes. Select units in the roster below.',
            ),
            field('Destination', destination),
            preview,
        );
        mapCard.classList.add('military-map');
        const checkboxes = new Map();
        const selectAll = el('input', { type: 'checkbox', 'aria-label': 'Select all divisions' });
        this.scope.listen(selectAll, 'change', () => {
            for (const checkbox of checkboxes.values()) {
                checkbox.checked = selectAll.checked;
                if (checkbox.checked) selected.add(Number(checkbox.value));
                else selected.delete(Number(checkbox.value));
            }
            updatePreview();
        });
        const roster = this.liveTable(
            ['Select', 'Division', 'Location', 'Current order'],
            () =>
                this.data.divisions.map((d) => {
                    let checkbox = checkboxes.get(d.division_id);
                    if (!checkbox) {
                        checkbox = el('input', {
                            type: 'checkbox',
                            value: d.division_id,
                            'aria-label': `Select division ${d.division_id}`,
                        });
                        checkboxes.set(d.division_id, checkbox);
                    }
                    checkbox.checked = selected.has(d.division_id);
                    return [
                        checkbox,
                        `#${d.division_id} ${title(d.division_type)}`,
                        this.territoryLink(d.territory_id),
                        orderText(d),
                    ];
                }),
            () => this.data.divisions.map((d) => d.division_id),
        );
        this.scope.listen(roster, 'change', (event) => {
            const checkbox = event.target;
            const id = Number(checkbox.value);
            if (checkbox.checked) selected.add(id);
            else selected.delete(id);
            selectAll.checked = selected.size === this.data.divisions.length;
            updatePreview();
        });
        const requireSelection = () => {
            if (!selected.size) {
                this.feedback.show('Select at least one division first.');
                return false;
            }
            return true;
        };
        this.scope.listen(destination, 'change', updatePreview);
        const orders = section(
            'Active divisions',
            field('Select all divisions', selectAll),
            roster,
            el(
                'div',
                { class: 'game-actions' },
                this.action('Send move / attack orders', () => {
                    if (!requireSelection()) return;
                    const orders = buildOrders();
                    if (!destination.value || orders.some((o) => o.path_territory_ids === null)) {
                        this.feedback.show('Choose a destination reachable by every selected division.');
                        return;
                    }
                    void this.command('sendMoveOrders', { orders });
                }),
                this.action('Cancel selected orders', () => {
                    if (requireSelection())
                        void this.command('cancelOrders', { division_ids: [...selected] });
                }),
                this.action(
                    'Disband selected divisions',
                    () => {
                        if (
                            requireSelection() &&
                            window.confirm(
                                `Order ${selected.size} divisions to disband at the end of this turn?`,
                            )
                        )
                            void this.command('sendDisbandOrders', {
                                orders: [...selected].map((division_id) => ({ division_id })),
                            });
                    },
                    'danger',
                ),
            ),
        );
        const emptyRoster = el('p', {
            text: 'No active divisions. Request deployment below; units become active after the turn advances.',
        });
        orders.append(emptyRoster);
        this.content.append(mapCard, orders);
        const type = el(
            'select',
            { 'aria-label': 'Division type' },
            definitions.divisions.map((d) => el('option', { value: d.division_type, text: d.description })),
        );
        const home = el(
            'select',
            { 'aria-label': 'Deployment territory', required: true },
            this.snapshot.ownTerritories
                .filter((t) => t.can_deploy)
                .map((t) =>
                    el('option', { value: t.territory_id, text: this.territoryName(t.territory_id) }),
                ),
        );
        const quantity = numeric(1, { min: 1, max: 100, step: 1, 'aria-label': 'Division quantity' });
        const cost = el('p', { class: 'muted' });
        const showCost = () => {
            const meta = this.data.definitions.divisions.find((m) => m.division_type === type.value);
            if (!meta) return;
            const costs = (values) =>
                Object.entries(values)
                    .map(([r, v]) => `${this.number(v * Number(quantity.value))} ${title(r)}`)
                    .join(', ') || 'None';
            cost.textContent = `Deployment: ${costs(meta.deployment_costs)}. Upkeep each turn: ${costs(meta.upkeep_costs)}. Attack costs: ${costs(meta.attack_costs)}. Movement ${meta.moves}. Attack ${meta.attack_power} / Defense ${meta.defense_power}.${meta.can_take_territory ? '' : ' Cannot capture territory.'}`;
        };
        this.scope.listen(type, 'change', showCost);
        this.scope.listen(quantity, 'input', showCost);
        showCost();
        const deploy = el(
            'form',
            { class: 'deployment-form' },
            field('Division type', type),
            field('Owned territory', home),
            field('Quantity (up to 100 per request)', quantity),
            cost,
            this.commandButton('Request deployment', { type: 'submit', variant: 'primary' }),
        );
        let deploymentRevision = 0;
        this.scope.listen(deploy, 'input', () => {
            deploymentEdited = true;
            deploymentRevision++;
        });
        this.scope.listen(deploy, 'submit', (event) => {
            event.preventDefault();
            if (
                !home.value ||
                !this.snapshot.ownTerritories.some(
                    (t) => t.territory_id === Number(home.value) && t.can_deploy,
                )
            ) {
                this.feedback.show('No territory currently has enough loyalty for deployment.');
                return;
            }
            const submittedRevision = deploymentRevision;
            void this.command('deploy', {
                deployments: Array.from({ length: Number(quantity.value) }, () => ({
                    division_type: type.value,
                    territory_id: Number(home.value),
                })),
            }).then((accepted) => {
                if (accepted && submittedRevision === deploymentRevision) deploymentEdited = false;
            });
        });
        const cancelButtons = new Map();
        const pending = this.liveTable(
            ['Type', 'Territory', 'Action'],
            () =>
                this.data.deployments.map((d) => {
                    let control = cancelButtons.get(d.deployment_id);
                    if (!control) {
                        control = new Button({ label: `Cancel deployment #${d.deployment_id}` });
                        control.element.dataset.deploymentId = d.deployment_id;
                        this.commandButtons.push(control);
                        cancelButtons.set(d.deployment_id, control);
                    }
                    return [title(d.division_type), this.territoryLink(d.territory_id), control.element];
                }),
            () => this.data.deployments.map((d) => d.deployment_id),
        );
        this.scope.listen(pending, 'click', (event) => {
            const control = event.target.closest('[data-deployment-id]');
            if (control)
                void this.command('cancelDeployments', {
                    deployment_ids: [Number(control.dataset.deploymentId)],
                });
        });
        const emptyPending = el('p', { text: 'No pending deployments.' });
        this.content.append(
            section('Deploy divisions', deploy),
            section('Pending deployments', pending, emptyPending),
        );
        this.updates.unshift((prior) => {
            if (!this.services.world.same(prior, this.snapshot)) {
                selected.clear();
                destination.value = '';
                quantity.value = 1;
                this.feedback.show(this.services.i18n.t('command.newTurn'));
            }
            const selectedCount = selected.size;
            for (const id of checkboxes.keys()) {
                if (!this.data.divisions.some((d) => d.division_id === id)) {
                    selected.delete(id);
                    checkboxes.delete(id);
                }
            }
            if (selected.size !== selectedCount)
                this.feedback.show(this.services.i18n.t('command.unitsChanged'));
        });
        this.updates.push(() => {
            for (const [id, control] of cancelButtons)
                if (!this.data.deployments.some((d) => d.deployment_id === id)) {
                    this.commandButtons = this.commandButtons.filter((item) => item !== control);
                    cancelButtons.delete(id);
                }
            updateOptions(
                destination,
                this.snapshot.territories
                    .filter((t) => t.terrain_type !== 'Water')
                    .map((t) => [t.territory_id, t.name]),
                'Select a destination…',
            );
            updateOptions(
                home,
                this.snapshot.ownTerritories
                    .filter((t) => t.can_deploy)
                    .map((t) => [t.territory_id, this.territoryName(t.territory_id)]),
            );
            emptyRoster.hidden = Boolean(this.data.divisions.length);
            emptyPending.hidden = Boolean(this.data.deployments.length);
            selectAll.checked = Boolean(selected.size) && selected.size === this.data.divisions.length;
            selectAll.indeterminate = Boolean(selected.size) && !selectAll.checked;
            viewport.context.territories = this.snapshot.territories;
            viewport.context.nationColors = this.snapshot.nation_colors;
            viewport.picker.update(this.snapshot.territories);
            viewport.renderer.updateData?.();
            viewport.context.overlays = [
                militaryOverlay(this.data.divisions, this.data.deployments, selected, buildOrders),
            ];
            updatePreview();
            showCost();
        });
        updatePreview();
    }
    async reports() {
        const turn = numeric(this.snapshot.turn_number, {
            min: 1,
            max: this.snapshot.turn_number,
            step: 1,
            'aria-label': 'Battle report turn',
        });
        const loadControl = new Button({ type: 'submit', label: 'Load battle turn' });
        const load = loadControl.element;
        const form = el('form', { class: 'report-controls' }, field('Battle report turn', turn), load);
        const body = el('div', { class: 'game-cards' });
        const rankingsView = new RankingsView({
            scope: this.scope,
            i18n: this.services.i18n,
            loadHistory: (snapshot) => this.services.gameplay.rankingHistory(snapshot),
        });
        this.content.append(form, body);
        let displayed;
        let context = this.snapshot;
        const loadReports = async (background = false) => {
            this.reportScope?.dispose();
            const request = new Scope();
            this.reportScope = request;
            const signal = AbortSignal.any([this.scope.signal, request.signal]);
            loadControl.setPending(!background);
            const snapshot = this.snapshot;
            const reportTurn = Number(turn.value);
            try {
                const report = await this.services.gameplay.reports(snapshot, reportTurn, signal);
                signal.throwIfAborted();
                if (!this.services.world.same(snapshot, this.snapshot)) return;
                const signature = JSON.stringify([reportTurn, report]);
                if (signature === displayed) return;
                displayed = signature;
                this.reportIdentities = report;
                const names = new Map(report.nations.map((n) => [n.nation_id, n.usual_name]));
                const name = (id) => names.get(id) ?? (id ? `Nation ${id}` : 'Unclaimed');
                const news = section(`News · current turn ${this.snapshot.turn_number}`);
                const reportOptions = {
                    ...report,
                    territories: this.snapshot.territories,
                    nationColors: this.snapshot.nation_colors,
                };
                for (const item of report.news) news.append(reportEvent(item, reportOptions));
                if (!report.news.length) news.append(el('p', { text: 'No news this turn.' }));
                const battles = section(
                    `Battle reports · turn ${reportTurn}`,
                    el('p', { text: 'Only battles in which your nation participated are shown.' }),
                );
                for (const battle of report.battles)
                    battles.append(
                        el(
                            'details',
                            { 'data-report-key': `battle-${battle.battle_id}` },
                            el(
                                'summary',
                                {},
                                el('span', { text: `${this.territoryName(battle.territory_id)} · ` }),
                                battleParticipants(battle, reportOptions),
                            ),
                            this.territoryLink(battle.territory_id),
                            this.reportContent(battle.text),
                        ),
                    );
                if (!report.battles.length)
                    battles.append(el('p', { text: 'No battle reports for this turn.' }));
                rankingsView.update({
                    rankings: report.rankings,
                    nations: report.nations,
                    snapshot: this.snapshot,
                    nationColors: this.snapshot.nation_colors,
                });
                const victory = section(
                    'Victory progress',
                    el('p', {
                        text: report.victory.winner_nation_id
                            ? `Winner: ${name(report.victory.winner_nation_id)}`
                            : 'No winner yet.',
                    }),
                );
                report.victory.goals.forEach((goal, index) =>
                    victory.append(
                        el('h3', {
                            text: `${goal.title} · Goal ${formatStat({ value: goal.goal, unit: goal.unit }, this.services.i18n)}`,
                        }),
                        table(
                            ['Rank', 'Nation', 'Value', 'Progress'],
                            (report.victory.progressions[index] ?? []).map((p) => [
                                String(p.rank),
                                name(p.nation_id),
                                formatStat({ value: p.value, unit: goal.unit }, this.services.i18n),
                                `${this.number(p.progress * 100)}%`,
                            ]),
                        ),
                    ),
                );
                const directory = section('Nations');
                for (const nation of report.nations) {
                    const details = el(
                        'details',
                        { 'data-report-key': `nation-${nation.nation_id}` },
                        el('summary', { text: nation.usual_name }),
                        el('p', { text: nation.formal_name }),
                        this.stats(nation.stats),
                    );
                    if (nation.flag_src)
                        details.append(
                            el('img', {
                                class: 'nation-flag',
                                src: nation.flag_src,
                                alt: `${nation.usual_name} flag`,
                            }),
                        );
                    for (const leader of report.leaders.filter(
                        (leader) => leader.nation_id === nation.nation_id,
                    ))
                        details.append(el('p', { text: `${leader.title} ${leader.name}` }));
                    directory.append(details);
                }
                // Preserve report sections and matching disclosures (including their summary
                // focus and expansion). Only changed read-only content is replaced.
                [news, battles, rankingsView.element, victory, directory].forEach((next, index) => {
                    const current = body.children[index];
                    if (!current) {
                        body.append(next);
                        return;
                    }
                    const comparison = current.cloneNode(true);
                    for (const detail of comparison.querySelectorAll('details'))
                        detail.removeAttribute('open');
                    if (comparison.isEqualNode(next)) return;
                    const children = [...next.children].map((child, index) => {
                        if (child.tagName !== 'DETAILS') {
                            const old = current.children[index];
                            return old?.isEqualNode(child) ? old : child;
                        }
                        const old = [...current.querySelectorAll('details')].find(
                            (item) => item.dataset.reportKey === child.dataset.reportKey,
                        );
                        if (!old) return child;
                        const same = old.cloneNode(true);
                        same.removeAttribute('open');
                        if (!same.isEqualNode(child)) {
                            const label = old.querySelector('summary');
                            label.textContent = child.querySelector('summary').textContent;
                            for (const content of [...old.children].slice(1)) content.remove();
                            old.append(...[...child.children].slice(1));
                        }
                        return old;
                    });
                    for (const child of [...current.children]) if (!children.includes(child)) child.remove();
                    children.forEach((child, index) => {
                        if (current.children[index] !== child)
                            current.insertBefore(child, current.children[index] ?? null);
                    });
                });
            } catch (error) {
                if (!signal.aborted) this.feedback.show(error.message);
            } finally {
                if (!signal.aborted) loadControl.setPending(false);
            }
        };
        this.scope.own(() => this.reportScope?.dispose());
        this.scope.listen(form, 'submit', (event) => {
            event.preventDefault();
            void loadReports();
        });
        this.updates.push((prior) => {
            turn.max = this.snapshot.turn_number;
            if (!this.services.world.same(context, this.snapshot)) {
                if (
                    Number(turn.value) === context.turn_number ||
                    Number(turn.value) > this.snapshot.turn_number
                )
                    turn.value = this.snapshot.turn_number;
                context = this.snapshot;
            }
            if (prior !== this.snapshot) void loadReports(true);
        });
        await loadReports();
    }
    reportContent(content) {
        return el('pre', {
            class: 'report-text',
            text: reportText(content, { ...this.reportIdentities, territories: this.snapshot.territories }),
        });
    }
}

export function createInstance(options) {
    return new GameplayWorkspace(options);
}
