import { Scope } from '../../runtime/Scope.js';
import { el } from '../dom.js';

/** Decorative, scope-owned slideshow. Hold durations exclude the fades. */
export class AtmosphereBackground {
    constructor(scope, { background, slides = [], fadeMs = 2200, holdMs = 5000, lastHoldMs = 10000 }) {
        this.background = background;
        this.slides = slides;
        this.timing = { fadeMs, holdMs, lastHoldMs };
        this.root = el('div', { class: 'atmosphere is-ready', 'aria-hidden': 'true' });
        this.root.style.setProperty('--atmosphere-fade', `${fadeMs}ms`);
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        scope.listen(this.motion, 'change', () => this.render());
        scope.listen(document, 'visibilitychange', () => this.render());
        scope.own(() => this.cycle?.dispose());
    }

    setSlideshow(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        this.render();
    }

    render() {
        void this.cycle?.dispose();
        const scope = (this.cycle = new Scope());
        const reduced = this.motion.matches;
        const playlist = this.enabled && this.slides.length ? this.slides : [this.background];
        const sources = reduced ? playlist.slice(0, 1) : playlist;
        const { fadeMs, holdMs, lastHoldMs } = this.timing;
        this.root.dataset.phase = 'loading';
        delete this.root.dataset.slide;
        const items = sources.map((src, index) => {
            const image = el('img', {
                class: 'atmosphere-image',
                alt: '',
                fetchpriority: index === 0 ? 'high' : 'low',
            });
            const item = { image, status: 'loading' };
            const settle = () => {
                item.status = image.naturalWidth > 0 ? 'loaded' : 'failed';
                cancelDeadline();
            };
            scope.listen(image, 'load', settle);
            scope.listen(image, 'error', settle);
            const cancelDeadline = scope.timeout(() => {
                item.status = 'failed';
            }, 8000);
            image.src = src;
            if (image.complete) settle();
            return item;
        });
        this.root.replaceChildren(
            ...items.map(({ image }) => image),
            el('div', { class: 'atmosphere-shade' }),
        );
        let current = null;
        const show = (index) => {
            if (scope.closed) return;
            const item = items[index];
            if (item.status === 'loading') {
                scope.timeout(() => show(index), 100);
                return;
            }
            if (item.status === 'failed') {
                if (items.every((entry) => entry.status === 'failed')) {
                    // A broken playlist should not leave the login unusable or retry forever.
                    this.root.dataset.phase = 'fallback';
                    const fallback = el('img', {
                        class: 'atmosphere-image is-visible',
                        src: this.background,
                        alt: '',
                    });
                    this.root.prepend(fallback);
                    return;
                }
                show((index + 1) % items.length);
                return;
            }
            const previous = current;
            current = item;
            item.image.style.zIndex = '1';
            // Establish opacity zero before fading a newly mounted/cached image.
            void item.image.offsetWidth;
            item.image.classList.add('is-visible');
            this.root.dataset.slide = String(index + 1);
            this.root.dataset.phase = 'fading-in';
            scope.timeout(
                () => {
                    if (previous && previous !== item) previous.image.classList.remove('is-visible');
                    item.image.style.zIndex = '0';
                    this.root.dataset.phase = 'holding';
                    if (reduced || document.hidden || items.length < 2) return;
                    scope.timeout(
                        () => {
                            if (index < items.length - 1) show(index + 1);
                            else {
                                this.root.dataset.phase = 'fading-out';
                                item.image.classList.remove('is-visible');
                                scope.timeout(() => {
                                    current = null;
                                    this.root.dataset.phase = 'black';
                                    // Paint the black endpoint before starting the first fade-in again.
                                    scope.timeout(() => show(0), 100);
                                }, fadeMs);
                            }
                        },
                        index === items.length - 1 ? lastHoldMs : holdMs,
                    );
                },
                reduced ? 0 : fadeMs,
            );
        };
        // The owner mounts root synchronously; defer even cached images until it is in the DOM.
        scope.timeout(() => show(0), 0);
    }
}
