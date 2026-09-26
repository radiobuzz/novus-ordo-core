import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createCartography } from '../../resources/js/map-lab/cartography.js';
import { createNaturalResources } from '../../resources/js/map-lab/natural-resources.js';
import {
    createDevelopment,
    setDevelopmentValue,
    builtPlots,
} from '../../resources/js/map-lab/development.js';
import {
    setScaleValue,
    restoreScaleCheckpoint,
    studyCells,
    setCellIndicator,
    polygonArea,
    clipPolygon,
} from '../../resources/js/map-lab/development-scale.js';
import { TerrainField } from '../../resources/js/map-lab/terrain-v2-field.js';
import { DevelopmentLandscape } from '../../resources/js/map-lab/development-landscape.js';
import { architecture } from '../../resources/js/map-lab/development-complexes.js';
import { hexCorners } from '../../resources/js/map-lab/hex.js';
import { segmentDistance } from '../../resources/js/map-lab/living-settlement.js';
const fixture = (resolution = 19) => {
    const model = createMapLabModel(resolution, 'world'),
        substrate = createNaturalResources(model);
    return { model, substrate, d: createDevelopment(model, createCartography(model), substrate) };
};

test('polygon-to-hex area shares conserve a cross-cell parcel without snapping its shape', () => {
    const hex = hexCorners(0, 0, 10),
        shifted = hexCorners(Math.sqrt(3) * 10, 0, 10);
    const parcel = [
        { x: 7, y: -2 },
        { x: 11, y: -2 },
        { x: 11, y: 2 },
        { x: 7, y: 2 },
    ];
    const first = polygonArea(clipPolygon(parcel, hex)),
        second = polygonArea(clipPolygon(parcel, shifted));
    assert.ok(first > 0 && second > 0);
    assert.ok(Math.abs(first + second - polygonArea(parcel)) < 1e-8);
});

test('scale, structure size and spacing are independent, reversible projections of the checkpoint', () => {
    const { model, substrate, d } = fixture(),
        s = d.sites.find((s) => s.living);
    const natural = JSON.stringify(model.cells),
        stock = JSON.stringify([...substrate.cells]);
    setDevelopmentValue(d, s.id, 'built', 100);
    setDevelopmentValue(d, s.id, 'activity', 25);
    const original = JSON.stringify(s.plots),
        originalStreets = s.streets,
        surface = new DevelopmentLandscape(d, true);
    const fullArea = studyCells(d, s).reduce((n, r) => n + r.area, 0);
    setScaleValue(d, s.id, 'footprintScale', 50);
    const half = JSON.stringify(s.plots),
        halfArea = studyCells(d, s).reduce((n, r) => n + r.area, 0);
    assert.ok(s.plots.length > 10);
    assert.ok(halfArea < fullArea * 0.3);
    for (const p of s.plots) {
        const base = s.checkpoint.plots.find((q) => q.id === p.id);
        assert.equal(p.x, s.x + (base.x - s.x) * 0.5);
        assert.equal(p.size, base.size * 0.5);
    }
    setScaleValue(d, s.id, 'footprintScale', 25);
    assert.ok(studyCells(d, s).reduce((n, r) => n + r.area, 0) < fullArea * 0.08);
    setScaleValue(d, s.id, 'footprintScale', 50);
    assert.equal(JSON.stringify(s.plots), half, 'always project from the checkpoint, never compound scaling');
    setScaleValue(d, s.id, 'structureScale', 50);
    const sized = s.plots.find((p) => p.use === 'homes'),
        base = s.checkpoint.plots.find((p) => p.id === sized.id);
    assert.equal(sized.size, base.size * 0.25);
    assert.equal(sized.x, s.x + (base.x - s.x) * 0.5);
    setScaleValue(d, s.id, 'spacing', 80);
    const spaced = s.plots.find((p) => p.id === sized.id);
    assert.equal(spaced.x, s.x + (base.x - s.x) * 0.5 * 0.8);
    assert.equal(s.activity, 25);
    assert.equal(s.built, 100);
    restoreScaleCheckpoint(d, s.id);
    assert.equal(s.plots, s.checkpoint.plots);
    assert.equal(JSON.stringify(s.plots), original);
    assert.equal(s.streets, originalStreets);
    assert.equal(new DevelopmentLandscape(d, true).key, surface.key);
    assert.equal(JSON.stringify(model.cells), natural);
    assert.equal(JSON.stringify([...substrate.cells]), stock);
    assert.equal(setScaleValue(d, 'missing', 'spacing', 100), false);
    assert.equal(setScaleValue(d, s.id, 'spacing', NaN), false);
    assert.equal(setScaleValue(d, s.id, 'useCellData', 'false'), false);
});

test('synthetic cells actually limit cross-boundary area and drive architecture without changing geography', () => {
    const { model, d } = fixture(),
        s = d.sites.find((s) => s.living);
    const natural = JSON.stringify(model.cells);
    setDevelopmentValue(d, s.id, 'built', 100);
    setDevelopmentValue(d, s.id, 'urbanIntensity', 100);
    setScaleValue(d, s.id, 'useCellData', true);
    setScaleValue(d, s.id, 'footprintScale', 50);
    let rows = studyCells(d, s);
    assert.ok(rows.some((r) => r.usedPercent > 0 && r.usedPercent < 100));
    for (const row of rows) assert.ok(row.usedPercent <= row.coverage + 1e-4);
    const used = rows.filter((r) => r.area > 0).sort((a, b) => b.area - a.area)[0];
    const stored = used.coverage;
    assert.equal(setCellIndicator(d, s.id, used.cellId, 'coverage', 0), true);
    assert.equal(studyCells(d, s).find((r) => r.cellId === used.cellId).usedPercent, 0);
    assert.equal(setCellIndicator(d, s.id, used.cellId, 'coverage', stored), true);
    assert.ok(studyCells(d, s).find((r) => r.cellId === used.cellId).usedPercent > 0);
    const home = s.plots.find(
        (p) => p.use === 'homes' && ['tower', 'landmark', 'midrise'].includes(architecture(s, p, d.unit)),
    );
    assert.ok(home);
    assert.equal(setCellIndicator(d, s.id, home.cellId, 'intensity', 0), true);
    assert.ok(
        s.plots
            .filter((p) => p.cellId === home.cellId && p.use === 'homes')
            .every((p) => !['tower', 'landmark', 'midrise', 'rowhouse'].includes(architecture(s, p, d.unit))),
    );
    const geometry = JSON.stringify(s.plots),
        key = new DevelopmentLandscape(d, true).key;
    setDevelopmentValue(d, s.id, 'activity', 0);
    assert.equal(JSON.stringify(s.plots), geometry);
    assert.equal(new DevelopmentLandscape(d, true).key, key);
    const capacity = s.plots;
    setDevelopmentValue(d, s.id, 'built', 20);
    const small = builtPlots(s);
    setDevelopmentValue(d, s.id, 'built', 100);
    assert.equal(s.plots, capacity);
    for (const p of small) assert.ok(builtPlots(s).includes(p));
    assert.equal(JSON.stringify(model.cells), natural);
});

test('all compact study types stay dry, bounded and resource-backed across 7/19/37 cell resolutions', () => {
    for (const resolution of [7, 19, 37]) {
        const { model, substrate, d } = fixture(resolution),
            field = new TerrainField(model);
        const riverEdges = [...model.riverEdges.values()].map((e) => [
            model.drainage.vertices.get(e.fromId),
            model.drainage.vertices.get(e.toId),
        ]);
        for (const s of d.sites) {
            setDevelopmentValue(d, s.id, 'built', 100);
            setScaleValue(d, s.id, 'useCellData', true);
            for (const scale of [100, 50, 25]) {
                setScaleValue(d, s.id, 'footprintScale', scale);
                for (const row of studyCells(d, s)) assert.ok(row.usedPercent <= row.coverage + 1e-4);
                for (const p of s.plots) {
                    for (const q of p.points) {
                        assert.ok(field.sample(q.x, q.y)[1] >= 0.95);
                        assert.ok(
                            riverEdges.every(
                                ([a, b]) => segmentDistance(q.x, q.y, a, b) >= model.cellSize * 0.17,
                            ),
                        );
                    }
                    if (s.resource) assert.ok(substrate.cells.get(p.cellId)[s.resource].density > 0.02);
                }
                assert.ok(s.plots.length <= s.checkpoint.plots.length);
            }
        }
    }
});
