import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedPower, territorialDefense } from '../../resources/js/client/services/forceSummary.js';
const types = [
    { division_type: 'Infantry', attack_power: 15, defense_power: 30 },
    { division_type: 'Fighter', attack_power: 50, defense_power: 80 },
];
const unit = (id, origin, order = null, type = 'Infantry') => ({
    division_id: id,
    territory_id: origin,
    division_type: type,
    order,
});
const data = {
    definitions: { divisions: types },
    divisions: [
        unit(1, 10),
        unit(2, 11, { order_type: 'Move', destination_territory_id: 10 }),
        unit(3, 10, { order_type: 'Move', destination_territory_id: 11 }),
        unit(4, 10, { order_type: 'Disband' }),
        unit(5, 11, { order_type: 'Attack', rebase_territory_id: 10, target_territory_id: 20 }),
        unit(6, 10, { order_type: 'Raid', target_territory_id: 20 }, 'Fighter'),
    ],
    deployments: [
        { territory_id: 10, division_type: 'Infantry' },
        { territory_id: 11, division_type: 'Infantry' },
    ],
};
const snapshot = {
    setup: { nation_id: 7 },
    territories: [
        { territory_id: 10, owner_nation_id: 7 },
        { territory_id: 20, owner_nation_id: 8 },
    ],
    nation: data,
};
test('before-battle defense includes arrivals, rebases, queued deployments and post-battle disbanding units', () => {
    assert.deepEqual(territorialDefense(snapshot, 10), {
        staying: 140,
        incoming: 60,
        deployments: 30,
        total: 230,
    });
    assert.equal(territorialDefense(snapshot, 20), null);
    assert.equal(territorialDefense({ ...snapshot, nation: null }, 10), null);
    assert.deepEqual(selectedPower(data, new Set([1, 2, 6])), { attack: 80, defense: 140 });
});
test('unknown metadata is never presented as zero power', () => {
    const incomplete = structuredClone(snapshot);
    incomplete.nation.definitions.divisions = [];
    assert.equal(territorialDefense(incomplete, 10), null);
    assert.equal(selectedPower(incomplete.nation, new Set([1])), null);
});
