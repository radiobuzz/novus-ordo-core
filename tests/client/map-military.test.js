import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import {
    createMilitary,
    resetMilitary,
    planOrder,
    issueOrder,
    advanceMilitary,
    UNIT_TYPES,
} from '../../resources/js/map-lab/military.js';
import { hexDistance } from '../../resources/js/map-lab/hex.js';
import { isWater } from '../../resources/js/map-lab/water.js';

const snapshot = (model) =>
    model.cells.map((cell) => [
        cell.id,
        cell.baseElevation,
        cell.terrain,
        cell.politicalOwnerId,
        cell.controllerId,
        cell.damage,
    ]);

test('formations have deterministic identities and compositions without changing geography', () => {
    const model = createMapLabModel(19, 'world');
    const before = snapshot(model),
        military = createMilitary(model);
    assert.deepEqual(snapshot(model), before);
    assert.deepEqual(military, createMilitary(model));
    assert.equal(new Set(military.formations.map((group) => group.id)).size, 15);
    assert.deepEqual(
        new Set(military.formations.map((group) => group.type)),
        new Set(Object.keys(UNIT_TYPES)),
    );
    for (const group of military.formations) {
        assert.ok(!isWater(model.cellById.get(group.cellId)));
        assert.ok(group.name.length > 10);
        assert.ok(group.units.every((unit) => Boolean(UNIT_TYPES[unit.type].air) === group.air));
    }
    const stacked = military.formations.filter((group) => group.cellId === military.formations[0].cellId);
    assert.ok(stacked.length > 1);
    assert.notEqual(stacked[0].id, stacked[1].id);
});

test('ground routes respect water, hostile blockers, terrain costs, and previews do not issue orders', () => {
    const model = createMapLabModel(19, 'world'),
        military = createMilitary(model);
    const group = military.formations[0],
        enemy = military.formations.find((entry) => entry.id === 'aurelia-1');
    const before = JSON.stringify(military);
    assert.ok(planOrder(model, military, group.id, enemy.cellId, 'move').error);
    assert.ok(planOrder(model, military, group.id, model.cells.find(isWater).id, 'move').error);
    const plan = planOrder(model, military, group.id, enemy.cellId, 'attack');
    assert.equal(plan.error, undefined);
    assert.equal(JSON.stringify(military), before);
    let cost = 0;
    for (let i = 1; i < plan.path.length; i++) {
        const cell = model.cellById.get(plan.path[i]);
        assert.ok(!isWater(cell));
        assert.equal(hexDistance(cell, model.cellById.get(plan.path[i - 1])), 1);
        cost += cell.movementCost;
    }
    assert.equal(plan.cost, cost);
    issueOrder(model, military, group.id, enemy.cellId, 'attack');
    assert.deepEqual(group.order, plan);
    assert.ok(planOrder(model, military, 'missing', enemy.cellId, 'attack').error);
});

test('combat causes partial losses and retreats without transferring political ownership; reset restores local control', () => {
    const model = createMapLabModel(19, 'world'),
        military = createMilitary(model);
    const original = snapshot(model),
        group = military.formations[0];
    const enemy = military.formations.find((entry) => entry.id === 'aurelia-1');
    const origin = enemy.cellId;
    enemy.morale = 26;
    issueOrder(model, military, group.id, enemy.cellId, 'attack');
    for (let i = 0; i < 3; i++) advanceMilitary(model, military);
    assert.ok(enemy.strength > 0 && enemy.strength < 100);
    assert.notEqual(enemy.cellId, origin);
    assert.ok(military.events.some((event) => event.includes('retreats')));
    assert.deepEqual(
        model.cells.map((cell) => [cell.id, cell.baseElevation, cell.terrain, cell.politicalOwnerId]),
        original.map((cell) => cell.slice(0, 4)),
    );
    const reset = resetMilitary(model, military);
    assert.deepEqual(snapshot(model), original);
    assert.equal(reset.tick, 0);
    assert.ok(reset.formations.every((entry) => !entry.order));
});

test('air strikes have bounded range, damage their target, and do not move or capture land', () => {
    const model = createMapLabModel(19, 'world'),
        military = createMilitary(model);
    const air = military.formations.find((entry) => entry.id === 'sable-4');
    const enemy = military.formations.find((entry) => entry.id === 'aurelia-1');
    const origin = air.cellId,
        beforeStrength = enemy.strength;
    const owners = model.cells.map((cell) => [cell.politicalOwnerId, cell.controllerId]);
    const distant = model.cells.find(
        (cell) => !isWater(cell) && hexDistance(cell, model.cellById.get(origin)) > 30,
    );
    assert.ok(planOrder(model, military, air.id, distant.id, 'move').error);
    assert.equal(issueOrder(model, military, air.id, enemy.cellId, 'attack').type, 'strike');
    advanceMilitary(model, military);
    assert.equal(air.cellId, origin);
    assert.equal(air.order, null);
    assert.ok(enemy.strength < beforeStrength);
    assert.deepEqual(
        model.cells.map((cell) => [cell.politicalOwnerId, cell.controllerId]),
        owners,
    );
});

test('movement advances over time and stops when a new enemy blocks a queued route', () => {
    const model = createMapLabModel(19, 'world'),
        military = createMilitary(model);
    const group = military.formations[0],
        origin = group.cellId;
    const occupied = new Set(military.formations.map((entry) => entry.cellId));
    const target = model.cells.find(
        (cell) =>
            !isWater(cell) && !occupied.has(cell.id) && hexDistance(cell, model.cellById.get(origin)) === 1,
    );
    assert.ok(target);
    issueOrder(model, military, group.id, target.id, 'move');
    assert.equal(group.cellId, origin);
    for (let i = 0; i < 3; i++) advanceMilitary(model, military);
    assert.equal(group.cellId, target.id);
    assert.equal(target.controllerId, group.nationId);
    issueOrder(model, military, group.id, origin, 'move');
    military.formations.find((entry) => entry.id === 'aurelia-2').cellId = origin;
    for (let i = 0; i < 3; i++) advanceMilitary(model, military);
    assert.equal(group.cellId, target.id);
    assert.equal(group.order, null);
    assert.equal(group.status, 'Blocked');
});
