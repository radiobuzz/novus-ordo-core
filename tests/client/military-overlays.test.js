import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStack } from '../../resources/js/client/ui/map/militaryOverlay.js';
import { projectBattleMarkers } from '../../resources/js/client/ui/map/battleOverlay.js';
import { GameplayService } from '../../resources/js/client/services/GameplayService.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';

test('military stack summary separates Guard and composes active units', () => {
    const summary = summarizeStack([
        { state: 'active', division_type: 'Infantry', order: { order_type: 'Guard' } },
        { state: 'active', division_type: 'Infantry', order: null },
        { state: 'active', division_type: 'Fighter', order: { order_type: 'Guard' } },
        { state: 'pending', division_type: 'Armored' },
        { state: 'draft', division_type: 'Bomber' },
    ]);
    assert.deepEqual(summary, {
        guard: 2,
        active: 1,
        pending: 1,
        draft: 1,
        composition: [
            { type: 'Infantry', count: 2 },
            { type: 'Fighter', count: 1 },
        ],
    });
});

test('battle markers expose every public site but losses only from participant logs', () => {
    const news = [
        { context: { type: 'battle', battle_id: 10, territory_id: 2, outcome: 'conquered' } },
        { context: { type: 'battle', battle_id: 11, territory_id: 2, outcome: 'repelled' } },
        { context: { type: 'battle', battle_id: 12, territory_id: 3, outcome: 'repelled' } },
        { context: null },
    ];
    const markers = projectBattleMarkers(news, [
        {
            battle_id: 10,
            attacker_formation_losses: 2,
            defender_formation_losses: 4,
        },
    ]);
    assert.deepEqual(markers, [
        {
            territoryId: 2,
            count: 2,
            conquered: 1,
            repelled: 1,
            attackerLosses: 2,
            defenderLosses: 4,
            knownLosses: true,
        },
        {
            territoryId: 3,
            count: 1,
            conquered: 0,
            repelled: 1,
            attackerLosses: 0,
            defenderLosses: 0,
            knownLosses: false,
        },
    ]);
});

test('military history coalesces the public and participant reads for one turn', async () => {
    const scope = new Scope();
    const snapshot = { game_id: 4, turn_number: 9, setup: { nation_id: 7 } };
    const world = {
        scope,
        snapshot,
        generation: 2,
        marker: async () => snapshot,
        same: (left, right) => left?.game_id === right?.game_id && left?.turn_number === right?.turn_number,
    };
    const calls = [];
    const service = new GameplayService(
        {
            getGameNews: async () => (calls.push('news'), [{ context: null }]),
            getNationBattleLogs: async () => (calls.push('battles'), [{ battle_id: 1 }]),
        },
        world,
        {},
    );
    try {
        const [first, second] = await Promise.all([
            service.militaryHistory(snapshot),
            service.militaryHistory(snapshot),
        ]);
        assert.equal(first, second);
        assert.deepEqual(calls.sort(), ['battles', 'news']);
    } finally {
        await scope.dispose();
    }
});

test('spectator military history never requests private battle logs', async () => {
    const scope = new Scope();
    const snapshot = { game_id: 4, turn_number: 9, setup: { nation_id: null } };
    const world = {
        scope,
        snapshot,
        generation: 2,
        marker: async () => snapshot,
        same: (left, right) => left?.game_id === right?.game_id && left?.turn_number === right?.turn_number,
    };
    const service = new GameplayService(
        {
            getGameNews: async () => [],
            getNationBattleLogs: async () => assert.fail('spectator requested private battle logs'),
        },
        world,
        {},
    );
    try {
        assert.deepEqual(await service.militaryHistory(snapshot), { news: [], battles: [] });
    } finally {
        await scope.dispose();
    }
});
