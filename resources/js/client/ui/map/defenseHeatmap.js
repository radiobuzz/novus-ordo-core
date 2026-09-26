import { territorialDefense } from '../../services/forceSummary.js';

export const defenseGradient = Object.freeze([
    Object.freeze({ at: 0, color: '#7e2938' }),
    Object.freeze({ at: 0.32, color: '#c66b3d' }),
    Object.freeze({ at: 0.56, color: '#d1b84a' }),
    Object.freeze({ at: 0.78, color: '#5a9c68' }),
    Object.freeze({ at: 1, color: '#3b8792' }),
]);

export const defenseGradientCss = `linear-gradient(90deg, ${defenseGradient
    .map((stop) => `${stop.color} ${stop.at * 100}%`)
    .join(', ')})`;

function interpolateColor(left, right, ratio) {
    const channels = [1, 3, 5].map((offset) => {
        const start = Number.parseInt(left.slice(offset, offset + 2), 16);
        const end = Number.parseInt(right.slice(offset, offset + 2), 16);
        return Math.round(start + (end - start) * ratio)
            .toString(16)
            .padStart(2, '0');
    });
    return `#${channels.join('')}`;
}

export function defenseColor(position) {
    const value = Math.max(0, Math.min(1, position));
    const upperIndex = defenseGradient.findIndex((stop) => stop.at >= value);
    if (upperIndex <= 0) return defenseGradient[0].color;
    const lower = defenseGradient[upperIndex - 1];
    const upper = defenseGradient[upperIndex];
    return interpolateColor(lower.color, upper.color, (value - lower.at) / (upper.at - lower.at));
}

export function defenseScale(values) {
    const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    const maximum = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)] : 0;
    return Object.freeze({ maximum });
}

export function defensePosition(value, scale) {
    if (value <= 0 || scale.maximum <= 0) return 0;
    const relative = Math.min(1, value / scale.maximum);
    // A mild adaptive curve keeps both early- and late-game differences readable.
    return Math.log1p(relative * 4) / Math.log(5);
}

/** Project the defence of each owned territory if it alone were attacked now. */
export function projectDefenseHeatmap(snapshot, coverage) {
    const guardByTerritory = new Map((coverage?.territories ?? []).map((row) => [row.territory_id, row]));
    const projected = snapshot.territories
        .filter((territory) => territory.owner_nation_id === snapshot.setup.nation_id)
        .map((territory) => {
            const projected = territorialDefense(snapshot, territory.territory_id);
            const guard = guardByTerritory.get(territory.territory_id);
            if (!projected || !guard) return null;
            const guardDefense = guard.guard_defense;
            return {
                territoryId: territory.territory_id,
                baseDefense: projected.total,
                guardDefense,
                guardDivisions: guard.guard_divisions,
                total: projected.total + guardDefense,
            };
        })
        .filter(Boolean);
    const scale = defenseScale(projected.map((entry) => entry.total));
    const entries = projected.map((entry) => {
        const position = defensePosition(entry.total, scale);
        return Object.freeze({ ...entry, position, color: defenseColor(position) });
    });
    return Object.freeze({ entries: Object.freeze(entries), scale });
}

/** Filled territory underlay; ownership borders and unit markers remain readable above it. */
export function heatmapOverlay(entries) {
    return (ctx, renderer) => {
        const territories = new Map(
            renderer.context.territories.map((territory) => [territory.territory_id, territory]),
        );
        for (const entry of entries) {
            if (renderer.highlight) {
                renderer.highlight(ctx, entry.territoryId, entry.color, 0.72);
                continue;
            }
            const territory = territories.get(entry.territoryId);
            if (!territory) continue;
            const definition = renderer.context.definition;
            ctx.save();
            ctx.globalAlpha = 0.72;
            ctx.fillStyle = entry.color;
            ctx.fillRect(
                territory.x * definition.tileWidth,
                territory.y * definition.tileHeight,
                definition.tileWidth,
                definition.tileHeight,
            );
            ctx.restore();
        }
    };
}

export const defenseHeatmapOverlay = heatmapOverlay;
