import { axialKey, neighborCoordinates } from './hex.js';

export const FEATURE_LAYERS = {
    ocean: 'oceanNames',
    river: 'riverNames',
    continent: 'continentNames',
    island: 'islandNames',
    mountain: 'mountainNames',
    lake: 'lakeNames',
};
export const FEATURE_TITLES = {
    ocean: 'Ocean / sea',
    river: 'River',
    continent: 'Continent',
    island: 'Island',
    mountain: 'Mountain range',
    lake: 'Lake',
};

function components(model, accepts) {
    const unseen = new Set(model.cells.filter(accepts).map((c) => c.id)),
        result = [];
    for (const start of unseen) {
        const ids = [start];
        unseen.delete(start);
        for (let i = 0; i < ids.length; i++) {
            const cell = model.cellById.get(ids[i]);
            for (const p of neighborCoordinates(cell.q, cell.r)) {
                const id = axialKey(p.q, p.r);
                if (unseen.delete(id)) ids.push(id);
            }
        }
        result.push(ids.sort());
    }
    return result;
}

function areaFeature(model, ids, id, type, name) {
    const cells = ids.map((key) => model.cellById.get(key));
    const centre = cells.reduce((p, c) => ({ x: p.x + c.x / cells.length, y: p.y + c.y / cells.length }), {
        x: 0,
        y: 0,
    });
    const distance = (c) => Math.hypot(c.x - centre.x, c.y - centre.y);
    const anchor = cells.reduce((best, c) => (distance(c) < distance(best) ? c : best));
    return {
        id,
        type,
        name,
        cellIds: ids,
        area: ids.length / model.cellCount,
        anchorId: anchor.id,
        anchor: { x: anchor.x, y: anchor.y },
        relations: [],
    };
}

// Pure derived geography: no writes to cells, generation settings or political regions.
export function createAreaFeatures(model, nameFor, continentMinimum = 20) {
    const landmasses = components(model, (c) => c.terrain !== 'ocean')
        .map((ids) => {
            // Inland water belongs to the containing landmass but does not count as land area.
            const landArea =
                ids.filter((id) => model.cellById.get(id).terrain !== 'lake').length / model.cellCount;
            const type = landArea >= continentMinimum ? 'continent' : 'island';
            const id = `landmass-${ids[0]}`;
            return {
                ...areaFeature(
                    model,
                    ids,
                    id,
                    type,
                    nameFor('landmass')(id, type === 'continent' ? 'Continent' : 'Island'),
                ),
                landArea,
            };
        })
        .filter((f) => f.landArea > 0);
    const landmassByCell = new Map(landmasses.flatMap((f) => f.cellIds.map((id) => [id, f.id])));
    const attachLandmass = (feature) => {
        const parents = new Set(feature.cellIds.map((id) => landmassByCell.get(id)).filter(Boolean));
        for (const id of parents) feature.relations.push({ type: 'part-of', featureId: id });
        return feature;
    };
    // High terrain joins across elevated saddles, never across low plains or water.
    const mountains = components(model, (c) => !['ocean', 'lake'].includes(c.terrain) && c.elevation >= 650)
        .filter(
            (ids) =>
                ids.length / model.cellCount >= 0.35 &&
                ids.some((id) => model.cellById.get(id).elevation > 900),
        )
        .map((ids) => {
            const id = `range-${ids[0]}`;
            return attachLandmass(areaFeature(model, ids, id, 'mountain', nameFor('mountain')(id, 'Range')));
        });
    const lakes = components(model, (c) => c.terrain === 'lake').map((ids) => {
        const id = `named-lake-${ids[0]}`;
        return attachLandmass(areaFeature(model, ids, id, 'lake', nameFor('lake')(id, 'Lake')));
    });
    return { landmasses, mountains, lakes };
}

export function relateLakes(model, lakes, rivers, riverByEdge) {
    const lakeByCell = new Map(lakes.flatMap((l) => l.cellIds.map((id) => [id, l.id])));
    const touches = (point) =>
        new Set(
            (point?.links ?? []).flatMap((link) =>
                link.edge.cellIds.map((id) => lakeByCell.get(id)).filter(Boolean),
            ),
        );
    const outgoing = new Map([...model.riverEdges.values()].map((e) => [e.fromId, e]));
    const contacts = new Map(lakes.map((l) => [l.id, new Map()]));
    const record = (lakeId, riverId, direction, flow) => {
        if (!riverId) return;
        const entries = contacts.get(lakeId);
        if (!entries.has(riverId)) entries.set(riverId, { flow: 0, directions: new Set() });
        const entry = entries.get(riverId);
        entry.flow = Math.max(entry.flow, flow);
        entry.directions.add(direction);
    };
    // Walk only hidden drainage links between visible reaches. Memoize paths to keep
    // tributaries sharing a lake exit from repeatedly traversing the same basin.
    const memo = new Map();
    const hidden = (start) => {
        let id = start;
        const path = [],
            seen = new Set();
        while (id && !outgoing.has(id) && !memo.has(id) && !seen.has(id)) {
            seen.add(id);
            path.push(id);
            id = model.drainage.vertices.get(id)?.downstream?.vertex.id;
        }
        let result = memo.get(id) ?? {
            lakes: new Set(touches(model.drainage.vertices.get(id))),
            next: outgoing.get(id),
        };
        for (let i = path.length - 1; i >= 0; i--) {
            result = {
                lakes: new Set([...result.lakes, ...touches(model.drainage.vertices.get(path[i]))]),
                next: result.next,
            };
            memo.set(path[i], result);
        }
        return result;
    };
    for (const edge of model.riverEdges.values()) {
        const riverId = riverByEdge.get(edge.id);
        for (const lakeId of touches(model.drainage.vertices.get(edge.fromId)))
            record(lakeId, riverId, 'outlet', edge.flow);
        const path = hidden(edge.toId);
        for (const lakeId of path.lakes) {
            record(lakeId, riverId, 'inlet', edge.flow);
            if (path.next) record(lakeId, riverByEdge.get(path.next.id), 'outlet', path.next.flow);
        }
    }
    const riverById = new Map(rivers.map((r) => [r.id, r])),
        used = new Set();
    for (const lake of lakes) {
        const candidates = [...contacts.get(lake.id)].sort(
            (a, b) => b[1].flow - a[1].flow || a[0].localeCompare(b[0]),
        );
        for (const [featureId, entry] of candidates)
            for (const direction of entry.directions) lake.relations.push({ type: direction, featureId });
        const main = candidates[0];
        // Keep an independent name when no river is connected or dominance is ambiguous.
        if (main && (!candidates[1] || main[1].flow > candidates[1][1].flow * 1.25)) {
            lake.namedAfterId = main[0];
            const base = riverById.get(main[0]).name.replace(/ River$/, '');
            lake.name = `${base} Lake`;
        }
        const base = lake.name.replace(/ Lake$/, '');
        let n = 2;
        while (used.has(lake.name)) lake.name = `${base} ${n++} Lake`;
        used.add(lake.name);
    }
}

export function buildFeatureRegistry(model, atlas, areas) {
    const features = [
        ...atlas.oceans.map((o) => ({
            ...o,
            type: 'ocean',
            anchor: { x: model.cellById.get(o.anchorId).x, y: model.cellById.get(o.anchorId).y },
            relations: [],
        })),
        ...atlas.rivers.map((r) => ({
            ...r,
            anchor: { x: r.anchor.x, y: r.anchor.y },
            type: 'river',
            cellIds: [...new Set(r.edgeIds.flatMap((id) => model.riverEdges.get(id).cellIds))],
            relations: r.tributaryOf ? [{ type: 'tributary-of', featureId: r.tributaryOf }] : [],
        })),
        ...areas.landmasses,
        ...areas.mountains,
        ...areas.lakes,
    ];
    const featureById = new Map(features.map((f) => [f.id, f])),
        featuresByCell = new Map();
    for (const feature of features) {
        for (const id of feature.cellIds) {
            if (!featuresByCell.has(id)) featuresByCell.set(id, []);
            featuresByCell.get(id).push(feature.id);
        }
        for (const relation of feature.relations) {
            const target = featureById.get(relation.featureId);
            if (target && ['inlet', 'outlet'].includes(relation.type))
                target.relations.push({
                    type: relation.type === 'inlet' ? 'flows-into' : 'flows-from',
                    featureId: feature.id,
                });
        }
    }
    return { features, featureById, featuresByCell };
}
