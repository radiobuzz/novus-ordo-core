import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainDetailPlan, TERRAIN_PIXEL_BUDGET } from '../../resources/js/map/terrain-detail-plan.js';
import { Camera } from '../../resources/js/client/ui/map/Camera.js';

const model = { width: 4053, height: 3318, cellSize: 33.5, cellCount: 7 };
test('whole-world detail fits by reducing raster size instead of rejecting more than 96 chunks', () => {
    const camera = new Camera(model.width, model.height);
    camera.resize(1440, 800);
    camera.fit();
    const plan = terrainDetailPlan(model, camera, 2);
    assert.ok(plan.chunks > 96);
    assert.ok(plan.fits);
    assert.ok(plan.resolution <= 64);
    assert.ok(plan.screenSpan > 8 && plan.screenSpan < 96);
    assert.ok(plan.chunks * plan.resolution ** 2 * 2 <= TERRAIN_PIXEL_BUDGET);
    camera.setAngle(Math.PI / 4);
    const rotated = terrainDetailPlan(model, camera);
    assert.ok(rotated.chunks <= Math.ceil(model.width / plan.span) * Math.ceil(model.height / plan.span));
});
test('extreme maps retain a finite chunk budget; close detail retains high resolution', () => {
    const large = { ...model, width: 50000, height: 50000 };
    const camera = new Camera(large.width, large.height);
    camera.resize(1440, 800);
    camera.fit();
    assert.equal(terrainDetailPlan(large, camera).fits, false);
    camera.zoom = 4;
    const close = terrainDetailPlan(large, camera, 2);
    assert.ok(close.fits);
    assert.equal(close.resolution, 512);
});
