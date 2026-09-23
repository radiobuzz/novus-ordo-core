export class SavedState {
    constructor(storage, namespace) {
        this.storage = storage;
        this.namespace = namespace;
    }
    child(key) {
        return new SavedState(this.storage, `${this.namespace}:${key}`);
    }
    read(fallback = {}) {
        try {
            const saved = JSON.parse(this.storage?.getItem(`no7:v1:${this.namespace}`) ?? 'null');
            return saved?.version === 1 && saved.value && typeof saved.value === 'object'
                ? saved.value
                : fallback;
        } catch {
            return fallback;
        }
    }
    write(value) {
        try {
            this.storage?.setItem(`no7:v1:${this.namespace}`, JSON.stringify({ version: 1, value }));
        } catch {
            /* Storage is optional. */
        }
    }
}
