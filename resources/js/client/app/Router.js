/** Only implemented routes are accepted. No class names or arbitrary import paths. */
export class Router {
    constructor(scope, onChange, isActive = () => true) {
        this.onChange = onChange;
        this.isActive = isActive;
        scope.listen(window, 'hashchange', () => this.read());
    }
    read() {
        if (!this.isActive()) return;
        const page = location.hash.match(/^#\/(nation|economy|military|reports)$/);
        if (page) {
            this.onChange(null, page[1]);
            return;
        }
        const match = location.hash.match(/^#\/world(?:\?territory=([1-9]\d*))?$/);
        if (!match) {
            history.replaceState(null, '', '#/world');
            this.onChange(null, 'world');
            return;
        }
        const id = match[1] ? Number(match[1]) : null;
        this.onChange(Number.isSafeInteger(id) ? id : null, 'world');
    }
    select(id) {
        const hash = id === null ? '#/world' : `#/world?territory=${id}`;
        if (location.hash === hash) this.read();
        else location.hash = hash;
    }
}
