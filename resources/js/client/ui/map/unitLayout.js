import { isWater } from '../../../map/water.js';

/** Visual slots only: no sub-territory positions or movement rules. Shared by drawing and picking. */
export function territoryCenter(context, id) {
    const t = context.territories.find((t) => t.territory_id === id);
    if (!t) return null;
    return (
        context.picker.center?.(t) ?? {
            x: (t.x + 0.5) * context.definition.tileWidth,
            y: (t.y + 0.5) * context.definition.tileHeight,
        }
    );
}

function slots(context, id) {
    const center = territoryCenter(context, id);
    if (!center) return [];
    const model = context.definition.model;
    if (model) {
        const region = model.regions.find((r) => r.territoryId === id);
        return (region?.cellIds ?? [])
            .map((id) => model.cellById.get(id))
            .filter((cell) => cell && !isWater(cell))
            .sort(
                (a, b) =>
                    Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y) ||
                    a.x - b.x ||
                    a.y - b.y,
            );
    }
    const points = [];
    for (const y of [0, -1, 1])
        for (const x of [0, -1, 1])
            points.push({
                x: center.x + x * context.definition.tileWidth * 0.3,
                y: center.y + y * context.definition.tileHeight * 0.3,
            });
    return points;
}

export function layoutUnits(context, camera, divisions, deployments = [], draft = []) {
    const groups = new Map();
    const add = (entry) => {
        const group = groups.get(entry.territory_id) ?? [];
        group.push(entry);
        groups.set(entry.territory_id, group);
    };
    [...divisions]
        .sort((a, b) => a.division_id - b.division_id)
        .forEach((d) => add({ ...d, state: 'active' }));
    [...deployments]
        .sort((a, b) => a.deployment_id - b.deployment_id)
        .forEach((d) => add({ ...d, state: 'pending' }));
    draft.forEach((d) => add({ ...d, state: 'draft' }));
    const result = [];
    for (const [id, units] of groups) {
        const center = territoryCenter(context, id);
        if (!center) continue;
        const positions = slots(context, id);
        const scale = context.definition.model
            ? context.definition.model.cellSize * 2
            : Math.min(context.definition.tileWidth, context.definition.tileHeight);
        const used = positions.slice(0, units.length);
        const detailed =
            scale * camera.zoom >= 110 &&
            units.length <= 25 &&
            used.length === units.length &&
            used.every((p, i) =>
                used.slice(0, i).every((q) => Math.hypot(p.x - q.x, p.y - q.y) * camera.zoom >= 48),
            );
        const size = Math.max(52, Math.min(84, scale * camera.zoom * 0.35));
        if (detailed)
            units.forEach((unit, i) =>
                result.push({ ...unit, ...camera.worldToScreen(used[i].x, used[i].y), size }),
            );
        else
            result.push({
                territory_id: id,
                state: 'stack',
                units,
                ...camera.worldToScreen(center.x, center.y),
                size: 42,
            });
    }
    return result;
}

export function hitUnits(layout, point) {
    return [...layout]
        .reverse()
        .find(
            (unit) =>
                Math.abs(unit.x - point.x) <= unit.size / 2 && Math.abs(unit.y - point.y) <= unit.size / 2,
        );
}

export function unitsInBox(layout, box) {
    const minX = Math.min(box.a.x, box.b.x),
        maxX = Math.max(box.a.x, box.b.x);
    const minY = Math.min(box.a.y, box.b.y),
        maxY = Math.max(box.a.y, box.b.y);
    return layout
        .filter((unit) => unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY)
        .flatMap((unit) => (unit.state === 'stack' ? unit.units : [unit]))
        .filter((unit) => unit.state === 'active')
        .map((unit) => unit.division_id);
}
