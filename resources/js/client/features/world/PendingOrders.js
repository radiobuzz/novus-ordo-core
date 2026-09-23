import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { unitVisual } from '../../ui/unitVisuals.js';
import { pendingOrderGroups } from '../../services/pendingOrders.js';

/** Persistent groups and rows. Delegated clicks always resolve IDs from the latest snapshot. */
export function renderPendingOrders(owner, body) {
    const t = owner.t;
    body.closest('.ui-panel')
        .querySelector('.ui-panel-actions')
        .prepend(
            new Tooltip({
                scope: owner.viewScope,
                text: t('pendingHelp'),
                label: owner.services.i18n.t('common.helpFor', { name: t('orders') }),
            }).element,
        );
    const empty = el('p', { text: t('noOrders') });
    const list = el('div', { class: 'pending-order-groups' });
    const groups = new Map(),
        rows = new Map();
    body.append(empty, list);
    owner.viewScope.listen(list, 'click', (event) => {
        const button = event.target.closest('button');
        const row = rows.get(button?.dataset.orderKey) ?? groups.get(button?.dataset.cancelGroup);
        if (row) void owner.command(row.command, row.body);
    });
    const control = (label) => {
        const button = new Button({ label, variant: 'quiet', icon: null });
        button.element.dataset.command = '';
        owner.controls.push(button);
        return button;
    };
    const remove = (map, key, row) => {
        row.element.remove();
        owner.controls = owner.controls.filter((c) => c !== row.control);
        map.delete(key);
    };
    const update = () => {
        const focused = list.contains(document.activeElement) ? document.activeElement : null;
        const items = pendingOrderGroups(owner.data);
        const rowKeys = new Set(items.flatMap((g) => g.items.map((i) => i.key)));
        for (const [key, row] of rows) if (!rowKeys.has(key)) remove(rows, key, row);
        for (const item of items) {
            const action = t(`action.${item.action}`);
            const title = `${action}${item.destination === null ? '' : ` → ${owner.name(item.destination)}`}`;
            let group = groups.get(item.key);
            if (!group) {
                const heading = el('strong');
                const cancel = control(t('cancelGroup'));
                cancel.element.dataset.cancelGroup = item.key;
                const counts = el('span', { class: 'pending-order-counts' });
                const units = el('div', { class: 'pending-order-units' });
                const details = el('details', {}, el('summary', {}, counts), units);
                const element = el(
                    'section',
                    { class: 'pending-order-group', 'data-order-group': item.key },
                    el('div', { class: 'pending-order-heading' }, heading, cancel.element),
                    details,
                );
                group = { element, heading, control: cancel, counts, units, details };
                groups.set(item.key, group);
                list.append(element);
            }
            group.heading.textContent = title;
            group.control.element.setAttribute(
                'aria-label',
                t('cancelGroupLabel', { name: title, count: item.items.length }),
            );
            group.command = item.command;
            group.body = { [item.idField]: item.items.map((i) => i.id) };
            const signature = JSON.stringify(item.counts);
            if (signature !== group.signature) {
                group.signature = signature;
                group.counts.replaceChildren(
                    ...Object.entries(item.counts).map(([type, count]) =>
                        el(
                            'span',
                            { class: 'pending-order-count' },
                            el('img', { src: unitVisual(type), alt: '' }),
                            el('span', { text: `${count} × ${owner.unit(type)}` }),
                        ),
                    ),
                );
            }
            for (const entry of item.items) {
                let row = rows.get(entry.key);
                if (!row) {
                    const cancel = control('');
                    cancel.element.dataset.orderKey = entry.key;
                    const text = el('span');
                    const element = el('div', { class: 'pending-order-unit' }, text, cancel.element);
                    row = { element, text, control: cancel };
                    rows.set(entry.key, row);
                }
                row.text.textContent = `${owner.unit(entry.type)} #${entry.id} · ${owner.name(entry.origin)}`;
                row.control.setLabel(t('cancel'));
                row.control.element.setAttribute(
                    'aria-label',
                    t(entry.command === 'cancelDeployments' ? 'cancelDeployment' : 'cancelOrder', {
                        id: entry.id,
                    }),
                );
                row.command = entry.command;
                row.body = { [entry.idField]: [entry.id] };
                if (row.element.parentElement !== group.units) {
                    group.units.append(row.element);
                    if (focused && row.element.contains(focused)) group.details.open = true;
                }
            }
        }
        const groupKeys = new Set(items.map((g) => g.key));
        for (const [key, group] of groups) if (!groupKeys.has(key)) remove(groups, key, group);
        if (focused?.isConnected && focused !== document.activeElement)
            focused.focus({ preventScroll: true });
        empty.hidden = Boolean(items.length);
        owner.updateBusy();
    };
    owner.refreshDock = update;
    update();
}
