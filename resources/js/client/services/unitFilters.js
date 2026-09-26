export const unitFilterTypes = ['Infantry', 'Armored', 'Artillery', 'Fighter', 'Bomber'];

const state = (division) =>
    division.order?.order_type === 'Guard' ? 'guard' : division.order ? 'ordered' : 'idle';

export function filterDivisions(divisions, filters) {
    const entries = filters instanceof Map ? [...filters] : filters;
    const byCategory = new Map();
    for (const [key, mode] of entries) {
        const [category, value] = key.split(':');
        if (!['include', 'exclude'].includes(mode) || !value) continue;
        const group = byCategory.get(category) ?? { include: new Set(), exclude: new Set() };
        group[mode].add(value);
        byCategory.set(category, group);
    }
    return divisions.filter((division) => {
        const values = { state: state(division), type: division.division_type };
        for (const [category, group] of byCategory) {
            const value = values[category];
            if (group.exclude.has(value)) return false;
            if (group.include.size && !group.include.has(value)) return false;
        }
        return true;
    });
}

export function updateUnitFilter(filters, key, exclude = false) {
    const next = new Map(filters);
    const mode = exclude ? 'exclude' : 'include';
    if (next.get(key) === mode) next.delete(key);
    else next.set(key, mode);
    return next;
}
