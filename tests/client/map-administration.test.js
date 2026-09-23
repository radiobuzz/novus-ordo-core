import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import {
    createAdministration,
    createAdministrativeArea,
    editAdministrativeCells,
    undoAdministration,
    administrativeMembership,
    beginAdministrativeStroke,
    finishAdministrativeStroke,
    setDevelopmentZoneColor,
} from '../../resources/js/map-lab/administration.js';

test('zone colours are independent, validated and do not invalidate geometry or membership', () => {
    const admin = createAdministration(createMapLabModel(7, 'world'));
    const [zone, other] = admin.zones;
    const before = structuredClone(admin);
    assert.equal(setDevelopmentZoneColor(admin, zone.id, '#12AbEF'), true);
    assert.equal(zone.color, '#12abef');
    assert.equal(other.color, before.zones[1].color);
    assert.deepEqual(zone.cellIds, before.zones[0].cellIds);
    assert.equal(zone.geometryRevision, before.zones[0].geometryRevision);
    assert.equal(admin.revision, before.revision + 1);
    assert.equal(setDevelopmentZoneColor(admin, zone.id, 'red'), false);
    assert.equal(setDevelopmentZoneColor(admin, admin.provinces[0].id, '#000000'), false);
    assert.equal(admin.history.length, 0);
});

test('continuous strokes deduplicate brushes and undo all province transfers or zone edits together', () => {
    const model = createMapLabModel(7, 'world');
    for (const kind of ['province', 'zone']) {
        const admin = createAdministration(model),
            nationId = admin.countries[0].id;
        const original = structuredClone(admin);
        const area = createAdministrativeArea(admin, kind, nationId, 'Painted area');
        const editor = { kind, areaId: area.id, nationId, radius: 1, operation: 'add' };
        const stroke = beginAdministrativeStroke(admin, editor);
        const ids = [...admin.countries[0].cellIds].slice(0, 27);
        for (const cellId of [...ids, ...ids])
            editAdministrativeCells(admin, model, { ...editor, cellId }, stroke);
        assert.ok(area.cellIds.size >= 27);
        assert.equal(admin.history.length, 0);
        assert.equal(finishAdministrativeStroke(stroke), area.cellIds.size);
        assert.equal(admin.history.length, 1);
        assert.equal(finishAdministrativeStroke(stroke), 0);
        assert.ok(editAdministrativeCells(admin, model, { ...editor, cellId: ids[0] }, stroke).error);
        const removal = beginAdministrativeStroke(admin, { ...editor, operation: 'remove' });
        for (const cellId of ids)
            editAdministrativeCells(admin, model, { ...removal.editor, cellId }, removal);
        finishAdministrativeStroke(removal);
        assert.equal(area.cellIds.size, 0);
        undoAdministration(admin);
        assert.ok(area.cellIds.size >= 27);
        undoAdministration(admin);
        assert.equal(area.cellIds.size, 0);
        assert.deepEqual(admin.provinceByCell, original.provinceByCell);
        assert.deepEqual(admin.countryByCell, original.countryByCell);
        for (const z of original.zones)
            assert.deepEqual(admin.zones.find((a) => a.id === z.id).cellIds, z.cellIds);
        const empty = beginAdministrativeStroke(admin, editor);
        assert.ok(
            editAdministrativeCells(admin, model, { ...editor, cellId: ids[0], areaId: 'other' }, empty)
                .error,
        );
        assert.equal(finishAdministrativeStroke(empty), 0);
        assert.equal(admin.history.length, 0);
        for (let i = 0; i < 55; i++) {
            const next = beginAdministrativeStroke(admin, { ...editor, operation: i % 2 ? 'remove' : 'add' });
            editAdministrativeCells(admin, model, { ...next.editor, cellId: ids[0] }, next);
            finishAdministrativeStroke(next);
        }
        assert.equal(admin.history.length, 50);
    }
});

test('political sandbox is repeatable, land-only, microcell-based and independent of simulation ownership', () => {
    for (const density of [7, 19, 37]) {
        const model = createMapLabModel(density, 'world');
        const before = JSON.stringify(model.cells);
        const admin = createAdministration(model);
        assert.deepEqual(createAdministration(model), admin);
        assert.equal(admin.countries.length, 3);
        assert.equal(admin.provinces.length, 9);
        assert.equal(
            admin.countryByCell.size,
            model.cells.filter((c) => !['ocean', 'lake'].includes(c.terrain)).length,
        );
        assert.equal(admin.provinceByCell.size, admin.countryByCell.size);
        for (const country of admin.countries)
            for (const id of country.cellIds) assert.equal(admin.countryByCell.get(id), country.id);
        for (const province of admin.provinces)
            for (const id of province.cellIds) {
                assert.equal(admin.countryByCell.get(id), province.nationId);
                assert.equal(admin.provinceByCell.get(id), province.id);
            }
        for (const zone of admin.zones)
            for (const id of zone.cellIds) assert.equal(admin.countryByCell.get(id), zone.nationId);
        assert.ok(
            model.regions.some(
                (r) => new Set(r.cellIds.map((id) => admin.provinceByCell.get(id)).filter(Boolean)).size > 1,
            ),
        );
        assert.ok(
            admin.zones.some(
                (z) => new Set([...z.cellIds].map((id) => admin.provinceByCell.get(id))).size > 1,
            ),
        );
        assert.ok(model.cells.some((c) => administrativeMembership(admin, c.id).zones.length > 1));
        assert.equal(JSON.stringify(model.cells), before);
        for (const cell of model.cells) {
            cell.politicalOwnerId = 'other';
            cell.controllerId = 'other';
        }
        assert.deepEqual(createAdministration(model), admin);
    }
});

test('exclusive provinces, overlapping zones, constrained brush and undo never transfer sovereignty', () => {
    const model = createMapLabModel(19, 'world'),
        admin = createAdministration(model),
        nationId = admin.countries[0].id;
    const cellId = [...admin.countries[0].cellIds][0],
        ownership = [...admin.countryByCell];
    const original = admin.provinceByCell.get(cellId);
    const province = createAdministrativeArea(admin, 'province', nationId, 'Test Province');
    const args = { kind: 'province', areaId: province.id, nationId, cellId, radius: 0, operation: 'add' };
    assert.equal(editAdministrativeCells(admin, model, args).changed, 1);
    assert.equal(admin.provinceByCell.get(cellId), province.id);
    assert.ok(!admin.provinces.find((p) => p.id === original).cellIds.has(cellId));
    assert.equal(editAdministrativeCells(admin, model, { ...args, operation: 'remove' }).changed, 1);
    assert.ok(!admin.provinceByCell.has(cellId));
    assert.ok(undoAdministration(admin));
    assert.equal(admin.provinceByCell.get(cellId), province.id);
    assert.ok(undoAdministration(admin));
    assert.equal(admin.provinceByCell.get(cellId), original);
    const zone1 = createAdministrativeArea(admin, 'zone', nationId, 'Coastal program'),
        zone2 = createAdministrativeArea(admin, 'zone', nationId, 'River program');
    for (const area of [zone1, zone2])
        assert.equal(
            editAdministrativeCells(admin, model, { ...args, kind: 'zone', areaId: area.id }).changed,
            1,
        );
    assert.ok(zone1.cellIds.has(cellId) && zone2.cellIds.has(cellId));
    editAdministrativeCells(admin, model, { ...args, kind: 'zone', areaId: zone1.id, operation: 'remove' });
    assert.ok(!zone1.cellIds.has(cellId) && zone2.cellIds.has(cellId));
    assert.equal(admin.provinceByCell.get(cellId), original);
    assert.ok(undoAdministration(admin));
    assert.ok(zone1.cellIds.has(cellId));
    const foreign = [...admin.countries[1].cellIds][0];
    assert.ok(editAdministrativeCells(admin, model, { ...args, cellId: foreign, radius: 2 }).error);
    const water = model.cells.find((c) => c.terrain === 'ocean');
    assert.ok(editAdministrativeCells(admin, model, { ...args, cellId: water.id, radius: 2 }).error);
    editAdministrativeCells(admin, model, { ...args, radius: 2 });
    for (const id of province.cellIds) assert.equal(admin.countryByCell.get(id), nationId);
    assert.deepEqual([...admin.countryByCell], ownership);
    assert.equal(createAdministrativeArea(admin, 'province', nationId, '   '), null);
    assert.equal(createAdministrativeArea(admin, 'zone', 'missing', 'Zone'), null);
});

test('small scenarios and different seeds retain valid membership without requiring coastline or rivers', () => {
    for (const [scale, seed] of [
        ['scenario', 'ember-19'],
        ['world', 'riverlands'],
        ['world', 'polar-4'],
    ]) {
        const model = createMapLabModel(7, scale, { seed }),
            admin = createAdministration(model);
        assert.ok(admin.countries.length);
        for (const [id, owner] of admin.countryByCell) {
            assert.ok(model.cellById.has(id));
            assert.ok(admin.countries.some((n) => n.id === owner));
        }
    }
});
