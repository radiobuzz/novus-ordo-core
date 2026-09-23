import test from 'node:test';
import assert from 'node:assert/strict';
import { movementPath, productionBid } from '../../resources/js/client/services/movement.js';
import { productionPreview, productionProductivity } from '../../resources/js/client/services/production.js';
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
test('production uses existing labor units, cancellation, and safe numeric boundaries', () => {
    const definitions = { labor_per_unit: 1000000, max_bid_labor: 2147483647, bid_resources: ['Ore'] };
    assert.deepEqual(productionBid('Ore', '1.25', '4', definitions), {
        resource_type: 'Ore',
        max_quantity: 1250000,
        max_labor_allocation_per_unit: 250000,
    });
    assert.equal(productionBid('Ore', 0, 0, definitions).max_labor_allocation_per_unit, 2147483647);
    for (const value of [-1, Infinity, 'bad', 1e30])
        assert.throws(() => productionBid('Ore', value, 1, definitions));
    assert.throws(() => productionBid('Capital', 1, 1, definitions));
});
test('production presentation normalizes stored thresholds and previews territorial labor', () => {
    const definitions = { labor_per_unit: 100, max_bid_labor: 2147483647 };
    assert.equal(
        productionProductivity(
            { max_labor_allocation_per_unit: 333334 },
            {
                ...definitions,
                labor_per_unit: 1000000,
            },
        ),
        3,
    );
    assert.equal(productionProductivity({ max_labor_allocation_per_unit: 2147483647 }, definitions), 0);
    const data = {
        definitions,
        budget: {
            labor_pools: [
                { territory_id: 1, size: 100, free_labor: 60 },
                { territory_id: 2, size: 100, free_labor: 20 },
            ],
            labor_facility_allocations: [
                {
                    territory_id: 1,
                    resource_type: 'Oil',
                    capacity: 100,
                    productivity: 2,
                    allocation: 20,
                },
                {
                    territory_id: 2,
                    resource_type: 'Oil',
                    capacity: 100,
                    productivity: 1,
                    allocation: 10,
                },
            ],
        },
    };
    const filtered = productionPreview('Oil', 1.5, 1.5, data);
    assert.equal(filtered.eligibleCount, 1);
    assert.equal(filtered.facilityCeiling, 2);
    assert.equal(filtered.freeLabor, 0.6);
    assert.equal(filtered.allocatedLabor, 0.2);
    assert.equal(filtered.laborDemand, 0.75);
    assert.equal(filtered.facilities.find((facility) => facility.territory_id === 2).eligible, false);
    const all = productionPreview('Oil', 3, 0, data);
    assert.equal(all.eligibleCount, 2);
    assert.equal(all.facilityCeiling, 3);
    assert.equal(all.freeLabor, 0.8);
    assert.ok(Math.abs(all.allocatedLabor - 0.3) < 1e-9);
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
    const snapshot = { game_id: 4, turn_number: 2, setup: { nation_id: 8 } };
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
    assert.deepEqual(payload.client_context, { game_id: 4, turn_number: 2, nation_id: 8, user_id: 9 });
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
    service.drafts(snapshot).Ore = { quantity: '2' };
    assert.equal(service.drafts(snapshot).Ore.quantity, '2');
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
