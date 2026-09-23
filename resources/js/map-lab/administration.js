import { axialKey, neighborCoordinates, hexDisk } from './hex.js';
import { isWater } from './water.js';
import { nations } from './model.js';

export const administrationActive = (state) =>
    Boolean(state.layers.administration && state.labFocus === 'administration' && state.view === 'terrain');
const adjacent = (model, id) => {
    const c = model.cellById.get(id);
    return neighborCoordinates(c.q, c.r).map((p) => axialKey(p.q, p.r));
};
const distance = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Multi-source land flood. Disconnected islands go to the nearest seed;
// the flood itself never crosses water or relies on the large hex boundaries.
function partition(model, ids, count) {
    if (!ids.length) return [];
    const eligible = new Set(ids),
        seen = new Set(),
        components = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        const component = [id];
        seen.add(id);
        for (let i = 0; i < component.length; i++)
            for (const next of adjacent(model, component[i])) {
                if (eligible.has(next) && !seen.has(next)) {
                    seen.add(next);
                    component.push(next);
                }
            }
        components.push(component);
    }
    components.sort((a, b) => b.length - a.length);
    const core = components[0];
    const seeds = [model.cellById.get(core[Math.floor(core.length / 2)])];
    while (seeds.length < Math.min(count, core.length)) {
        const candidate = core
            .map((id) => model.cellById.get(id))
            .reduce((best, c) => {
                const score = (p) => Math.min(...seeds.map((s) => distance(p, s)));
                return score(c) > score(best) ? c : best;
            });
        seeds.push(candidate);
    }
    const owners = new Map(seeds.map((c, i) => [c.id, i])),
        queue = seeds.map((c) => c.id);
    for (let i = 0; i < queue.length; i++)
        for (const next of adjacent(model, queue[i])) {
            if (eligible.has(next) && !owners.has(next)) {
                owners.set(next, owners.get(queue[i]));
                queue.push(next);
            }
        }
    for (const component of components.slice(1)) {
        const centre = component.reduce(
            (p, id) => {
                const c = model.cellById.get(id);
                return { x: p.x + c.x / component.length, y: p.y + c.y / component.length };
            },
            { x: 0, y: 0 },
        );
        let closest = 0;
        for (let i = 1; i < seeds.length; i++)
            if (distance(centre, seeds[i]) < distance(centre, seeds[closest])) closest = i;
        for (const id of component) owners.set(id, closest);
    }
    return seeds.map((_, i) => ids.filter((id) => owners.get(id) === i));
}

function expand(model, start, allowed, steps) {
    const result = new Set(start),
        queue = [...start].map((id) => [id, 0]);
    for (let i = 0; i < queue.length; i++) {
        const [id, depth] = queue[i];
        if (depth >= steps) continue;
        for (const next of adjacent(model, id))
            if (allowed.has(next) && !result.has(next)) {
                result.add(next);
                queue.push([next, depth + 1]);
            }
    }
    return result;
}

export function createAdministration(model) {
    const admin = {
        countries: [],
        countryByCell: new Map(),
        provinces: [],
        provinceByCell: new Map(),
        zones: [],
        revision: 0,
        nextId: 1,
        history: [],
    };
    const land = model.cells.filter((c) => !isWater(c)).map((c) => c.id);
    partition(model, land, 3).forEach((ids, i) => {
        const nation = Object.values(nations)[i];
        const country = { ...nation, cellIds: new Set(ids) };
        admin.countries.push(country);
        for (const id of ids) admin.countryByCell.set(id, country.id);
        partition(model, ids, 3).forEach((cells, j) => {
            const province = {
                id: `province-${admin.nextId++}`,
                nationId: country.id,
                name: `${['Northmarch', 'Heartland', 'Southreach'][j]} Province`,
                cellIds: new Set(cells),
            };
            admin.provinces.push(province);
            for (const id of cells) admin.provinceByCell.set(id, province.id);
        });
        const coast = ids.filter((id) =>
            adjacent(model, id).some((n) => model.cellById.get(n)?.terrain === 'ocean'),
        );
        const river = ids.filter((id) => model.cellById.get(id).riverEdgeIds.length);
        const radius = Math.max(1, Math.round(Math.sqrt(model.cellCount) * 0.8));
        for (const [name, start, color] of [
            ['Coastal development', coast, '#f0b55e'],
            ['River-valley development', river, '#ba9ef3'],
        ]) {
            if (!start.length) continue;
            admin.zones.push({
                id: `zone-${admin.nextId++}`,
                nationId: country.id,
                name,
                color,
                cellIds: expand(model, start, country.cellIds, radius),
            });
        }
    });
    return admin;
}

export function createAdministrativeArea(admin, kind, nationId, name) {
    if (!['province', 'zone'].includes(kind) || !admin.countries.some((n) => n.id === nationId)) return null;
    const label = String(name).trim().slice(0, 64);
    if (!label) return null;
    const area = { id: `${kind}-${admin.nextId++}`, nationId, name: label, cellIds: new Set() };
    if (kind === 'zone') area.color = ['#f0b55e', '#ba9ef3', '#6ed8cf'][admin.zones.length % 3];
    admin[kind === 'province' ? 'provinces' : 'zones'].push(area);
    admin.revision++;
    return area;
}

export function setDevelopmentZoneColor(admin, areaId, color) {
    const zone = admin.zones.find((z) => z.id === areaId);
    if (!zone || !/^#[\da-f]{6}$/i.test(color)) return false;
    color = color.toLowerCase();
    if (zone.color !== color) {
        zone.color = color;
        admin.revision++;
    }
    return true;
}

// Keep the original target and the first value of every cell touched in a stroke.
export function beginAdministrativeStroke(admin, editor) {
    return { admin, editor: { ...editor }, changes: new Map(), finished: false };
}

export function finishAdministrativeStroke(stroke) {
    if (!stroke || stroke.finished) return 0;
    stroke.finished = true;
    const changes = [...stroke.changes.values()].filter((c) => c.before !== c.after);
    if (changes.length) rememberEdit(stroke.admin, { ...stroke.editor, changes });
    return changes.length;
}

function rememberEdit(admin, entry) {
    admin.history.push(entry);
    if (admin.history.length > 50) admin.history.shift();
}

export function editAdministrativeCells(
    admin,
    model,
    { kind, areaId, nationId, cellId, radius = 0, operation },
    stroke = null,
) {
    if (
        stroke &&
        (stroke.finished ||
            stroke.admin !== admin ||
            Object.entries({ kind, areaId, nationId, radius, operation }).some(
                ([key, value]) => stroke.editor[key] !== value,
            ))
    )
        return { changed: 0, rejected: 0, error: 'The painting target changed. Start a new stroke.' };
    const area = admin[kind === 'province' ? 'provinces' : 'zones']?.find((a) => a.id === areaId);
    const origin = model.cellById.get(cellId);
    if (
        !['province', 'zone'].includes(kind) ||
        !area ||
        area.nationId !== nationId ||
        !origin ||
        !['add', 'remove'].includes(operation)
    )
        return { changed: 0, rejected: 0, error: 'Select a valid area and editing operation.' };
    if (admin.countryByCell.get(cellId) !== nationId)
        return {
            changed: 0,
            rejected: 1,
            error: 'Choose land inside the selected country. Ownership cannot be edited.',
        };
    const changes = [],
        rejected = [];
    for (const offset of hexDisk(Math.max(0, Math.min(2, Math.floor(Number(radius) || 0))))) {
        const id = axialKey(origin.q + offset.q, origin.r + offset.r);
        if (admin.countryByCell.get(id) !== nationId) {
            rejected.push(id);
            continue;
        }
        if (kind === 'province') {
            const before = admin.provinceByCell.get(id) ?? null;
            const after = operation === 'add' ? area.id : before === area.id ? null : before;
            if (before === after) continue;
            if (before) admin.provinces.find((p) => p.id === before).cellIds.delete(id);
            if (after) area.cellIds.add(id);
            if (after) admin.provinceByCell.set(id, after);
            else admin.provinceByCell.delete(id);
            changes.push({ id, before, after });
        } else {
            const before = area.cellIds.has(id),
                after = operation === 'add';
            if (before === after) continue;
            if (after) area.cellIds.add(id);
            else area.cellIds.delete(id);
            changes.push({ id, before, after });
        }
    }
    if (changes.length) {
        touchGeometry(admin, kind, areaId, changes);
        if (stroke) {
            for (const change of changes) {
                const previous = stroke.changes.get(change.id);
                stroke.changes.set(change.id, {
                    ...change,
                    before: previous ? previous.before : change.before,
                });
            }
        } else rememberEdit(admin, { kind, areaId, changes });
        admin.revision++;
    }
    return { changed: changes.length, rejected: rejected.length };
}

export function undoAdministration(admin) {
    const entry = admin.history.pop();
    if (!entry) return false;
    touchGeometry(admin, entry.kind, entry.areaId, entry.changes);
    for (const { id, before, after } of entry.changes) {
        if (entry.kind === 'province') {
            if (after) admin.provinces.find((p) => p.id === after).cellIds.delete(id);
            if (before) {
                admin.provinces.find((p) => p.id === before).cellIds.add(id);
                admin.provinceByCell.set(id, before);
            } else admin.provinceByCell.delete(id);
        } else {
            const zone = admin.zones.find((z) => z.id === entry.areaId);
            if (before) zone.cellIds.add(id);
            else zone.cellIds.delete(id);
        }
    }
    admin.revision++;
    return true;
}

function touchGeometry(admin, kind, areaId, changes) {
    const ids =
        kind === 'province'
            ? new Set(changes.flatMap((c) => [c.before, c.after]).filter(Boolean))
            : new Set([areaId]);
    for (const area of admin[kind === 'province' ? 'provinces' : 'zones'])
        if (ids.has(area.id)) area.geometryRevision = (area.geometryRevision ?? 0) + 1;
}

export function administrativeMembership(admin, cellId) {
    return {
        country: admin.countries.find((n) => n.id === admin.countryByCell.get(cellId)) ?? null,
        province: admin.provinces.find((p) => p.id === admin.provinceByCell.get(cellId)) ?? null,
        zones: admin.zones.filter((z) => z.cellIds.has(cellId)),
    };
}
