import test from 'node:test';
import assert from 'node:assert/strict';
import { foreignTerritoryOverlay } from '../../resources/js/client/ui/map/foreignTerritoryOverlay.js';

test('foreign territory muting excludes own, unclaimed, selected and hovered territory', () => {
    const painted = [];
    const renderer = {
        context: {
            ownNationId: 1,
            selectedId: 4,
            hoveredId: 5,
            territories: [
                { territory_id: 1, owner_nation_id: 1 },
                { territory_id: 2, owner_nation_id: null },
                { territory_id: 3, owner_nation_id: 2 },
                { territory_id: 4, owner_nation_id: 2 },
                { territory_id: 5, owner_nation_id: 3 },
            ],
        },
        highlight(_ctx, id, color, alpha) {
            painted.push({ id, color, alpha });
        },
    };

    foreignTerritoryOverlay()({}, renderer);

    assert.deepEqual(painted, [{ id: 3, color: '#687479', alpha: 0.62 }]);
});
