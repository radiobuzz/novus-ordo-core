import atlasUrl from '../map-lab/assets/terrain-atlas-v1.png?url';
import { axialKey, axialToPixel, directions, traceHex } from './hex.js';
import { isWater } from './water.js';
import { materialFor } from './geography.js';

const BLEND_SIZE = 96;
const RADIUS = BLEND_SIZE / 2;
const CACHE_LIMIT = 1024;

// Reusable atlas sprites plus code-drawn polar materials, no per-cell images.
export class TerrainTiles {
    constructor(onChange) {
        this.status = 'loading';
        this.sprites = new Map();
        this.materials = new Map();
        this.blended = new Map();
        this.pending = 0;
        this.edgeMasks = directions.map(({ q, r }) => {
            const point = axialToPixel(q, r, 1);
            const length = Math.hypot(point.x, point.y);
            const nx = point.x / length;
            const ny = point.y / length;
            const boundary = (Math.sqrt(3) * RADIUS) / 2;
            const width = RADIUS * 0.48;
            const mask = document.createElement('canvas');
            mask.width = mask.height = BLEND_SIZE;
            const ctx = mask.getContext('2d');
            const gradient = ctx.createLinearGradient(
                RADIUS + nx * (boundary - width),
                RADIUS + ny * (boundary - width),
                RADIUS + nx * (boundary + width),
                RADIUS + ny * (boundary + width),
            );
            gradient.addColorStop(0, 'rgba(255,255,255,0)');
            gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
            gradient.addColorStop(1, 'rgba(255,255,255,1)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, BLEND_SIZE, BLEND_SIZE);
            return mask;
        });
        this.scratch = document.createElement('canvas');
        this.scratch.width = this.scratch.height = BLEND_SIZE;
        this.image = new Image();
        this.image.onload = () => {
            for (const [index, terrain] of [
                'plains',
                'forest',
                'hills',
                'mountain',
                'lake',
                'ocean',
            ].entries()) {
                const sprite = document.createElement('canvas');
                sprite.width = sprite.height = 192;
                const ctx = sprite.getContext('2d');
                ctx.beginPath();
                traceHex(ctx, 96, 96, 95);
                ctx.clip();
                const width = this.image.naturalWidth / 3;
                const height = this.image.naturalHeight / 2;
                ctx.drawImage(
                    this.image,
                    (index % 3) * width,
                    Math.floor(index / 3) * height,
                    width,
                    height,
                    0,
                    0,
                    192,
                    192,
                );
                this.sprites.set(terrain, sprite);
                // Mirror the source swatch into a repeatable material. Neighbors of
                // the same biome sample identical world coordinates at their seam.
                const material = document.createElement('canvas');
                material.width = material.height = 256;
                const materialCtx = material.getContext('2d');
                for (let row = 0; row < 2; row++) {
                    for (let col = 0; col < 2; col++) {
                        materialCtx.save();
                        materialCtx.translate(col ? 256 : 0, row ? 256 : 0);
                        materialCtx.scale(col ? -1 : 1, row ? -1 : 1);
                        materialCtx.drawImage(
                            this.image,
                            (index % 3) * width,
                            Math.floor(index / 3) * height,
                            width,
                            height,
                            0,
                            0,
                            128,
                            128,
                        );
                        materialCtx.restore();
                    }
                }
                this.materials.set(terrain, material);
            }
            // Polar surfaces are native Canvas materials, not recolored forest
            // artwork: no green trees showing through sea ice or permanent snow.
            for (const [terrain, base, accent] of [
                ['snow', '#e4eeee', '#c0d4dc'],
                ['tundra', '#99a59a', '#737e71'],
                ['ice', '#325f75', '#8bb6c4'],
            ]) {
                const material = document.createElement('canvas');
                material.width = material.height = 256;
                const ctx = material.getContext('2d');
                ctx.fillStyle = base;
                ctx.fillRect(0, 0, 256, 256);
                ctx.strokeStyle = accent;
                ctx.lineWidth = terrain === 'ice' ? 1.2 : 2;
                for (let i = 0; i < 48; i++) {
                    const x = 12 + ((i * 73) % 224),
                        y = 12 + ((i * 47) % 224);
                    ctx.globalAlpha = terrain === 'ice' ? 0.4 : 0.3;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + 6, y - 3);
                    ctx.lineTo(x + 12, y - (terrain === 'ice' ? 9 : 1));
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                this.materials.set(terrain, material);
                const sprite = document.createElement('canvas');
                sprite.width = sprite.height = 192;
                const spriteCtx = sprite.getContext('2d');
                spriteCtx.beginPath();
                traceHex(spriteCtx, 96, 96, 95);
                spriteCtx.clip();
                spriteCtx.drawImage(material, 0, 0, 192, 192);
                this.sprites.set(terrain, sprite);
            }
            this.status = 'ready';
            clearTimeout(this.timeout);
            onChange();
        };
        this.image.onerror = () => {
            this.status = 'unavailable';
            clearTimeout(this.timeout);
            onChange();
        };
        this.timeout = setTimeout(() => {
            this.status = 'unavailable';
            onChange();
        }, 12000);
        this.image.src = atlasUrl;
    }

    destroy() {
        clearTimeout(this.timeout);
        this.image.onload = this.image.onerror = null;
        this.blended.clear();
    }

    draw(ctx, cell, size, model, transitions = false) {
        if (transitions && this.blended.has(cell.id) && this.model === model) {
            const sprite = this.blended.get(cell.id);
            ctx.drawImage(sprite, cell.x - size, cell.y - size, size * 2, size * 2);
            return;
        }
        const sprite = this.sprites.get(materialFor(cell));
        if (!sprite) return;
        ctx.drawImage(sprite, cell.x - size, cell.y - size, size * 2, size * 2);
    }

    prepare(model, cells) {
        if (this.model !== model) {
            this.model = model;
            this.blended.clear();
        }
        const wanted = new Set(cells.map((cell) => cell.id));
        const started = performance.now();
        this.pending = 0;
        for (const cell of cells) {
            if (this.blended.has(cell.id)) continue;
            if (performance.now() - started >= 6) {
                this.pending++;
                continue;
            }
            if (this.blended.size >= CACHE_LIMIT) {
                const removable = [...this.blended.keys()].find((id) => !wanted.has(id));
                if (removable !== undefined) this.blended.delete(removable);
            }
            this.transitionTile(cell, model);
        }
    }

    paintMaterial(ctx, terrain, cell, model) {
        const pattern = ctx.createPattern(this.materials.get(terrain), 'repeat');
        // One texture coordinate system across all cells and political regions.
        // Material repeats every four cell radii, independent of zoom.
        const scale = (4 * RADIUS) / 256;
        pattern.setTransform(
            new DOMMatrix([
                scale,
                0,
                0,
                scale,
                RADIUS - ((cell.x - model.offsetX) / model.cellSize) * RADIUS,
                RADIUS - ((cell.y - model.offsetY) / model.cellSize) * RADIUS,
            ]),
        );
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, BLEND_SIZE, BLEND_SIZE);
    }

    transitionTile(cell, model) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = BLEND_SIZE;
        const ctx = tile.getContext('2d');
        ctx.beginPath();
        traceHex(ctx, RADIUS, RADIUS, RADIUS + 0.3);
        ctx.clip();
        this.paintMaterial(ctx, materialFor(cell), cell, model);
        const scratchCtx = this.scratch.getContext('2d');
        directions.forEach(({ q, r }, index) => {
            const neighbor = model.cellById.get(axialKey(cell.q + q, cell.r + r));
            if (!neighbor || materialFor(neighbor) === materialFor(cell)) return;
            scratchCtx.clearRect(0, 0, BLEND_SIZE, BLEND_SIZE);
            this.paintMaterial(scratchCtx, materialFor(neighbor), cell, model);
            // A shared edge meets at half of each material and fades inward.
            // The sprite stays within this cell; army/ownership picking is unchanged.
            scratchCtx.globalCompositeOperation = 'destination-in';
            scratchCtx.drawImage(this.edgeMasks[index], 0, 0);
            scratchCtx.globalCompositeOperation = 'source-over';
            ctx.drawImage(this.scratch, 0, 0);
            if (isWater(cell) !== isWater(neighbor)) {
                scratchCtx.clearRect(0, 0, BLEND_SIZE, BLEND_SIZE);
                scratchCtx.fillStyle =
                    cell.temperature < 0.32
                        ? isWater(cell)
                            ? '#dbeaec'
                            : '#c3d2d4'
                        : isWater(cell)
                          ? '#8ed1cb'
                          : '#cbbb87';
                scratchCtx.fillRect(0, 0, BLEND_SIZE, BLEND_SIZE);
                scratchCtx.globalCompositeOperation = 'destination-in';
                scratchCtx.drawImage(this.edgeMasks[index], 0, 0);
                scratchCtx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = isWater(cell) ? 0.35 : 0.22;
                ctx.drawImage(this.scratch, 0, 0);
                ctx.globalAlpha = 1;
            }
        });
        this.blended.set(cell.id, tile);
        if (this.blended.size > CACHE_LIMIT) this.blended.delete(this.blended.keys().next().value);
        return tile;
    }
}
