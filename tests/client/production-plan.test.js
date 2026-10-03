import test from 'node:test';
import assert from 'node:assert/strict';
import {
    acquisitionPlan,
    publicInvestmentControl,
    publicInvestmentAllowed,
} from '../../resources/js/client/services/production.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { deploymentDraft, moveOrderPreview } from '../../resources/js/client/services/militaryCommands.js';

const data = () => ({
    definitions: {
        edit_counter: 2,
        acquisition_resources: ['grain', 'test_good'],
    },
    policies: { turn_id: 5, edit_counter: 1, current: {}, pending: {} },
    acquisitions: [
        {
            resource_key: 'test_good',
            quantity: '1.234567',
            spending_limit: '2.345678',
            priority: 100,
        },
    ],
});
test('public investment permission follows the shared current, pending and draft choices', () => {
    const policies = {
        current: { ownership: { option: 'private' } },
        pending: {},
        catalogue: {
            policies: [
                {
                    key: 'ownership',
                    status: 'active',
                    options: ['private', 'mixed', 'public'].map((arrangement) => ({
                        key: arrangement,
                        effects: [
                            {
                                effect_type: 'institutions.development_ownership',
                                arguments: { sector: 'production', arrangement },
                            },
                        ],
                    })),
                },
            ],
        },
    };
    assert.equal(publicInvestmentAllowed(policies), false);
    policies.pending.ownership = { option: 'mixed' };
    assert.equal(publicInvestmentAllowed(policies), true);
    assert.equal(publicInvestmentAllowed(policies, { ownership: { option: 'private' } }), false);
    assert.equal(publicInvestmentAllowed(policies, { ownership: { option: 'public' } }), true);
    assert.equal(policies.current.ownership.option, 'private');
});
test('public investment edits share the policy draft, preserve pending choices and fence conflicts', () => {
    const snapshot = {
        game_id: 1,
        turn_number: 3,
        turn_context_revision: 'turn',
        setup: { nation_id: 4 },
        nation: data(),
    };
    const p = snapshot.nation.policies;
    p.enabled = true;
    p.current = {
        investment: { option: 'enabled', parameters: { fraction: '0' } },
        tax: { option: 'standard', parameters: { rate: '0.25' } },
    };
    p.pending = { tax: { option: 'standard', parameters: { rate: '0.30' } } };
    p.catalogue = {
        policies: [
            {
                key: 'investment',
                status: 'active',
                parameters: [
                    {
                        key: 'fraction',
                        unit_key: 'fraction_of_program_requirement',
                    },
                ],
                options: [
                    {
                        key: 'enabled',
                        effects: [
                            {
                                effect_type: 'production.development_funding',
                                arguments: {
                                    resource: 'test_good',
                                    funding_ratio: { parameter: 'fraction' },
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    };
    const before = structuredClone(p);
    const service = new GameplayService({}, { snapshot }, { userId: 1 });
    service.setPolicyParameter(snapshot, 'investment', 'fraction', '0.25');
    const draft = service.policyDraft(snapshot);
    assert.equal(publicInvestmentControl(snapshot.nation, 'test_good', draft.changes).value, '0.25');
    assert.equal(draft.changes.tax.parameters.rate, '0.30');
    assert.deepEqual(p, before);
    assert.equal(service.economicPlan(snapshot).changes.investment.parameters.fraction, '0.25');
    service.setPolicyParameter(snapshot, 'investment', 'fraction', '0');
    assert.equal(Object.hasOwn(draft.changes, 'investment'), false);
    p.pending.tax.parameters.rate = '0.31';
    assert.throws(
        () => service.setPolicyParameter(snapshot, 'investment', 'fraction', '0.5'),
        /saved policy plan changed/i,
    );
});
test('complete dynamic plan retains unedited decimals and does not mutate confirmed data', () => {
    const source = data(),
        before = structuredClone(source);
    assert.deepEqual(
        acquisitionPlan(source, {
            grain: { quantity: '0.000001', spending_limit: '0', priority: 100 },
        }),
        [
            {
                resource_key: 'grain',
                quantity: '0.000001',
                spending_limit: '0',
                priority: 100,
            },
            {
                resource_key: 'test_good',
                quantity: '1.234567',
                spending_limit: '2.345678',
                priority: 100,
            },
        ],
    );
    assert.deepEqual(source, before);
});
test('reject non-decimal, negative, excess precision and oversized draft quantities', () => {
    for (const value of ['1e5', '-1', 'Infinity', '0.0000001', '100000000000000'])
        assert.throws(() => acquisitionPlan(data(), { grain: { quantity: value } }));
});
test('priority requires an explicit nonnegative bounded integer', () => {
    for (const priority of ['', ' ', '1e2', '-1', '2.5', '2147483648'])
        assert.throws(() => acquisitionPlan(data(), { grain: { priority } }));
    assert.equal(acquisitionPlan(data(), { grain: { priority: '7' } })[0].priority, 7);
});
test('resource preview uses authoritative endpoint and rejects late catalogue responses', async () => {
    const snapshot = {
        game_id: 1,
        turn_number: 3,
        turn_context_revision: 'turn',
        setup: { nation_id: 4 },
        nation: data(),
    };
    const world = {
        snapshot,
        same: (a, b) => a.game_id === b.game_id && a.turn_context_revision === b.turn_context_revision,
    };
    let payload;
    const service = new GameplayService(
        {
            previewPolicies: async (args) => {
                payload = args.body;
                return {
                    valid: true,
                    production_planning: {
                        rows: { grain: { production: '0.000001' } },
                    },
                };
            },
        },
        world,
        { userId: 5 },
    );
    const bids = acquisitionPlan(snapshot.nation, {});
    assert.deepEqual(await service.previewProduction(snapshot, bids), {
        rows: { grain: { production: '0.000001' } },
    });
    assert.equal(payload.client_context.resource_edit_counter, 2);
    service.api.previewPolicies = async () => {
        world.snapshot = {
            ...snapshot,
            nation: {
                ...snapshot.nation,
                definitions: {
                    ...snapshot.nation.definitions,
                    edit_counter: 3,
                },
            },
        };
        return {};
    };
    await assert.rejects(service.previewProduction(snapshot, bids), /plan changed/i);
    assert.equal(service.outcome, null);
});
test('deployment display accepts catalogue decimal strings for a synthetic good', () => {
    const d = {
        definitions: {
            divisions: [
                {
                    division_type: 'Infantry',
                    deployment_costs: { test_good: '0.123456' },
                    upkeep_costs: { credits: '1.000000' },
                },
            ],
        },
        deployment_limits: { Infantry: 4 },
        budget: {
            available_production: {
                test_good: '0.200000',
                credits: '20.000000',
            },
        },
    };
    const snapshot = {
        ownTerritories: [{ territory_id: 1, can_deploy: true }],
    };
    const plan = deploymentDraft(d, snapshot, [{ division_type: 'Infantry', territory_id: 1 }]);
    assert.equal(plan.valid, true);
    assert.equal(plan.costs.test_good, 0.123456);
    assert.equal(
        deploymentDraft(d, snapshot, [
            { division_type: 'Infantry', territory_id: 1 },
            { division_type: 'Infantry', territory_id: 1 },
        ]).valid,
        false,
    );
});

test('combined commands preserve newer policy and acquisition drafts and reject conflicts before busy state', async () => {
    const snapshot = {
        game_id: 1,
        turn_number: 3,
        turn_context_revision: 'turn',
        setup: { nation_id: 4 },
        nation: data(),
    };
    const world = {
        snapshot,
        same: () => true,
        beginCommand() {},
        reconcile: async () => true,
        refresh: async () => true,
    };
    let sent;
    const service = new GameplayService(
        {
            applyProductionPlan: async ({ body }) => {
                sent = body;
                service.drafts(snapshot).grain = {
                    quantity: '3',
                    spending_limit: '8',
                };
                service.policyDraft(snapshot).changes = { newer: true };
            },
        },
        world,
        { userId: 1 },
    );
    service.check = async () => {};
    service.drafts(snapshot).grain = { quantity: '2', spending_limit: '4' };
    const draft = service.policyDraft(snapshot);
    draft.base = JSON.stringify([{}, {}]);
    draft.changes = {
        tax: { option: 'standard', parameters: { rate: '0.3' } },
    };
    await service.command('applyProductionPlan', {}, snapshot);
    assert.equal(sent.changes.tax.parameters.rate, '0.3');
    assert.equal(sent.acquisitions[0].quantity, '2');
    assert.equal(service.drafts(snapshot).grain.quantity, '3');
    assert.deepEqual(draft.changes, { newer: true });
    draft.base = 'changed elsewhere';
    await assert.rejects(service.command('applyProductionPlan', {}, snapshot), /saved policy plan changed/i);
    assert.equal(service.busy, false);
});

test('editing either draft invalidates an in-flight economic preview', async () => {
    const snapshot = {
        game_id: 1,
        turn_number: 3,
        turn_context_revision: 'turn',
        setup: { nation_id: 4 },
        nation: data(),
    };
    const world = { snapshot, same: () => true };
    let complete;
    const service = new GameplayService(
        {
            previewPolicies: () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        },
        world,
        { userId: 1 },
    );
    const pending = service.previewPolicies(snapshot, {});
    service.drafts(snapshot).grain = { quantity: '9', spending_limit: '20' };
    service.notifyEconomicDraft();
    complete({ valid: true });
    await assert.rejects(pending, /plan changed/i);
});
