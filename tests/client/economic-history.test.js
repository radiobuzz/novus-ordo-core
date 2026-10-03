import test from 'node:test';
import assert from 'node:assert/strict';
import { nationalPoint, industryPoint } from '../../resources/js/client/features/gameplay/historySeries.js';
import { policyGroup, seasonFinance } from '../../resources/js/client/features/gameplay/economyGroups.js';
import { treasuryChange } from '../../resources/js/client/ui/financeProjection.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';

test('financing stays out of income/spending and category totals reconcile', () => {
    const r = {
        treasury_inflows: '18',
        treasury_outflows: '15',
        closing_treasury: '23',
        opening_treasury: '20',
        command_costs: '2',
        public_payroll_paid: '1',
        public_operations: '1',
        government_purchases: '2',
        public_development: '2',
        support_paid: '1',
        infrastructure: { 1: { paid: '1' } },
        fiscal: { borrowing: '5', principal_repaid: '3', closing_debt: '7', interest_due: '2', arrears: '1' },
    };
    const p = nationalPoint({ season: 4, economy: r });
    assert.equal(p.values.balance, 1);
    assert.equal(seasonFinance(r).treasuryChange, 3);
    assert.equal(treasuryChange({ opening_treasury: '20', closing_treasury: '18' }), -2);
    assert.equal(treasuryChange({ opening_treasury: '20' }), null);
    assert.equal(p.values.receipts, 13);
    assert.equal(p.values.spending, 12);
    assert.equal(p.values.other, 1);
    assert.equal(nationalPoint({ season: 5, economy: null }).values.receipts, undefined);
    assert.equal(nationalPoint({ season: 5, economy: { fiscal: {} } }).values.interest, null);
});
test('generic industries retain missing financial observations and use recorded costs', () => {
    const record = {
        season: 2,
        resources: {
            unusual_good: {
                production: { producer: '2', government: '1' },
                civilian_requested: '4',
                industrial_requested: '2',
                development: { government: '1', producer: '2' },
            },
        },
        economy: {},
    };
    assert.equal(industryPoint(record, 'unusual_good').values.sales, null);
    record.economy.industries = {
        unusual_good: {
            owners: {
                government: { sales: '5', recognized_cost: '3', operating_result: '2' },
                producer: { sales: '7', recognized_cost: '6', operating_result: '1' },
            },
        },
    };
    assert.equal(industryPoint(record, 'unusual_good').values.result, 3);
    assert.equal(industryPoint(record, 'unusual_good').values.production, 3);
    assert.equal(policyGroup({ options: [{ effects: [{ effect_type: 'something_future' }] }] }), 'other');
    assert.equal(
        policyGroup({
            options: [
                {
                    effects: [
                        {
                            effect_type: 'production.development_funding',
                            arguments: { resource: 'role:nutrition' },
                        },
                    ],
                },
            ],
        }),
        'food',
    );
});
test('history reads deduplicate and reject responses after rollback with a reused turn number', async () => {
    let finish,
        reads = 0;
    const snapshot = { game_id: 1, turn_number: 2, turn_context_revision: 'a', setup: { nation_id: 7 } };
    const world = {
        snapshot,
        generation: 1,
        scope: { signal: new AbortController().signal },
        same: (a, b) => a.turn_context_revision === b.turn_context_revision,
        marker: async () => world.snapshot,
    };
    const api = {
        getEconomicHistory: () => {
            reads++;
            return new Promise((r) => (finish = r));
        },
    };
    const service = new GameplayService(api, world, {});
    const a = service.economicHistory(snapshot),
        b = service.economicHistory(snapshot);
    await new Promise((r) => setImmediate(r));
    assert.equal(reads, 1);
    world.snapshot = { ...snapshot, turn_context_revision: 'b' };
    finish({ game_id: 1, nation_id: 7, through_turn: 2, turn_context_revision: 'a', seasons: [] });
    const settled = await Promise.allSettled([a, b]);
    assert.ok(settled.every((r) => r.status === 'rejected'));
    assert.equal(service.economicHistoryReads.size, 0);
});
