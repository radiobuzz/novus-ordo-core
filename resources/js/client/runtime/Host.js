/** Owns replacement and race control, not feature rendering or endpoint knowledge. */
export class Host {
    #generation = 0;
    #intent = 0;
    #closing = new Set();
    #disposed = false;
    constructor({ loader, services, createSlot, showStatus, onError = console.error }) {
        Object.assign(this, { loader, services, createSlot, showStatus, onError });
        this.current = null;
    }
    async #retire(instance) {
        if (!instance) return;
        const closing = instance.destroy();
        this.#closing.add(closing);
        try {
            await closing;
        } catch (error) {
            this.onError(error);
        } finally {
            this.#closing.delete(closing);
        }
    }
    async open(featureId, inputs = {}) {
        if (this.#disposed) return false;
        const intent = ++this.#intent;
        const prior = this.current;
        if (prior && !(await prior.canClose())) return false;
        if (intent !== this.#intent || this.#disposed) return false;
        const generation = ++this.#generation;
        this.current = null;
        await this.#retire(prior);
        if (generation !== this.#generation) return false;
        this.showStatus('loading');
        let instance;
        try {
            const definition = await this.loader.load(featureId);
            if (generation !== this.#generation) return false;
            instance = definition.createInstance({ featureId, inputs, services: this.services });
            this.current = instance;
            const slot = this.createSlot();
            await instance.mount(slot);
            if (generation !== this.#generation) {
                await this.#retire(instance);
                return false;
            }
            this.showStatus('ready');
            return true;
        } catch (error) {
            await this.#retire(instance);
            if (generation !== this.#generation) return false;
            this.current = null;
            this.showStatus('error', error, () => this.open(featureId, inputs));
            return false;
        }
    }
    async close({ force = false } = {}) {
        const intent = ++this.#intent;
        const prior = this.current;
        if (!force && prior && !(await prior.canClose())) return false;
        if (intent !== this.#intent) return false;
        const generation = ++this.#generation;
        this.current = null;
        await this.#retire(prior);
        if (generation === this.#generation) this.showStatus('closed');
        return true;
    }
    async dispose() {
        this.#disposed = true;
        await this.close({ force: true });
        await Promise.allSettled([...this.#closing]);
    }
}
