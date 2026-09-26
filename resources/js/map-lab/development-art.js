import atlasUrl from './assets/development-atlas-v2.png';
import quarryUrl from './assets/quarry-v2.png';

// Explicit source rectangles: the painted sheet is not a mechanically exact
// grid. Gutters are kept; no colour-keying, per-frame slicing or image rotation.
const sprites = {
    houseClay: [24, 102, 335, 245],
    houseSlate: [385, 65, 325, 262],
    rowhouse: [724, 21, 376, 352],
    midrise: [1102, 8, 346, 378],
    tower: [51, 348, 302, 390],
    landmark: [407, 325, 299, 436],
    factory: [716, 400, 391, 363],
    warehouse: [1108, 480, 340, 263],
    pump: [21, 782, 340, 272],
    tanks: [377, 761, 333, 299],
    crusher: [717, 775, 383, 281],
    excavator: [1103, 780, 345, 274],
};

/** Two lazy, renderer-owned images. A failed download leaves the land usable. */
export class DevelopmentArt {
    status = 'not-loaded';
    image = null;
    quarry = null;
    atlasReady = false;
    quarryReady = false;
    disposed = false;
    constructor(invalidate) {
        this.invalidate = invalidate;
    }
    load() {
        if (this.status !== 'not-loaded' || this.disposed) return;
        this.status = 'loading';
        let pending = 2,
            failed = false;
        for (const [key, ready, url] of [
            ['image', 'atlasReady', atlasUrl],
            ['quarry', 'quarryReady', quarryUrl],
        ]) {
            const img = (this[key] = new Image());
            const done = (ok) => {
                if (this.disposed) return;
                this[ready] = ok;
                failed ||= !ok;
                pending--;
                this.status = pending ? 'loading' : failed ? 'error' : 'ready';
                this.invalidate();
            };
            img.onload = () => done(true);
            img.onerror = () => done(false);
            img.src = url;
        }
    }
    draw(ctx, kind, p) {
        const source = sprites[kind];
        if (!source || !this.atlasReady) return false;
        const [x, y, w, h] = source;
        const tall = ['tower', 'landmark'].includes(kind);
        const width = p.size * (tall ? 3.1 : ['midrise', 'rowhouse'].includes(kind) ? 2.65 : 2.2);
        const height = ((width * h) / w) * (tall ? 1.25 : 0.85);
        // Ground anchor stays put as a house becomes a tall building.
        ctx.drawImage(this.image, x, y, w, h, p.x - width * 0.5, p.y + p.size * 0.63 - height, width, height);
        return true;
    }
    drawPit(ctx, p) {
        if (!this.quarryReady) return false;
        ctx.save();
        ctx.beginPath();
        p.points.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(this.quarry, p.x - p.size, p.y - p.size * 0.76, p.size * 2, p.size * 1.52);
        ctx.restore();
        return true;
    }
    destroy() {
        this.disposed = true;
        if (this.image) this.image.onload = this.image.onerror = null;
        if (this.quarry) this.quarry.onload = this.quarry.onerror = null;
        this.image = null;
        this.quarry = null;
        this.invalidate = () => {};
    }
}
