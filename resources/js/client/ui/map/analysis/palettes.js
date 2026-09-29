import { defenseColor, defensePosition, defenseScale } from '../defenseHeatmap.js';

export const palettes = {
    sequential: ['#51351f', '#c58a31', '#fff0bb'],
    population: ['#452154', '#be4d9b', '#ffe0ee'],
    economy: ['#173f30', '#369b64', '#ddf5bf'],
    risk: ['#574f44', '#e39339', '#d62c38'],
    water: ['#153f70', '#3d9fd4', '#d5f3ff'],
    temperature: ['#386eb5', '#ece0ae', '#dc5435'],
    oil: ['#30213f', '#9061c2', '#ecd9ff'],
    categories: ['#d8ba77', '#7aafad', '#a39ac6', '#c28b9e', '#99ae77', '#91bce2', '#cc9874'],
};
const biomeColours = {
    desert: '#e4bf70',
    drylands: '#b39955',
    forest: '#348251',
    grassland: '#a2bd60',
    tundra: '#b3ac91',
    snow: '#eef6ff',
    ocean: '#245d86',
    lake: '#57a8bf',
    Forest: '#388553',
    'Other land': '#c4aa70',
    'Snow / ice': '#eef6ff',
    'No snow / ice': '#81734f',
    'Detected bay': '#e6b94b',
};
export function interpolate(colours, position) {
    const p = Math.max(0, Math.min(1, position)) * (colours.length - 1);
    const i = Math.min(colours.length - 2, Math.floor(p)),
        t = p - i;
    return (
        '#' +
        [1, 3, 5]
            .map((n) =>
                Math.round(
                    parseInt(colours[i].slice(n, n + 2), 16) * (1 - t) +
                        parseInt(colours[i + 1].slice(n, n + 2), 16) * t,
                )
                    .toString(16)
                    .padStart(2, '0'),
            )
            .join('')
    );
}
export function analysisStyle(layer, values, resource = null) {
    const categories =
        layer.scale === 'category'
            ? [...new Set([...values.values()].filter((v) => v != null))].sort((a, b) =>
                  String(a).localeCompare(String(b)),
              )
            : [];
    const categoryColours = new Map(
        categories.map((v, i) => [
            v,
            biomeColours[v] ??
                (categories.length <= palettes.categories.length
                    ? palettes.categories[i]
                    : `hsl(${(i * 137.508) % 360} 48% ${52 + (i % 3) * 8}%)`),
        ]),
    );
    const numeric = [...values.values()].filter((v) => typeof v === 'number' && Number.isFinite(v));
    const fixed = ['index', 'percent'].includes(layer.scale) || layer.id === 'exposure';
    const scale = fixed ? { maximum: 1 } : defenseScale(numeric);
    const lower = layer.id === 'elevation' ? numeric.reduce((a, b) => Math.min(a, b), 0) : 0;
    let colours = palettes.sequential;
    if (['population', 'density'].includes(layer.id)) colours = palettes.population;
    if (
        ['fertility', 'forest', 'capacity', 'income', 'netIncome', 'loyalty', 'production'].includes(layer.id)
    )
        colours = palettes.economy;
    if (['unrest', 'informal'].includes(layer.id)) colours = palettes.risk;
    if (['rainfall', 'moisture', 'depth', 'flow'].includes(layer.id)) colours = palettes.water;
    if (layer.id === 'temperature') colours = palettes.temperature;
    if (['deposits', 'potential'].includes(layer.id))
        colours =
            resource?.method === 'agriculture' || resource?.method === 'forest'
                ? palettes.economy
                : resource?.key === 'oil'
                  ? palettes.oil
                  : resource?.key === 'copper'
                    ? ['#503026', '#c77748', '#ffe0aa']
                    : resource?.key === 'iron'
                      ? ['#393547', '#8996ac', '#f1f3f6']
                      : palettes.sequential;
    return {
        categories,
        hasValues: numeric.length > 0 || categories.length > 0,
        maximum: scale.maximum,
        lower,
        colours,
        colour(value) {
            if (value == null) return null;
            if (layer.scale === 'category') return categoryColours.get(value) ?? null;
            const p = fixed
                ? Math.max(0, Math.min(1, value))
                : lower < 0
                  ? Math.max(0, Math.min(1, (value - lower) / (scale.maximum - lower || 1)))
                  : defensePosition(value, scale);
            return layer.id === 'defense' ? defenseColor(p) : interpolate(colours, p);
        },
    };
}
