// Valid generated-map geometry with a compact 20-region landmass for end-to-end victory testing.
// Uses ordinary terrain/capacity/starting stocks; does not change engine or victory rules.
import { createMapModel } from '../../resources/js/map/model.js';
import { exportMap } from '../../resources/js/map/snapshot.js';
const snapshot = exportMap(createMapModel());
for (const cell of snapshot.cells) {
    const x = cell[2] % 30,
        y = Math.floor(cell[2] / 30);
    const land = x >= 10 && x < 15 && y >= 9 && y < 13;
    cell[3] = land ? 'plains' : 'ocean';
    cell[4] = land ? 'plains' : 'water';
    cell[5] = land ? 'grass' : 'none';
    cell[6] = false;
    cell[7] = false;
}
snapshot.rivers = [];
snapshot.shorelines = [];
snapshot.shores = [];
process.stdout.write(JSON.stringify(snapshot));
