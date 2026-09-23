import { axialKey, hexDistance, neighborCoordinates } from './hex.js';
import { isWater } from './water.js';

// Type names and base powers mirror app/Domain/DivisionType.php. Movement,
// strength and morale below are isolated demo rules, not live combat rules.
export const UNIT_TYPES = {
    Infantry: { label: 'Infantry', attack: 15, defense: 30, speed: 1 },
    Armored: { label: 'Armor', attack: 50, defense: 30, speed: 2 },
    Artillery: { label: 'Artillery', attack: 30, defense: 30, speed: 1 },
    Fighter: {
        label: 'Fighters',
        attack: 50,
        defense: 80,
        speed: 6,
        air: true,
    },
    Bomber: { label: 'Bombers', attack: 80, defense: 15, speed: 8, air: true },
};
const adjacent = (model, cell) =>
    neighborCoordinates(cell.q, cell.r)
        .map(({ q, r }) => model.cellById.get(axialKey(q, r)))
        .filter(Boolean);
const hash = (text) => {
    let n = 2166136261;
    for (const char of text) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
    return n >>> 0;
};
export const activeFormations = (military) => military.formations.filter((group) => group.strength > 0);
export const formationsAt = (military, cellId) =>
    activeFormations(military).filter((group) => group.cellId === cellId);

export function createMilitary(model) {
    const land = model.cells.filter((cell) => !isWater(cell));
    const front = model.cellById.get(model.army.cellId);
    const formations = [];
    const nicknames = [
        'Ironwood',
        'Northwatch',
        'Resolute',
        'Kestrel',
        'Thunder',
        'Sentinel',
        'Vanguard',
        'Silverwing',
    ];
    for (const nationId of ['sable', 'aurelia', 'verdant']) {
        const owned = land.filter((cell) => cell.controllerId === nationId);
        const candidates = (owned.length ? owned : land)
            .slice()
            .sort((a, b) => hexDistance(a, front) - hexDistance(b, front));
        const anchor = candidates[0];
        Object.keys(UNIT_TYPES).forEach((type, index) => {
            const air = Boolean(UNIT_TYPES[type].air);
            const cell = air
                ? anchor
                : (candidates.find((candidate) => hexDistance(candidate, anchor) >= index * 2) ?? anchor);
            const n = hash(`${model.geography.settings.seed}:${nationId}:${index}`);
            const units =
                type === 'Armored'
                    ? [
                          { type, count: 2 },
                          { type: 'Infantry', count: 1 },
                      ]
                    : type === 'Infantry'
                      ? [
                            { type, count: 3 },
                            { type: 'Artillery', count: 1 },
                        ]
                      : [{ type, count: 2 }];
            formations.push({
                id: `${nationId}-${index + 1}`,
                nationId,
                type,
                air,
                units,
                name: `${index + 1}${['st', 'nd', 'rd'][index] ?? 'th'} ${air ? 'Air Wing' : type === 'Armored' ? 'Armored Group' : type === 'Artillery' ? 'Artillery Group' : 'Infantry Group'} “${nicknames[n % nicknames.length]}”`,
                cellId: cell.id,
                strength: 90 + (n % 11),
                morale: 75 + (n % 21),
                order: null,
                progress: 0,
                status: 'Holding',
                oilConsumed: 0,
            });
        });
    }
    return {
        formations,
        tick: 0,
        events: [],
        oilSpent: { aurelia: 0, sable: 0, verdant: 0 },
        baseline: model.cells.map((cell) => [cell.id, cell.controllerId, cell.damage]),
    };
}

export function resetMilitary(model, military) {
    for (const [id, controllerId, damage] of military.baseline)
        Object.assign(model.cellById.get(id), { controllerId, damage });
    return createMilitary(model);
}

// A bounded binary heap for A*: avoid sorting the entire frontier per cell.
class Frontier {
    items = [];
    push(item) {
        let i = this.items.length;
        this.items.push(item);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.items[parent].score <= item.score) break;
            this.items[i] = this.items[parent];
            i = parent;
        }
        this.items[i] = item;
    }
    pop() {
        const first = this.items[0],
            last = this.items.pop();
        if (this.items.length) {
            let i = 0;
            while (i * 2 + 1 < this.items.length) {
                let child = i * 2 + 1;
                if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score)
                    child++;
                if (this.items[child].score >= last.score) break;
                this.items[i] = this.items[child];
                i = child;
            }
            this.items[i] = last;
        }
        return first;
    }
}

export function planOrder(model, military, groupId, targetId, type) {
    const group = activeFormations(military).find((candidate) => candidate.id === groupId);
    const target = model.cellById.get(targetId);
    if (!group || !target) return { error: 'Select an active formation and a map cell.' };
    const origin = model.cellById.get(group.cellId);
    if (targetId === group.cellId) return { error: 'Choose a different destination.' };
    if (!['move', 'attack'].includes(type)) return { error: 'Choose Move or Attack.' };
    const enemies = new Set(
        activeFormations(military)
            .filter((other) => other.nationId !== group.nationId)
            .map((other) => other.cellId),
    );
    if (type === 'move' && enemies.has(targetId))
        return { error: 'Enemy formation at destination. Use Attack.' };
    if (isWater(target))
        return {
            error: 'This demo requires a land destination or land target.',
        };
    if (group.air) {
        const range = UNIT_TYPES[group.type].speed * 2;
        if (hexDistance(origin, target) > range)
            return { error: `Beyond aircraft range (${range} micro-cells).` };
        if (type === 'attack' && !enemies.has(targetId))
            return { error: 'An air strike requires an enemy formation.' };
        return {
            type: type === 'attack' ? 'strike' : 'move',
            targetId,
            path: [origin.id, targetId],
            cost: hexDistance(origin, target),
        };
    }
    const frontier = new Frontier(),
        costs = new Map([[origin.id, 0]]),
        previous = new Map();
    frontier.push({ cell: origin, cost: 0, score: 0 });
    while (frontier.items.length) {
        const current = frontier.pop();
        if (current.cost !== costs.get(current.cell.id)) continue;
        if (current.cell.id === targetId) {
            const path = [targetId];
            while (path[0] !== origin.id) path.unshift(previous.get(path[0]));
            return { type, targetId, path, cost: current.cost };
        }
        for (const next of adjacent(model, current.cell)) {
            if (isWater(next) || (enemies.has(next.id) && !(type === 'attack' && next.id === targetId)))
                continue;
            const cost = current.cost + next.movementCost;
            if (cost >= (costs.get(next.id) ?? Infinity)) continue;
            costs.set(next.id, cost);
            previous.set(next.id, current.cell.id);
            frontier.push({
                cell: next,
                cost,
                score: cost + hexDistance(next, target),
            });
        }
    }
    return { error: 'No land route. Water or enemy formations block the way.' };
}

export function issueOrder(model, military, groupId, targetId, type) {
    const plan = planOrder(model, military, groupId, targetId, type);
    if (plan.error) return plan;
    const group = military.formations.find((candidate) => candidate.id === groupId);
    group.order = plan;
    group.progress = 0;
    group.status = 'Ordered';
    return plan;
}

export function advanceMilitary(model, military) {
    const useFuel = (group) => {
        const amount = group.units
            .filter((unit) => ['Armored', 'Fighter', 'Bomber'].includes(unit.type))
            .reduce((sum, unit) => sum + unit.count, 0);
        military.oilSpent[group.nationId] += amount;
        group.oilConsumed += amount;
    };
    military.tick++;
    const events = [],
        fought = new Set();
    const note = (message) => events.push(`Step ${military.tick}: ${message}`);
    const retreat = (group, attacker) => {
        if (group.strength <= 0) {
            group.strength = 0;
            group.order = null;
            group.status = 'Destroyed';
            note(`${group.name} destroyed.`);
            return;
        }
        if (group.morale > 25) return;
        const origin = model.cellById.get(group.cellId),
            threat = model.cellById.get(attacker.cellId);
        const escape = adjacent(model, origin)
            .filter(
                (cell) =>
                    !isWater(cell) &&
                    !formationsAt(military, cell.id).some((other) => other.nationId !== group.nationId),
            )
            .sort((a, b) => hexDistance(b, threat) - hexDistance(a, threat))[0];
        group.order = null;
        group.progress = 0;
        if (escape) {
            group.cellId = escape.id;
            group.status = 'Retreating';
            note(`${group.name} retreats with ${group.strength}% strength.`);
        } else {
            group.status = 'Pinned';
            note(`${group.name} is pinned; no safe retreat.`);
        }
    };
    for (const group of activeFormations(military)) {
        if (group.strength <= 0 || fought.has(group.id)) continue;
        if (!group.order) {
            group.morale = Math.min(100, group.morale + 3);
            if (group.status === 'Returning to base') group.status = 'Holding';
            if (group.status === 'Retreating') group.status = 'Regrouping';
            continue;
        }
        const order = group.order;
        const nextId = order.path[1];
        if (!nextId) {
            group.order = null;
            continue;
        }
        const next = model.cellById.get(nextId);
        group.progress += Math.min(...group.units.map((unit) => UNIT_TYPES[unit.type].speed));
        if (!group.air && group.progress < next.movementCost) {
            group.status = 'Moving through rough terrain';
            continue;
        }
        const defender = formationsAt(military, nextId).find((other) => other.nationId !== group.nationId);
        if (defender) {
            if (order.type === 'move') {
                group.order = null;
                group.status = 'Blocked';
                note(`${group.name} stopped by an enemy formation.`);
                continue;
            }
            useFuel(group);
            const attack = group.units.reduce(
                (sum, unit) => sum + UNIT_TYPES[unit.type].attack * unit.count,
                0,
            );
            const defense = defender.units.reduce(
                (sum, unit) => sum + UNIT_TYPES[unit.type].defense * unit.count,
                0,
            );
            const damage = Math.max(
                5,
                Math.min(
                    30,
                    Math.round(
                        ((((attack / Math.max(30, defense)) * 16 * group.strength) / 100) *
                            (0.5 + group.morale / 200)) /
                            (next.landform === 'mountain' ? 1.5 : 1),
                    ),
                ),
            );
            defender.strength = Math.max(0, defender.strength - damage);
            defender.morale = Math.max(0, defender.morale - 16);
            group.strength = Math.max(0, group.strength - (group.air ? 3 : 9));
            group.morale = Math.max(0, group.morale - 8);
            group.status = order.type === 'strike' ? 'Returning to base' : 'Engaged';
            defender.status = 'Under attack';
            next.damage = Math.min(3, next.damage + 1);
            fought.add(group.id);
            fought.add(defender.id);
            note(
                `${group.name} ${order.type === 'strike' ? 'strikes' : 'attacks'} ${defender.name} (−${damage}% strength).`,
            );
            retreat(defender, group);
            retreat(group, defender);
            if (group.air) group.order = null;
            continue;
        }
        if (order.type === 'strike') {
            group.order = null;
            group.status = 'Target gone';
            note(`${group.name}: strike cancelled; target moved.`);
            continue;
        }
        useFuel(group);
        group.cellId = nextId;
        group.progress = Math.max(0, group.progress - next.movementCost);
        order.path.shift();
        group.status = 'Moving';
        if (!group.air) next.controllerId = group.nationId;
        if (order.path.length === 1) {
            group.order = null;
            group.status = 'Holding';
            note(`${group.name} reached its destination.`);
        }
    }
    military.events = [...events.reverse(), ...military.events].slice(0, 12);
    return events;
}
