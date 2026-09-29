import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';

/** One persistent category instance. Hiding a tab never destroys its controls. */
export class SettingsPanel extends Component {
    constructor(key, title) {
        super({ featureId: `map-settings-${key}` });
        this.element = el('section', {
            id: this.id,
            role: 'tabpanel',
            class: 'map-settings-panel',
            tabindex: 0,
        });
        this.body = el('div', { class: 'map-studio-fields' });
        this.element.append(el('h3', { text: title }), this.body);
    }
    async render() {}
}
