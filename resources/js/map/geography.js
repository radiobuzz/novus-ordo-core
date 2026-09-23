// Seeded continuous fields, independent of the political grid and its resolution.
// Value-noise octaves + warped ridges: no runtime libraries or generated image data.
import { regionalFeatures, coastDetail, regionalRelief } from './landscape-features.js';
export const DEFAULT_GEOGRAPHY = Object.freeze({
    seed: 'ember-19',
    land: 53,
    mountains: 55,
    scale: 100,
    wetness: 55,
    continents: 3,
    coastComplexity: 75,
    islandAbundance: 50,
    lakeAbundance: 50,
    polarExtent: 6,
    snowline: 1800,
});
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function geographyOptions(options = {}) {
    const bounded = (key, min, max) => {
        const value = Number(options[key] ?? DEFAULT_GEOGRAPHY[key]);
        return clamp(Number.isFinite(value) ? value : DEFAULT_GEOGRAPHY[key], min, max);
    };
    return {
        seed: String(options.seed ?? DEFAULT_GEOGRAPHY.seed).slice(0, 64),
        land: bounded('land', 25, 80),
        mountains: bounded('mountains', 0, 100),
        scale: bounded('scale', 50, 180),
        wetness: bounded('wetness', 0, 100),
        continents: Math.round(bounded('continents', 2, 5)),
        coastComplexity: bounded('coastComplexity', 0, 100),
        islandAbundance: bounded('islandAbundance', 0, 100),
        lakeAbundance: bounded('lakeAbundance', 0, 100),
        polarExtent: bounded('polarExtent', 0, 25),
        snowline: bounded('snowline', 800, 3200),
    };
}

function seedNumber(seed) {
    let value = 2166136261;
    for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return value >>> 0;
}

function noiseFactory(seed) {
    const hash = (x, y, salt) => {
        let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed ^ Math.imul(salt, 1274126177);
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    };
    const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const mix = (a, b, t) => a + (b - a) * t;
    return (x, y, salt = 0) => {
        const ix = Math.floor(x),
            iy = Math.floor(y);
        const tx = smooth(x - ix),
            ty = smooth(y - iy);
        return mix(
            mix(hash(ix, iy, salt), hash(ix + 1, iy, salt), tx),
            mix(hash(ix, iy + 1, salt), hash(ix + 1, iy + 1, salt), tx),
            ty,
        );
    };
}

// Invert the region-center sublattice. A region center has exactly the same
// geographic position at 7, 19, and 37 cells, including fractional corner samples.
export function geographyPoint(q, r, radius, scenario = false) {
    const determinant = 3 * radius * radius + 3 * radius + 1;
    const u = ((2 * radius + 1) * q + radius * r) / determinant + (scenario ? 10 : 0);
    const v = (-radius * q + (radius + 1) * r) / determinant + (scenario ? 10 : 0);
    return { x: u + v / 2, y: (v * Math.sqrt(3)) / 2 };
}

export function createGeography(options = {}) {
    const settings = geographyOptions(options);
    const noise = noiseFactory(seedNumber(settings.seed));
    const size = settings.scale / 100;
    const fbm = (x, y, salt) =>
        (noise(x, y, salt) +
            0.45 * noise(x * 2.07 + 17, y * 2.07 - 11, salt + 1) +
            0.18 * noise(x * 4.13 - 7, y * 4.13 + 31, salt + 2)) /
        1.63;
    let randomState = seedNumber(settings.seed);
    const random = () => {
        randomState += 0x6d2b79f5;
        let value = Math.imul(randomState ^ (randomState >>> 15), randomState | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    // Farthest-candidate seeds spread the continental cores over the world.
    // Warped nearest/second-nearest distances reserve seas between the cores,
    // instead of raising everything toward a single central island.
    const cores = [{ x: 12 + random() * 6, y: 6 + random() * 4 }];
    while (cores.length < settings.continents) {
        let best,
            clearance = -Infinity;
        for (let attempt = 0; attempt < 32; attempt++) {
            const candidate = { x: 3 + random() * 24, y: 1 + random() * 14.5 };
            const distance = Math.min(
                ...cores.map((core) => Math.hypot(candidate.x - core.x, candidate.y - core.y)),
            );
            if (distance > clearance) {
                best = candidate;
                clearance = distance;
            }
        }
        cores.push(best);
    }
    const continent = (x, y, marginOnly = false) => {
        const wx = x + (fbm(x / (4 * size), y / (4 * size), 10) - 0.5) * 3;
        const wy = y + (fbm(x / (4 * size), y / (4 * size), 20) - 0.5) * 3;
        const distances = cores.map((core) => Math.hypot(wx - core.x, wy - core.y)).sort((a, b) => a - b);
        const score = 1 - distances[0] / Math.max(0.01, distances[1]);
        if (marginOnly) return score;
        const rim = Math.max(0, 1 - Math.min(x, 30 - x) / 2);
        return score - rim * 0.22 + (noise(x / (1.4 * size), y / (1.4 * size), 25) - 0.5) * 0.065;
    };
    // A fixed reference sampling grid makes sea level independent of micro density.
    // Coverage is a target, not an exact count of political regions or lake cells.
    const reference = [];
    for (let row = 0; row < 80; row++)
        for (let col = 0; col < 120; col++)
            reference.push(continent((col + 0.5) / 4, (((row + 0.5) / 4) * Math.sqrt(3)) / 2));
    reference.sort((a, b) => a - b);
    const baseSeaLevel = reference[Math.floor(reference.length * (1 - settings.land / 100))];
    const features = regionalFeatures(
        cores,
        random,
        continent,
        baseSeaLevel,
        settings.islandAbundance,
        noise,
    );
    const richness = settings.coastComplexity / 100;
    const detailedCoast = (x, y) => {
        const base = continent(x, y);
        const shoreWeight = Math.exp(-Math.pow((base - baseSeaLevel) / 0.2, 2));
        const detail =
            ((noise(x / (0.8 * size), y / (0.8 * size), 26) - 0.5) * 0.12 +
                (noise(x / (0.32 * size), y / (0.32 * size), 27) - 0.5) * 0.045) *
            richness *
            shoreWeight;
        const shaped = coastDetail(x, y, base + detail, baseSeaLevel, features, richness);
        // Keep a deep-water corridor between continental cores. Coastal capes
        // and island chains should not accidentally bridge two whole continents.
        const corridor = clamp((continent(x, y, true) - 0.08) / 0.1);
        return shaped > base ? base + (shaped - base) * corridor : shaped;
    };
    const detailedReference = [];
    for (let row = 0; row < 80; row++)
        for (let col = 0; col < 120; col++)
            detailedReference.push(detailedCoast((col + 0.5) / 4, (((row + 0.5) / 4) * Math.sqrt(3)) / 2));
    detailedReference.sort((a, b) => a - b);
    const seaLevel = detailedReference[Math.floor(detailedReference.length * (1 - settings.land / 100))];
    const sample = (x, y) => {
        const land = detailedCoast(x, y) - seaLevel;
        const relief = land > 0 ? regionalRelief(x, y, features, noise, size) : { mountain: 0, plateau: 0 };
        // Relief cannot lift ocean floors into barrier rings: coastlines are
        // decided independently, with mountain uplift fading toward the coast.
        const inland = clamp(land / 0.1);
        const elevation =
            land <= 0
                ? land * 2600
                : land * 240 +
                  inland *
                      (40 +
                          (fbm(x / (1.4 * size), y / (1.4 * size), 50) - 0.3) * 100 +
                          relief.plateau +
                          (relief.mountain * settings.mountains) / 55);
        const latitude = clamp(1 - (2 * y) / ((19 * Math.sqrt(3)) / 2), -1, 1) * 90;
        const climateVariation = (noise(x / 4, y / 4, 65) - 0.5) * 0.05;
        const temperature = climateTemperature(latitude, elevation, climateVariation, settings.polarExtent);
        const polarIce =
            settings.polarExtent > 0 &&
            Math.abs(latitude) >= 90 - settings.polarExtent + climateVariation * 20;
        const snowCover = polarIce || elevation >= settings.snowline;
        const rainfall = clamp(
            0.12 +
                0.55 * fbm(x / (3 * size), y / (3 * size), 70) +
                0.18 * noise(x / (0.8 * size), y / (0.8 * size), 74) +
                (settings.wetness - 55) / 120,
            0.02,
            1,
        );
        return { elevation, temperature, rainfall, latitude, polarIce, snowCover };
    };
    return {
        settings,
        seaLevel,
        cores,
        features,
        sample,
        at: (q, r, radius, scenario) => {
            const { x, y } = geographyPoint(q, r, radius, scenario);
            return sample(x, y);
        },
    };
}

export function climateTemperature(
    latitude,
    elevation,
    variation = 0,
    polarExtent = DEFAULT_GEOGRAPHY.polarExtent,
) {
    const latitudeFraction = Math.abs(latitude) / 90;
    const polarCooling = polarExtent > 0 ? 0.5 * clamp((Math.abs(latitude) - (90 - polarExtent - 4)) / 4) : 0;
    return clamp(
        0.94 -
            Math.pow(latitudeFraction, 1.3) * 0.56 -
            Math.max(0, elevation) / 8000 -
            polarCooling +
            variation,
    );
}

export const materialFor = (cell) => (cell.frozen ? 'ice' : cell.terrain);

export function classifyTerrain(cell, neighbors, cellsPerRegion) {
    if (cell.terrain === 'ocean' || cell.terrain === 'lake') return;
    // Elevation change per approximate region-length, not per micro-cell.
    cell.slope =
        Math.max(0, ...neighbors.map((other) => Math.abs(cell.elevation - other.elevation))) *
        Math.sqrt(cellsPerRegion);
    cell.landform =
        cell.elevation > 900 ? 'mountain' : cell.elevation > 430 || cell.slope > 600 ? 'hills' : 'plains';
    cell.moisture = clamp(
        cell.rainfall +
            (neighbors.some((other) => other.terrain === 'lake' || other.terrain === 'ocean') ? 0.12 : 0) +
            (cell.riverEdgeIds.length ? 0.1 : 0),
    );
    cell.vegetation = cell.snowCover
        ? 'none'
        : cell.temperature < 0.32
          ? 'tundra'
          : cell.moisture > 0.53 && cell.landform !== 'mountain'
            ? 'forest'
            : 'grass';
    cell.terrain = cell.snowCover
        ? 'snow'
        : cell.temperature < 0.32
          ? 'tundra'
          : cell.landform === 'mountain'
            ? 'mountain'
            : cell.vegetation === 'forest'
              ? 'forest'
              : cell.landform;
    cell.terrainColor = {
        plains: '#64765b',
        forest: '#3f6653',
        hills: '#776e58',
        mountain: '#62666a',
        snow: '#e4eeee',
        tundra: '#99a59a',
    }[cell.terrain];
    cell.movementCost =
        cell.landform === 'mountain' ? 3 : cell.landform === 'hills' || cell.vegetation === 'forest' ? 2 : 1;
}
