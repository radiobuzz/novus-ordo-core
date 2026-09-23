import { el } from './dom.js';
export class FeedbackMessage {
    element = el('p', { class: 'entry-feedback', role: 'alert', hidden: true });
    show(message) {
        this.element.textContent = message;
        this.element.hidden = !message;
    }
}
