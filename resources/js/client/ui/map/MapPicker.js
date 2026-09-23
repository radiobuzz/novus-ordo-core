/** Shared grid picking. */
export class MapPicker {
    constructor(territories, definition) {
        this.definition = definition;
        this.update(territories);
    }
    update(territories) {
        this.grid = new Map(territories.map((t) => [`${t.x},${t.y}`, t]));
    }
    atWorld(x, y) {
        return (
            this.grid.get(
                `${Math.floor(x / this.definition.tileWidth)},${Math.floor(y / this.definition.tileHeight)}`,
            ) ?? null
        );
    }
    atScreen(camera, x, y) {
        const point = camera.screenToWorld(x, y);
        return this.atWorld(point.x, point.y);
    }
}
