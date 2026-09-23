import { createStore } from '../runtime/Store.js';

export const soundDefaults = Object.freeze({ enabled: false, interaction: true, events: true, volume: 0.35 });
export function soundPreferences(value = {}) {
    return {
        enabled: value.enabled === true,
        interaction: value.interaction !== false,
        events: value.events !== false,
        volume: Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : soundDefaults.volume,
    };
}
const cues = {
    hover: [720, 0.025, 0.035],
    click: [430, 0.05, 0.09],
    select: [560, 0.075, 0.1],
    place: [340, 0.08, 0.1],
    accepted: [800, 0.13, 0.1],
    ready: [940, 0.18, 0.1],
    turn: [620, 0.3, 0.13],
    error: [160, 0.12, 0.08],
    rejected: [210, 0.32, 0.15],
};
/** Browser-local preferences; no game data or automatic audio permission requests. */
export class SoundService {
    constructor(saved, scope) {
        this.saved = saved;
        this.scope = scope;
        const { store, publish } = createStore(soundPreferences(saved.read()));
        this.store = store;
        this.publish = publish;
        this.lastHover = 0;
        scope.own(() => this.context?.close().catch(() => {}));
    }
    set(values) {
        const value = soundPreferences({ ...this.store.value, ...values });
        this.saved.write(value);
        this.publish(value);
        if (!value.enabled) void this.context?.suspend().catch(() => {});
    }
    unlock() {
        if (!this.store.value.enabled) return;
        try {
            const Audio = window.AudioContext ?? window.webkitAudioContext;
            if (!Audio) return;
            this.context ??= new Audio();
            if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
        } catch {
            /* Audio is optional, never a gameplay dependency. */
        }
    }
    play(name) {
        const settings = this.store.value;
        const interaction = ['hover', 'click'].includes(name);
        if (
            !settings.enabled ||
            !settings[interaction ? 'interaction' : 'events'] ||
            !settings.volume ||
            this.context?.state !== 'running' ||
            document.hidden ||
            !cues[name]
        )
            return;
        if (name === 'hover') {
            if (performance.now() - this.lastHover < 100) return;
            this.lastHover = performance.now();
        }
        try {
            const [frequency, duration, level] = cues[name];
            const oscillator = this.context.createOscillator(),
                gain = this.context.createGain();
            const start = this.context.currentTime;
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(frequency, start);
            if (name === 'rejected') oscillator.frequency.setValueAtTime(125, start + 0.14);
            oscillator.frequency.exponentialRampToValueAtTime(
                frequency * (name === 'turn' ? 1.5 : 0.65),
                start + duration,
            );
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(level * settings.volume, start + 0.004);
            if (name === 'rejected') {
                gain.gain.linearRampToValueAtTime(0.0001, start + 0.12);
                gain.gain.linearRampToValueAtTime(level * settings.volume, start + 0.15);
            }
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            oscillator.connect(gain).connect(this.context.destination);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
            };
            oscillator.start(start);
            oscillator.stop(start + duration + 0.01);
        } catch {
            /* A missing/suspended output must never block input. */
        }
    }
    bind(root) {
        const control = (event) =>
            event.target.closest?.('button, summary, a[href], input[type="checkbox"], input[type="radio"]');
        this.scope.listen(root, 'pointerdown', () => this.unlock(), { capture: true });
        this.scope.listen(root, 'keydown', () => this.unlock(), { capture: true });
        this.scope.listen(root, 'click', (event) => {
            const node = control(event);
            if (node && !node.disabled && node.getAttribute('aria-disabled') !== 'true') this.play('click');
        });
        for (const type of ['pointerover', 'focusin'])
            this.scope.listen(root, type, (event) => {
                const node = control(event);
                if (node && !node.disabled && !node.contains(event.relatedTarget)) this.play('hover');
            });
    }
}
