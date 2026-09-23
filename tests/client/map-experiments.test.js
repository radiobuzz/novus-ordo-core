import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import {
    createEconomy,
    setFoodShare,
    setNationFoodShare,
    allocationPreview,
    recomputeEconomy,
    advanceEconomy,
    recordOilUse,
    oilCommitments,
} from '../../resources/js/map-lab/economy.js';
import { createMilitary, issueOrder, advanceMilitary } from '../../resources/js/map-lab/military.js';
import {
    createNaval,
    advanceNaval,
    configureNaval,
    requestWithdrawal,
    troopLedger,
    navalFinished,
    seaApproach,
} from '../../resources/js/map-lab/naval.js';
import { hexDistance } from '../../resources/js/map-lab/hex.js';
const shape = (model) =>
    model.cells.map((cell) => [
        cell.id,
        cell.baseElevation,
        cell.terrain,
        cell.population,
        cell.politicalOwnerId,
        cell.controllerId,
        cell.damage,
    ]);
const checkLedger = (naval) => {
    const l = troopLedger(naval);
    assert.equal(l.initial, l.aboard + l.ashore + l.evacuated + l.killed + l.captured + l.stranded);
    assert.ok(Object.values(l).every((n) => Number.isInteger(n) && n >= 0));
};
test('economic allocation is deterministic, conserves workers, and does not modify geography', () => {
    const model = createMapLabModel(19, 'world'),
        before = shape(model),
        economy = createEconomy(model);
    assert.deepEqual(economy.totals, createEconomy(model).totals);
    const district = economy.districts.find((d) => d.output.Oil.potential > 0 && d.output.Food.potential > 0);
    const output = district.output.Food.production,
        preview = allocationPreview(district, 100);
    assert.equal(district.output.Food.production, output);
    setFoodShare(economy, district.id, 100);
    assert.ok(district.output.Food.production >= output);
    assert.equal(district.output.Oil.production, 0);
    assert.ok(Math.abs(district.output.Food.production - preview.Food) < 1e-8);
    for (const d of economy.districts) {
        assert.ok(d.usedWorkers <= d.workforce + 1e-8);
        for (const resource of ['Food', 'Oil'])
            assert.ok(d.output[resource].production <= d.output[resource].potential + 1e-8);
    }
    const cell = district.sites[0].cell,
        controller = cell.controllerId;
    cell.controllerId = 'invader';
    recomputeEconomy(economy);
    assert.equal(economy.cells.get(cell.id).Food.production, 0);
    cell.controllerId = controller;
    assert.deepEqual(shape(model), before);
    assert.equal(setFoodShare(economy, district.id, NaN), false);
});
test('settlement conserves stocks, charges operations once, and reports shortages', () => {
    const economy = createEconomy(createMapLabModel(19, 'world'));
    setNationFoodShare(economy, 'sable', 100);
    recordOilUse(economy, 'sable', 5, {
        id: 'fleet',
        cellId: 'first',
        label: 'Fleet',
    });
    recordOilUse(economy, 'sable', 7, {
        id: 'fleet',
        cellId: 'second',
        label: 'Fleet',
    });
    assert.equal(economy.operationSites.length, 1);
    assert.equal(economy.operationSites[0].amount, 12);
    assert.equal(economy.operationSites[0].cellId, 'second');
    advanceEconomy(economy);
    assert.equal(economy.accounts.sable.Oil, 28);
    assert.equal(economy.operationSites.length, 0);
    assert.equal(economy.lastOperationSites[0].amount, 12);
    advanceEconomy(economy);
    assert.equal(economy.accounts.sable.Oil, 28);
    setNationFoodShare(economy, 'aurelia', 0);
    for (let i = 0; i < 5; i++) advanceEconomy(economy);
    assert.ok(economy.lastTurn.aurelia.Food.shortage > 0);
    for (const nation of Object.values(economy.lastTurn))
        for (const entry of Object.values(nation)) {
            assert.ok(Math.abs(entry.opening + entry.production - entry.consumed - entry.closing) < 1e-7);
            assert.ok(Math.abs(entry.requested - entry.consumed - entry.shortage) < 1e-7);
            assert.ok(entry.closing >= 0);
        }
});
test('naval failure follows ocean routes and retains survivors and immutable recorded history', () => {
    const model = createMapLabModel(19, 'world'),
        before = shape(model);
    const naval = createNaval(model, null, {
        defense: 100,
        escortEnabled: false,
    });
    assert.ok(naval.available);
    naval.path.forEach((id, i) => {
        const cell = model.cellById.get(id);
        assert.equal(cell.terrain, 'ocean');
        assert.equal(cell.frozen, false);
        if (i) assert.equal(hexDistance(cell, model.cellById.get(naval.path[i - 1])), 1);
    });
    assert.equal(hexDistance(model.cellById.get(naval.path.at(-1)), model.cellById.get(naval.beachId)), 1);
    const first = structuredClone(naval.history[0]);
    while (!navalFinished(naval) && naval.tick < 40) {
        advanceNaval(naval);
        checkLedger(naval);
    }
    assert.equal(naval.phase, 'evacuated');
    assert.ok(troopLedger(naval).killed > 0 && troopLedger(naval).evacuated >= 100);
    assert.deepEqual(naval.history[0], first);
    assert.equal(first.contacts.length, 0);
    assert.ok(naval.contacts.length > 0);
    assert.equal(naval.history.length, naval.tick + 1);
    assert.deepEqual(shape(model), before);
    const final = JSON.stringify(naval);
    assert.equal(advanceNaval(naval), false);
    assert.equal(JSON.stringify(naval), final);
});
test('military oil is incurred on action, not previews or idle steps; naval estimates respect escorts', () => {
    const model = createMapLabModel(19, 'world'),
        military = createMilitary(model);
    const air = military.formations.find((group) => group.id === 'sable-4');
    const enemy = military.formations.find((group) => group.id === 'aurelia-1');
    const count = air.units.reduce((sum, unit) => sum + unit.count, 0);
    issueOrder(model, military, air.id, enemy.cellId, 'attack');
    assert.equal(air.oilConsumed, 0);
    assert.equal(oilCommitments(military, null).sable, count);
    advanceMilitary(model, military);
    assert.equal(air.oilConsumed, count);
    assert.equal(military.oilSpent.sable, count);
    advanceMilitary(model, military);
    assert.equal(military.oilSpent.sable, count);
    const naval = createNaval(model, null, { escortEnabled: false });
    advanceNaval(naval);
    assert.equal(oilCommitments(military, naval).sable, 2);
});
test('escort/reinforcement can secure a beach; abort and sinking account for every participant', () => {
    const model = createMapLabModel(19, 'world');
    const naval = createNaval(model, null, {
        defense: 75,
        escortEnabled: true,
    });
    while (!navalFinished(naval) && naval.tick < 40) {
        if (naval.phase === 'beachhead') naval.secondWave = true;
        advanceNaval(naval);
        checkLedger(naval);
    }
    assert.equal(naval.phase, 'secured');
    assert.ok(troopLedger(naval).ashore > 100);
    const aborted = createNaval(model);
    advanceNaval(aborted);
    assert.equal(configureNaval(aborted, { defense: 0 }), false);
    requestWithdrawal(aborted);
    while (!navalFinished(aborted)) advanceNaval(aborted);
    assert.equal(troopLedger(aborted).evacuated, 200);
    const lastStepSinking = createNaval(model, null, {
        defense: 100,
        escortEnabled: false,
    });
    lastStepSinking.path = lastStepSinking.path.slice(-2);
    lastStepSinking.index = 1;
    lastStepSinking.phase = 'withdrawal';
    lastStepSinking.transportHealth = 1;
    advanceNaval(lastStepSinking);
    assert.equal(lastStepSinking.phase, 'failed');
    assert.equal(troopLedger(lastStepSinking).killed, 200);
    checkLedger(lastStepSinking);
    const undefended = createNaval(model, null, { defense: 0 });
    while (!navalFinished(undefended)) advanceNaval(undefended);
    assert.equal(undefended.phase, 'secured');
    assert.ok(undefended.contacts.some((contact) => contact.observation.includes('no opposition')));
    for (const escortEnabled of [false, true]) {
        const sunk = createNaval(model, null, { defense: 100, escortEnabled });
        sunk.transportHealth = 1;
        while (!navalFinished(sunk) && sunk.tick < 40) {
            advanceNaval(sunk);
            checkLedger(sunk);
        }
        assert.equal(sunk.phase, 'failed');
        assert.equal(troopLedger(sunk).aboard, 0);
        if (escortEnabled) assert.ok(troopLedger(sunk).evacuated > 0);
    }
});
test('demos handle all densities and invalid landing sites without changing terrain', () => {
    for (const density of [7, 19, 37]) {
        const model = createMapLabModel(density, 'world'),
            before = shape(model);
        const economy = createEconomy(model),
            naval = createNaval(model);
        assert.ok(economy.districts.length > 0 && naval.available);
        assert.equal(seaApproach(model, naval.path[0]), null);
        assert.equal(createNaval(model, naval.path[0]).available, false);
        assert.equal(createNaval(model, 'missing').available, false);
        assert.deepEqual(shape(model), before);
    }
});
