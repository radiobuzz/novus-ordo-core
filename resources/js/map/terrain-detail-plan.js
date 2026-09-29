// One viewport calculation for eligibility, raster resolution and cache bounds.
export const TERRAIN_PIXEL_BUDGET = 8 * 1024 * 1024;
export const TERRAIN_MAX_CHUNKS = 1024;
export function terrainDetailPlan(model, camera, pixelRatio = 1) {
    const span = model.cellSize * Math.sqrt(model.cellCount) * 1.4;
    const bounds = camera.worldBounds();
    const left = Math.max(0, Math.floor(bounds.left / span));
    const right = Math.min(Math.ceil(model.width / span) - 1, Math.floor(bounds.right / span));
    const top = Math.max(0, Math.floor(bounds.top / span));
    const bottom = Math.min(Math.ceil(model.height / span) - 1, Math.floor(bounds.bottom / span));
    const chunks = Math.max(0, right - left + 1) * Math.max(0, bottom - top + 1);
    const screenSpan = span * camera.zoom;
    const desired = screenSpan * Math.min(pixelRatio, 2);
    let resolution = desired > 300 ? 512 : desired > 150 ? 256 : desired > 64 ? 128 : 64;
    // Two copies: reusable ground plus decorated canvas. Never raise the pixel budget.
    while (resolution > 32 && chunks * resolution * resolution * 2 > TERRAIN_PIXEL_BUDGET) resolution /= 2;
    const fits = chunks <= TERRAIN_MAX_CHUNKS && chunks * resolution * resolution * 2 <= TERRAIN_PIXEL_BUDGET;
    return { span, screenSpan, left, right, top, bottom, chunks, resolution, fits };
}
