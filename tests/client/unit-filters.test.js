import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDivisions, updateUnitFilter } from '../../resources/js/client/services/unitFilters.js';

const divisions = [
    { division_id: 1, division_type: 'Infantry', order: null },
    { division_id: 2, division_type: 'Armored', order: { order_type: 'Guard' } },
    { division_id: 3, division_type: 'Fighter', order: { order_type: 'Move' } },
    { division_id: 4, division_type: 'Fighter', order: null },
];
const ids = (filters) => filterDivisions(divisions, filters).map(({ division_id }) => division_id);

test('unit filters OR inclusions within a category and AND separate categories', () => {
    assert.deepEqual(ids(new Map([['state:idle', 'include']])), [1, 4]);
    assert.deepEqual(
        ids(
            new Map([
                ['type:Infantry', 'include'],
                ['type:Fighter', 'include'],
            ]),
        ),
        [1, 3, 4],
    );
    assert.deepEqual(
        ids(
            new Map([
                ['state:idle', 'include'],
                ['type:Fighter', 'include'],
            ]),
        ),
        [4],
    );
});

test('excluded filters subtract units and clicking the same mode clears it', () => {
    let filters = updateUnitFilter(new Map(), 'state:idle', true);
    assert.deepEqual(ids(filters), [2, 3]);
    filters = updateUnitFilter(filters, 'type:Armored', true);
    assert.deepEqual(ids(filters), [3]);
    filters = updateUnitFilter(filters, 'state:idle', true);
    assert.deepEqual(ids(filters), [1, 3, 4]);
});

test('switching a filter between include and exclude replaces its mode', () => {
    const included = updateUnitFilter(new Map(), 'type:Fighter');
    assert.deepEqual(ids(included), [3, 4]);
    const excluded = updateUnitFilter(included, 'type:Fighter', true);
    assert.deepEqual(ids(excluded), [1, 2]);
});
