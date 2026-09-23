import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createCartography, createOceans, createRiverNames } from '../../resources/js/map-lab/cartography.js';
import { createNaturalResources, RESOURCE_KINDS } from '../../resources/js/map-lab/natural-resources.js';
import { createEconomy, updateOilSubstrate, recordOilUse } from '../../resources/js/map-lab/economy.js';
import { axialKey, neighborCoordinates } from '../../resources/js/map-lab/hex.js';
import { createAreaFeatures, relateLakes } from '../../resources/js/map-lab/geographic-features.js';

const terrain = (m) =>
    JSON.stringify(
        m.cells.map((c) => [c.id, c.terrain, c.elevation, c.population, c.controllerId, c.damage]),
    );
test('river identity follows the higher-flow branch through a confluence and an unrendered lake gap', () => {
    const vertices = new Map(['a', 'b', 'j', 'lake', 'exit', 'sea'].map((id, i) => [id, { id, x: i, y: i }]));
    for (const [a, b] of [
        ['a', 'j'],
        ['b', 'j'],
        ['j', 'lake'],
        ['lake', 'exit'],
        ['exit', 'sea'],
    ])
        vertices.get(a).downstream = { vertex: vertices.get(b) };
    const riverEdges = new Map([
        ['a-j', { id: 'a-j', fromId: 'a', toId: 'j', flow: 5 }],
        ['b-j', { id: 'b-j', fromId: 'b', toId: 'j', flow: 2 }],
        ['j-lake', { id: 'j-lake', fromId: 'j', toId: 'lake', flow: 7 }],
        ['exit-sea', { id: 'exit-sea', fromId: 'exit', toId: 'sea', flow: 7 }],
    ]);
    const atlas = createRiverNames({
        geography: { settings: { seed: 'test' } },
        drainage: { vertices },
        riverEdges,
        cellCount: 19,
    });
    assert.equal(atlas.rivers.length, 2);
    const main = atlas.riverById.get(atlas.riverByEdge.get('exit-sea'));
    assert.deepEqual(main.edgeIds, ['a-j', 'j-lake', 'exit-sea']);
    const tributary = atlas.riverById.get(atlas.riverByEdge.get('b-j'));
    assert.equal(tributary.tributaryOf, main.id);
    assert.equal(main.segments.length, 3); // No invented line across the hidden lake link.
});
const checkOceans = (model, atlas) => {
    assert.equal(atlas.oceanByCell.size, model.cells.filter((c) => c.terrain === 'ocean').length);
    assert.equal(new Set(atlas.oceans.map((o) => o.name)).size, atlas.oceans.length);
    for (const ocean of atlas.oceans) {
        assert.equal(atlas.oceanByCell.get(ocean.anchorId), ocean.id);
        const visited = new Set([ocean.anchorId]),
            queue = [ocean.anchorId];
        for (let i = 0; i < queue.length; i++) {
            const cell = model.cellById.get(queue[i]);
            assert.equal(cell.terrain, 'ocean');
            for (const p of neighborCoordinates(cell.q, cell.r)) {
                const id = axialKey(p.q, p.r);
                if (!visited.has(id) && atlas.oceanByCell.get(id) === ocean.id) {
                    visited.add(id);
                    queue.push(id);
                }
            }
        }
        assert.equal(visited.size, ocean.cellIds.length, `${ocean.name} must be connected`);
    }
};
test('ocean membership is total, disjoint, connected, repeatable and labels stay in their own water', () => {
    for (const density of [7, 19, 37]) {
        const model = createMapLabModel(density, 'world'),
            before = terrain(model);
        const atlas = createCartography(model);
        assert.equal(new Set(atlas.features.map((f) => f.id)).size, atlas.features.length);
        assert.deepEqual(createCartography(model), atlas);
        for (const feature of atlas.features) {
            assert.ok(feature.cellIds.length);
            if (feature.anchorId) assert.ok(feature.cellIds.includes(feature.anchorId));
            for (const relation of feature.relations) assert.ok(atlas.featureById.has(relation.featureId));
            for (const id of feature.cellIds) assert.ok(atlas.featuresByCell.get(id).includes(feature.id));
        }
        for (const cell of model.cells) {
            const features = (atlas.featuresByCell.get(cell.id) ?? []).map((id) => atlas.featureById.get(id));
            assert.equal(
                features.filter((f) => ['continent', 'island'].includes(f.type)).length,
                cell.terrain === 'ocean' ? 0 : 1,
            );
            assert.equal(features.filter((f) => f.type === 'lake').length, cell.terrain === 'lake' ? 1 : 0);
        }
        const reclassified = createCartography(model, { continentMinimum: 80 });
        assert.deepEqual(
            reclassified.landmasses.map((f) => [f.id, f.cellIds]),
            atlas.landmasses.map((f) => [f.id, f.cellIds]),
        );
        assert.deepEqual(reclassified.mountains, atlas.mountains);
        assert.deepEqual(reclassified.rivers, atlas.rivers);
        assert.deepEqual(reclassified.oceans, atlas.oceans);
        checkOceans(model, atlas);
        assert.deepEqual(createOceans(model).oceans, atlas.oceans);
        assert.equal(atlas.riverByEdge.size, model.riverEdges.size);
        const used = new Set();
        for (const river of atlas.rivers) {
            for (const id of river.edgeIds) {
                assert.ok(!used.has(id));
                used.add(id);
            }
            if (river.tributaryOf) assert.ok(atlas.riverById.has(river.tributaryOf));
            assert.ok(river.anchor && river.segments.length === river.edgeIds.length);
        }
        assert.equal(new Set(atlas.rivers.map((r) => r.name)).size, atlas.rivers.length);
        assert.equal(terrain(model), before);
    }
});
test('area identity overlaps, connects elevated saddles, and classifies by normalized land area', () => {
    const cells = Array.from({ length: 7 }, (_, q) => ({
        id: `${q},0`,
        q,
        r: 0,
        x: q,
        y: 0,
        terrain: q === 5 ? 'lake' : 'plains',
        elevation: [1100, 700, 1200, 200, 1000, 0, 100][q],
    }));
    const model = { cells, cellById: new Map(cells.map((c) => [c.id, c])), cellCount: 2 };
    const nameFor = (type) => (id, suffix) => `${type}-${id} ${suffix}`;
    const a = createAreaFeatures(model, nameFor, 3);
    assert.equal(a.landmasses.length, 1);
    assert.equal(a.landmasses[0].type, 'continent');
    assert.equal(a.landmasses[0].landArea, 3);
    assert.equal(a.mountains.length, 2);
    assert.deepEqual(a.mountains[0].cellIds, ['0,0', '1,0', '2,0']);
    assert.equal(a.lakes[0].relations[0].featureId, a.landmasses[0].id);
    assert.equal(a.mountains[0].relations[0].featureId, a.landmasses[0].id);
    const b = createAreaFeatures({ ...model, cellCount: 4 }, nameFor, 3);
    assert.equal(b.landmasses[0].type, 'island');
    assert.equal(b.landmasses[0].id, a.landmasses[0].id);
});

test('lake names follow connected dominant drainage, retain tributaries, and do not invent outlets', () => {
    const vertices = new Map(
        ['a', 'b', 'wet', 'exit', 'sea', 'isolated'].map((id) => [id, { id, links: [] }]),
    );
    const contact = { cellIds: ['lake-cell'] };
    vertices.get('wet').links = [{ edge: contact }];
    vertices.get('wet').downstream = { vertex: vertices.get('exit') };
    const riverEdges = new Map([
        ['main-in', { id: 'main-in', fromId: 'a', toId: 'wet', flow: 10 }],
        ['side-in', { id: 'side-in', fromId: 'b', toId: 'wet', flow: 2 }],
        ['main-out', { id: 'main-out', fromId: 'exit', toId: 'sea', flow: 12 }],
    ]);
    const model = { riverEdges, drainage: { vertices } };
    const rivers = [
        { id: 'main', name: 'Velora River' },
        { id: 'side', name: 'Tarn River' },
    ];
    const byEdge = new Map([
        ['main-in', 'main'],
        ['main-out', 'main'],
        ['side-in', 'side'],
    ]);
    const makeLakes = () => [
        { id: 'lake', name: 'Original Lake', cellIds: ['lake-cell'], relations: [] },
        { id: 'remote', name: 'Remote Lake', cellIds: ['remote-cell'], relations: [] },
    ];
    let lakes = makeLakes();
    relateLakes(model, lakes, rivers, byEdge);
    assert.equal(lakes[0].name, 'Velora Lake');
    assert.ok(lakes[0].relations.some((r) => r.type === 'inlet' && r.featureId === 'side'));
    assert.ok(lakes[0].relations.some((r) => r.type === 'outlet' && r.featureId === 'main'));
    assert.equal(lakes[1].name, 'Remote Lake');
    assert.deepEqual(lakes[1].relations, []);
    const collision = makeLakes();
    collision[1].name = 'Velora Lake';
    relateLakes(model, collision, rivers, byEdge);
    assert.equal(new Set(collision.map((l) => l.name)).size, 2);
    riverEdges.delete('main-out');
    vertices.get('wet').downstream = null;
    lakes = makeLakes();
    relateLakes(model, lakes, rivers, byEdge);
    assert.equal(lakes[0].name, 'Velora Lake');
    assert.ok(!lakes[0].relations.some((r) => r.type === 'outlet'));
    riverEdges.get('side-in').flow = 10;
    lakes = makeLakes();
    relateLakes(model, lakes, rivers, byEdge);
    assert.equal(lakes[0].name, 'Original Lake');
    assert.equal(rivers[1].name, 'Tarn River');
});
test('ocean partition handles different seeds, small crops, and no ocean', () => {
    for (const seed of ['riverlands', 'polar-4', 'atlas-5', 'atlas-8', 'atlas-10']) {
        const model = createMapLabModel(7, 'world', { seed });
        checkOceans(model, createOceans(model));
    }
    const crop = createMapLabModel(19, 'scenario');
    checkOceans(crop, createOceans(crop));
    const empty = createOceans({ ...crop, cells: crop.cells.filter((c) => c.terrain !== 'ocean') });
    assert.equal(empty.oceanByCell.size, 0);
});
test('natural stock is seeded, independent of ownership, area normalized and richness scales without moving fields', () => {
    const model = createMapLabModel(19, 'world'),
        before = terrain(model);
    const resources = createNaturalResources(model),
        repeat = createNaturalResources(model),
        rich = createNaturalResources(model, { richness: 200 });
    assert.deepEqual(resources, repeat);
    const none = createNaturalResources(model, { abundance: 0 });
    for (const kind of RESOURCE_KINDS) {
        assert.equal(none.totals[kind].quantity, 0);
        assert.equal(rich.totals[kind].sites, resources.totals[kind].sites);
        assert.ok(Math.abs(rich.totals[kind].quantity - resources.totals[kind].quantity * 2) < 1e-6);
        assert.ok(resources.totals[kind].quantity > 0);
    }
    for (const cell of model.cells) {
        const entry = resources.cells.get(cell.id);
        for (const kind of RESOURCE_KINDS) {
            assert.ok(entry[kind].accessible >= 0 && entry[kind].accessible <= entry[kind].quantity);
            assert.ok(
                Math.abs(
                    entry[kind].quantity * model.cellCount -
                        entry[kind].density * (kind === 'Timber' ? 800 : 1200),
                ) < 1e-7,
            );
        }
        if (cell.vegetation !== 'forest') assert.equal(entry.Timber.quantity, 0);
        if (['ocean', 'lake'].includes(cell.terrain))
            for (const kind of ['Iron', 'Copper', 'Coal', 'Timber']) assert.equal(entry[kind].quantity, 0);
    }
    assert.equal(terrain(model), before);
    for (const region of model.regions) region.ownerId = 'other';
    for (const cell of model.cells) cell.politicalOwnerId = 'other';
    assert.deepEqual(createNaturalResources(model), resources);
    for (const density of [7, 37]) {
        const another = createNaturalResources(createMapLabModel(density, 'world'));
        assert.deepEqual(another.basins, resources.basins);
        assert.ok(another.totals.Oil.quantity / resources.totals.Oil.quantity > 0.8);
        assert.ok(another.totals.Oil.quantity / resources.totals.Oil.quantity < 1.2);
    }
});
test('onshore economic oil uses the survey substrate and reconfiguration preserves stocks and costs', () => {
    const model = createMapLabModel(19, 'world'),
        substrate = createNaturalResources(model);
    const economy = createEconomy(model, substrate);
    for (const district of economy.districts)
        for (const site of district.sites)
            assert.equal(site.Oil.slots > 0, substrate.cells.get(site.cellId).Oil.quantity > 0);
    recordOilUse(economy, 'sable', 12);
    const stocks = structuredClone(economy.accounts);
    updateOilSubstrate(economy, model, createNaturalResources(model, { abundance: 0 }));
    assert.deepEqual(economy.accounts, stocks);
    assert.equal(economy.pendingOil.sable, 12);
    for (const totals of Object.values(economy.totals)) assert.equal(totals.Oil.production, 0);
});
