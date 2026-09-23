// Regional features are expressed in world/region units, never micro-cell units.
export function segmentDistance(x, y, a, b) {
    const dx = b.x - a.x,
        dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

export function regionalFeatures(cores, random, baseCoast, seaLevel, islandAbundance, noise) {
    const coasts = [],
        islands = [],
        ranges = [],
        plateaus = [];
    for (const core of cores) {
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < 6; i++) {
            const angle = phase + (i * Math.PI) / 3 + (random() - 0.5) * 0.35;
            const dx = Math.cos(angle),
                dy = Math.sin(angle);
            let distance = 0.5;
            while (distance < 18 && baseCoast(core.x + dx * distance, core.y + dy * distance) > seaLevel)
                distance += 0.35;
            const x = core.x + dx * distance,
                y = core.y + dy * distance;
            if (x < 1 || x > 29 || y < 0.7 || y > 16) continue;
            if (i % 3 === 2) {
                const threshold = 1 + noise(x, y, 140) * 49;
                for (let j = 0; j < 4; j++) {
                    const offset = 1 + j * 1.05;
                    const bend = Math.sin(j * 0.9) * 0.6;
                    islands.push({
                        x: x + dx * offset - dy * bend,
                        y: y + dy * offset + dx * bend,
                        radius: 0.32 + random() * 0.38,
                        threshold,
                    });
                }
            } else {
                const bay = i % 3 === 0;
                const offset = bay ? -0.8 : 0.7;
                coasts.push({
                    x: x + dx * offset,
                    y: y + dy * offset,
                    dx,
                    dy,
                    length: 1.4 + random() * 1.6,
                    width: 0.45 + random() * 0.65,
                    amplitude: (bay ? -0.38 : 0.34) * (0.8 + random() * 0.4),
                    bend: (random() - 0.5) * 0.65,
                });
            }
        }
        // A bent main range and a shorter branch, rather than worldwide stripes.
        const angle = random() * Math.PI * 2;
        const dx = Math.cos(angle),
            dy = Math.sin(angle),
            length = 5 + random() * 5;
        const points = Array.from({ length: 6 }, (_, i) => {
            const along = (i / 5 - 0.5) * length,
                bend = (random() - 0.5) * 2;
            return { x: core.x + dx * along - dy * bend, y: core.y + dy * along + dx * bend };
        });
        ranges.push({ points, width: 0.45 + random() * 0.4, height: 1700 + random() * 650 });
        const branchAngle = angle + (random() > 0.5 ? 1 : -1) * (1 + random() * 0.5);
        const start = points[2],
            branchLength = 2 + random() * 3;
        ranges.push({
            points: [
                start,
                {
                    x: start.x + Math.cos(branchAngle) * branchLength * 0.55,
                    y: start.y + Math.sin(branchAngle) * branchLength * 0.55,
                },
                {
                    x: start.x + Math.cos(branchAngle + 0.25) * branchLength,
                    y: start.y + Math.sin(branchAngle + 0.25) * branchLength,
                },
            ],
            width: 0.35 + random() * 0.3,
            height: 1200,
        });
        plateaus.push({
            x: core.x - dy * 2.5,
            y: core.y + dx * 2.5,
            rx: 1.4 + random() * 1.3,
            ry: 1 + random() * 1.1,
            height: 350 + random() * 350,
        });
    }
    // Extra archipelago candidates use a separate noise stream. Changing their
    // abundance never reshuffles continental cores, bays, or mountain ranges.
    // A whole group appears together, with stable positions and sizes.
    for (const core of cores) {
        const phase = noise(core.x, core.y, 141) * Math.PI * 2;
        for (let i = 0; i < 12; i++) {
            const threshold = 51 + noise(core.x + i, core.y, 142) * 49;
            if (islandAbundance < threshold) continue;
            const angle = phase + (i * Math.PI) / 6;
            const dx = Math.cos(angle),
                dy = Math.sin(angle);
            let distance = 0.5;
            while (distance < 18 && baseCoast(core.x + dx * distance, core.y + dy * distance) > seaLevel)
                distance += 0.35;
            for (let j = 0; j < 4; j++) {
                const offset = distance + 1.1 + j * 1.1;
                const bend = Math.sin(j * 0.9 + phase) * 0.7;
                const x = core.x + dx * offset - dy * bend;
                const y = core.y + dy * offset + dx * bend;
                if (x < 0.7 || x > 29.3 || y < 0.5 || y > 16 || baseCoast(x, y) > seaLevel) continue;
                islands.push({ x, y, radius: 0.32 + noise(x, y, 143) * 0.38, threshold });
            }
        }
    }
    return {
        coasts,
        islands: islands.filter((island) => island.threshold <= islandAbundance),
        ranges,
        plateaus,
    };
}

export function coastDetail(x, y, base, seaLevel, features, richness) {
    let value = base;
    for (const feature of features.coasts) {
        const dx = x - feature.x,
            dy = y - feature.y;
        const along = (dx * feature.dx + dy * feature.dy) / feature.length;
        const across =
            (-dx * feature.dy + dy * feature.dx - Math.sin(along * 1.5) * feature.bend) / feature.width;
        value += Math.exp(-(along * along + across * across) * 1.5) * feature.amplitude * richness;
    }
    for (const island of features.islands) {
        const distance = Math.hypot(x - island.x, y - island.y) / island.radius;
        if (distance > 1.5) continue;
        const peak = seaLevel + 0.13 - distance * distance * 0.17;
        // Island abundance selects groups, not their height or coastline noise.
        value += Math.max(0, peak - value) * 0.75;
    }
    return value;
}

export function regionalRelief(x, y, features, noise, size) {
    let mountain = 0,
        plateau = 0;
    const wx = x + (noise(x / size, y / size, 101) - 0.5) * 0.35;
    const wy = y + (noise(x / size, y / size, 102) - 0.5) * 0.35;
    for (const range of features.ranges) {
        let distance = Infinity;
        for (let i = 1; i < range.points.length; i++)
            distance = Math.min(distance, segmentDistance(wx, wy, range.points[i - 1], range.points[i]));
        const ridge = Math.exp(-Math.pow(distance / range.width, 2) * 1.4);
        // Saddles and subsidiary peaks interrupt the ridge without random tiles.
        mountain = Math.max(
            mountain,
            ridge * range.height * (0.42 + 0.58 * noise(x / (0.7 * size), y / (0.7 * size), 103)),
        );
    }
    for (const mesa of features.plateaus) {
        const distance = Math.hypot((x - mesa.x) / mesa.rx, (y - mesa.y) / mesa.ry);
        plateau = Math.max(plateau, Math.max(0, Math.min(1, (1.2 - distance) * 3)) * mesa.height);
    }
    return { mountain, plateau };
}
