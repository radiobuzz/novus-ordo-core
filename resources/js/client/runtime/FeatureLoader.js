export class FeatureLoader {
    #loaded = new Map();
    constructor(registry) {
        this.registry = registry;
    }
    load(id) {
        if (!this.registry.has(id)) return Promise.reject(new Error(`Unknown feature: ${id}`));
        if (!this.#loaded.has(id)) {
            const promise = Promise.resolve()
                .then(this.registry.get(id))
                .then((module) => {
                    if (typeof module.createInstance !== 'function')
                        throw new Error(`Invalid feature: ${id}`);
                    return module;
                })
                .catch((error) => {
                    this.#loaded.delete(id);
                    throw error;
                });
            this.#loaded.set(id, promise);
        }
        return this.#loaded.get(id);
    }
}
