export class EntryRouter {
    constructor(scope) {
        scope.listen(window, 'hashchange', () => this.read());
    }
    attach(process) {
        this.process = process;
        this.read();
    }
    detach(process) {
        if (this.process === process) this.process = null;
    }
    read() {
        if (!this.process) return;
        const match = location.hash.match(/^#\/nation\/(identity|leader|homeland|review)$/);
        if (match && match[1] !== this.process.stepId) this.process.goTo(match[1]);
        this.write(this.process.stepId, true);
    }
    write(id, replace = false) {
        const hash = `#/nation/${id}`;
        if (location.hash === hash) return;
        history[replace ? 'replaceState' : 'pushState'](null, '', hash);
    }
}
