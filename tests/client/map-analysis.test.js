import test from 'node:test';
import assert from 'node:assert/strict';
import {
    territoryValues,
    availableLayers,
    resourcesFor,
    geographyValues,
} from '../../resources/js/client/ui/map/analysis/data.js';
import { analysisStyle, palettes } from '../../resources/js/client/ui/map/analysis/palettes.js';
const model = {
    resourceProfiles: [
        { key: 'food', method: 'agriculture' },
        { key: 'oil', method: 'deposit' },
        { key: 'copper', method: 'deposit' },
    ],
    cells: [],
};
const snapshot = {
    setup: { nation_id: 7 },
    territories: [
        {
            territory_id: 1,
            owner_nation_id: 7,
            stats: [
                { title: 'Population', value: 1000 },
                { title: 'Land area', value: 100 },
            ],
            loyalties: [{ nation_id: 7, loyalty_ratio: 0.4 }],
        },
        {
            territory_id: 2,
            owner_nation_id: 8,
            stats: [
                { title: 'Population', value: 4000 },
                { title: 'Land area', value: 200 },
            ],
        },
        {
            territory_id: 3,
            owner_nation_id: null,
            stats: [
                { title: 'Population', value: 0, unit: 'Unknown' },
                { title: 'Land area', value: 0 },
            ],
        },
    ],
    nation: {
        definitions: {
            resources: [
                { resource_key: 'food', can_produce: true },
                { resource_key: 'oil', can_produce: true },
                { resource_key: 'engines', can_produce: true },
            ],
        },
        budget: {
            labor_facility_allocations: [{ territory_id: 1, resource_key: 'oil', production: '12.000000' }],
            labor_pools: [{ territory_id: 1, free_labor: 25 }],
        },
        economy: {
            territories: [
                { id: 1, state: { infrastructure: 0.65, capacity: 1.2, unrest: 0.1, informal: 0.3 } },
            ],
            last_season: {
                territories: [
                    { id: 1, population: 500, income: 100, tax: 25 },
                    { id: 2, population: 500, income: 200, tax: 25 },
                ],
            },
        },
        divisions: [{ territory_id: 1 }],
    },
};
test('current Land area contract supplies density without revealing unknown population', () => {
    assert.deepEqual(
        [...territoryValues(snapshot, 'density').values],
        [
            [1, 10],
            [2, 20],
            [3, null],
        ],
    );
    assert.equal(territoryValues(snapshot, 'population').values.get(3), null);
});
test('regional state and flows use real fields, ownership and historical population', () => {
    for (const [id, value] of [
        ['infrastructure', 0.65],
        ['capacity', 1.2],
        ['income', 100],
        ['netIncome', 0.15],
        ['workers', 25],
        ['production', 12],
        ['loyalty', 0.4],
        ['forces', 1],
    ]) {
        const { values } = territoryValues(snapshot, id, 'oil');
        assert.equal(values.get(1), value, id);
        assert.equal(values.get(2), null, id);
    }
    const empty = structuredClone(snapshot);
    delete empty.nation.budget.labor_facility_allocations;
    assert.equal(territoryValues(empty, 'production', 'oil').values.get(1), null);
});
test('resource choices are catalogue/profile intersections; Food is not a mineral deposit', () => {
    assert.deepEqual(
        resourcesFor(model, snapshot, 'deposits').map((r) => r.key),
        ['oil'],
    );
    assert.deepEqual(
        resourcesFor(model, snapshot, 'potential').map((r) => r.key),
        ['food', 'oil'],
    );
    assert.deepEqual(
        resourcesFor(model, snapshot, 'production').map((r) => r.key),
        ['food', 'oil', 'engines'],
    );
    const publicOnly = { territories: [], resource_definitions: snapshot.nation.definitions.resources };
    assert.ok(availableLayers(model, publicOnly, true).some((l) => l.id === 'potential'));
    assert.ok(availableLayers(model, publicOnly, true).every((l) => l.source === 'geography'));
    const noEconomy = structuredClone(snapshot);
    delete noEconomy.nation.economy;
    assert.ok(!availableLayers(model, noEconomy).some((l) => l.id === 'infrastructure' || l.id === 'income'));
    assert.ok(!availableLayers(model, snapshot).some((l) => ['basin', 'flow', 'guard'].includes(l.id)));
});
test('geography distinguishes water exclusions, missing deposits and zero potential', () => {
    const m = {
        cells: [
            { id: 'a', terrain: 'plains', agriculturalSuitability: 0.7 },
            { id: 'b', terrain: 'ocean', baseElevation: -500, resourcePotential: { oil: { capacity: 0.4 } } },
        ],
    };
    assert.deepEqual(
        [...geographyValues(m, { id: 'fertility' }, 'food')],
        [
            ['a', 0.7],
            ['b', null],
        ],
    );
    assert.deepEqual(
        [...geographyValues(m, { id: 'potential' }, 'oil')],
        [
            ['a', 0],
            ['b', 0.4],
        ],
    );
    assert.equal(geographyValues(m, { id: 'potential' }, 'oil', { ocean: false }).get('b'), null);
});
test('palettes use meaningful distinct families and align endpoints with legend', () => {
    const v = new Map([
        [1, 0],
        [2, 0.5],
        [3, 1],
    ]);
    const population = analysisStyle({ id: 'population', scale: 'adaptive' }, v);
    const income = analysisStyle({ id: 'income', scale: 'adaptive' }, v);
    assert.notDeepEqual(population.colours, income.colours);
    assert.equal(population.colour(1), palettes.population.at(-1));
    assert.equal(population.colour(null), null);
    const temperature = analysisStyle({ id: 'temperature', scale: 'index' }, v);
    assert.equal(temperature.colour(0.5), palettes.temperature[1]);
});
