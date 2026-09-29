import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapLabModel } from '../../resources/js/map-lab/model.js';
import { createCartography } from '../../resources/js/map/cartography.js';
import { createNaturalResources } from '../../resources/js/map-lab/natural-resources.js';
import {
    createDevelopment,
    builtPlots,
    setDevelopmentValue,
    plotActivity,
} from '../../resources/js/map-lab/development.js';
import { TerrainField } from '../../resources/js/map/terrain-v2-field.js';
import { DevelopmentLandscape } from '../../resources/js/map-lab/development-landscape.js';
import { segmentDistance } from '../../resources/js/map-lab/living-settlement.js';
import { architecture } from '../../resources/js/map-lab/development-complexes.js';

test('woodland study shares stable clearings and terrain-safe streets without changing the natural model', () => {
    const model = createMapLabModel(19, 'world'),
        field = new TerrainField(model);
    const before = JSON.stringify(model.cells);
    const d = createDevelopment(model, createCartography(model), createNaturalResources(model));
    const site = d.sites.find((s) => s.living);
    assert.ok(site);
    assert.equal(model.cellById.get(site.cellId).vegetation, 'forest');
    assert.ok(site.plots.some((p) => p.use === 'fields'));
    assert.ok(site.streets.length);
    setDevelopmentValue(d, site.id, 'built', 100);
    const surface = new DevelopmentLandscape(d, true);
    const homes = site.plots.filter((p) => p.use === 'homes');
    for (const p of homes) assert.equal(surface.clearing(p.x, p.y), 1);
    const riverEdges = [...model.riverEdges.values()].map((e) => [
        model.drainage.vertices.get(e.fromId),
        model.drainage.vertices.get(e.toId),
    ]);
    for (const street of site.streets)
        for (let i = 0; i <= 10; i++) {
            const p = {
                x: street.a.x + ((street.b.x - street.a.x) * i) / 10,
                y: street.a.y + ((street.b.y - street.a.y) * i) / 10,
            };
            assert.ok(field.sample(p.x, p.y)[1] >= 0.94);
            assert.ok(!riverEdges.some(([a, b]) => segmentDistance(p.x, p.y, a, b) < d.unit * 0.02));
        }
    setDevelopmentValue(d, site.id, 'activity', 0);
    const idle = new DevelopmentLandscape(d, true);
    assert.equal(idle.key, surface.key);
    assert.deepEqual(idle.plots, surface.plots);
    assert.deepEqual(idle.streets, surface.streets);
    const hidden = new DevelopmentLandscape(d, false);
    assert.equal(hidden.key, 'natural');
    assert.equal(hidden.clearing(site.x, site.y, d.unit), 0);
    setDevelopmentValue(d, site.id, 'built', 0);
    const empty = new DevelopmentLandscape(d, true);
    assert.ok(!empty.plots.some((p) => p.living));
    assert.ok(empty.streets.every((p) => !site.streets.includes(p)));
    for (const s of d.sites) setDevelopmentValue(d, s.id, 'built', 0);
    assert.equal(new DevelopmentLandscape(d, true).streets.length, 0);
    assert.equal(JSON.stringify(model.cells), before);
});

test('development is a repeatable read-only visual model with suitable dry resource-backed footprints', () => {
    const model = createMapLabModel(19, 'world'),
        atlas = createCartography(model),
        substrate = createNaturalResources(model);
    const before = JSON.stringify(model.cells),
        stock = JSON.stringify([...substrate.cells]);
    const development = createDevelopment(model, atlas, substrate),
        field = new TerrainField(model);
    assert.equal(development.sites.length, 6);
    assert.deepEqual(createDevelopment(model, atlas, substrate), development);
    for (const site of development.sites) {
        assert.ok(site.cellIds.size > 1);
        assert.ok(site.plots.length < 300);
        for (const plot of site.plots) {
            assert.ok(!['lake', 'ocean'].includes(model.cellById.get(plot.cellId).terrain));
            for (const point of plot.points) assert.ok(field.sample(point.x, point.y)[1] >= 0.95);
            if (site.resource) assert.ok(substrate.cells.get(plot.cellId)[site.resource].density > 0.02);
        }
    }
    assert.equal(JSON.stringify(model.cells), before);
    assert.equal(JSON.stringify([...substrate.cells]), stock);
});

test('growth adds stable footprints; idling and missing stock never erase existing construction', () => {
    const model = createMapLabModel(19, 'world'),
        atlas = createCartography(model),
        substrate = createNaturalResources(model);
    const development = createDevelopment(model, atlas, substrate);
    for (const site of development.sites) {
        const geometry = JSON.stringify(site.plots);
        setDevelopmentValue(development, site.id, 'built', 20);
        const sparse = builtPlots(site);
        setDevelopmentValue(development, site.id, 'built', 100);
        const mature = builtPlots(site);
        assert.ok(mature.length > sparse.length);
        for (const plot of sparse)
            assert.equal(
                mature.find((p) => p.id === plot.id),
                plot,
            );
        setDevelopmentValue(development, site.id, 'activity', 0);
        assert.deepEqual(builtPlots(site), mature);
        assert.ok(mature.every((p) => plotActivity(site, p, substrate) === 0));
        setDevelopmentValue(development, site.id, 'activity', 100);
        assert.ok(mature.every((p) => plotActivity(site, p, substrate) === 1));
        assert.equal(JSON.stringify(site.plots), geometry);
        setDevelopmentValue(development, site.id, 'built', 0);
        assert.equal(builtPlots(site).length, 0);
    }
    const empty = createNaturalResources(model, { abundance: 0 });
    for (const site of development.sites.filter((s) => s.resource)) {
        setDevelopmentValue(development, site.id, 'built', 100);
        assert.ok(builtPlots(site).length);
        assert.ok(builtPlots(site).every((p) => plotActivity(site, p, empty) === 0));
    }
    assert.equal(setDevelopmentValue(development, 'missing', 'built', 50), false);
    assert.equal(setDevelopmentValue(development, development.sites[0].id, 'built', NaN), false);
    assert.equal(setDevelopmentValue(development, development.sites[0].id, 'population', 50), false);
});

test('resolution does not multiply study or decorative capacity counts; zero resources omit extraction studies', () => {
    const counts = [];
    for (const resolution of [7, 19, 37]) {
        const model = createMapLabModel(resolution, 'world'),
            atlas = createCartography(model),
            substrate = createNaturalResources(model);
        const development = createDevelopment(model, atlas, substrate);
        assert.equal(development.sites.length, 6);
        counts.push(development.sites.reduce((n, s) => n + s.plots.length, 0));
        const none = createDevelopment(model, atlas, createNaturalResources(model, { abundance: 0 }));
        assert.ok(none.sites.every((s) => !s.resource));
        assert.equal(none.omissions.length, 2);
    }
    assert.ok(Math.max(...counts) / Math.min(...counts) < 1.6, JSON.stringify(counts));
});

test('a small scenario can omit unsuitable studies without modifying the landscape', () => {
    const model = createMapLabModel(7, 'scenario'),
        atlas = createCartography(model),
        substrate = createNaturalResources(model);
    const before = JSON.stringify(model.cells),
        development = createDevelopment(model, atlas, substrate);
    assert.equal(development.sites.length + development.omissions.length, 6);
    assert.equal(JSON.stringify(model.cells), before);
});

test('urban architecture intensifies centrally on fixed anchors with denser clearing but independent activity', () => {
    const model = createMapLabModel(19, 'world');
    const d = createDevelopment(model, createCartography(model), createNaturalResources(model));
    const site = d.sites.find((s) => s.living);
    setDevelopmentValue(d, site.id, 'built', 100);
    const geometry = JSON.stringify(site.plots),
        surface = new DevelopmentLandscape(d, true);
    const buildingKinds = () => site.plots.map((p) => architecture(site, p, d.unit));
    setDevelopmentValue(d, site.id, 'urbanIntensity', 0);
    assert.ok(!buildingKinds().some((k) => ['tower', 'landmark', 'midrise'].includes(k)));
    setDevelopmentValue(d, site.id, 'activity', 25);
    setDevelopmentValue(d, site.id, 'urbanIntensity', 100);
    assert.ok(buildingKinds().includes('tower'));
    assert.ok(buildingKinds().includes('landmark'));
    assert.ok(buildingKinds().includes('factory'));
    for (const p of site.plots.filter((p) => ['tower', 'landmark'].includes(architecture(site, p, d.unit))))
        assert.ok(Math.hypot(p.x - site.x, p.y - site.y) < d.unit * 0.55);
    assert.equal(site.activity, 25);
    assert.equal(site.built, 100);
    assert.equal(JSON.stringify(site.plots), geometry);
    assert.notEqual(new DevelopmentLandscape(d, true).key, surface.key);
    assert.ok(
        new DevelopmentLandscape(d, true).plots.filter((p) => p.urban).length >
            surface.plots.filter((p) => p.urban).length,
    );
    for (const s of d.sites.filter((s) => !['coast', 'inland'].includes(s.kind)))
        assert.equal(setDevelopmentValue(d, s.id, 'urbanIntensity', 100), false);
});

test('resource compounds have non-overlapping footprints, sampled interiors and terrain-safe service tracks', () => {
    const model = createMapLabModel(19, 'world'),
        field = new TerrainField(model);
    const d = createDevelopment(model, createCartography(model), createNaturalResources(model));
    const rivers = [...model.riverEdges.values()].map((e) => [
        model.drainage.vertices.get(e.fromId),
        model.drainage.vertices.get(e.toId),
    ]);
    const mine = d.sites.find((s) => s.kind === 'mine');
    assert.ok(mine.plots.some((p) => p.art === 'pit'));
    assert.ok(mine.plots.filter((p) => p.art === 'pit').length <= 2);
    for (const s of d.sites.filter((s) => s.complex)) {
        assert.ok(s.plots.every((p) => p.art));
        assert.ok(s.streets.length > 0);
        for (const p of s.plots) {
            for (const q of s.plots.filter((q) => q !== p))
                assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > p.size + q.size);
            for (const q of p.points)
                for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
                    const x = p.x + (q.x - p.x) * t,
                        y = p.y + (q.y - p.y) * t;
                    assert.ok(field.sample(x, y)[1] >= 0.95);
                    assert.ok(!rivers.some(([a, b]) => segmentDistance(x, y, a, b) < d.unit * 0.025));
                }
        }
        for (const path of s.streets)
            for (let i = 0; i <= 20; i++) {
                const x = path.a.x + ((path.b.x - path.a.x) * i) / 20,
                    y = path.a.y + ((path.b.y - path.a.y) * i) / 20;
                assert.ok(field.sample(x, y)[1] >= 0.95);
                assert.ok(!rivers.some(([a, b]) => segmentDistance(x, y, a, b) < d.unit * 0.025));
            }
    }
});
