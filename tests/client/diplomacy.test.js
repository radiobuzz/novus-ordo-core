import test from 'node:test';
import assert from 'node:assert/strict';
import { Scope } from '../../resources/js/client/runtime/Scope.js';
import { createStore } from '../../resources/js/client/runtime/Store.js';
import { DiplomacyService } from '../../resources/js/client/services/DiplomacyService.js';
import { draftMoveOrders, moveOrderPreview } from '../../resources/js/client/services/militaryCommands.js';
const tick = () => new Promise((r) => setImmediate(r));
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};
function fixture() {
    const snapshot = {
        game_id: 1,
        turn_number: 4,
        turn_context_revision: 'revision-4',
        setup: { nation_id: 1 },
        nation: {
            diplomacy: { enabled: true, relations: [] },
            definitions: { resources: [{ resource_key: 'money', grantable: true }] },
        },
    };
    const { store, publish } = createStore({ status: 'ready', snapshot });
    const world = {
        scope: new Scope(),
        store,
        get snapshot() {
            return store.value.snapshot;
        },
        current: true,
        same(a, b) {
            return a?.turn_context_revision === b?.turn_context_revision && a?.game_id === b?.game_id;
        },
    };
    const response = () => ({
        game_id: 1,
        nation_id: 1,
        turn_number: world.snapshot.turn_number,
        turn_context_revision: world.snapshot.turn_context_revision,
    });
    const gameplay = { busy: false };
    const api = {
        getDiplomacyInbox: async () => ({ ...response(), conversations: [] }),
        getNationConversation: async ({ params }) => ({
            ...response(),
            other_nation_id: params.nationId,
            messages: [],
            has_more: false,
        }),
    };
    const service = new DiplomacyService(api, world, gameplay, null);
    return { service, world, publish, api, gameplay, response };
}
test('conversation switching discards slow previous responses and preserves drafts', async () => {
    const f = fixture();
    try {
        await tick();
        await f.service.refresh();
        const hold = deferred();
        f.service.open = true;
        f.api.getNationConversation = async ({ params }) => {
            if (params.nationId === 2) await hold.promise;
            return { ...f.response(), other_nation_id: params.nationId, messages: [], has_more: false };
        };
        f.service.draft(2).text = 'Keep this draft';
        const first = f.service.select(2);
        await tick();
        const second = f.service.select(3);
        hold.resolve();
        await Promise.all([first, second]);
        assert.equal(f.service.store.value.conversation.other_nation_id, 3);
        assert.equal(f.service.draft(2).text, 'Keep this draft');
        assert.equal(f.service.dirty, true);
        f.publish({ status: 'blocked', snapshot: null });
        assert.equal(f.service.store.value.conversation, null);
        assert.equal(f.service.dirty, false);
        assert.equal(f.service.other, null);
    } finally {
        await f.world.scope.dispose();
    }
});
test('turn rollback revision rejects an in-flight response and command reconciliation reads current offers', async () => {
    const f = fixture();
    try {
        await tick();
        await f.service.refresh();
        const hold = deferred();
        const old = f.response();
        f.api.getDiplomacyInbox = async () => {
            await hold.promise;
            return { ...old, conversations: [{ other_nation_id: 2, unread: 99 }] };
        };
        const oldRead = f.service.refresh();
        await tick();
        f.publish({
            status: 'ready',
            snapshot: { ...f.world.snapshot, turn_context_revision: 'revision-after-rollback' },
        });
        hold.resolve();
        await oldRead;
        assert.deepEqual(f.service.store.value.inbox, []);
        f.api.getDiplomacyInbox = async () => ({
            ...f.response(),
            conversations: [{ other_nation_id: 2, unread: 1 }],
        });
        f.gameplay.busy = true;
        assert.equal(await f.gameplay.reconcileCommunication(), true);
        assert.equal(f.service.store.value.inbox[0].unread, 1);
        f.service.draft(2).text = 'Discard when leaving this game';
        await f.world.scope.dispose();
        assert.equal(f.service.dirty, false);
        assert.deepEqual(f.service.store.value.inbox, []);
        assert.equal(await f.service.refresh(), false);
    } finally {
        await f.world.scope.dispose();
    }
});
test('allied transit is free and peace destinations cannot be drafted', () => {
    const territories = [
        {
            territory_id: 1,
            owner_nation_id: 1,
            connected_territory_ids: [2],
            connected_land_territory_ids: [2],
        },
        {
            territory_id: 2,
            owner_nation_id: 2,
            connected_territory_ids: [1, 3],
            connected_land_territory_ids: [1, 3],
        },
        {
            territory_id: 3,
            owner_nation_id: 3,
            connected_territory_ids: [2],
            connected_land_territory_ids: [2],
        },
    ];
    const snapshot = {
        territories,
        setup: { nation_id: 1 },
        nation: { diplomacy: { relations: [{ nation_a_id: 1, nation_b_id: 2, state: 'Allied' }] } },
    };
    const data = {
        divisions: [{ division_id: 1, division_type: 'Armored', territory_id: 1 }],
        definitions: { divisions: [{ division_type: 'Armored', moves: 2, attack_costs: { Capital: 5 } }] },
        budget: { available_production: { Capital: 10 } },
    };
    const allied = draftMoveOrders(snapshot, data, [1], 2);
    assert.equal(moveOrderPreview(snapshot, data, allied).charged, 0);
    assert.deepEqual(draftMoveOrders(snapshot, data, [1], 3)[0].path_territory_ids, [2]);
    snapshot.nation.diplomacy.relations[0].state = 'Peace';
    assert.equal(draftMoveOrders(snapshot, data, [1], 2)[0].path_territory_ids, null);
    assert.equal(draftMoveOrders(snapshot, data, [1], 3)[0].path_territory_ids, null);
});

test('incoming action notices ask the world owner to reconcile once, without an extra command refresh', async () => {
    const f = fixture();
    try {
        await tick();
        await f.service.refresh();
        let refreshes = 0;
        f.world.refreshAfterActivity = async () => {
            refreshes++;
        };
        f.api.getDiplomacyInbox = async () => ({
            ...f.response(),
            conversations: [{ other_nation_id: 2, unread: 1, last_action_message_id: 50 }],
        });
        await f.service.refresh();
        assert.equal(refreshes, 1);
        await f.service.refresh();
        assert.equal(refreshes, 1);
        f.api.getDiplomacyInbox = async () => ({
            ...f.response(),
            conversations: [{ other_nation_id: 2, unread: 1, last_action_message_id: 51 }],
        });
        await f.gameplay.reconcileCommunication();
        assert.equal(refreshes, 1, 'Command reconciliation already refreshed the world');
    } finally {
        await f.world.scope.dispose();
    }
});

test('unread badge waits for confirmed read metadata, then refreshes its server count', async () => {
    const f = fixture();
    try {
        await tick();
        await f.service.refresh();
        let unread = 3;
        const ack = deferred();
        f.api.getDiplomacyInbox = async () => ({
            ...f.response(),
            conversations: [{ other_nation_id: 2, unread }],
        });
        f.api.readNationMessages = async ({ body }) => {
            assert.deepEqual(body, { nation_id: 2, message_id: 9 });
            await ack.promise;
            unread = 0;
        };
        f.service.open = true;
        f.service.other = 2;
        await f.service.refresh();
        const marking = f.service.markRead(9);
        await tick();
        assert.equal(f.service.store.value.inbox[0].unread, 3);
        ack.resolve();
        await marking;
        assert.equal(f.service.store.value.inbox[0].unread, 0);
    } finally {
        await f.world.scope.dispose();
    }
});
