import { iconUrl } from './icons.js';
// Resource definitions select from the shared icon vocabulary; economic identity stays data-owned.
export function resourceIcon(iconKey) {
    return iconUrl(iconKey ?? 'layers');
}

export function resourceName(data, key, i18n) {
    const meta = data?.definitions?.resources?.find((r) => r.resource_key === key);
    return meta?.labels?.[i18n.locale] ?? meta?.labels?.en ?? key;
}

export function productionConstraint(data, key, i18n) {
    return key.startsWith('input:')
        ? `${i18n.t('planner.constraint_input')}: ${resourceName(data, key.slice(6), i18n)}`
        : i18n.t(`planner.constraint_${key}`);
}
