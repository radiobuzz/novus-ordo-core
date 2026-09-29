import profiles from '../../map-resources/profiles.json' with { type: 'json' };
import { geographyPoint } from './geography.js';
import { featureHash } from './cartography.js';
export const RESOURCE_PROFILES = profiles;
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const defaultProfiles = () =>
    profiles
        .filter((p) => p.default)
        .map((p) => ({ ...structuredClone(p), version: 1, abundance: 50, concentration: 50, richness: 100 }));
export function validateProfiles(selected) {
    if (!Array.isArray(selected) || selected.length > 64) throw new Error('Invalid map resource selection.');
    const keys = new Set();
    for (const p of selected) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(p.key) || keys.has(p.key))
            throw new Error('Resource identities must be unique.');
        keys.add(p.key);
        if (!['agriculture', 'surface', 'forest', 'deposit'].includes(p.method))
            throw new Error('Unsupported geographic resource method.');
        for (const [key, max] of [
            ['abundance', 100],
            ['concentration', 100],
            ['richness', 200],
        ])
            if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > max) throw new Error(`Invalid ${key}.`);
    }
    for (const p of selected)
        if (p.excludes.some((key) => keys.has(key)))
            throw new Error(`${p.labels.en} conflicts with another selected resource.`);
}
export function agriculturalSuitability(cell) {
    if (['lake', 'ocean'].includes(cell.terrain)) return 0;
    const warmth = clamp((cell.temperature - 0.18) / 0.45);
    const water = clamp(cell.moisture / 0.55) * (1 - clamp((cell.moisture - 0.85) / 0.15) * 0.45);
    const slope = 1 / (1 + Math.max(0, cell.slope ?? 0) / 350);
    return warmth * water * slope * (cell.snowCover ? 0.1 : 1);
}
/** Deterministic static potential. Spatial lattice avoids testing every world deposit against every cell. */
export function generateResources(model, selected = defaultProfiles()) {
    validateProfiles(selected);
    for (const cell of model.cells) cell.agriculturalSuitability = agriculturalSuitability(cell);
    model.resourceProfiles = structuredClone(selected);
    model.resources = selected.map((profile) => {
        const entries = [],
            seed = `${model.geography.settings.seed}:${profile.key}`,
            anchors = new Map();
        const spacing = 3;
        const anchor = (x, y) => {
            const id = `${x},${y}`;
            if (!anchors.has(id)) {
                const random = (lane) => featureHash(`${seed}:${id}:${lane}`);
                anchors.set(id, {
                    x: (x + random('x')) * spacing,
                    y: (y + random('y')) * spacing,
                    active: random('active') < profile.abundance / 100,
                    radius: spacing * (0.9 - profile.concentration / 200),
                    grade: 0.5 + random('grade') * 0.5,
                });
            }
            return anchors.get(id);
        };
        for (const cell of model.cells) {
            const habitat = ['lake', 'ocean'].includes(cell.terrain) ? cell.terrain : 'land';
            if (!profile.habitats.includes(habitat)) continue;
            const depth = habitat === 'ocean' ? Math.max(0, -cell.baseElevation) : (cell.waterDepth ?? 0);
            if (depth > (profile.maxDepth ?? Infinity)) continue;
            let density = 0;
            if (profile.method === 'agriculture')
                density = cell.agriculturalSuitability * (profile.abundance / 50);
            if (profile.method === 'surface') density = profile.abundance / 50;
            if (profile.method === 'forest' && cell.vegetation === 'forest')
                density = ((0.35 + cell.moisture * 0.65) * profile.abundance) / 50;
            if (profile.method === 'deposit') {
                const p = geographyPoint(cell.q, cell.r, model.microRadius),
                    gx = Math.floor(p.x / spacing),
                    gy = Math.floor(p.y / spacing);
                for (let x = gx - 1; x <= gx + 1; x++)
                    for (let y = gy - 1; y <= gy + 1; y++) {
                        const a = anchor(x, y);
                        if (a.active)
                            density = Math.max(
                                density,
                                Math.max(0, 1 - Math.hypot(p.x - a.x, p.y - a.y) / a.radius) * a.grade,
                            );
                    }
            }
            density *= ((profile.affinities[cell.landform] ?? 0) * profile.richness) / 100;
            if (density <= 0) continue;
            const quantity = (density * profile.baseQuantity) / model.cellCount;
            // Potential seasonal output, not a workforce or a developed mine.
            const accessibility = habitat === 'land' ? 1 / (1 + (cell.slope ?? 0) / 1800) : 0.3;
            const capacity = (density * profile.baseCapacity * accessibility) / model.cellCount;
            entries.push([cell.id, density, quantity, capacity]);
        }
        return { key: profile.key, cells: entries };
    });
    return model.resources;
}
