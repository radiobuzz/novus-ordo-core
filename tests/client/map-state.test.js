import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../../resources/js/client/features/world/Camera.js';
import { MapPicker } from '../../resources/js/client/features/world/MapPicker.js';
import { SavedState } from '../../resources/js/client/services/SavedState.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test('rotated camera uses the same transform for drawing, picking, panning and anchored zoom', () => {
    const camera = new Camera(900, 400);
    camera.resize(1000, 700);
    camera.zoom = 3;
    const picker = new MapPicker([{ territory_id: 7, x: 10, y: 8 }], { tileWidth: 30, tileHeight: 20 });
    for (const degrees of [15, 45, 90, 180, 270, 345]) {
        camera.setAngle((degrees * Math.PI) / 180);
        const screen = camera.worldToScreen(315, 170),
            world = camera.screenToWorld(screen.x, screen.y);
        near(world.x, 315);
        near(world.y, 170);
        assert.equal(picker.atScreen(camera, screen.x, screen.y).territory_id, 7);
        let matrix;
        camera.applyTransform({ setTransform: (...values) => (matrix = values) }, 2, 3);
        near(matrix[0] * 315 + matrix[2] * 170 + matrix[4], screen.x * 2);
        near(matrix[1] * 315 + matrix[3] * 170 + matrix[5], screen.y * 3);
        camera.pan(30, -20);
        const moved = camera.worldToScreen(315, 170);
        near(moved.x, screen.x + 30);
        near(moved.y, screen.y - 20);
        const anchor = camera.screenToWorld(410, 350);
        camera.zoomAt(1.1, 410, 350);
        const after = camera.screenToWorld(410, 350);
        near(after.x, anchor.x);
        near(after.y, anchor.y);
    }
});

test('fit contains the rotated world, culling covers all four corners and saved cameras remain compatible', () => {
    const camera = new Camera(900, 400);
    camera.resize(800, 600);
    for (const degrees of [0, 15, 45, 90, 180, 270]) {
        camera.setAngle((degrees * Math.PI) / 180);
        camera.fit();
        for (const [x, y] of [
            [0, 0],
            [900, 0],
            [900, 400],
            [0, 400],
        ]) {
            const p = camera.worldToScreen(x, y);
            assert.ok(p.x >= 0 && p.x <= camera.width && p.y >= 0 && p.y <= camera.height);
        }
        const bounds = camera.worldBounds();
        for (const p of camera.viewportCorners()) {
            assert.ok(p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom);
        }
        const restored = new Camera(900, 400);
        restored.resize(800, 600);
        restored.restore(camera.snapshot());
        assert.deepEqual(restored.snapshot(), camera.snapshot());
    }
    camera.restore({ x: 100, y: 200, zoom: 2 });
    assert.equal(camera.angle, 0);
    camera.restore({ x: 100, y: 200, zoom: 2, angle: Infinity });
    assert.equal(camera.angle, 0);
    camera.setAngle(-Math.PI / 2);
    near(camera.angle, Math.PI * 1.5);
    for (let i = 0; i < 6; i++) camera.setAngle(camera.angle + Math.PI / 12);
    assert.equal(camera.angle, 0);
});

test('camera transforms and picking remain correct after pan, resize and anchored zoom', () => {
    const camera = new Camera(900, 400);
    camera.resize(1000, 700);
    camera.fit();
    const picker = new MapPicker([{ territory_id: 7, x: 10, y: 8 }], { tileWidth: 30, tileHeight: 20 });
    const before = camera.screenToWorld(410, 350);
    camera.zoomAt(2, 410, 350);
    const after = camera.screenToWorld(410, 350);
    assert.ok(Math.abs(before.x - after.x) < 1e-9);
    assert.ok(Math.abs(before.y - after.y) < 1e-9);
    camera.pan(30, -20);
    camera.resize(500, 350);
    const p = camera.worldToScreen(315, 170);
    assert.equal(picker.atScreen(camera, p.x, p.y).territory_id, 7);
    assert.equal(picker.atWorld(-1, -1), null);
    assert.equal(picker.atWorld(900, 400), null);
});
test('corrupt or cross-user/game saved state cannot leak and invalid cameras fit safely', () => {
    const data = new Map();
    const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
    const a = new SavedState(storage, 'user-1').child('game-1').child('world');
    a.write({ camera: { x: 100, y: 200, zoom: 2 } });
    assert.equal(a.read().camera.x, 100);
    assert.deepEqual(new SavedState(storage, 'user-2').child('game-1').child('world').read(), {});
    storage.setItem('no7:v1:user-1:game-1:world', '{bad');
    assert.deepEqual(a.read(), {});
    const camera = new Camera(900, 400);
    camera.resize(500, 400);
    camera.restore({ x: 'evil', y: Infinity, zoom: -1 });
    assert.equal(camera.zoom, camera.fitZoom);
    camera.restore({ x: -100, y: 5000, zoom: 10000 });
    assert.equal(camera.x, 0);
    assert.equal(camera.y, 400);
    assert.equal(camera.zoom, 16);
});
