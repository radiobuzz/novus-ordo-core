import { axialKey, neighborCoordinates } from './hex.js';
import { createAreaFeatures, relateLakes, buildFeatureRegistry } from './geographic-features.js';

export function featureHash(value) {
    let n = 2166136261;
    for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    n = Math.imul(n ^ (n >>> 16), 2246822507);
    n = Math.imul(n ^ (n >>> 13), 3266489909);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
}
const roots = [
    'Aster',
    'Veyra',
    'Orien',
    'Neral',
    'Selka',
    'Istren',
    'Talven',
    'Evara',
    'Meren',
    'Calda',
    'Varda',
    'Lyris',
    'Solen',
    'Arden',
    'Tirra',
    'Osven',
];
const endings = ['a', 'is', 'en', 'ora', 'al', 'eth', 'une', 'ara'];
function names(seed) {
    const used = new Set();
    return (id, suffix) => {
        const hash = featureHash(`${seed}:${id}`);
        const base =
            roots[Math.floor(hash * roots.length)] +
            endings[Math.floor(featureHash(id + seed) * endings.length)];
        let name = `${base} ${suffix}`,
            n = 2;
        while (used.has(name)) name = `${base} ${n++} ${suffix}`;
        used.add(name);
        return name;
    };
}

// Stable min-heap: equal costs retain insertion order, independent of sort engines.
class Queue {
    items = [];
    sequence = 0;
    earlier(a, b) {
        return a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq);
    }
    push(entry) {
        entry.seq = this.sequence++;
        let i = this.items.length;
        this.items.push(entry);
        while (i) {
            const parent = (i - 1) >> 1;
            if (!this.earlier(entry, this.items[parent])) break;
            this.items[i] = this.items[parent];
            i = parent;
        }
        this.items[i] = entry;
    }
    pop() {
        const first = this.items[0],
            last = this.items.pop();
        if (this.items.length) {
            let i = 0;
            while (2 * i + 1 < this.items.length) {
                let child = 2 * i + 1;
                if (child + 1 < this.items.length && this.earlier(this.items[child + 1], this.items[child]))
                    child++;
                if (!this.earlier(this.items[child], last)) break;
                this.items[i] = this.items[child];
                i = child;
            }
            this.items[i] = last;
        }
        return first;
    }
}

export function createOceans(model) {
    const water = model.cells.filter((cell) => cell.terrain === 'ocean');
    const cells = new Map(water.map((cell) => [cell.id, cell]));
    const adjacent = new Map(
        water.map((cell) => [
            cell.id,
            neighborCoordinates(cell.q, cell.r)
                .map((p) => axialKey(p.q, p.r))
                .filter((id) => cells.has(id)),
        ]),
    );
    const clearance = new Map(),
        shoreQueue = [];
    for (const cell of water) {
        const nearLand = neighborCoordinates(cell.q, cell.r).some((p) => {
            const other = model.cellById.get(axialKey(p.q, p.r));
            return other && other.terrain !== 'ocean';
        });
        if (nearLand) {
            clearance.set(cell.id, 0);
            shoreQueue.push(cell.id);
        }
    }
    for (let i = 0; i < shoreQueue.length; i++)
        for (const id of adjacent.get(shoreQueue[i])) {
            if (clearance.has(id)) continue;
            clearance.set(id, clearance.get(shoreQueue[i]) + 1);
            shoreQueue.push(id);
        }
    // Clearance is area-normalized; a finer micro-grid should not erase strait resistance.
    const radius = Math.sqrt(model.cellCount),
        depth = (id) => (clearance.get(id) ?? radius * 4) / radius;
    const step = (a, b) => 1 + 3 / (0.3 + Math.min(depth(a), depth(b)));
    const flood = (seeds) => {
        const distance = new Map(),
            owners = new Map(),
            queue = new Queue();
        for (const [owner, id] of seeds.entries()) {
            distance.set(id, 0);
            owners.set(id, owner);
            queue.push({ id, cost: 0, owner });
        }
        while (queue.items.length) {
            const current = queue.pop();
            if (distance.get(current.id) !== current.cost || owners.get(current.id) !== current.owner)
                continue;
            for (const id of adjacent.get(current.id)) {
                const cost = current.cost + step(current.id, id);
                if (cost >= (distance.get(id) ?? Infinity)) continue;
                distance.set(id, cost);
                owners.set(id, current.owner);
                queue.push({ id, cost, owner: current.owner });
            }
        }
        return { distance, owners };
    };
    const seen = new Set(),
        oceans = [],
        oceanByCell = new Map(),
        name = names(model.geography.settings.seed);
    for (const cell of water) {
        if (seen.has(cell.id)) continue;
        const component = [cell.id];
        seen.add(cell.id);
        for (let i = 0; i < component.length; i++)
            for (const id of adjacent.get(component[i])) {
                if (!seen.has(id)) {
                    seen.add(id);
                    component.push(id);
                }
            }
        const count = Math.max(1, Math.min(5, Math.round(component.length / model.cellCount / 80)));
        const choose = (score) =>
            component.reduce((best, id) => (score(id) > score(best) ? id : best), component[0]);
        const seeds = [choose((id) => depth(id))];
        let distances = flood(seeds);
        while (seeds.length < count) {
            seeds.push(choose((id) => distances.distance.get(id) * (0.4 + Math.min(2, depth(id)))));
            distances = flood(seeds);
        }
        for (let i = 0; i < seeds.length; i++) {
            const ids = component.filter((id) => distances.owners.get(id) === i);
            const area = ids.length / model.cellCount;
            const ocean = {
                id: `ocean-${oceans.length + 1}`,
                cellIds: ids,
                area,
                kind: area < 25 ? 'Sea' : 'Ocean',
            };
            ocean.name = name(ocean.id, ocean.kind);
            const centre = ids.reduce(
                (p, id) => ({ x: p.x + cells.get(id).x / ids.length, y: p.y + cells.get(id).y / ids.length }),
                { x: 0, y: 0 },
            );
            // Constrained centre: never put the label on land or a different ocean.
            const score = (id) =>
                Math.hypot(cells.get(id).x - centre.x, cells.get(id).y - centre.y) /
                    (model.cellSize * radius) +
                1.8 / (0.3 + depth(id));
            ocean.anchorId = ids.reduce((best, id) => (score(id) < score(best) ? id : best), ids[0]);
            for (const id of ids) oceanByCell.set(id, ocean.id);
            oceans.push(ocean);
        }
    }
    return { oceans, oceanByCell, oceanById: new Map(oceans.map((o) => [o.id, o])) };
}

export function createRiverNames(model) {
    const edges = model.riverEdges,
        outgoing = new Map([...edges.values()].map((e) => [e.fromId, e]));
    const nextAt = new Map();
    // Follow actual drainage through unrendered links (including lake gaps), not nearest geometry.
    const nextVisible = (start) => {
        let id = start;
        const path = [];
        while (id && !nextAt.has(id) && !outgoing.has(id)) {
            path.push(id);
            id = model.drainage.vertices.get(id)?.downstream?.vertex.id;
        }
        const result = outgoing.get(id) ?? nextAt.get(id) ?? null;
        for (const key of path) nextAt.set(key, result);
        return result;
    };
    const incoming = new Map(),
        downstream = new Map();
    for (const edge of edges.values()) {
        const next = nextVisible(edge.toId);
        downstream.set(edge.id, next?.id ?? null);
        if (next) {
            if (!incoming.has(next.id)) incoming.set(next.id, []);
            incoming.get(next.id).push(edge);
        }
    }
    const dominant = new Map(
        [...incoming].map(([id, branches]) => [
            id,
            branches.sort((a, b) => b.flow - a.flow || a.id.localeCompare(b.id))[0].id,
        ]),
    );
    const riverByEdge = new Map(),
        rivers = [],
        name = names(model.geography.settings.seed + ':rivers');
    const terminals = [...edges.values()]
        .filter((e) => !downstream.get(e.id) || dominant.get(downstream.get(e.id)) !== e.id)
        .sort((a, b) => b.flow - a.flow || a.id.localeCompare(b.id));
    for (const terminal of terminals) {
        const river = {
            id: `course-${rivers.length + 1}`,
            name: '',
            edgeIds: [],
            flow: terminal.flow,
            tributaryOf: null,
            points: [],
        };
        river.name = name(river.id, 'River');
        let id = terminal.id;
        while (id && !riverByEdge.has(id)) {
            river.edgeIds.push(id);
            riverByEdge.set(id, river.id);
            id = dominant.get(id);
        }
        river.edgeIds.reverse();
        river.length = river.edgeIds.length / Math.sqrt(model.cellCount);
        river.anchor = model.drainage.vertices.get(
            edges.get(river.edgeIds[Math.floor(river.edgeIds.length / 2)]).fromId,
        );
        river.downstreamEdge = downstream.get(terminal.id);
        // Keep actual edge geometry separate: a hidden lake gap must not become a straight river stroke.
        river.segments = river.edgeIds.map((key) => {
            const e = edges.get(key),
                a = model.drainage.vertices.get(e.fromId),
                b = model.drainage.vertices.get(e.toId);
            return [
                { x: a.x, y: a.y },
                { x: b.x, y: b.y },
            ];
        });
        rivers.push(river);
    }
    for (const river of rivers) river.tributaryOf = riverByEdge.get(river.downstreamEdge) ?? null;
    return { rivers, riverByEdge, riverById: new Map(rivers.map((r) => [r.id, r])) };
}

export function createCartography(model, options = {}) {
    const atlas = { ...createOceans(model), ...createRiverNames(model) };
    const requested = Number(options.continentMinimum ?? 20);
    const continentMinimum = Number.isFinite(requested) ? Math.max(1, Math.min(200, requested)) : 20;
    const factories = new Map();
    const nameFor = (type) => {
        if (!factories.has(type)) factories.set(type, names(`${model.geography.settings.seed}:${type}`));
        return factories.get(type);
    };
    const areas = createAreaFeatures(model, nameFor, continentMinimum);
    relateLakes(model, areas.lakes, atlas.rivers, atlas.riverByEdge);
    return {
        ...atlas,
        ...areas,
        ...buildFeatureRegistry(model, atlas, areas),
        settings: { continentMinimum },
    };
}
