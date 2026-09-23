import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.js';
import { productionPlanBids, productionPlanPreview } from '../../resources/js/client/services/production.js';

function economy() {
    const data = fixtures('/client/gameplay');
    data.bids = [];
    data.budget.labor_pools = [{ territory_id: 1, size: 12645753 }];
    data.production_planning.bid_order = [];
    for (const [name, meta] of Object.entries(data.production_planning.resources)) {
        meta.stock = 0;
        meta.upkeep = name === 'Food' ? 12645753 : name === 'Capital' ? 6000000 : 0;
    }
    data.production_planning.facilities = ['Capital', 'Food', 'Material', 'Ore', 'Oil'].map(
        (resource_type) => ({
            territory_id: 1,
            resource_type,
            capacity: 12645753,
            productivity: ['Food', 'Material'].includes(resource_type) ? 4 : 1,
        }),
    );
    return data;
}
const drafts = (values) =>
    Object.fromEntries(Object.entries(values).map(([key, quantity]) => [key, { quantity, productivity: 0 }]));
test('joint plan reserves upkeep and balances useful production without materials', () => {
    const data = economy(),
        before = structuredClone(data);
    const plan = productionPlanPreview(data, productionPlanBids(data, drafts({ Food: 1, Ore: 1, Oil: 1 })));
    assert.equal(plan.total, 12645753);
    assert.equal(plan.automatic, 3161439);
    assert.equal(plan.reserved, 6000000);
    assert.equal(plan.discretionary, 3484314);
    assert.equal(plan.allocated, 2250000);
    assert.equal(plan.rows.Capital.balance, 1234314);
    assert.equal(plan.rows.Food.production, 13645756);
    assert.equal(plan.rows.Material.production, 0);
    assert.equal(plan.rows.Oil.shortfall, 0);
    assert.deepEqual(data, before);
});
test('competing ore leaves only remaining labor for oil, not a full independent forecast', () => {
    const data = economy();
    const plan = productionPlanPreview(data, productionPlanBids(data, drafts({ Ore: 2.55, Oil: 3.18 })));
    assert.equal(plan.rows.Ore.commandOutput, 2550000);
    assert.equal(plan.rows.Oil.commandOutput, 934314);
    assert.equal(plan.rows.Oil.shortfall, 2245686);
    assert.equal(plan.rows.Capital.balance, 0);
});
test('saved order determines competition, not displayed resource order', () => {
    const data = economy();
    data.production_planning.bid_order = [{ resource_type: 'Oil', upkeep: false, priority: 65536 }];
    const plan = productionPlanPreview(data, productionPlanBids(data, drafts({ Ore: 3, Oil: 3 })));
    assert.equal(plan.rows.Oil.commandOutput, 3000000);
    assert.equal(plan.rows.Ore.commandOutput, 484314);
});
test('unused workers elsewhere cannot satisfy oil and cutoffs exclude facilities', () => {
    const data = economy();
    data.production_planning.facilities.find((f) => f.resource_type === 'Oil').territory_id = 2;
    data.budget.labor_pools.push({ territory_id: 2, size: 100000 });
    const plan = productionPlanPreview(data, productionPlanBids(data, drafts({ Oil: 1 })));
    assert.equal(plan.rows.Oil.commandOutput, 100000);
    assert.ok(plan.rows.Capital.balance > 3000000);
    const excluded = productionPlanPreview(
        data,
        productionPlanBids(data, { Oil: { quantity: 1, productivity: 2 } }),
    );
    assert.equal(excluded.rows.Oil.commandOutput, 0);
    assert.equal(excluded.rows.Oil.capacityShortfall, 1000000);
});
test('cutoff display rounding and existing materials are preserved in full batch', () => {
    const data = economy();
    data.bids = [{ resource_type: 'Material', max_quantity: 1234567, max_labor_allocation_per_unit: 333334 }];
    const bids = productionPlanBids(data, { Material: { quantity: '1.234567', productivity: '3' } });
    assert.equal(bids.length, 4);
    assert.deepEqual(
        bids.find((bid) => bid.resource_type === 'Material'),
        data.bids[0],
    );
    assert.throws(() => productionPlanBids(data, drafts({ Oil: Infinity })));
    assert.equal(productionPlanPreview({ ...data, production_planning: null }, bids), null);
});
test('zero target still covers food upkeep, and capital shortage activates reserve fallback', () => {
    const data = economy();
    const plan = productionPlanPreview(data, productionPlanBids(data, {}));
    assert.equal(plan.rows.Food.production, 12645756);
    data.production_planning.facilities.find((f) => f.resource_type === 'Capital').capacity = 1000000;
    data.production_planning.resources.Food.stock = 12645753;
    const fallback = productionPlanPreview(data, productionPlanBids(data, drafts({ Food: 1 })));
    assert.equal(fallback.usesReserves, true);
    assert.equal(fallback.rows.Food.automatic, 0);
    assert.equal(fallback.rows.Food.commandOutput, 1000000);
});
