/** Shared viewport camera; state belongs to each mounted map. */
export class Camera {
    constructor(worldWidth, worldHeight) {
        Object.assign(this, {
            worldWidth,
            worldHeight,
            width: 1,
            height: 1,
            x: worldWidth / 2,
            y: worldHeight / 2,
            zoom: 1,
            angle: 0,
        });
    }
    get fitZoom() {
        const c = Math.abs(Math.cos(this.angle)),
            s = Math.abs(Math.sin(this.angle));
        return (
            Math.min(
                this.width / (this.worldWidth * c + this.worldHeight * s),
                this.height / (this.worldWidth * s + this.worldHeight * c),
            ) * 0.9
        );
    }
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.constrain();
    }
    fit() {
        this.x = this.worldWidth / 2;
        this.y = this.worldHeight / 2;
        this.zoom = this.fitZoom;
    }
    constrain() {
        this.zoom = Math.max(this.fitZoom * 0.65, Math.min(16, this.zoom));
        this.x = Math.max(0, Math.min(this.worldWidth, this.x));
        this.y = Math.max(0, Math.min(this.worldHeight, this.y));
    }
    screenToWorld(x, y) {
        const dx = (x - this.width / 2) / this.zoom,
            dy = (y - this.height / 2) / this.zoom,
            c = Math.cos(this.angle),
            s = Math.sin(this.angle);
        return {
            x: dx * c + dy * s + this.x,
            y: -dx * s + dy * c + this.y,
        };
    }
    worldToScreen(x, y) {
        const dx = (x - this.x) * this.zoom,
            dy = (y - this.y) * this.zoom,
            c = Math.cos(this.angle),
            s = Math.sin(this.angle);
        return {
            x: dx * c - dy * s + this.width / 2,
            y: dx * s + dy * c + this.height / 2,
        };
    }
    pan(dx, dy) {
        const c = Math.cos(this.angle),
            s = Math.sin(this.angle);
        this.x -= (dx * c + dy * s) / this.zoom;
        this.y -= (-dx * s + dy * c) / this.zoom;
        this.constrain();
    }
    /** Clockwise radians; rotate the view, never the map's geometry. */
    setAngle(angle) {
        const turn = Math.PI * 2;
        this.angle = Number.isFinite(angle) ? ((angle % turn) + turn) % turn : 0;
        if (Math.abs(this.angle - turn) < 1e-10 || this.angle < 1e-10) this.angle = 0;
        this.constrain();
    }
    applyTransform(ctx, rx = 1, ry = 1) {
        const c = Math.cos(this.angle) * this.zoom,
            s = Math.sin(this.angle) * this.zoom;
        ctx.setTransform(
            rx * c,
            ry * s,
            -rx * s,
            ry * c,
            rx * (this.width / 2 - this.x * c + this.y * s),
            ry * (this.height / 2 - this.x * s - this.y * c),
        );
    }
    viewportCorners() {
        return [
            [0, 0],
            [this.width, 0],
            [this.width, this.height],
            [0, this.height],
        ].map(([x, y]) => this.screenToWorld(x, y));
    }
    worldBounds() {
        const corners = this.viewportCorners();
        return {
            left: Math.min(...corners.map((p) => p.x)),
            right: Math.max(...corners.map((p) => p.x)),
            top: Math.min(...corners.map((p) => p.y)),
            bottom: Math.max(...corners.map((p) => p.y)),
        };
    }
    zoomAt(factor, x = this.width / 2, y = this.height / 2) {
        const before = this.screenToWorld(x, y);
        this.zoom *= factor;
        this.constrain();
        const after = this.screenToWorld(x, y);
        this.x += before.x - after.x;
        this.y += before.y - after.y;
        this.constrain();
    }
    snapshot() {
        return { x: this.x, y: this.y, zoom: this.zoom, angle: this.angle };
    }
    restore(value) {
        this.setAngle(value?.angle ?? 0);
        if (!value || !['x', 'y', 'zoom'].every((key) => Number.isFinite(value[key])) || value.zoom <= 0) {
            this.fit();
            return;
        }
        Object.assign(this, { x: value.x, y: value.y, zoom: value.zoom });
        this.constrain();
    }
}
