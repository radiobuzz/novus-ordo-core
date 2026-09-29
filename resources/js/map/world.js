/** World dimensions are region counts. Host limits belong to deployment configuration. */
export const DEFAULT_WORLD = Object.freeze({ regionColumns: 30, regionRows: 20, cellCount: 19 });
export const RESOLUTIONS = new Map([
    [7, 1],
    [19, 2],
    [37, 3],
]);

export function worldOptions(options = {}, limits = {}) {
    const result = Object.fromEntries(
        Object.entries(DEFAULT_WORLD).map(([key, fallback]) => [key, Number(options[key] ?? fallback)]),
    );
    for (const key of ['regionColumns', 'regionRows']) {
        if (!Number.isSafeInteger(result[key]) || result[key] < 1)
            throw new Error('World dimensions must be positive whole numbers.');
    }
    if (!RESOLUTIONS.has(result.cellCount)) throw new Error('Choose 7, 19 or 37 microcells per region.');
    const total = result.regionColumns * result.regionRows * result.cellCount;
    if (!Number.isSafeInteger(total) || total > (limits.maxCells ?? 50000))
        throw new Error(`This world exceeds the deployment limit of ${limits.maxCells ?? 50000} microcells.`);
    return result;
}
