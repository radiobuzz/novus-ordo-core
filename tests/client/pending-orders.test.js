import assert from 'node:assert/strict';
import { pendingOrderGroups } from '../../resources/js/client/services/pendingOrders.js';

const division = (id, type, action, destination) => ({
    division_id: id,
    division_type: type,
    territory_id: 10,
    order: { order_type: action, target_territory_id: destination },
});
const data = {
    deployments: [{ deployment_id: 1, division_type: 'Infantry', territory_id: 20 }],
    divisions: [
        division(1, 'Infantry', 'Raid', 20),
        division(2, 'Armored', 'Raid', 20),
        division(3, 'Armored', 'Attack', 20),
        division(4, 'Infantry', 'Raid', 21),
        division(5, 'Infantry', 'Disband', null),
        division(6, 'Armored', 'Disband', null),
        { division_id: 7, order: null },
        {
            ...division(8, 'Infantry', 'Move', null),
            order: { order_type: 'Move', destination_territory_id: 21 },
        },
    ],
};
const before = JSON.stringify(data);
const groups = pendingOrderGroups(data);
assert.equal(groups.length, 6);
assert.equal(JSON.stringify(data), before);
assert.deepEqual(groups[1].counts, { Infantry: 1, Armored: 1 });
assert.deepEqual(
    groups[1].items.map((i) => i.id),
    [1, 2],
);
assert.equal(groups[0].command, 'cancelDeployments');
assert.equal(groups[0].idField, 'deployment_ids');
assert.equal(groups[1].command, 'cancelOrders');
assert.equal(groups[1].idField, 'division_ids');
assert.notEqual(groups[0].items[0].key, groups[1].items[0].key);
assert.equal(groups[4].destination, null);
assert.equal(groups[4].items.length, 2);
assert.equal(groups[5].destination, 21);
assert.deepEqual(pendingOrderGroups({ deployments: [], divisions: [] }), []);
