import test from 'node:test';
import assert from 'node:assert/strict';
import {
    projectLoyalty,
    projectPopulationDensity,
    projectResourceProduction,
} from '../../resources/js/client/ui/map/mapAnalysis.js';

const snapshot = {
    setup: { nation_id: 7 },
    nation: {
        definitions: { labor_per_unit: 1_000_000 },
        budget: {
            labor_facility_allocations: [
                {
                    territory_id: 1,
                    resource_type: 'Oil',
                    production: 7_000_000,
                },
                {
                    territory_id: 1,
                    resource_type: 'Oil',
                    production: 5_000_000,
                },
                {
                    territory_id: 2,
                    resource_type: 'Oil',
                    production: 50_000_000,
                },
            ],
        },
    },
    territories: [
        {
            territory_id: 1,
            terrain_type: 'Plain',
            owner_nation_id: 7,
            stats: [
                { title: 'Area', value: 100, unit: 'Km2' },
                { title: 'Population', value: 1_000, unit: 'WholeNumber' },
            ],
            owner_production: { Oil: 99 },
            loyalties: [{ nation_id: 7, loyalty_ratio: 0.4 }],
        },
        {
            territory_id: 2,
            terrain_type: 'Forest',
            owner_nation_id: 8,
            stats: [
                { title: 'Area', value: 200, unit: 'Km2' },
                { title: 'Population', value: 4_000, unit: 'WholeNumber' },
            ],
            owner_production: { Oil: 50 },
            loyalties: [{ nation_id: 8, loyalty_ratio: 0.9 }],
        },
        {
            territory_id: 3,
            terrain_type: 'Plain',
            owner_nation_id: null,
            stats: [
                { title: 'Area', value: 100, unit: 'Km2' },
                { title: 'Population', value: 0, unit: 'Unknown' },
            ],
            owner_production: null,
            loyalties: [],
        },
    ],
};

test('population density includes known foreign population and excludes unknown territory', () => {
    const projection = projectPopulationDensity(snapshot);
    assert.deepEqual(
        projection.entries.map(({ territoryId, value }) => [territoryId, value]),
        [
            [1, 10],
            [2, 20],
        ],
    );
});

test('allocated resource output is aggregated by owned territory and loyalty remains owner-scoped', () => {
    const production = projectResourceProduction(snapshot, 'Oil');
    assert.deepEqual(
        production.entries.map(({ territoryId, value }) => [territoryId, value]),
        [[1, 12]],
    );
    const loyalty = projectLoyalty(snapshot);
    assert.deepEqual(
        loyalty.entries.map(({ territoryId, value }) => [territoryId, value]),
        [[1, 0.4]],
    );
    assert.equal(loyalty.scale.maximum, 1);
});
