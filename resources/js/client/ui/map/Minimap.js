import { el } from '../dom.js';
import { Camera } from './Camera.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { HexMapRenderer } from './HexMap.js';
import { createLayers } from './layers.js';

/** Same geography/coordinates, fixed overview camera, navigation intent only. */
export class Minimap {
    constructor({ scope, context, camera, images, label, onNavigate }) {
        this.element = el('canvas', { class: 'minimap-canvas', tabindex: 0, 'aria-label': label });
        this.camera = new Camera(context.definition.width, context.definition.height);
        const Renderer = context.definition.model ? HexMapRenderer : CanvasRenderer;
        const layers = createLayers().filter((l) =>
            ['terrain', 'ownership', 'borders', 'rivers'].includes(l.id),
        );
        const overview = {
            ...context,
            layers,
            selectedId: null,
            underlays: [],
            overlays: [
                (ctx) => {
                    const corners = camera.viewportCorners();
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, camera.worldWidth, camera.worldHeight);
                    ctx.clip();
                    ctx.strokeStyle = getComputedStyle(this.element)
                        .getPropertyValue('--accent-command')
                        .trim();
                    ctx.lineWidth = 2 / this.camera.zoom;
                    ctx.beginPath();
                    corners.forEach((p, index) => (index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                },
            ],
        };
        this.context = overview;
        this.renderer = new Renderer(this.element, this.camera, overview, scope);
        // Fit before every overview draw, including resize; never change the main camera here.
        const draw = this.renderer.draw.bind(this.renderer);
        this.renderer.draw = () => {
            this.camera.fit();
            draw();
        };
        void this.renderer.loadImages(images);
        scope.listen(this.element, 'click', (event) => {
            const r = this.element.getBoundingClientRect();
            onNavigate(this.camera.screenToWorld(event.clientX - r.left, event.clientY - r.top));
        });
        scope.listen(this.element, 'keydown', (event) => {
            const step = Math.min(camera.worldWidth, camera.worldHeight) / 10;
            const deltas = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
            };
            if (event.key === 'Home') onNavigate({ x: camera.worldWidth / 2, y: camera.worldHeight / 2 });
            else if (deltas[event.key])
                onNavigate({ x: camera.x + deltas[event.key][0], y: camera.y + deltas[event.key][1] });
            else return;
            event.preventDefault();
        });
    }
    invalidate() {
        this.renderer.invalidate();
    }
    updateData(context) {
        this.context.territories = context.territories;
        this.context.ownNationId = context.ownNationId;
        this.context.nationColors = context.nationColors;
        this.renderer.updateData?.();
        this.invalidate();
    }
}
