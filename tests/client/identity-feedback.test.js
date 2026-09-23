import assert from 'node:assert/strict';
import { soundPreferences, SoundService } from '../../resources/js/client/services/SoundService.js';
import { Scope } from '../../resources/js/client/runtime/Scope.js';
import { SavedState } from '../../resources/js/client/services/SavedState.js';
import { nationPalette } from '../../resources/js/client/services/nationColors.js';
import { unitMarking, recolorUnitPixels } from '../../resources/js/client/ui/map/unitPalette.js';
import { iconUrl } from '../../resources/js/client/ui/icons.js';
import { fixtures } from './fixtures.js';

assert.equal(soundPreferences().enabled, false);
assert.equal(soundPreferences({ enabled: 'true', volume: Infinity }).enabled, false);
assert.equal(soundPreferences({ volume: -2 }).volume, 0);
assert.equal(soundPreferences({ volume: 5 }).volume, 1);
const data = new Map(),
    storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
const scope = new Scope(),
    saved = new SavedState(storage, 'device:sound');
const sound = new SoundService(saved, scope);
sound.set({ enabled: true, interaction: false, events: false, volume: 0.2 });
assert.deepEqual(saved.read(), { enabled: true, interaction: false, events: false, volume: 0.2 });
sound.set({ enabled: false });
assert.equal(saved.read().enabled, false);
await scope.dispose();
const catalogue = fixtures('/game').nation_colors;
assert.equal(catalogue.colors.length, 24);
assert.equal(nationPalette(catalogue, 7).paint, '#d94b57');
assert.equal(nationPalette(catalogue, 8).paint, '#428ee8');
assert.equal(nationPalette(catalogue, 8).accent, nationPalette(catalogue, 7).accent);
assert.ok(iconUrl('Food').startsWith('data:image/svg+xml,'));
assert.ok(decodeURIComponent(iconUrl('ready')).includes('viewBox="0 0 24 24"'));
assert.equal(unitMarking('Infantry', 0.3, 0.23), 'paint');
assert.equal(unitMarking('Infantry', 0.3, 0.65), null);
const pixels = new Uint8ClampedArray([110, 120, 60, 255, 110, 120, 60, 255, 180, 110, 75, 255]);
recolorUnitPixels(pixels, { paint: '#d94b57', accent: '#428ee8' }, false, (i) => (i === 0 ? 'paint' : null));
assert.notDeepEqual([...pixels.slice(0, 3)], [110, 120, 60]);
assert.deepEqual([...pixels.slice(4)], [110, 120, 60, 255, 180, 110, 75, 255]);
