import { isWater } from './water.js';
import { createNaturalResources, oilSite } from './natural-resources.js';

const nations = ['aurelia', 'sable', 'verdant'];
const resources = ['Food', 'Oil'];
const emptyTotals = () => ({
    potential: 0,
    production: 0,
    demand: 0,
    balance: 0,
});

// Separate illustrative economic substrate: never writes terrain, population,
// ownership or drainage. Quantities use region area, not micro-cell count.
export function createEconomy(model, substrate = createNaturalResources(model)) {
    const districts = model.regions
        .filter((region) => region.isLand)
        .map((region) => ({
            id: region.id,
            name: region.name,
            nationId: region.ownerId,
            foodShare: 65,
            cells: region.cellIds.map((id) => model.cellById.get(id)).filter((cell) => !isWater(cell)),
        }));
    for (const district of districts) {
        district.sites = district.cells.map((cell) => {
            const fertility =
                (cell.landform === 'mountain' ? 0.15 : cell.landform === 'hills' ? 0.65 : 1) *
                (cell.snowCover ? 0.1 : cell.vegetation === 'tundra' ? 0.3 : 1) *
                (0.5 + cell.moisture);
            return {
                cellId: cell.id,
                cell,
                population: cell.population / model.cellCount,
                Food: {
                    slots: (36 * fertility) / model.cellCount,
                    productivity: 2.2 + cell.moisture * 1.4,
                },
                Oil: oilSite(cell, substrate.cells.get(cell.id)?.Oil, model.cellCount),
            };
        });
        district.workforce = district.sites.reduce((sum, site) => sum + site.population * 0.42, 0);
        district.anchorId = [...district.sites].sort((a, b) => b.Food.slots - a.Food.slots)[0].cellId;
    }
    const economy = {
        districts,
        districtById: new Map(districts.map((district) => [district.id, district])),
        tick: 0,
        revision: 0,
        cells: new Map(),
        accounts: {},
        pendingOil: {},
        operationSites: [],
        lastOperationSites: [],
        lastTurn: null,
    };
    for (const nation of nations) {
        economy.accounts[nation] = { Food: 0, Oil: 40 };
        economy.pendingOil[nation] = 0;
    }
    recomputeEconomy(economy);
    for (const nation of nations) economy.accounts[nation].Food = economy.totals[nation].Food.demand * 2;
    return economy;
}

export function updateOilSubstrate(economy, model, substrate) {
    for (const district of economy.districts)
        for (const site of district.sites)
            site.Oil = oilSite(site.cell, substrate.cells.get(site.cellId)?.Oil, model.cellCount);
    recomputeEconomy(economy);
}

export function recomputeEconomy(economy) {
    economy.cells.clear();
    economy.totals = Object.fromEntries(
        nations.map((nation) => [nation, { Food: emptyTotals(), Oil: emptyTotals() }]),
    );
    for (const district of economy.districts) {
        district.output = { Food: emptyTotals(), Oil: emptyTotals() };
        district.assigned = {};
        district.usedWorkers = 0;
        for (const resource of resources) {
            const share = (resource === 'Food' ? district.foodShare : 100 - district.foodShare) / 100;
            const availability = (site) =>
                site.cell.controllerId === district.nationId ? Math.max(0.2, 1 - site.cell.damage * 0.2) : 0;
            const capacity = district.sites.reduce(
                (sum, site) => sum + site[resource].slots * availability(site),
                0,
            );
            const workers = Math.min(capacity, district.workforce * share);
            const useRatio = capacity ? workers / capacity : 0;
            district.assigned[resource] = workers;
            district.usedWorkers += workers;
            for (const site of district.sites) {
                const potential = site[resource].slots * site[resource].productivity;
                const production = potential * useRatio * availability(site);
                const demand = resource === 'Food' ? site.population * 0.8 : 0;
                const entry = economy.cells.get(site.cellId) ?? {};
                entry[resource] = {
                    potential,
                    production,
                    demand,
                    balance: production - demand,
                };
                economy.cells.set(site.cellId, entry);
                for (const key of Object.keys(emptyTotals()))
                    district.output[resource][key] += entry[resource][key];
            }
            for (const key of Object.keys(emptyTotals()))
                economy.totals[district.nationId][resource][key] += district.output[resource][key];
        }
    }
    economy.revision++;
}

export function setFoodShare(economy, regionId, value) {
    const district = economy.districtById.get(regionId);
    if (!district || !Number.isFinite(Number(value))) return false;
    district.foodShare = Math.max(0, Math.min(100, Number(value)));
    recomputeEconomy(economy);
    return true;
}

export function recordOilUse(economy, nationId, amount, site = null) {
    if (!(nationId in economy.pendingOil) || !Number.isFinite(amount) || amount <= 0) return;
    economy.pendingOil[nationId] += amount;
    if (site) {
        const previous = economy.operationSites.find((entry) => entry.id === site.id);
        if (previous) {
            previous.amount += amount;
            previous.cellId = site.cellId;
        } else economy.operationSites.push({ ...site, nationId, amount });
    }
}

export function allocationPreview(district, share) {
    const result = {};
    for (const resource of resources) {
        let slots = 0,
            output = 0;
        for (const site of district.sites) {
            const usable =
                site.cell.controllerId === district.nationId ? Math.max(0.2, 1 - site.cell.damage * 0.2) : 0;
            slots += site[resource].slots * usable;
            output += site[resource].slots * site[resource].productivity * usable;
        }
        result[resource] = slots
            ? output *
              Math.min(1, (district.workforce * (resource === 'Food' ? share : 100 - share)) / 100 / slots)
            : 0;
    }
    return result;
}

export function setNationFoodShare(economy, nationId, value) {
    if (!Number.isFinite(Number(value))) return false;
    for (const district of economy.districts)
        if (district.nationId === nationId) district.foodShare = Math.max(0, Math.min(100, Number(value)));
    recomputeEconomy(economy);
    return true;
}

export function oilCommitments(military, naval) {
    const totals = Object.fromEntries(nations.map((nation) => [nation, 0]));
    for (const group of military.formations)
        if (group.strength > 0 && group.order)
            totals[group.nationId] += group.units
                .filter((unit) => ['Armored', 'Fighter', 'Bomber'].includes(unit.type))
                .reduce((sum, unit) => sum + unit.count, 0);
    if (naval?.available && !['ready', 'secured', 'evacuated', 'failed'].includes(naval.phase))
        totals.sable += naval.escortEnabled && naval.escortHealth > 0 ? 3 : 2;
    return totals;
}

export function advanceEconomy(economy) {
    const report = {};
    for (const nation of nations) {
        report[nation] = {};
        for (const resource of resources) {
            const opening = economy.accounts[nation][resource];
            const { production, demand } = economy.totals[nation][resource];
            const requested = demand + (resource === 'Oil' ? economy.pendingOil[nation] : 0);
            const available = opening + production;
            const consumed = Math.min(available, requested),
                shortage = Math.max(0, requested - available);
            const closing = Math.max(0, available - consumed);
            economy.accounts[nation][resource] = closing;
            report[nation][resource] = {
                opening,
                production,
                requested,
                consumed,
                shortage,
                closing,
            };
        }
        economy.pendingOil[nation] = 0;
    }
    economy.tick++;
    economy.lastTurn = report;
    economy.lastOperationSites = structuredClone(economy.operationSites);
    economy.operationSites = [];
    economy.revision++;
    return report;
}
