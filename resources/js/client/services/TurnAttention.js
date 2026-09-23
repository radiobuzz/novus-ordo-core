/** Per-instance tab attention. No sound, notification permission or extra reads. */
export class TurnAttention {
    constructor(world, { document = globalThis.document, window = globalThis.window } = {}) {
        this.document = document;
        this.scope = world.scope;
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.icons = [...document.querySelectorAll('link[rel~="icon"]')];
        this.icon = document.createElement('link');
        this.icon.rel = 'icon';
        this.icon.type = 'image/svg+xml';
        this.icon.dataset.turnAttention = '';
        const svg = (color) =>
            'data:image/svg+xml,' +
            encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#101518"/><text x="16" y="25" text-anchor="middle" font-family="serif" font-size="27" fill="${color}">N</text><circle cx="26" cy="6" r="5" fill="${color}"/></svg>`,
            );
        this.frames = [svg('#d6ba80'), svg('#88c5b1')];
        this.scope.listen(document, 'visibilitychange', () => {
            if (!document.hidden) this.clear();
        });
        this.scope.listen(window, 'focus', () => {
            if (!document.hidden) this.clear();
        });
        this.scope.listen(this.reduced, 'change', () => {
            if (this.active) {
                this.clear();
                this.start();
            }
        });
        this.scope.own(() => this.clear());
        world.store.subscribe(this.scope, (state) => {
            if (!state.snapshot) {
                this.last = null;
                this.clear();
                return;
            }
            if (state.status !== 'ready') return;
            const next = { game: state.snapshot.game_id, turn: state.snapshot.turn_number };
            if (this.last?.game === next.game && next.turn > this.last.turn && document.hidden) this.start();
            if (this.last && (this.last.game !== next.game || next.turn < this.last.turn)) this.clear();
            this.last = next;
        });
    }
    start() {
        if (this.active || !this.document.hidden || this.scope.closed) return;
        this.active = true;
        this.positions = this.icons
            .filter((icon) => icon.isConnected)
            .map((icon) => {
                const anchor = this.document.createComment('original icon');
                icon.replaceWith(anchor);
                return { icon, anchor };
            });
        this.document.head.append(this.icon);
        let frame = 0;
        const tick = () => {
            this.icon.href = this.frames[frame++ % this.frames.length];
            if (!this.reduced.matches) this.cancel = this.scope.timeout(tick, 1000);
        };
        tick();
    }
    clear() {
        this.cancel?.();
        this.cancel = null;
        this.icon.remove();
        if (this.active) {
            for (const { icon, anchor } of this.positions) anchor.replaceWith(icon);
            this.positions = [];
        }
        this.active = false;
    }
}
