export class Signal {
    #listeners = new Set();
    subscribe(scope, listener) {
        if (scope.closed) throw new Error('Cannot subscribe with a closed scope.');
        this.#listeners.add(listener);
        return scope.own(() => this.#listeners.delete(listener));
    }
    emit(value) {
        for (const listener of [...this.#listeners]) listener(value);
    }
}
