// Presentation metadata and projection of recorded observations; no economic rules.
export const indicatorGroups = [
    { key: 'development', keys: ['economic_strength', 'dynamism', 'infrastructure'] },
    { key: 'conditions', keys: ['health', 'education', 'environment'] },
    { key: 'pressures', keys: ['inequality', 'crime', 'unrest', 'informal'] },
];
export const lowerIsBetter = new Set(['inequality', 'crime', 'unrest', 'informal']);

export function indicatorPercent(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number * 100 : null;
}

export function indicatorValues(values = {}) {
    return Object.fromEntries(
        indicatorGroups.flatMap((group) => group.keys).map((key) => [key, indicatorPercent(values?.[key])]),
    );
}

export function indicatorPoint(record) {
    return { season: record.season, values: indicatorValues(record.economy?.indicators) };
}

export function precedingIndicators(history, turn) {
    // Current turn N reflects the result of season N-1. Compare with N-2;
    // never treat an older observation across a missing season as a seasonal change.
    const record = history?.seasons?.find((r) => r.season === turn - 2);
    return indicatorValues(record?.economy?.indicators);
}
