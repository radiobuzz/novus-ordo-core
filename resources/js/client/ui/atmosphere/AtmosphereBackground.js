import { Scope } from '../../runtime/Scope.js';
import { el } from '../dom.js';

/** Decorative, scope-owned slideshow. Hold durations exclude the fades. */
export class AtmosphereBackground {
    constructor(
        scope,
        { background, slides = [], fadeMs = 2200, holdMs = 5000, lastHoldMs = 10000, audio = null },
    ) {
        this.background = background;
        this.slides = slides.map((slide, index) =>
            typeof slide === 'string'
                ? {
                      id: `legacy-${index}`,
                      src: slide,
                      duration_ms: index === slides.length - 1 ? lastHoldMs : holdMs,
                      transition: 'fade',
                      transition_ms: fadeMs,
                      effect: 'none',
                      focus_x: 50,
                      focus_y: 50,
                  }
                : slide,
        );
        this.timing = { fadeMs, holdMs, lastHoldMs };
        this.root = el('div', { class: 'atmosphere is-ready', 'aria-hidden': 'true' });
        this.root.style.setProperty('--atmosphere-fade', `${fadeMs}ms`);
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        scope.listen(this.motion, 'change', () => this.render());
        scope.listen(document, 'visibilitychange', () => this.render());
        scope.own(() => this.cycle?.dispose());
        let audioWasPlaying = false;
        if (audio)
            audio.changed.subscribe(scope, () => {
                const playing = audio.status === 'playing';
                if (playing && !audioWasPlaying && this.enabled) this.render();
                audioWasPlaying = playing;
            });
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
        const { fadeMs, holdMs, lastHoldMs } = this.timing;
        const playlist =
            this.enabled && this.slides.length
                ? this.slides
                : [
                      {
                          id: 'fallback',
                          src: this.background,
                          duration_ms: lastHoldMs,
                          transition: 'fade',
                          transition_ms: fadeMs,
                          effect: 'none',
                          focus_x: 50,
                          focus_y: 50,
                      },
                  ];
        const sources = reduced ? playlist.slice(0, 1) : playlist;
        this.root.dataset.phase = 'loading';
        delete this.root.dataset.slide;
        const items = sources.map((slide, index) => {
            const image = el('img', {
                class: 'atmosphere-image',
                alt: '',
                fetchpriority: index === 0 ? 'high' : 'low',
            });
            image.dataset.effect = slide.effect ?? 'none';
            image.style.objectPosition = `${slide.focus_x ?? 50}% ${slide.focus_y ?? 50}%`;
            const item = { image, slide, status: 'loading' };
            const settle = () => {
                item.status = image.naturalWidth > 0 ? 'loaded' : 'failed';
                cancelDeadline();
            };
            scope.listen(image, 'load', settle);
            scope.listen(image, 'error', settle);
            const cancelDeadline = scope.timeout(() => {
                item.status = 'failed';
            }, 8000);
            image.src = slide.url ?? slide.src;
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
            const transitionMs = item.slide.transition === 'cut' ? 0 : (item.slide.transition_ms ?? fadeMs);
            const hold = item.slide.duration_ms ?? (index === items.length - 1 ? lastHoldMs : holdMs);
            item.image.style.setProperty('--atmosphere-transition', `${transitionMs}ms`);
            item.image.style.setProperty('--atmosphere-motion-duration', `${transitionMs + hold}ms`);
            item.image.style.zIndex = '1';
            // Establish opacity zero before fading a newly mounted/cached image.
            item.image.classList.remove('is-visible', 'is-animating');
            void item.image.offsetWidth;
            item.image.classList.add('is-visible', 'is-animating');
            this.root.dataset.slide = String(index + 1);
            this.root.dataset.phase = 'fading-in';
            scope.timeout(
                () => {
                    if (previous && previous !== item)
                        previous.image.classList.remove('is-visible', 'is-animating');
                    item.image.style.zIndex = '0';
                    this.root.dataset.phase = 'holding';
                    if (reduced || document.hidden || items.length < 2) return;
                    scope.timeout(() => {
                        if (index < items.length - 1) show(index + 1);
                        else {
                            this.root.dataset.phase = 'fading-out';
                            item.image.classList.remove('is-visible', 'is-animating');
                            scope.timeout(() => {
                                current = null;
                                this.root.dataset.phase = 'black';
                                // Paint the black endpoint before starting the first fade-in again.
                                scope.timeout(() => show(0), 100);
                            }, transitionMs);
                        }
                    }, hold);
                },
                reduced ? 0 : transitionMs,
            );
        };
        // The owner mounts root synchronously; defer even cached images until it is in the DOM.
        scope.timeout(() => show(0), 0);
    }
}
