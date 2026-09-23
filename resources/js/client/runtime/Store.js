export function freezeValue(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freezeValue);
        Object.freeze(value);
    }
    return value;
}

/** The owner keeps publish; consumers receive only the read/subscribe facade. */
export function createStore(initial, { onError = console.error } = {}) {
    let value = freezeValue(initial);
    let notifying = false;
    const listeners = new Set();
    const deliver = (entry) => {
        const { scope, listener } = entry;
        if (scope.closed || !listeners.has(entry)) return;
        try {
            listener(value);
        } catch (error) {
            try {
                onError(error);
            } catch (reportError) {
                console.error(reportError);
            }
        }
    };
    const store = Object.freeze({
        get value() {
            return value;
        },
        subscribe(scope, listener) {
            if (scope.closed) throw new Error('Cannot subscribe with a closed scope.');
            const entry = { scope, listener };
            listeners.add(entry);
            const release = scope.own(() => listeners.delete(entry));
            const wasNotifying = notifying;
            notifying = true;
            try {
                deliver(entry);
            } finally {
                notifying = wasNotifying;
            }
            return release;
        },
    });
    return {
        store,
        publish(next) {
            if (notifying) throw new Error('Store publication cannot be nested inside a subscriber.');
            if (next === value) return;
            value = freezeValue(next);
            notifying = true;
            try {
                for (const entry of [...listeners]) deliver(entry);
            } finally {
                notifying = false;
            }
        },
    };
}
