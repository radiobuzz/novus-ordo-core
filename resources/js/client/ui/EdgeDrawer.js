import { el } from './element.js';
import { Button } from './Button.js';
import './edge-drawer.scss';

let sequence = 0;
/** A responsive edge drawer. Only the handle owns swipe gestures; content stays mounted. */
export class EdgeDrawer {
    constructor(scope, { content, label, media = '(max-width: 760px)' }) {
        this.content = content;
        this.handle = new Button({ label: '⋮', icon: null, className: 'ui-edge-handle' });
        content.id ||= `edge-drawer-${++sequence}`;
        this.handle.element.setAttribute('aria-controls', content.id);
        this.setLabel(label);
        this.element = el('div', { class: 'ui-edge-drawer' }, content, this.handle.element);
        this.media = window.matchMedia(media);
        this.open = false;
        scope.listen(this.media, 'change', () => this.update());
        scope.listen(this.handle.element, 'click', () => {
            if (this.swiped) {
                this.swiped = false;
                return;
            }
            this.setOpen(!this.open);
        });
        scope.listen(this.handle.element, 'pointerdown', (event) => {
            this.swiped = false;
            this.start = { x: event.clientX, y: event.clientY, id: event.pointerId };
            this.handle.element.setPointerCapture(event.pointerId);
        });
        scope.listen(this.handle.element, 'pointerup', (event) => {
            if (!this.start || this.start.id !== event.pointerId) return;
            const dx = event.clientX - this.start.x,
                dy = event.clientY - this.start.y;
            this.start = null;
            if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
                this.swiped = true;
                this.setOpen(dx > 0);
            }
        });
        scope.listen(this.handle.element, 'pointercancel', () => {
            this.start = null;
        });
        scope.listen(this.element, 'keydown', (event) => {
            if (event.key === 'Escape' && this.media.matches && this.open) {
                event.preventDefault();
                event.stopPropagation();
                this.setOpen(false);
            }
        });
        scope.listen(document, 'pointerdown', (event) => {
            if (this.media.matches && this.open && !this.element.contains(event.target)) this.setOpen(false);
        });
        scope.own(() => {
            content.inert = false;
        });
        this.update();
    }
    setLabel(label) {
        this.handle.element.setAttribute('aria-label', label);
        this.handle.element.title = label;
    }
    setOpen(open) {
        this.open = open;
        this.update();
    }
    update() {
        const mobile = this.media.matches;
        if (mobile && !this.open && this.content.contains(document.activeElement))
            this.handle.element.focus();
        this.element.dataset.mobile = String(mobile);
        this.element.dataset.open = String(this.open);
        this.content.inert = mobile && !this.open;
        this.handle.element.setAttribute('aria-expanded', String(!mobile || this.open));
    }
}
