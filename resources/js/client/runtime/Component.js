import { Instance } from './Instance.js';

/** A DOM-owning instance. Subclasses render only inside their own root. */
export class Component extends Instance {
    async onMount(element) {
        this.element = element;
        this.scope.own(() => element.replaceChildren());
        await this.render();
    }
    async render() {}
}
