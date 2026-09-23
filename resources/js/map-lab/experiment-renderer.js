import { traceHex } from './hex.js';
import { troopLedger } from './naval.js';

export class ExperimentOverlay {
    economyCache = null;
    navalMarkers = [];
    economicSites = 0;
    oilSitesDrawn = 0;

    drawEconomy(ctx, state) {
        if (!state.layers.economy || state.view !== 'terrain') return;
        const {
            economy,
            model,
            economicResource: resource,
            economicLens: lens,
            economicNation: nation,
        } = state;
        const key = `${economy.revision}:${resource}:${lens}:${nation}`;
        if (resource === 'Oil' && lens === 'demand') return;
        if (this.economyCache?.economy !== economy || this.economyCache.key !== key) {
            const values = model.cells
                .filter((cell) => cell.politicalOwnerId === nation && economy.cells.has(cell.id))
                .map((cell) => ({
                    cell,
                    value: economy.cells.get(cell.id)[resource][lens],
                }));
            const sorted = values.map((entry) => Math.abs(entry.value)).sort((a, b) => a - b);
            const max = sorted[Math.floor(sorted.length * 0.92)] || 1;
            const paths = new Map();
            for (const { cell, value } of values) {
                const intensity = Math.min(1, Math.abs(value) / max);
                const bucket = Math.round(intensity * 10);
                const hue =
                    lens === 'balance'
                        ? value < 0
                            ? 10
                            : 145
                        : lens === 'demand'
                          ? 285
                          : resource === 'Food'
                            ? 105
                            : 42;
                const color = bucket ? `hsla(${hue} 70% ${24 + bucket * 4}% / .76)` : '#50627055';
                if (!paths.has(color)) paths.set(color, new Path2D());
                traceHex(paths.get(color), cell.x, cell.y, model.cellSize * 1.015);
            }
            this.economyCache = { economy, key, paths };
        }
        for (const [color, path] of this.economyCache.paths) {
            ctx.fillStyle = color;
            ctx.fill(path);
        }
    }

    drawScreen(ctx, state, camera) {
        this.navalMarkers = [];
        this.economicSites = 0;
        this.oilSitesDrawn = 0;
        if (state.view !== 'terrain') return;
        const point = (id) => {
            const cell = state.model.cellById.get(id);
            return camera.worldToScreen(cell.x, cell.y);
        };
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        if (state.layers.economy) {
            const placed = [];
            const districts = [...state.economy.districts]
                .filter((district) => district.nationId === state.economicNation)
                .sort(
                    (a, b) =>
                        Number(b.id === state.selectedRegionId) - Number(a.id === state.selectedRegionId),
                );
            for (const district of districts) {
                if (state.economicResource === 'Oil' && state.economicLens === 'demand') continue;
                const p = point(district.anchorId);
                if (p.x < 20 || p.y < 20 || p.x > camera.width - 20 || p.y > camera.height - 20) continue;
                if (placed.some((other) => Math.hypot(other.x - p.x, other.y - p.y) < 60)) continue;
                placed.push(p);
                const value = district.output[state.economicResource][state.economicLens];
                ctx.fillStyle = '#12212ded';
                ctx.strokeStyle = district.id === state.selectedRegionId ? '#ffe2a1' : '#c4d1a6';
                ctx.lineWidth = district.id === state.selectedRegionId ? 2 : 1;
                ctx.beginPath();
                ctx.roundRect(p.x - 25, p.y - 12, 50, 24, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = state.economicResource === 'Food' ? '#b9de8c' : '#f1cb80';
                ctx.fillText(
                    `${state.economicResource === 'Food' ? 'F' : 'O'} ${state.economicResource === 'Oil' ? value.toFixed(1) : Math.round(value)}`,
                    p.x,
                    p.y,
                );
                this.economicSites++;
            }
            if (state.economicResource === 'Oil' && ['demand', 'balance'].includes(state.economicLens)) {
                const sites = state.economy.operationSites.length
                    ? state.economy.operationSites
                    : state.economy.lastOperationSites;
                const entries = sites
                    .filter((site) => site.nationId === state.economicNation)
                    .map((site) => ({
                        ...site,
                        tag: `${state.economy.operationSites.length ? 'USED' : 'LAST'} ${site.amount}`,
                    }));
                for (const group of state.military.formations)
                    if (group.nationId === state.economicNation && group.order && group.strength > 0) {
                        const cost = group.units
                            .filter((unit) => ['Armored', 'Fighter', 'Bomber'].includes(unit.type))
                            .reduce((sum, unit) => sum + unit.count, 0);
                        if (cost)
                            entries.push({
                                cellId: group.cellId,
                                tag: `PLAN ${cost}`,
                            });
                    }
                const placed = [];
                for (const entry of entries) {
                    const p = point(entry.cellId);
                    if (p.x < 0 || p.y < 0 || p.x > camera.width || p.y > camera.height) continue;
                    // Keep the fleet's consumer badge below its beach/ship counters at overview zoom.
                    let y = p.y + (entry.id === 'landing-fleet' && state.layers.naval ? 100 : 35);
                    while (placed.some((other) => Math.abs(other.x - p.x) < 75 && Math.abs(other.y - y) < 23))
                        y += 24;
                    placed.push({ x: p.x, y });
                    ctx.fillStyle = '#33292aec';
                    ctx.strokeStyle = '#f1bc86';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect(p.x - 38, y - 11, 76, 22, 4);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#f4c18d';
                    ctx.fillText(`O ${entry.tag}`, p.x, y);
                    this.oilSitesDrawn++;
                }
            }
        }
        if (state.layers.naval && state.naval.available) {
            const naval =
                state.navalReplay < state.naval.history.length - 1
                    ? state.naval.history[state.navalReplay]
                    : state.naval;
            const route = naval.path.map(point),
                beach = point(naval.beachId),
                ship = route[naval.index];
            if (state.layers.orders) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#8ad1e9';
                ctx.setLineDash([6, 5]);
                ctx.beginPath();
                route.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
                ctx.stroke();
                ctx.setLineDash([]);
                if (naval.phase !== 'ready') {
                    ctx.strokeStyle = naval.phase === 'secured' ? '#b0db83' : '#eec68d';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(route.at(-1).x, route.at(-1).y);
                    ctx.lineTo(beach.x, beach.y);
                    ctx.stroke();
                }
            }
            const ledger = troopLedger(naval);
            const labels = [];
            const banner = (p, label, color) => {
                ctx.font = 'bold 11px system-ui';
                const width = ctx.measureText(label).width + 16;
                let y = p.y - 40;
                while (
                    labels.some(
                        (other) =>
                            Math.abs(other.y - y) < 24 &&
                            p.x - width / 2 < other.x + other.width &&
                            p.x + width / 2 > other.x,
                    )
                )
                    y -= 25;
                labels.push({ x: p.x - width / 2, y, width });
                ctx.fillStyle = '#102330f2';
                ctx.fillRect(p.x - width / 2, y, width, 21);
                ctx.fillStyle = color;
                ctx.fillText(label, p.x, y + 11);
            };
            ctx.strokeStyle = naval.phase === 'secured' ? '#a8d989' : '#f1bb83';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(beach.x, beach.y, 19, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#172832ef';
            ctx.fill();
            ctx.fillStyle = '#f8dec1';
            ctx.fillText(ledger.ashore ? String(ledger.ashore) : '⚑', beach.x, beach.y);
            banner(
                beach,
                naval.phase === 'secured'
                    ? 'BEACHHEAD SECURED'
                    : ledger.ashore
                      ? 'CONTESTED BEACHHEAD'
                      : 'LANDING BEACH',
                '#f5d8a5',
            );
            if (naval.contacts.length) {
                ctx.fillStyle = '#de937c';
                ctx.fillText(
                    `Defenders: ~${Math.ceil(naval.defenseStrength / 10) * 10}`,
                    beach.x,
                    beach.y + 34,
                );
            }
            for (const [id, name, health, offset, color] of [
                ['transport', 'Nereid · transport', naval.transportHealth, 0, '#efc889'],
                ['escort', 'Resolute · escort', naval.escortHealth, 48, '#95d1e7'],
            ]) {
                if (id === 'escort' && !naval.escortEnabled) continue;
                const p = { x: ship.x + offset, y: ship.y + (offset ? 42 : 0) };
                ctx.strokeStyle = '#dae7ee88';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(ship.x, ship.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.fillStyle = '#142b38';
                ctx.strokeStyle = health ? color : '#bb7268';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(p.x - 23, p.y - 16, 46, 32, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = health ? color : '#775959';
                ctx.beginPath();
                ctx.moveTo(p.x - 16, p.y + 1);
                ctx.lineTo(p.x + 16, p.y + 1);
                ctx.lineTo(p.x + 10, p.y + 8);
                ctx.lineTo(p.x - 11, p.y + 8);
                ctx.closePath();
                ctx.fill();
                ctx.fillRect(p.x - 7, p.y - 6, 13, 7);
                ctx.fillRect(p.x, p.y - 12, 2, 8);
                ctx.fillStyle = '#07121b';
                ctx.fillRect(p.x - 18, p.y + 11, 36, 3);
                ctx.fillStyle = '#a9d393';
                ctx.fillRect(p.x - 18, p.y + 11, (health / 100) * 36, 3);
                banner(p, `${name}${health ? '' : ' · SUNK'}`, color);
                this.navalMarkers.push({ id, ...p });
            }
            if (state.navalReplay < state.naval.history.length - 1) {
                ctx.fillStyle = '#152836f0';
                ctx.fillRect(15, camera.height - 95, 250, 28);
                ctx.fillStyle = '#ffe0a0';
                ctx.fillText(`RECORDED REPLAY · STEP ${naval.tick}`, 140, camera.height - 81);
            }
        }
        ctx.restore();
    }
}
