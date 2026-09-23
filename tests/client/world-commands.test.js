import assert from 'node:assert/strict';
import {
    draftDeployments,
    draftMoveOrders,
    deploymentMaximum,
} from '../../resources/js/client/services/militaryCommands.js';
import { fixtures } from './fixtures.js';

const data = fixtures('/client/gameplay');
const snapshot = {
    setup: { nation_id: 7 },
    ownTerritories: [
        { territory_id: 156, can_deploy: true },
        { territory_id: 157, can_deploy: false },
    ],
    territories: [],
};
assert.equal(deploymentMaximum(data, 'Infantry'), 10);
assert.equal(deploymentMaximum({}, 'Infantry'), null);
assert.equal(deploymentMaximum({ deployment_limits: { Infantry: -1 } }, 'Infantry'), null);
assert.equal(draftDeployments('Infantry', 156, 10, data, snapshot).length, 10);
for (const quantity of [0, 1.5, NaN, Infinity, 11, 101])
    assert.equal(draftDeployments('Infantry', 156, quantity, data, snapshot), null);
assert.equal(draftDeployments('Unknown', 156, 1, data, snapshot), null);
assert.equal(draftDeployments('Infantry', 157, 1, data, snapshot), null);
assert.equal(draftDeployments('Infantry', 158, 1, data, snapshot), null);
assert.equal(draftMoveOrders(snapshot, data, new Set([999]), 156)[0].path_territory_ids, null);
