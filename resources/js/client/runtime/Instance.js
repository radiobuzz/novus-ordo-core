import { Scope } from './Scope.js';

let nextId = 0;
export class Instance {
    #mount;
    #destroy;
    #host;
    constructor({ featureId = null, inputs = {}, services = {}, stateKey = null } = {}) {
        this.featureId = featureId;
        this.inputs = inputs;
        this.services = services;
        this.stateKey = stateKey;
        this.id = `instance-${++nextId}`;
        this.scope = new Scope();
        this.state = 'created';
    }
    mount(element) {
        if (this.state === 'destroyed' || this.state === 'destroying')
            return Promise.reject(new Error('Cannot mount a destroyed instance.'));
        if (this.#host && this.#host !== element)
            return Promise.reject(new Error('An instance can have only one host.'));
        if (this.#mount) return this.#mount;
        if (this.state !== 'created') return Promise.reject(new Error('Cannot mount a destroyed instance.'));
        this.#host = element;
        this.state = 'mounting';
        this.#mount = Promise.resolve().then(async () => {
            try {
                this.scope.signal.throwIfAborted();
                await this.onMount(element);
                this.scope.signal.throwIfAborted();
                this.state = 'ready';
                return this;
            } catch (error) {
                try {
                    await this.destroy();
                } catch (cleanup) {
                    throw new AggregateError([error, cleanup], 'Initialization and cleanup failed.');
                }
                throw error;
            }
        });
        return this.#mount;
    }
    async onMount() {}
    async canClose() {
        return true;
    }
    destroy() {
        if (this.#destroy) return this.#destroy;
        this.state = 'destroying';
        this.#destroy = this.scope.dispose().finally(() => {
            this.state = 'destroyed';
        });
        return this.#destroy;
    }
}
