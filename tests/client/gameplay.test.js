import test from 'node:test';
import assert from 'node:assert/strict';
import { movementPath } from '../../resources/js/client/services/movement.js';
import { acquisitionPlan } from '../../resources/js/client/services/production.js';
import { reportText } from '../../resources/js/client/services/reportText.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';

const territory = (id, links, land = links, owner = 1, terrain = 'Plain', coast = false) => ({
    territory_id: id,
    connected_territory_ids: links,
    connected_land_territory_ids: land,
    owner_nation_id: owner,
    terrain_type: terrain,
    has_sea_access: coast,
});
test('movement follows topology, owned intermediates, range, and the existing final-step rule', () => {
    const graph = [territory(91, [32]), territory(32, [91, 77], [91]), territory(77, [32], [], 2)];
    assert.deepEqual(movementPath(graph, 91, 77, { moves: 2 }, 1), [32]);
    assert.equal(movementPath(graph, 91, 77, { moves: 1 }, 1), null);
    graph[1].owner_nation_id = 2;
    assert.equal(movementPath(graph, 91, 77, { moves: 2 }, 1), null);
    graph[1].terrain_type = 'Water';
    graph[1].owner_nation_id = null;
    assert.deepEqual(movementPath(graph, 91, 77, { moves: 2, can_fly: true }, 1), [32]);
    assert.equal(movementPath(graph, 91, 32, { moves: 8, can_fly: true }, 1), null);
});
test('coastal transport and single-cell island regions keep current engine behavior', () => {
    const graph = [territory(1, [], [], 1, 'Plain', true), territory(2, [], [], null, 'Plain', true)];
    assert.deepEqual(movementPath(graph, 1, 2, { moves: 1 }, 1), []);
    assert.equal(movementPath(graph, 1, 1, { moves: 1 }, 1), null);
});
test('production payload preserves exact decimal strings for arbitrary catalogue keys', () => {
    const data = {
        definitions: { acquisition_resources: ['test_good'] },
        acquisitions: [
            { resource_key: 'test_good', quantity: '0.123456', spending_limit: '2.000001', priority: 100 },
        ],
    };
    assert.deepEqual(acquisitionPlan(data, {}), [
        { resource_key: 'test_good', quantity: '0.123456', spending_limit: '2.000001', priority: 100 },
    ]);
    assert.throws(() => acquisitionPlan(data, { test_good: { quantity: '0.0000001' } }));
    assert.throws(() => acquisitionPlan(data, { test_good: { quantity: '1e4' } }));
});
test('report tokens resolve as text without interpreting player HTML', () => {
    assert.equal(
        reportText('##nation#3#usual_name## captured ##territory#8#name##.', {
            nations: [{ nation_id: 3, usual_name: '<img onerror=evil()>' }],
            territories: [{ territory_id: 8, name: 'Island' }],
        }),
        '<img onerror=evil()> captured Island.',
    );
});
function fixture(api = {}) {
    const snapshot = {
        game_id: 4,
        turn_number: 2,
        setup: { nation_id: 8 },
        nation: { definitions: { edit_counter: 1 } },
    };
    const world = {
        snapshot,
        same: (a, b) => a.game_id === b.game_id && a.turn_number === b.turn_number,
        marker: async () => snapshot,
        refresh: async () => {
            world.refreshes++;
            return true;
        },
        beginCommand: () => {},
        reconcile: () => world.refresh(),
        refreshes: 0,
    };
    return { snapshot, world, service: new GameplayService(api, world, { userId: 9 }) };
}
test('accepted deployment clears only submitted local IDs, independently of the originating view', async () => {
    let payload;
    const { service, snapshot } = fixture({
        deploy: async ({ body }) => {
            payload = body;
        },
    });
    const draft = service.deploymentDraft(snapshot);
    draft.entries = [{ draft_id: 1 }, { draft_id: 2 }];
    await service.command(
        'deploy',
        { deployments: [{ division_type: 'Infantry', territory_id: 1 }] },
        snapshot,
        { deploymentDraftIds: [1] },
    );
    assert.deepEqual(draft.entries, [{ draft_id: 2 }]);
    assert.equal(payload.deploymentDraftIds, undefined);
    assert.equal(service.deploymentDraft(snapshot), draft);
    assert.deepEqual(service.deploymentDraft({ ...snapshot, turn_number: 3 }).entries, []);
});
test('commands carry identity, serialize, reconcile, and never retry uncertain outcomes', async () => {
    let attempts = 0,
        payload;
    const { service, world, snapshot } = fixture({
        deploy: async ({ body }) => {
            attempts++;
            payload = body;
            throw Object.assign(new Error('Lost response'), { uncertain: true });
        },
    });
    await assert.rejects(service.command('deploy', { deployments: [] }, snapshot));
    assert.equal(attempts, 1);
    assert.deepEqual(payload.client_context, {
        game_id: 4,
        turn_number: 2,
        nation_id: 8,
        user_id: 9,
        resource_edit_counter: 1,
    });
    assert.equal(world.refreshes, 1);
    assert.equal(service.busy, false);
    assert.match(service.notice, /uncertain/);
    service.busy = true;
    await assert.rejects(service.command('deploy', {}, snapshot));
    assert.equal(attempts, 1);
});
test('stale client snapshot prevents sending a command; drafts do not cross turns', async () => {
    let calls = 0;
    const { service, world, snapshot } = fixture({ deploy: async () => calls++ });
    world.snapshot = { ...snapshot, turn_number: 3 };
    await assert.rejects(service.command('deploy', {}, snapshot));
    assert.equal(calls, 0);
    service.drafts(snapshot).ore = { quantity: '2' };
    assert.equal(service.drafts(snapshot).ore.quantity, '2');
    assert.deepEqual(service.drafts(world.snapshot), {});
});
test('ranking history is context-fenced, shared for concurrent readers, and cached per turn', async () => {
    let reads = 0;
    const requestedTurns = [];
    const { service, snapshot, world } = fixture({
        getGameRankingHistory: async ({ query }) => {
            reads++;
            requestedTurns.push(query.turn_number);
            assert.equal(query.game_id, 4);
            return { game_id: 4, through_turn: snapshot.turn_number, rankings: [] };
        },
    });
    const [first, second] = await Promise.all([
        service.rankingHistory(snapshot),
        service.rankingHistory(snapshot),
    ]);
    assert.equal(first, second);
    assert.equal(reads, 1);
    assert.equal(await service.rankingHistory(snapshot), first);
    assert.equal(reads, 1);

    const next = { ...snapshot, turn_number: 3 };
    world.snapshot = next;
    world.marker = async () => next;
    await assert.rejects(service.rankingHistory(next), /ranking history changed/i);
    assert.equal(reads, 2);
    assert.deepEqual(requestedTurns, [2, 3]);
});

test('policy drafts survive same-context refresh and reset on rule edits or rollback revisions', () => {
    const { service, snapshot } = fixture();
    Object.assign(snapshot, {
        turn_context_revision: 'first',
        nation: { definitions: { edit_counter: 1 }, policies: { edit_counter: 1 } },
    });
    const draft = service.policyDraft(snapshot);
    draft.changes = { tax: { option: 'standard', parameters: { rate: '.3' } } };
    assert.equal(service.policyDraft(structuredClone(snapshot)), draft);
    const revised = { ...snapshot, turn_context_revision: 'rollback' };
    assert.equal(service.policyDraft(revised).changes, null);
    service.policyDraft(revised).changes = {};
    assert.equal(
        service.policyDraft({
            ...revised,
            nation: { definitions: { edit_counter: 1 }, policies: { edit_counter: 2 } },
        }).changes,
        null,
    );
});

test('policy save clears only the accepted submitted draft and preserves newer or rejected edits', async () => {
    const { service, snapshot } = fixture({ savePendingPolicies: async () => {} });
    Object.assign(snapshot, {
        turn_context_revision: 'season',
        nation: {
            definitions: { edit_counter: 1, acquisition_resources: [] },
            acquisitions: [],
            policies: { turn_id: 5, edit_counter: 1, current: {}, pending: {} },
        },
    });
    const changes = { income_tax: { option: 'standard', parameters: { rate: '0.3' } } };
    const draft = service.policyDraft(snapshot);
    draft.changes = changes;
    draft.base = JSON.stringify([{}, {}]);
    await service.command('savePendingPolicies', { changes: structuredClone(changes) }, snapshot);
    assert.equal(draft.changes, null);
    draft.changes = changes;
    draft.base = JSON.stringify([{}, {}]);
    service.api.savePendingPolicies = async () => {
        draft.changes = { ...changes, newer: true };
    };
    await service.command('savePendingPolicies', { changes: structuredClone(changes) }, snapshot);
    assert.equal(draft.changes.newer, true);
    service.api.savePendingPolicies = async () => {
        throw new Error('Rejected');
    };
    await assert.rejects(
        service.command('savePendingPolicies', { changes: structuredClone(changes) }, snapshot),
    );
    assert.equal(draft.changes.newer, true);
});

test('policy preview is read-only and rejects a response from a replaced rules context', async () => {
    let payload;
    const { service, world, snapshot } = fixture({
        previewPolicies: async (args) => {
            payload = args.body;
            world.snapshot = {
                ...snapshot,
                nation: { definitions: { edit_counter: 1 }, policies: { edit_counter: 2 } },
            };
            return { valid: true };
        },
    });
    Object.assign(snapshot, {
        turn_context_revision: 'season',
        nation: {
            definitions: { edit_counter: 1, acquisition_resources: [] },
            acquisitions: [],
            policies: { turn_id: 5, edit_counter: 1, current: {}, pending: {} },
        },
    });
    await assert.rejects(service.previewPolicies(snapshot, {}), /plan changed/i);
    assert.equal(payload.edit_counter, 1);
    assert.equal(payload.client_context.turn_context_revision, 'season');
    assert.equal(world.refreshes, 0);
    assert.equal(service.outcome, null);
});
