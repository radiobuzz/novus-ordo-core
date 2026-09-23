import test from 'node:test';
import assert from 'node:assert/strict';
import { moveOrderPreview } from '../../resources/js/client/services/militaryCommands.js';
import { nationColorChoices } from '../../resources/js/client/services/nationColors.js';
import { NationCreationProcess } from '../../resources/js/client/features/nation-creation/NationCreationProcess.js';
import { SoundService } from '../../resources/js/client/services/SoundService.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';

test('rejection cue has two pitches and respects event mute, global mute and zero volume', async () => {
    const scope = new Scope();
    const sound = new SoundService({ read: () => ({}), write() {} }, scope);
    const frequencies = [];
    const previousDocument = globalThis.document;
    globalThis.document = { hidden: false };
    sound.context = {
        state: 'running',
        currentTime: 0,
        destination: {},
        suspend: async () => {},
        close: async () => {},
        createOscillator: () => ({
            frequency: { setValueAtTime: (f) => frequencies.push(f), exponentialRampToValueAtTime() {} },
            connect: (node) => node,
            start() {},
            stop() {},
        }),
        createGain: () => ({
            gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
        }),
    };
    try {
        sound.play('rejected');
        assert.deepEqual(frequencies, []);
        sound.set({ enabled: true });
        sound.play('rejected');
        assert.deepEqual(frequencies, [210, 125]);
        sound.set({ events: false });
        sound.play('rejected');
        sound.set({ events: true, volume: 0 });
        sound.play('rejected');
        sound.set({ enabled: false, volume: 1 });
        sound.play('rejected');
        assert.deepEqual(frequencies, [210, 125]);
    } finally {
        globalThis.document = previousDocument;
        await scope.dispose();
    }
});

const catalogue = {
    colors: [
        { id: 1, name: 'Red', primary_allowed: 1 },
        { id: 2, name: 'Blue', primary_allowed: 1 },
        { id: 25, name: 'Black', primary_allowed: 0 },
    ],
    assignments: [{ nation_id: 7, name: 'Other nation', primary_color_id: 1, secondary_color_id: 25 }],
};
test('primary choices exclude neutrals and reserve other nations; secondary choices are reusable', () => {
    const primary = nationColorChoices(catalogue, null, 'en', true);
    assert.equal(primary.length, 2);
    assert.equal(primary[0].disabled, true);
    assert.equal(nationColorChoices(catalogue, 7, 'en', true)[0].disabled, false);
    assert.equal(nationColorChoices(catalogue, null, 'en', false).filter((c) => !c.disabled).length, 3);
});
test('creation defaults to an available primary and validates colour drafts', () => {
    const process = new NationCreationProcess({ nation_colors: catalogue }, {}, () => {});
    assert.equal(process.draft.identity.primary_color_id, 2);
    process.updateDraft('identity', { nation_name: 'New nation', secondary_color_id: 25 });
    assert.deepEqual(process.validate('identity'), {});
    process.updateDraft('identity', { primary_color_id: 25 });
    assert.ok(process.validate('identity').primary_color_id);
    process.updateDraft('identity', { primary_color_id: 1 });
    assert.ok(process.validate('identity').primary_color_id);
    process.scope.dispose();
});
test('move preview mirrors new hostile attack costs, availability, existing orders and unknown metadata', () => {
    const snapshot = {
        setup: { nation_id: 7 },
        territories: [
            { territory_id: 1, owner_nation_id: 7 },
            { territory_id: 2, owner_nation_id: 8 },
            { territory_id: 3, owner_nation_id: null },
        ],
    };
    const data = {
        divisions: [1, 2].map((id) => ({ division_id: id, division_type: 'Armored', order: null })),
        definitions: { divisions: [{ division_type: 'Armored', attack_costs: { Oil: 1, Capital: 2 } }] },
        budget: { available_production: { Oil: 1, Capital: 4 } },
    };
    const orders = (destination) =>
        [1, 2].map((id) => ({
            division_id: id,
            destination_territory_id: destination,
            path_territory_ids: [],
        }));
    assert.deepEqual(moveOrderPreview(snapshot, data, orders(1)).costs, {});
    for (const destination of [2, 3]) {
        const preview = moveOrderPreview(snapshot, data, orders(destination));
        assert.deepEqual(preview.costs, { Oil: 2, Capital: 4 });
        assert.deepEqual(preview.shortages, { Oil: 1 });
        assert.equal(preview.valid, false);
    }
    for (const type of ['Attack', 'Raid']) {
        data.divisions[0].order = { order_type: type };
        assert.equal(moveOrderPreview(snapshot, data, orders(2)).valid, true);
        assert.deepEqual(moveOrderPreview(snapshot, data, orders(2)).costs, { Oil: 1, Capital: 2 });
    }
    delete data.definitions.divisions[0].attack_costs;
    assert.equal(moveOrderPreview(snapshot, data, orders(2)).valid, false);
    assert.equal(
        moveOrderPreview(snapshot, data, [{ ...orders(1)[0], path_territory_ids: null }]).valid,
        false,
    );
});
