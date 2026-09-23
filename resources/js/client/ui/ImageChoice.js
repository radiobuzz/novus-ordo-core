import { Button } from './Button.js';
import { el } from './dom.js';

/** A selectable image button. The caller supplies availability and owns selection intent. */
export class ImageChoice {
    constructor({ label, image, detail = '', selected = false, disabled = false, unavailable = false }) {
        this.control = new Button({ disabled, className: 'ui-image-choice' });
        this.element = this.control.element;
        this.element.setAttribute('aria-pressed', String(selected));
        this.element.dataset.unavailable = String(unavailable);
        if (image)
            this.element.append(el('img', { src: image, alt: '', loading: 'eager', decoding: 'async' }));
        this.badges = el('span', { class: 'ui-image-choice-badges', hidden: true });
        this.element.append(this.badges);
        this.element.append(el('span', { class: 'ui-image-choice-label', text: label }));
        this.detail = el('span', { class: 'ui-image-choice-detail', text: detail });
        this.element.append(this.detail);
    }
    setSelected(selected) {
        this.element.setAttribute('aria-pressed', String(selected));
    }
    setDetail(detail) {
        this.detail.textContent = detail;
    }
    /** Caller-owned display values; labels explain compact notation to assistive technology. */
    setBadges(badges) {
        const signature = JSON.stringify(badges);
        if (signature === this.badgeSignature) return;
        this.badgeSignature = signature;
        this.badges.hidden = !badges.length;
        this.badges.replaceChildren(
            ...badges.map(({ text, label }) =>
                el(
                    'span',
                    {
                        class: 'ui-image-choice-badge',
                    },
                    el('span', { text, 'aria-hidden': 'true' }),
                    el('span', {
                        class: 'ui-visually-hidden',
                        text: label,
                    }),
                ),
            ),
        );
    }
    setUnavailable(unavailable) {
        this.element.dataset.unavailable = String(unavailable);
    }
    setPending(pending) {
        this.control.setPending(pending);
    }
}
