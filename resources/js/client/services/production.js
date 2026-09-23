import { productionBid } from './movement.js';

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** All edits share one payload, in the same order used for new bids by the forecast. */
export function productionPlanBids(data, drafts) {
    return data.definitions.bid_resources.map((resource) => {
        const saved = data.bids.find((bid) => bid.resource_type === resource);
        const draft = drafts[resource];
        const bid = productionBid(
            resource,
            draft?.quantity ?? (saved?.max_quantity ?? 0) / data.definitions.labor_per_unit,
            draft?.productivity ?? productionProductivity(saved, data.definitions),
            data.definitions,
        );
        if (!Number.isSafeInteger(bid.max_quantity)) throw new Error('Production target is too large.');
        // Display rounding must not alter an untouched, inverse-stored cutoff.
        if (
            saved &&
            (!draft || Number(draft.productivity) === productionProductivity(saved, data.definitions))
        )
            bid.max_labor_allocation_per_unit = saved.max_labor_allocation_per_unit;
        return bid;
    });
}

/**
 * Joint estimate of NationDetail::attemptAllocateLabor, using raw owner-only inputs.
 * No reads or writes: territory pools, capacity, priorities, rounding and reserve fallback
 * all participate. Server rules and concurrent commands remain authoritative.
 */
export function productionPlanPreview(data, bids) {
    const source = data.production_planning;
    if (!source) return null;
    const unit = data.definitions.labor_per_unit;
    const total = data.budget.labor_pools.reduce((sum, pool) => sum + pool.size, 0);
    const commands = new Map(bids.map((bid) => [bid.resource_type, bid]));
    const poolSizes = new Map(data.budget.labor_pools.map((pool) => [pool.territory_id, pool.size]));
    const simulate = (preserve) => {
        const pools = new Map(data.budget.labor_pools.map((pool) => [pool.territory_id, pool.size]));
        const facilities = source.facilities
            .map((facility) => ({ ...facility, remaining: facility.capacity, allocation: 0 }))
            .sort((a, b) => b.productivity - a.productivity);
        const rows = Object.fromEntries(
            Object.entries(source.resources).map(([resource, meta]) => [
                resource,
                {
                    target: commands.get(resource)?.max_quantity ?? 0,
                    commandOutput: 0,
                    labor: 0,
                    production: 0,
                    automaticLabor: 0,
                    demand: 0,
                    capacityShortfall: 0,
                    automatic: !meta.produced_by_labor
                        ? 0
                        : preserve && commands.get(resource)?.max_quantity > 0
                          ? meta.upkeep
                          : Math.max(0, meta.upkeep + meta.expenses - meta.stock),
                },
            ]),
        );
        const reserved = Object.entries(source.resources).reduce(
            (sum, [resource, meta]) => sum + (meta.reserve_labor ? rows[resource].automatic : 0),
            0,
        );
        let usable = Math.max(0, total - reserved);
        const queue = source.bid_order.map((bid) => ({ ...bid }));
        const add = (resource, upkeep, priority) => {
            if (!queue.some((bid) => bid.resource_type === resource && bid.upkeep === upkeep))
                queue.push({ resource_type: resource, upkeep, priority });
        };
        for (const bid of bids) add(bid.resource_type, false, source.command_priority);
        for (const resource of Object.keys(rows))
            if (rows[resource].automatic > 0) add(resource, true, source.resources[resource].upkeep_priority);
        add('Capital', false, source.capital_priority);
        queue.sort((a, b) => a.priority - b.priority);
        for (const bid of queue) {
            const resource = bid.resource_type,
                row = rows[resource];
            const command = commands.get(resource);
            const maxLabor =
                bid.upkeep || resource === 'Capital'
                    ? data.definitions.max_bid_labor
                    : command?.max_labor_allocation_per_unit;
            let pending = bid.upkeep
                ? row.automatic
                : resource === 'Capital'
                  ? Number.MAX_SAFE_INTEGER
                  : row.target;
            if (!maxLabor || pending <= 0) continue;
            for (const facility of facilities) {
                if (facility.resource_type !== resource || facility.productivity <= 0) continue;
                if (maxLabor < unit / facility.productivity) break;
                let usage = Math.min(
                    Math.ceil(pending / facility.productivity),
                    pools.get(facility.territory_id) ?? 0,
                    facility.remaining,
                );
                if (!bid.upkeep) usage = Math.min(usage, usable);
                if (usage <= 0) continue;
                usable -= usage;
                facility.remaining -= usage;
                facility.allocation += usage;
                pools.set(facility.territory_id, pools.get(facility.territory_id) - usage);
                const output = Math.min(pending, Math.floor(usage * facility.productivity));
                pending -= output;
                if (bid.upkeep) row.automaticLabor += usage;
                else if (resource !== 'Capital') {
                    row.labor += usage;
                    row.commandOutput += output;
                }
                if (pending <= 0) break;
            }
        }
        for (const facility of facilities)
            rows[facility.resource_type].production += facility.allocation * facility.productivity;
        for (const [resource, row] of Object.entries(rows)) {
            const meta = source.resources[resource];
            row.production = meta.produced_by_labor
                ? Math.floor(row.production)
                : Math.round((data.budget.production[resource] ?? 0) * unit);
            row.balance = row.production - meta.upkeep - meta.expenses;
            row.shortfall = Math.max(0, row.target - row.commandOutput);
            let pending = row.target;
            for (const facility of facilities) {
                if (
                    facility.resource_type !== resource ||
                    facility.productivity <= 0 ||
                    (commands.get(resource)?.max_labor_allocation_per_unit ?? 0) <
                        unit / facility.productivity
                )
                    continue;
                const usage = Math.min(
                    Math.ceil(pending / facility.productivity),
                    facility.capacity,
                    poolSizes.get(facility.territory_id) ?? 0,
                );
                row.demand += usage;
                pending = Math.max(0, pending - Math.floor(usage * facility.productivity));
            }
            row.capacityShortfall = pending;
        }
        const automatic = Object.entries(rows).reduce(
            (sum, [resource, row]) =>
                sum + (source.resources[resource].reserve_labor ? 0 : row.automaticLabor),
            0,
        );
        const requested = bids.reduce((sum, bid) => sum + rows[bid.resource_type].demand, 0);
        const allocated = bids.reduce((sum, bid) => sum + rows[bid.resource_type].labor, 0);
        return {
            rows,
            facilities,
            total,
            reserved,
            automatic,
            requested,
            allocated,
            discretionary: Math.max(0, total - reserved - automatic),
            capitalLabor: facilities
                .filter((f) => f.resource_type === 'Capital')
                .reduce((sum, f) => sum + f.allocation, 0),
            idle: [...pools.values()].reduce((sum, value) => sum + value, 0),
            usesReserves: !preserve,
        };
    };
    const result = simulate(true);
    return source.resources.Capital.stock < -result.rows.Capital.balance ? simulate(false) : result;
}

/** Recover the player-facing threshold without exposing inverse-storage rounding noise. */
export function productionProductivity(bid, definitions) {
    const stored = bid?.max_labor_allocation_per_unit;
    if (!stored || stored >= definitions.max_bid_labor) return 0;
    return Math.round((definitions.labor_per_unit / stored) * 1000) / 1000;
}

/**
 * Local explanation only. The server still owns allocation and may account for competing bids.
 * Labor is territorial, so available output is calculated pool by pool rather than from one total.
 */
export function productionPreview(resource, quantity, minimumProductivity, data) {
    const unit = data.definitions.labor_per_unit;
    const target = Math.max(0, finite(quantity));
    const cutoff = Math.max(0, finite(minimumProductivity));
    const pools = new Map(data.budget.labor_pools.map((pool) => [pool.territory_id, pool]));
    const facilities = data.budget.labor_facility_allocations
        .filter((facility) => facility.resource_type === resource)
        .map((facility) => {
            const productivity = Math.max(0, finite(facility.productivity));
            const capacityLabor = Math.max(0, finite(facility.capacity) / unit);
            const allocatedLabor = Math.max(0, finite(facility.allocation) / unit);
            const pool = pools.get(facility.territory_id);
            const poolLabor = Math.max(0, finite(pool?.size) / unit);
            // Pool free labor includes work that can move away from automatic Capital production,
            // but excludes labor already committed to Food or another requested resource.
            const freeLabor = Math.min(capacityLabor, Math.max(0, finite(pool?.free_labor) / unit));
            const eligible = cutoff === 0 || productivity >= cutoff;
            return {
                ...facility,
                productivity,
                capacityLabor,
                allocatedLabor,
                poolLabor,
                freeLabor,
                eligible,
                outputCeiling: capacityLabor * productivity,
                freeOutput: freeLabor * productivity,
            };
        })
        .sort((a, b) => b.productivity - a.productivity || a.territory_id - b.territory_id);
    const eligible = facilities.filter((facility) => facility.eligible);
    const facilityCeiling = eligible.reduce((sum, facility) => sum + facility.outputCeiling, 0);
    const freeLabor = eligible.reduce((sum, facility) => sum + facility.freeLabor, 0);
    const allocatedLabor = eligible.reduce((sum, facility) => sum + facility.allocatedLabor, 0);
    let remaining = Math.min(target, facilityCeiling),
        laborDemand = 0;
    for (const facility of eligible) {
        if (remaining <= 0 || facility.productivity <= 0) break;
        const output = Math.min(remaining, facility.outputCeiling);
        laborDemand += output / facility.productivity;
        remaining -= output;
    }
    return {
        target,
        cutoff,
        facilities,
        eligibleCount: eligible.length,
        facilityCeiling,
        freeLabor,
        allocatedLabor,
        laborDemand,
    };
}
