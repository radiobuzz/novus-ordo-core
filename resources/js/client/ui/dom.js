export { el } from './element.js';
export { button } from './Button.js';
export function formatStat(stat, i18n) {
    const value = Number(stat.value);
    if (stat.unit === 'Unknown' || !Number.isFinite(value)) return i18n?.t('common.unknown') ?? 'Unknown';
    if (['Percent', 'DetailedPercent'].includes(stat.unit))
        return new Intl.NumberFormat(i18n?.locale, {
            style: 'percent',
            maximumFractionDigits: stat.unit === 'DetailedPercent' ? 2 : 0,
        }).format(value);
    const number = new Intl.NumberFormat(i18n?.locale, {
        maximumFractionDigits: stat.unit === 'DecimalNumber' ? 2 : 0,
    }).format(value);
    return `${stat.unit === 'ApproximateNumber' ? '≈ ' : ''}${number}${stat.unit === 'Km2' ? ' km²' : ''}`;
}
