import { el } from './element.js';

let nextId = 0;

/** Local, retained panels. Callers own content, translated labels and badge meaning. */
export class Tabs {
    constructor(scope, { label = '', onSelect } = {}) {
        this.scope = scope;
        this.onSelect = onSelect;
        this.items = new Map();
        this.element = el('div', { class: 'ui-tabs', role: 'tablist', 'aria-label': label });
        scope.listen(this.element, 'click', (event) => {
            const tab = event.target.closest('[role="tab"]');
            if (tab && this.element.contains(tab)) this.select(tab.dataset.tabKey, { focus: true });
        });
        scope.listen(this.element, 'keydown', (event) => {
            const keys = [...this.items].filter(([, item]) => !item.button.disabled).map(([key]) => key);
            const index = keys.indexOf(event.target.dataset.tabKey);
            if (index < 0) return;
            let next;
            if (event.key === 'ArrowRight') next = keys[(index + 1) % keys.length];
            if (event.key === 'ArrowLeft') next = keys[(index + keys.length - 1) % keys.length];
            if (event.key === 'Home') next = keys[0];
            if (event.key === 'End') next = keys.at(-1);
            if (next === undefined) return;
            event.preventDefault();
            this.select(next, { focus: true });
        });
    }
    setLabel(label) {
        this.element.setAttribute('aria-label', label);
    }
    setItems(descriptors) {
        if (this.scope.closed) return;
        const hadFocus = this.element.contains(document.activeElement);
        const previous = this.items;
        this.items = new Map();
        for (const descriptor of descriptors) {
            const { key, label, icon, iconOnly = false, badge, panel, disabled = false } = descriptor;
            let item = previous.get(key);
            if (!item) {
                const id = `ui-tab-${++nextId}`;
                const picture = el('img', { class: 'ui-tab-icon', alt: '', width: 24, height: 24 });
                const caption = el('span', { class: 'ui-tab-label' });
                const marker = el('span', { class: 'ui-tab-badge', 'aria-hidden': 'true' });
                const button = el(
                    'button',
                    {
                        id,
                        type: 'button',
                        role: 'tab',
                        class: 'ui-button ui-tab',
                        'data-icon': 'none',
                        'data-tab-key': key,
                    },
                    picture,
                    caption,
                    marker,
                );
                item = { button, picture, caption, marker };
            }
            item.panel = panel;
            panel.id ||= `${item.button.id}-panel`;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', item.button.id);
            panel.tabIndex = 0;
            item.button.setAttribute('aria-controls', panel.id);
            item.button.setAttribute('aria-label', [label, badge?.label].filter(Boolean).join(' · '));
            item.button.title = [label, badge?.label].filter(Boolean).join(' · ');
            item.button.disabled = disabled;
            item.caption.textContent = label;
            item.caption.hidden = iconOnly && !!icon;
            item.picture.hidden = !icon;
            if (icon && item.picture.getAttribute('src') !== icon) item.picture.src = icon;
            item.marker.hidden = !badge;
            item.marker.textContent = badge?.text ?? '•';
            item.marker.dataset.tone = badge?.tone ?? 'accent';
            this.items.set(key, item);
        }
        for (const [key, item] of previous)
            if (!this.items.has(key)) {
                item.button.remove();
                item.panel.hidden = true;
            }
        // Do not move unchanged nodes: browser focus survives routine refresh/localization.
        [...this.items.values()].forEach((item, index) => {
            if (this.element.children[index] !== item.button)
                this.element.insertBefore(item.button, this.element.children[index] ?? null);
        });
        const selected = this.items.get(this.selected);
        const key =
            selected && !selected.button.disabled
                ? this.selected
                : [...this.items].find(([, item]) => !item.button.disabled)?.[0];
        this.select(key, { focus: hadFocus && (!selected || selected.button.disabled) });
    }
    select(key, { focus = false } = {}) {
        if (
            this.scope.closed ||
            (key !== undefined && (!this.items.has(key) || this.items.get(key).button.disabled))
        )
            return;
        const changed = this.selected !== key;
        this.selected = key;
        for (const [id, item] of this.items) {
            const selected = id === key;
            item.button.setAttribute('aria-selected', String(selected));
            item.button.tabIndex = selected ? 0 : -1;
            item.panel.hidden = !selected;
        }
        const button = this.items.get(key)?.button;
        if (focus && button) {
            button.focus({ preventScroll: true });
            const list = this.element.getBoundingClientRect(),
                tab = button.getBoundingClientRect();
            if (tab.left < list.left) this.element.scrollLeft += tab.left - list.left;
            if (tab.right > list.right) this.element.scrollLeft += tab.right - list.right;
        }
        if (changed) this.onSelect?.(key);
    }
}
