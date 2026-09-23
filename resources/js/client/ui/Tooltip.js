import { el } from './element.js';
import './tooltip.scss';

let nextId = 0;

/** Text-only help: hover/focus to read, click/tap to pin, Escape to dismiss. */
export class Tooltip {
    constructor({ scope, text = '', label = 'Help', trigger } = {}) {
        this.trigger =
            trigger ??
            el('button', {
                type: 'button',
                class: 'ui-help',
                text: '?',
                'data-icon': 'none',
                'aria-label': label,
            });
        this.popup = el('span', {
            id: `ui-tooltip-${++nextId}`,
            class: 'ui-tooltip',
            role: 'tooltip',
            popover: 'manual',
            text,
        });
        this.element = el('span', { class: 'ui-tooltip-anchor' }, this.trigger, this.popup);
        this.description = this.trigger.getAttribute('aria-describedby') ?? '';
        this.trigger.setAttribute('aria-describedby', `${this.description} ${this.popup.id}`.trim());
        let dismiss;
        const show = () => {
            dismiss?.();
            dismiss = null;
            this.show();
        };
        const leave = () => {
            dismiss?.();
            dismiss = scope.timeout(() => {
                dismiss = null;
                if (
                    !this.pinned &&
                    !this.element.matches(':hover') &&
                    !this.element.contains(document.activeElement)
                )
                    this.hide();
            }, 150);
        };
        scope.listen(this.element, 'pointerenter', (event) => {
            if (event.pointerType !== 'touch') show();
        });
        scope.listen(this.element, 'pointerleave', leave);
        scope.listen(this.trigger, 'focus', show);
        scope.listen(this.trigger, 'blur', () => {
            if (!this.pinned) this.hide();
        });
        scope.listen(this.trigger, 'click', (event) => {
            event.stopPropagation();
            if (this.pinned) this.hide();
            else {
                this.pinned = true;
                show();
            }
        });
        if (this.trigger.tagName !== 'BUTTON')
            scope.listen(this.trigger, 'keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.trigger.click();
                }
            });
        scope.listen(
            document,
            'keydown',
            (event) => {
                if (event.key === 'Escape' && this.open) {
                    this.hide();
                    event.preventDefault();
                    event.stopPropagation();
                }
            },
            true,
        );
        scope.listen(
            document,
            'pointerdown',
            (event) => {
                if (this.open && !this.element.contains(event.target)) this.hide();
            },
            true,
        );
        scope.listen(window, 'resize', () => {
            if (this.open) this.position();
        });
        scope.listen(
            document,
            'scroll',
            (event) => {
                if (this.open && event.target !== this.popup) this.position();
            },
            true,
        );
        scope.own(() => {
            this.hide();
            this.popup.remove();
        });
        this.setText(text);
    }
    setText(text) {
        if (this.popup.textContent !== text) this.popup.textContent = text;
        this.enabled = Boolean(text);
        if (!text) this.hide();
        else if (this.open) this.position();
    }
    setLabel(label) {
        this.trigger.setAttribute('aria-label', label);
    }
    show() {
        if (!this.enabled || !this.trigger.isConnected) return;
        if (!this.open) {
            this.popup.showPopover();
            this.open = true;
        }
        this.position();
    }
    position() {
        const anchor = this.trigger.getBoundingClientRect();
        const gap = 8;
        const bounds = this.popup.getBoundingClientRect();
        const left = Math.max(gap, Math.min(anchor.left, window.innerWidth - bounds.width - gap));
        const below = anchor.bottom + gap;
        const top =
            below + bounds.height <= window.innerHeight - gap
                ? below
                : Math.max(gap, anchor.top - bounds.height - gap);
        this.popup.style.left = `${left}px`;
        this.popup.style.top = `${top}px`;
    }
    hide() {
        if (this.open && this.popup.isConnected && this.popup.matches(':popover-open'))
            this.popup.hidePopover();
        this.open = false;
        this.pinned = false;
    }
}
