import { geographyValues } from '../../ui/map/analysis/data.js';
import { featureHash } from '../../../map/cartography.js';
export { analysisStyle, palettes } from '../../ui/map/analysis/palettes.js';

const wet = (c) => ['ocean', 'lake'].includes(c.terrain);
const sample = (region, key) => featureHash(`layer-menu:${region.id}:${key}`);

/** Fixed illustrative values; never reads a game, nation, economy service or API. */
export function makeSamples(model) {
    return new Map(
        model.regions.map((r) => {
            const land = r.cellIds.filter((id) => !wet(model.cellById.get(id))).length / model.cellCount;
            const population = Math.round((0.1 + sample(r, 'population') * 2) * 1e6 * land);
            const own = r.column < model.regionColumns * 0.6;
            const forces = Math.floor(sample(r, 'forces') * 5);
            return [
                r.id,
                {
                    own,
                    land,
                    population,
                    density: land ? population / land : 0,
                    infrastructure: sample(r, 'infrastructure'),
                    capacity: 0.4 + sample(r, 'capacity') * 1.2,
                    income: (population / 1e6) * (15 + sample(r, 'income') * 40),
                    netIncome: 10 + sample(r, 'income') * 30,
                    unrest: sample(r, 'unrest') * 0.6,
                    informal: sample(r, 'informal') * 0.5,
                    workers: Math.round(population * sample(r, 'workers') * 0.3),
                    loyalty: 0.2 + sample(r, 'loyalty') * 0.8,
                    defense: forces * (2 + sample(r, 'defense') * 8),
                    guard: sample(r, 'guard') > 0.5 ? 3 : 0,
                    forces,
                },
            ];
        }),
    );
}

export function valuesFor(model, samples, layer, resource, options = {}) {
    if (layer.source !== 'sample') return geographyValues(model, layer, resource, options);
    const totals = new Map();
    if (layer.id === 'production')
        for (const c of model.cells)
            totals.set(
                c.regionId,
                (totals.get(c.regionId) ?? 0) + (c.resourcePotential?.[resource]?.capacity ?? 0),
            );
    return new Map(
        model.cells.map((c) => {
            const s = samples.get(c.regionId);
            const value = wet(c)
                ? null
                : layer.id === 'ownership'
                  ? s.own
                      ? 'Your nation (sample)'
                      : 'Other nation (sample)'
                  : !s.own
                    ? null
                    : layer.id === 'production'
                      ? (totals.get(c.regionId) ?? 0) * 0.55
                      : s[layer.id];
            return [c.id, value ?? null];
        }),
    );
}
