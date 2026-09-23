import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceValues, turnKey } from '../../resources/js/client/services/turnBriefing.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';

test('resource values retain engine meanings, negative balances, zero and missing data', () => {
    const data = {
        budget: {
            balances: { Food: -2 },
            stockpiles: { Food: 42 },
            expenses: { Food: 0 },
            available_production: { Food: 40 },
        },
    };
    assert.deepEqual(resourceValues(data, 'Food'), {
        balance: -2,
        reserve: 42,
        production: null,
        upkeep: null,
        expenses: 0,
        available: 40,
    });
    assert.equal(resourceValues(data, 'Oil').reserve, null);
    assert.equal(turnKey({ game_id: 1, turn_number: 2, setup: { nation_id: 3 } }), '1:3:2');
    assert.equal(turnKey({ setup: {} }), null);
});

test('briefing uses result turn, guards generations and never submits commands', async () => {
    const snapshot = { game_id: 1, turn_number: 4, setup: { nation_id: 7 } };
    const world = {
        snapshot,
        generation: 1,
        scope: new Scope(),
        same: (a, b) => a.game_id === b.game_id && a.turn_number === b.turn_number,
        marker: async () => snapshot,
    };
    let requestedTurn;
    const api = {
        getGameNews: async () => [],
        getNationBattleLogs: async ({ query }) => {
            requestedTurn = query.turn_number;
            return [];
        },
        getGameIdentities: async () => ({ game_id: 1, turn_number: 4, nations: [], leaders: [] }),
    };
    const service = new GameplayService(api, world, {});
    await service.briefing(snapshot, new AbortController().signal);
    assert.equal(requestedTurn, 4);
    api.getGameNews = async () => {
        world.generation++;
        return [];
    };
    await assert.rejects(service.briefing(snapshot, new AbortController().signal));
    api.getGameIdentities = async () => ({ game_id: 2, turn_number: 4 });
    world.generation++;
    await assert.rejects(service.identities(snapshot, new AbortController().signal));
    await world.scope.dispose();
});
