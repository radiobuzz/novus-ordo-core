import { gameCatalogue } from './catalogue.js';
import { projectDefenseHeatmap } from '../defenseHeatmap.js';

const wet = (c) => ['ocean', 'lake'].includes(c.terrain);
const number = (v) =>
    v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const stat = (t, key) => {
    const s = t.stats?.find((s) => s.title === key);
    return s?.unit === 'Unknown' ? null : number(s?.value);
};
export function resourcesFor(model, snapshot, type) {
    const definitions = snapshot.nation?.definitions?.resources ?? snapshot.resource_definitions ?? [];
    return definitions.flatMap((d) => {
        if (d.kind === 'currency') return [];
        const profile = model.resourceProfiles?.find((p) => p.key === d.resource_key);
        if (
            type === 'production'
                ? !d.can_produce
                : !profile || (type === 'deposits' && profile.method === 'agriculture')
        )
            return [];
        return [{ ...profile, key: d.resource_key, labels: d.labels, unit_labels: d.unit_labels }];
    });
}
export function availableLayers(model, snapshot, homeland = false) {
    const own = !!snapshot.setup?.nation_id;
    return gameCatalogue.filter((l) => {
        if (l.source === 'geography')
            return (
                !['deposits', 'potential'].includes(l.id) || resourcesFor(model, snapshot, l.id).length > 0
            );
        if (homeland) return false;
        if (['population', 'density'].includes(l.id))
            return snapshot.territories.some((t) => stat(t, 'Population') != null);
        if (!own || !snapshot.nation) return false;
        if (['infrastructure', 'capacity', 'unrest', 'informal'].includes(l.id))
            return Array.isArray(snapshot.nation.economy?.territories);
        if (['income', 'netIncome'].includes(l.id))
            return (
                snapshot.nation.economy?.last_season?.territories?.some(
                    (t) => number(t.income) != null && (l.id !== 'netIncome' || number(t.tax) != null),
                ) ?? false
            );
        if (l.id === 'production')
            return (
                Array.isArray(snapshot.nation.budget?.labor_facility_allocations) &&
                resourcesFor(model, snapshot, l.id).length > 0
            );
        if (l.id === 'workers') return Array.isArray(snapshot.nation.budget?.labor_pools);
        if (l.id === 'guard') return !!snapshot.guard_enabled;
        return true;
    });
}
export function geographyValues(model, layer, resource, { ocean = true, includeWater = false } = {}) {
    const bays =
        layer.id === 'bays'
            ? new Set(model.atlas.features.filter((f) => f.type === 'bay').flatMap((f) => f.cellIds))
            : null;
    return new Map(
        model.cells.map((c) => {
            if (
                (!ocean && c.terrain === 'ocean') ||
                (wet(c) && !includeWater && !['depth', 'bays', 'deposits', 'potential'].includes(layer.id))
            )
                return [c.id, null];
            let v;
            switch (layer.id) {
                case 'terrain':
                    v = null;
                    break;
                case 'depth':
                    v = wet(c) ? (c.terrain === 'lake' ? c.waterDepth : Math.max(0, -c.baseElevation)) : null;
                    break;
                case 'snow':
                    v = c.snowCover || c.frozen || c.polarIce ? 'Snow / ice' : 'No snow / ice';
                    break;
                case 'fertility':
                    v = c.agriculturalSuitability;
                    break;
                case 'forest':
                    v = c.vegetation === 'forest' ? 'Forest' : 'Other land';
                    break;
                case 'basin':
                    v = c.outletId;
                    break;
                case 'bays':
                    v = bays.has(c.id) ? 'Detected bay' : null;
                    break;
                case 'deposits':
                case 'potential':
                    v =
                        c.resourcePotential?.[resource]?.[layer.id === 'deposits' ? 'density' : 'capacity'] ??
                        (wet(c) ? null : 0);
                    break;
                case 'coast':
                case 'exposure':
                    v = null;
                    break;
                default:
                    v = c[layer.id];
            }
            return [c.id, v ?? null];
        }),
    );
}
export function territoryValues(snapshot, id, resource, coverage = null) {
    const values = new Map(),
        nation = snapshot.nation,
        own = snapshot.setup?.nation_id;
    const states = new Map((nation?.economy?.territories ?? []).map((t) => [t.id, t.state]));
    const historical = new Map((nation?.economy?.last_season?.territories ?? []).map((t) => [t.id, t]));
    const production = new Map(),
        workers = new Map(),
        divisions = new Map();
    for (const f of nation?.budget?.labor_facility_allocations ?? [])
        if (f.resource_key === resource)
            production.set(f.territory_id, (production.get(f.territory_id) ?? 0) + Number(f.production));
    for (const p of nation?.budget?.labor_pools ?? [])
        workers.set(p.territory_id, (workers.get(p.territory_id) ?? 0) + Number(p.free_labor));
    for (const d of nation?.divisions ?? [])
        divisions.set(d.territory_id, (divisions.get(d.territory_id) ?? 0) + 1);
    let entries = [];
    if (id === 'defense' && coverage) entries = projectDefenseHeatmap(snapshot, coverage).entries;
    const defense = new Map(entries.map((e) => [e.territoryId, e.total]));
    const guard = new Map((coverage?.territories ?? []).map((t) => [t.territory_id, t.guard_defense]));
    for (const t of snapshot.territories) {
        let v = null;
        const p = stat(t, 'Population'),
            area = stat(t, 'Land area'),
            state = states.get(t.territory_id),
            past = historical.get(t.territory_id);
        if (id === 'population') v = p;
        else if (id === 'density') v = p != null && area > 0 ? p / area : null;
        else if (own && t.owner_nation_id === own) {
            if (['infrastructure', 'capacity', 'unrest', 'informal'].includes(id)) v = number(state?.[id]);
            if (id === 'income') v = number(past?.income);
            if (id === 'netIncome')
                v =
                    number(past?.income) != null && number(past?.tax) != null && past.population > 0
                        ? (past.income - past.tax) / past.population
                        : null;
            if (id === 'production' && Array.isArray(nation?.budget?.labor_facility_allocations))
                v = production.get(t.territory_id) ?? 0;
            if (id === 'workers') v = workers.get(t.territory_id) ?? null;
            if (id === 'forces' && Array.isArray(nation?.divisions)) v = divisions.get(t.territory_id) ?? 0;
            if (id === 'loyalty') v = number(t.loyalties?.find((l) => l.nation_id === own)?.loyalty_ratio);
            if (id === 'defense') v = defense.get(t.territory_id) ?? null;
            if (id === 'guard') v = guard.get(t.territory_id) ?? null;
        }
        values.set(t.territory_id, Number.isFinite(v) ? v : null);
    }
    return { values, entries };
}
