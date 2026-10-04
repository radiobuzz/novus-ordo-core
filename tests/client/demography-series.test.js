import test from 'node:test';
import assert from 'node:assert/strict';
import {
    indicatorGroups,
    lowerIsBetter,
    indicatorPercent,
    indicatorValues,
    indicatorPoint,
    precedingIndicators,
} from '../../resources/js/client/features/gameplay/demographySeries.js';

test('indicator groups cover ten distinct conditions and distinguish social pressures', () => {
    const keys = indicatorGroups.flatMap((g) => g.keys);
    assert.equal(keys.length, 10);
    assert.equal(new Set(keys).size, 10);
    assert.deepEqual([...lowerIsBetter], ['inequality', 'crime', 'unrest', 'informal']);
});

test('percentage projection preserves zero and missing observations without inventing measurements', () => {
    for (const value of [undefined, null, '', ' ', [], {}, true, false, NaN, Infinity, -0.1, 1.1])
        assert.equal(indicatorPercent(value), null);
    assert.equal(indicatorPercent(0), 0);
    assert.equal(indicatorPercent('0.75'), 75);
    const input = { season: 2, economy: { indicators: { health: 0.6, unrest: 0 } } };
    const copy = structuredClone(input);
    const point = indicatorPoint(input);
    assert.equal(point.values.health, 60);
    assert.equal(point.values.unrest, 0);
    assert.equal(point.values.education, null);
    assert.deepEqual(input, copy);
});

test('seasonal changes compare the preceding close, never the latest close or a gap', () => {
    const history = {
        seasons: [1, 2, 3].map((season) => ({ season, economy: { indicators: { health: season / 10 } } })),
    };
    assert.equal(precedingIndicators(history, 4).health, 20);
    assert.equal(precedingIndicators({ seasons: [history.seasons[0], history.seasons[2]] }, 4).health, null);
    assert.equal(precedingIndicators(history, 1).health, null);
    assert.deepEqual(precedingIndicators(null, 4), indicatorValues());
});
