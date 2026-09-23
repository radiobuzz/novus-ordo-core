import { symbolById } from './catalog.js';
import { validateRecipe, resolveColor, SIZE } from './recipe.js';

/** Synchronous canvas composition. No editor, nation, network or global state. */
export function renderFlag(canvas, input) {
    const recipe = validateRecipe(input);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / SIZE[0], canvas.height / SIZE[1]);
    ctx.fillStyle = resolveColor(recipe.flag.background, recipe.palette);
    ctx.fillRect(0, 0, ...SIZE);
    ctx.beginPath();
    ctx.rect(0, 0, ...SIZE);
    ctx.clip();
    for (const layer of recipe.flag.layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.scale(layer.scale * (layer.flipX ? -1 : 1), layer.scale);
        ctx.fillStyle = resolveColor(layer.color, recipe.palette);
        const { width, height, points } = layer.geometry;
        if (layer.shape === 'symbol') {
            const asset =
                symbolById(layer.geometry.symbolId) ??
                recipe.customAssets.find((a) => a.id === layer.geometry.symbolId);
            const [vx, vy, vw, vh] = asset.viewBox;
            const fit = Math.min(width / vw, height / vh);
            ctx.scale(fit, fit);
            ctx.translate(-vx - vw / 2, -vy - vh / 2);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.miterLimit = 4;
            for (const item of asset.paths) {
                ctx.save();
                ctx.transform(...item.matrix);
                ctx.globalAlpha = item.opacity;
                ctx.lineWidth = item.strokeWidth;
                const path = new Path2D(item.d);
                if (item.fill) ctx.fill(path, item.fillRule);
                if (item.stroke && item.strokeWidth > 0) ctx.stroke(path);
                ctx.restore();
            }
            ctx.restore();
            continue;
        }
        ctx.beginPath();
        if (layer.shape === 'rect') ctx.rect(-width / 2, -height / 2, width, height);
        else if (layer.shape === 'polygon') {
            points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
        } else {
            ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
            if (layer.shape === 'crescent') {
                ctx.clip();
                ctx.moveTo(width * 0.72, 0);
                ctx.ellipse(width * 0.22, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
            }
        }
        ctx.fill('evenodd');
        ctx.restore();
    }
    ctx.restore();
    return canvas;
}
export function renderMaster(input) {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = SIZE;
    return renderFlag(canvas, input);
}
/** Captures resolved JSON and PNG from the very same immutable snapshot. */
export async function compileFlag(input) {
    const recipe = validateRecipe(input);
    const canvas = renderMaster(recipe);
    const png = await new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'),
    );
    return { recipe, png };
}

/** Selection uses the same transforms as composition, with symbol bounding boxes. */
export function hitTest(recipe, x, y) {
    for (const l of [...recipe.flag.layers].reverse()) {
        if (!l.visible) continue;
        const a = (-l.rotation * Math.PI) / 180,
            dx = x - l.x,
            dy = y - l.y;
        const px = ((dx * Math.cos(a) - dy * Math.sin(a)) / l.scale) * (l.flipX ? -1 : 1);
        const py = (dx * Math.sin(a) + dy * Math.cos(a)) / l.scale;
        const { width, height, points } = l.geometry;
        if (l.shape === 'polygon') {
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [xi, yi] = points[i],
                    [xj, yj] = points[j];
                if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
            }
            if (inside) return l.id;
        } else if (l.shape === 'ellipse' || l.shape === 'crescent') {
            const inside = (px / (width / 2)) ** 2 + (py / (height / 2)) ** 2 <= 1;
            const cut =
                l.shape === 'crescent' &&
                ((px - width * 0.22) / (width / 2)) ** 2 + (py / (height / 2)) ** 2 <= 1;
            if (inside && !cut) return l.id;
        } else if (Math.abs(px) <= width / 2 && Math.abs(py) <= height / 2) return l.id;
    }
    return '';
}
