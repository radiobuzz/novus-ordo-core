import { el } from '../dom.js';
import { MapViewport } from './MapViewport.js';
import { MapPicker } from './MapPicker.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { HexMapPicker, HexMapRenderer, mapDefinitionFor } from './HexMap.js';
import { createLayers } from './layers.js';
import { nationPalette } from '../../services/nationColors.js';

/** Two ownership frames, one camera. No live state, requests or playback policy. */
export class OwnershipMap {
    constructor({ scope, i18n, map, before, after, nationColors, images }) {
        const definition = mapDefinitionFor(map, before);
        this.viewport = new MapViewport({
            scope,
            i18n,
            definition,
            territories: before,
            layers: createLayers(),
            images,
            onSelect: () => {},
            context: { nationColors },
            onDraw: () => this.afterRenderer?.draw(),
        });
        this.element = this.viewport.element;
        this.element.classList.add('ownership-map');
        this.afterCanvas = el('canvas', { class: 'world-canvas ownership-map-after', 'aria-hidden': true });
        this.element.insertBefore(this.afterCanvas, this.viewport.canvas.nextSibling);
        this.highlightCanvas = el('canvas', {
            class: 'world-canvas ownership-map-highlight',
            'aria-hidden': true,
        });
        this.element.insertBefore(this.highlightCanvas, this.afterCanvas.nextSibling);
        this.highlights = [];
        // Generated pickers write ownership into their model, so each frame owns its geometry instance.
        const afterDefinition = mapDefinitionFor(map, after);
        const Picker = afterDefinition.model ? HexMapPicker : MapPicker;
        const Renderer = afterDefinition.model ? HexMapRenderer : CanvasRenderer;
        this.afterRenderer = new Renderer(
            this.afterCanvas,
            this.viewport.camera,
            {
                definition: afterDefinition,
                territories: after,
                layers: createLayers(),
                picker: new Picker(after, afterDefinition),
                nationColors,
            },
            scope,
            () => this.drawHighlights(),
        );
        const owners = new Map(
            before.map((territory) => [territory.territory_id, territory.owner_nation_id]),
        );
        const groups = new Map();
        for (const territory of after) {
            if (
                owners.get(territory.territory_id) === territory.owner_nation_id ||
                territory.terrain_type === 'Water'
            )
                continue;
            const owner = territory.owner_nation_id;
            if (!groups.has(owner)) groups.set(owner, { owner, fill: new Path2D(), border: new Path2D() });
            const group = groups.get(owner);
            if (afterDefinition.model) {
                const paths = this.afterRenderer.territoryPaths(territory.territory_id);
                if (paths) {
                    group.fill.addPath(paths.fill);
                    group.border.addPath(paths.border);
                }
            } else {
                const { tileWidth, tileHeight } = afterDefinition;
                for (const path of [group.fill, group.border])
                    path.rect(territory.x * tileWidth, territory.y * tileHeight, tileWidth, tileHeight);
            }
        }
        this.highlights = [...groups.values()].map((group) => ({
            ...group,
            color: group.owner == null ? null : nationPalette(nationColors, group.owner).paint,
        }));
        scope.own(() => this.stopHighlight());
        this.ready = Promise.all([this.viewport.ready, this.afterRenderer.loadImages(images)]);
    }
    drawHighlights() {
        const canvas = this.highlightCanvas;
        const { camera } = this.viewport;
        const source = this.viewport.canvas;
        if (canvas.width !== source.width) canvas.width = source.width;
        if (canvas.height !== source.height) canvas.height = source.height;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rx = canvas.width / camera.width,
            ry = canvas.height / camera.height;
        const contrast = getComputedStyle(canvas).getPropertyValue('--text-primary').trim();
        for (const group of this.highlights) {
            const color = group.color ?? contrast;
            // Screen-sized diagonal hatching stays legible at the world overview zoom.
            const tile = document.createElement('canvas');
            tile.width = tile.height = 8;
            const paint = tile.getContext('2d');
            paint.beginPath();
            for (const offset of [-8, 0, 8]) {
                paint.moveTo(offset, 8);
                paint.lineTo(offset + 8, 0);
            }
            paint.strokeStyle = contrast;
            paint.lineWidth = 5;
            paint.stroke();
            paint.strokeStyle = color;
            paint.lineWidth = 3;
            paint.stroke();
            ctx.save();
            camera.applyTransform(ctx, rx, ry);
            ctx.clip(group.fill);
            ctx.setTransform(rx, 0, 0, ry, 0, 0);
            ctx.fillStyle = ctx.createPattern(tile, 'repeat');
            ctx.fillRect(0, 0, camera.width, camera.height);
            ctx.restore();
            camera.applyTransform(ctx, rx, ry);
            ctx.strokeStyle = contrast;
            ctx.lineWidth = 3 / camera.zoom;
            ctx.stroke(group.border);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5 / camera.zoom;
            ctx.stroke(group.border);
        }
    }
    stopHighlight() {
        this.highlightAnimation?.cancel();
        this.highlightAnimation = null;
        this.highlightCanvas.style.opacity = '0';
    }
    show(after, animate = true) {
        this.afterCanvas.style.transitionDuration = animate ? '800ms' : '0ms';
        this.afterCanvas.style.opacity = after ? '1' : '0';
        this.stopHighlight();
        if (!after || !this.highlights.length) return;
        if (!animate) {
            this.highlightCanvas.style.opacity = '1';
            return;
        }
        this.highlightAnimation = this.highlightCanvas.animate(
            [{ opacity: 1 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }],
            { duration: 1200, easing: 'ease-out' },
        );
    }
}
