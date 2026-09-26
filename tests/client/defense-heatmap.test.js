import test from 'node:test';
import assert from 'node:assert/strict';
import {
    defenseColor,
    defensePosition,
    defenseScale,
    projectDefenseHeatmap,
} from '../../resources/js/client/ui/map/defenseHeatmap.js';

const snapshot = {
    setup: { nation_id: 7 },
    territories: [
        { territory_id: 10, owner_nation_id: 7 },
        { territory_id: 11, owner_nation_id: 7 },
        { territory_id: 20, owner_nation_id: 8 },
    ],
    nation: {
        definitions: {
            divisions: [{ division_type: 'Infantry', defense_power: 30 }],
        },
        divisions: [
            { division_id: 1, division_type: 'Infantry', territory_id: 10, order: null },
            {
                division_id: 2,
                division_type: 'Infantry',
                territory_id: 10,
                order: { order_type: 'Move', destination_territory_id: 11 },
            },
        ],
        deployments: [{ division_type: 'Infantry', territory_id: 10 }],
    },
};

test('defence heat map combines projected base defence with independently affordable Guard coverage', () => {
    const projection = projectDefenseHeatmap(snapshot, {
        territories: [
            { territory_id: 10, guard_defense: 60, guard_divisions: 2 },
            { territory_id: 11, guard_defense: 120, guard_divisions: 4 },
            { territory_id: 20, guard_defense: 999, guard_divisions: 9 },
        ],
    });
    assert.deepEqual(
        projection.entries.map(({ territoryId, baseDefense, guardDefense, guardDivisions, total }) => ({
            territoryId,
            baseDefense,
            guardDefense,
            guardDivisions,
            total,
        })),
        [
            {
                territoryId: 10,
                baseDefense: 60,
                guardDefense: 60,
                guardDivisions: 2,
                total: 120,
            },
            {
                territoryId: 11,
                baseDefense: 30,
                guardDefense: 120,
                guardDivisions: 4,
                total: 150,
            },
        ],
    );
    assert.equal(projection.scale.maximum, 150);
    assert.equal(projection.entries[1].position, 1);
    assert.notEqual(projection.entries[0].color, projection.entries[1].color);
});

test('adaptive defence scale resists one outlier and preserves a continuous range', () => {
    const scale = defenseScale([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 10000]);
    assert.equal(scale.maximum, 100);
    assert.equal(defensePosition(0, scale), 0);
    assert.equal(defensePosition(100, scale), 1);
    assert.equal(defensePosition(10000, scale), 1);
    assert.ok(defensePosition(50, scale) > 0.5);
    assert.equal(defenseColor(0), '#7e2938');
    assert.equal(defenseColor(1), '#3b8792');
    assert.notEqual(defenseColor(0.49), defenseColor(0.5));
});
