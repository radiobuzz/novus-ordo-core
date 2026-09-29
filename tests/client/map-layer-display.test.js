import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue } from '../../resources/js/client/experiments/map-layers/catalogue.js';
import { layerDisplay } from '../../resources/js/client/ui/map/analysis/display.js';
const display = (id, locale = 'en', resource) =>
    layerDisplay(
        catalogue.find((l) => l.id === id),
        locale,
        resource,
    );

test('temperature follows Map Lab convention; legend and inspection share the conversion', () => {
    const t = display('temperature');
    assert.deepEqual(
        [0, 0.5, 1].map((v) => t.format(v, { tick: true })),
        ['-20 °C', '5 °C', '30 °C'],
    );
    assert.equal(t.format(0.555), '8 °C');
    assert.equal(display('temperature', 'fr').format(0.5), '5 °C');
    assert.equal(display('elevation').format(-20), '-20 m');
    assert.equal(display('depth').format(550, { tick: true, above: true }), '550+ m');
});
test('scores, percentages and relative quantities do not fabricate physical units', () => {
    for (const id of ['rainfall', 'moisture', 'fertility', 'exposure']) {
        assert.equal(display(id).format(0.72), '72/100');
        assert.match(display(id).description, /score/);
    }
    assert.equal(display('unrest').format(0.72), '72%');
    assert.match(display('flow').description, /not m³\/s/);
    assert.match(display('slope').description, /not degrees/);
    assert.match(display('density').description, /not km²/);
    assert.equal(display('population').format(12345), '12,345 people');
    assert.equal(display('flow').format(null), 'Unavailable');
});
test('resource output uses selected profile units and translated season labels', () => {
    const profile = { unit: 'tonnes', labels: { en: 'Copper', fr: 'Cuivre' } };
    assert.equal(display('production', 'en', profile).format(2.5), '2.5 tonnes/season');
    assert.equal(display('potential', 'fr', profile).format(2.5), '2,5 tonnes/saison');
    assert.match(display('potential', 'fr', profile).description, /Cuivre/);
    assert.equal(display('production', 'fr', { unit: 'units' }).format(2), '2 unités/saison');
});
