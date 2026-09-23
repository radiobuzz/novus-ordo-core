import { Scope } from '../runtime/Scope.js';
import { Signal } from '../runtime/Signal.js';

export class AudioService {
    scope = new Scope();
    changed = new Signal();
    eligible = false;
    generation = 0;
    status = 'blocked';
    constructor(src, saved, player = new Audio()) {
        this.player = player;
        this.saved = saved;
        const value = saved.read();
        this.muted = value.muted === true;
        this.volume = Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : 0.25;
        player.src = src;
        player.preload = 'none';
        player.loop = true;
        player.volume = this.volume;
        this.scope.own(() => {
            this.generation++;
            player.pause();
            player.removeAttribute('src');
            player.load();
        });
    }
    persist() {
        this.saved.write({ ...this.saved.read(), muted: this.muted, volume: this.volume });
    }
    emit() {
        this.changed.emit(this);
    }
    setEligible(value) {
        this.eligible = value;
        ++this.generation;
        if (!value) {
            this.status = 'blocked';
            // Stop before a new screen appears; never let a fade run over the wizard.
            this.player.pause();
        } else this.player.volume = this.volume;
        this.emit();
    }
    async play() {
        if (!this.eligible || this.muted || this.scope.closed) return;
        this.player.volume = this.volume;
        const generation = this.generation;
        try {
            await this.player.play();
            if (generation !== this.generation || !this.eligible || this.muted || this.scope.closed) {
                this.player.pause();
                return;
            }
            this.status = 'playing';
        } catch (error) {
            if (generation === this.generation)
                this.status = error.name === 'NotAllowedError' ? 'blocked' : 'error';
        }
        this.emit();
    }
    toggle() {
        if (this.status !== 'playing' || this.muted) {
            this.muted = false;
            this.persist();
            void this.play();
        } else {
            this.muted = true;
            this.generation++;
            this.player.pause();
            this.status = 'blocked';
            this.persist();
            this.emit();
        }
    }
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, Number(value)));
        this.player.volume = this.volume;
        this.persist();
        this.emit();
    }
    pause() {
        this.generation++;
        this.player.pause();
        this.status = 'blocked';
        this.emit();
    }
    dispose() {
        return this.scope.dispose();
    }
}
