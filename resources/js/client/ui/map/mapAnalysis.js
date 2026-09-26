import { defenseColor, defensePosition, defenseScale } from './defenseHeatmap.js';

export const analysisTypes = Object.freeze(['none', 'defense', 'population', 'production', 'loyalty']);

function stat(territory, title) {
    return territory.stats?.find((entry) => entry.title === title);
}

function adaptive(entries) {
    const scale = defenseScale(entries.map((entry) => entry.value));
    return Object.freeze({
        entries: Object.freeze(
            entries.map((entry) => {
                const position = defensePosition(entry.value, scale);
                return Object.freeze({ ...entry, position, color: defenseColor(position) });
            }),
        ),
        scale,
    });
}

export function projectPopulationDensity(snapshot) {
    return adaptive(
        snapshot.territories
            .map((territory) => {
                const population = stat(territory, 'Population');
                const area = stat(territory, 'Area');
                if (
                    territory.terrain_type === 'Water' ||
                    population?.unit === 'Unknown' ||
                    !Number.isFinite(population?.value) ||
                    !Number.isFinite(area?.value) ||
                    area.value <= 0
                )
                    return null;
                return {
                    territoryId: territory.territory_id,
                    value: population.value / area.value,
                    population: population.value,
                    area: area.value,
                };
            })
            .filter(Boolean),
    );
}

export function projectResourceProduction(snapshot, resource) {
    const unit = snapshot.nation?.definitions?.labor_per_unit || 1;
    const outputByTerritory = new Map();
    for (const facility of snapshot.nation?.budget?.labor_facility_allocations ?? []) {
        if (facility.resource_type !== resource) continue;
        outputByTerritory.set(
            facility.territory_id,
            (outputByTerritory.get(facility.territory_id) ?? 0) + Number(facility.production ?? 0) / unit,
        );
    }
    return adaptive(
        snapshot.territories
            .filter((territory) => territory.owner_nation_id === snapshot.setup.nation_id)
            .map((territory) => ({
                territoryId: territory.territory_id,
                value: outputByTerritory.get(territory.territory_id) ?? 0,
                resource,
            })),
    );
}

export function projectLoyalty(snapshot) {
    const nationId = snapshot.setup.nation_id;
    const entries = snapshot.territories
        .filter((territory) => territory.owner_nation_id === nationId)
        .map((territory) => {
            const loyalty = territory.loyalties?.find((entry) => entry.nation_id === nationId);
            const ratio = Number(loyalty?.loyalty_ratio ?? loyalty?.loyalty);
            if (!Number.isFinite(ratio)) return null;
            const value = Math.max(0, Math.min(1, ratio));
            return Object.freeze({
                territoryId: territory.territory_id,
                value,
                position: value,
                color: defenseColor(value),
            });
        })
        .filter(Boolean);
    return Object.freeze({ entries: Object.freeze(entries), scale: Object.freeze({ maximum: 1 }) });
}

export function projectLocalAnalysis(snapshot, type, resource) {
    if (type === 'population') return projectPopulationDensity(snapshot);
    if (type === 'production') return projectResourceProduction(snapshot, resource);
    if (type === 'loyalty') return projectLoyalty(snapshot);
    return Object.freeze({ entries: Object.freeze([]), scale: null });
}
