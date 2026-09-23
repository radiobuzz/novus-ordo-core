import { geographyPoint } from './geography.js';
import { featureHash } from './cartography.js';

export const RESOURCE_KINDS = ['Oil', 'Iron', 'Copper', 'Coal', 'Timber'];
export const RESOURCE_DEFAULTS = Object.freeze({ abundance: 50, concentration: 50, richness: 100 });
export function resourceOptions(options = {}) {
    return Object.fromEntries(
        Object.entries(RESOURCE_DEFAULTS).map(([key, fallback]) => {
            const value = Number(options[key] ?? fallback);
            return [
                key,
                Math.max(
                    0,
                    Math.min(key === 'richness' ? 200 : 100, Number.isFinite(value) ? value : fallback),
                ),
            ];
        }),
    );
}

// Fictional geology, not a geological solver. Anchors are in continuous world
// coordinates; political ownership and the micro-grid never seed the deposits.
export function createNaturalResources(model, options = {}) {
    const settings = resourceOptions(options),
        seed = model.geography.settings.seed;
    const basins = [];
    for (const kind of RESOURCE_KINDS.filter((kind) => kind !== 'Timber')) {
        for (let i = 0; i < 48; i++) {
            const key = `${seed}:substrate:${kind}:${i}`,
                random = (suffix) => featureHash(key + suffix);
            if (random('active') >= settings.abundance / 100) continue;
            const concentration = settings.concentration / 100;
            const major = random('major') < 0.35;
            if (!major && random('cluster') < concentration * 0.85) continue;
            const radius = (major ? 2.6 : 1.2) * (1 - concentration * 0.35);
            basins.push({
                id: `${kind.toLowerCase()}-${i}`,
                kind,
                x: (((i % 8) + 0.15 + random('x') * 0.7) * 30) / 8,
                y: ((Math.floor(i / 8) + 0.15 + random('y') * 0.7) * 17.32) / 6,
                angle: random('angle') * Math.PI,
                rx: radius * (['Iron', 'Copper'].includes(kind) ? 1.6 : 1.1),
                ry: radius * (['Iron', 'Copper'].includes(kind) ? 0.35 : 0.7),
                grade: (0.6 + random('grade') * 0.4) * (1 + concentration * (major ? 0.7 : 0)),
            });
        }
    }
    const cells = new Map(),
        totals = Object.fromEntries(
            RESOURCE_KINDS.map((kind) => [kind, { quantity: 0, sites: 0, offshore: 0 }]),
        );
    for (const cell of model.cells) {
        const p = geographyPoint(cell.q, cell.r, model.microRadius, model.scale === 'scenario');
        const water = ['ocean', 'lake'].includes(cell.terrain),
            entries = {};
        for (const kind of RESOURCE_KINDS) {
            let density = 0,
                fieldId = null;
            const eligible =
                kind === 'Oil' ? cell.terrain !== 'lake' && (!water || cell.baseElevation > -350) : !water;
            if (kind === 'Timber') {
                if (cell.vegetation === 'forest' && !water)
                    density = ((0.35 + cell.moisture * 0.65) * settings.abundance) / 50;
            } else if (eligible) {
                for (const basin of basins) {
                    if (basin.kind !== kind) continue;
                    const dx = p.x - basin.x,
                        dy = p.y - basin.y;
                    const along = (dx * Math.cos(basin.angle) + dy * Math.sin(basin.angle)) / basin.rx;
                    const across = (-dx * Math.sin(basin.angle) + dy * Math.cos(basin.angle)) / basin.ry;
                    const warp = Math.sin(p.x * 1.7 + p.y * 0.9 + basin.x) * 0.15;
                    const value = Math.max(0, 1 - Math.hypot(along, across + warp)) * basin.grade;
                    if (value > density) {
                        density = value;
                        fieldId = basin.id;
                    }
                }
            }
            density *= settings.richness / 100;
            // Timber is standing stock, not a mineral reserve. All quantities are
            // illustrative area integrals, never a fixed amount per micro-cell.
            const quantity = (density * (kind === 'Timber' ? 800 : 1200)) / model.cellCount;
            const difficulty = Math.min(
                1,
                (water ? 0.7 : 0.15) + Math.min(0.6, (cell.slope ?? 0) / 1800) + (cell.frozen ? 0.25 : 0),
            );
            entries[kind] = {
                density,
                quantity,
                difficulty,
                fieldId,
                accessible: quantity * (1 - difficulty),
                regrowth: kind === 'Timber' ? quantity * Math.max(0, cell.temperature - 0.2) * 0.03 : 0,
            };
            totals[kind].quantity += quantity;
            if (density > 0) {
                totals[kind].sites++;
                if (water) totals[kind].offshore++;
            }
        }
        cells.set(cell.id, entries);
    }
    return { settings, basins, cells, totals };
}

export function oilSite(cell, entry, cellCount) {
    const density = entry?.density ?? 0;
    return {
        slots: (48 * density * (1 - (entry?.difficulty ?? 0))) / cellCount,
        productivity: 0.08 + Math.min(2, density) * 0.08,
    };
}
