import assert from 'node:assert/strict';
import {
    deploymentDraft,
    remainingDeploymentMaximum,
} from '../../resources/js/client/services/militaryCommands.js';
import { layoutUnits, hitUnits, unitsInBox } from '../../resources/js/client/ui/map/unitLayout.js';
import { recolorUnitPixels, unitPalette } from '../../resources/js/client/ui/map/unitPalette.js';
import { Camera } from '../../resources/js/client/ui/map/Camera.js';
import { MapPicker } from '../../resources/js/client/ui/map/MapPicker.js';
import { fixtures } from './fixtures.js';

const data = fixtures('/client/gameplay');
const snapshot = {
    ownTerritories: [
        { territory_id: 156, can_deploy: true },
        { territory_id: 157, can_deploy: true },
    ],
};
const draft = [
    { division_type: 'Armored', territory_id: 156 },
    { division_type: 'Fighter', territory_id: 157 },
];
assert.deepEqual(deploymentDraft(data, snapshot, draft).costs, { Capital: 15, RecruitmentPool: 2, Ore: 6 });
assert.equal(deploymentDraft(data, snapshot, draft).valid, true);
assert.equal(remainingDeploymentMaximum(data, snapshot, draft, 'Armored'), 0);
assert.equal(remainingDeploymentMaximum(data, snapshot, draft, 'Infantry'), 5);
assert.equal(deploymentDraft(data, snapshot, [...draft, ...draft, ...draft]).valid, false);
assert.equal(deploymentDraft(data, snapshot, [{ ...draft[0], territory_id: 999 }]).valid, false);
assert.equal(deploymentDraft(data, snapshot, []).valid, false);
assert.equal(deploymentDraft(data, snapshot, Array(101).fill(draft[0])).valid, false);
assert.equal(remainingDeploymentMaximum({ ...data, budget: {} }, snapshot, [], 'Infantry'), null);
assert.equal(data.budget.available_production.Capital, 30);

const definition = { width: 900, height: 600, tileWidth: 30, tileHeight: 30 };
const territories = [{ territory_id: 156, x: 5, y: 5 }];
const context = { definition, territories, picker: new MapPicker(territories, definition) };
const camera = new Camera(900, 600);
camera.resize(900, 600);
camera.zoom = 1;
let layout = layoutUnits(context, camera, data.divisions);
assert.equal(layout[0].state, 'stack');
assert.deepEqual(unitsInBox(layout, { a: { x: 0, y: 0 }, b: { x: 900, y: 600 } }), [11, 12]);
camera.zoom = 8;
camera.x = camera.y = 165;
layout = layoutUnits(context, camera, data.divisions, [], [draft[0]]);
assert.equal(layout.length, 3);
assert.equal(layout[0].state, 'active');
assert.equal(hitUnits(layout, layout[1]).division_id, 12);
assert.deepEqual(unitsInBox(layout, { a: { x: 0, y: 0 }, b: { x: 900, y: 600 } }), [11, 12]);
assert.deepEqual(layoutUnits(context, camera, [...data.divisions].reverse(), [], [draft[0]]), layout);
assert.equal(
    layoutUnits(
        context,
        camera,
        Array.from({ length: 30 }, (_, division_id) => ({ ...data.divisions[0], division_id })),
    )[0].state,
    'stack',
);

const pixels = new Uint8ClampedArray([
    100, 110, 65, 200, 180, 120, 85, 255, 80, 80, 80, 255, 100, 110, 65, 0,
]);
const original = pixels.slice();
recolorUnitPixels(pixels, { paint: '#3055aa', accent: '#dddddd' });
assert.notDeepEqual(pixels.slice(0, 3), original.slice(0, 3));
assert.equal(pixels[3], 200);
assert.deepEqual(pixels.slice(4), original.slice(4));
assert.equal(unitPalette({ paint: 'invalid' }).paint, '#617859');
console.log('Unit draft, shared budgets, stable slots, picking, crowding and palette contracts passed.');
