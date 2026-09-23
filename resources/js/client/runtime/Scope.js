/** Owns cancellation and cleanup. Release functions remove resources from diagnostics immediately. */
export class Scope {
    static activeScopes = 0;
    static activeResources = 0;
    #cleanups = new Set();
    #controller = new AbortController();
    #disposal;
    closed = false;

    constructor() {
        Scope.activeScopes++;
    }
    get signal() {
        return this.#controller.signal;
    }
    static diagnostics() {
        return { scopes: Scope.activeScopes, resources: Scope.activeResources };
    }

    own(cleanup) {
        if (this.closed) throw new Error('Cannot add resources to a closed scope.');
        let active = true;
        const release = () => {
            if (!active) return;
            active = false;
            this.#cleanups.delete(release);
            Scope.activeResources--;
            return cleanup();
        };
        this.#cleanups.add(release);
        Scope.activeResources++;
        return release;
    }
    listen(target, event, listener, options) {
        if (this.closed) throw new Error('Cannot listen with a closed scope.');
        target.addEventListener(event, listener, options);
        return this.own(() => target.removeEventListener(event, listener, options));
    }
    timeout(callback, delay) {
        let release;
        const id = setTimeout(() => {
            release();
            if (!this.closed) callback();
        }, delay);
        release = this.own(() => clearTimeout(id));
        return release;
    }
    dispose() {
        if (this.#disposal) return this.#disposal;
        this.closed = true;
        this.#controller.abort();
        Scope.activeScopes--;
        this.#disposal = Promise.resolve().then(async () => {
            const errors = [];
            for (const cleanup of [...this.#cleanups].reverse()) {
                try {
                    await cleanup();
                } catch (error) {
                    errors.push(error);
                }
            }
            if (errors.length) throw new AggregateError(errors, 'Resource cleanup failed.');
        });
        return this.#disposal;
    }
}
