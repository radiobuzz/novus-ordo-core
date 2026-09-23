import { movementPath } from './movement.js';

/** Mirrors sendMoveOrders' additional-cost check. Existing Attack/Raid costs are already reserved. */
export function moveOrderPreview(snapshot, data, orders) {
    const costs = {},
        shortages = {};
    let valid = orders.length > 0,
        charged = 0;
    for (const order of orders) {
        const division = data?.divisions.find((d) => d.division_id === order.division_id);
        const destination = snapshot.territories.find(
            (t) => t.territory_id === order.destination_territory_id,
        );
        const meta = data?.definitions.divisions.find((d) => d.division_type === division?.division_type);
        if (!division || !destination || !meta || order.path_territory_ids === null) valid = false;
        if (!division || !destination || !meta) continue;
        if (
            destination.owner_nation_id === snapshot.setup.nation_id ||
            ['Attack', 'Raid'].includes(division.order?.order_type)
        )
            continue;
        charged++;
        if (!meta.attack_costs) {
            valid = false;
            continue;
        }
        for (const [resource, cost] of Object.entries(meta.attack_costs)) {
            if (!Number.isFinite(cost) || cost < 0) valid = false;
            else costs[resource] = (costs[resource] ?? 0) + cost;
        }
    }
    for (const [resource, cost] of Object.entries(costs)) {
        const available = data?.budget.available_production[resource];
        if (!Number.isFinite(available)) valid = false;
        else if (cost > available) {
            shortages[resource] = cost - available;
            valid = false;
        }
    }
    return { costs, shortages, charged, valid };
}

/** Shared command drafting; server metadata and validation remain authoritative. */
export function draftMoveOrders(snapshot, data, selected, destination) {
    return [...selected].map((id) => {
        const division = data.divisions.find((d) => d.division_id === id);
        const meta = data.definitions.divisions.find((m) => m.division_type === division?.division_type);
        return {
            division_id: id,
            destination_territory_id: Number(destination),
            path_territory_ids:
                division && meta && destination
                    ? movementPath(
                          snapshot.territories,
                          division.territory_id,
                          Number(destination),
                          meta,
                          snapshot.setup.nation_id,
                      )
                    : null,
        };
    });
}

export function deploymentMaximum(data, type) {
    const value = data?.deployment_limits?.[type];
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function draftDeployments(type, territoryId, quantity, data, snapshot) {
    const maximum = deploymentMaximum(data, type);
    if (
        !data.definitions.divisions.some((d) => d.division_type === type) ||
        !snapshot.ownTerritories.some((t) => t.territory_id === territoryId && t.can_deploy) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100 ||
        maximum === null ||
        quantity > maximum
    )
        return null;
    return Array.from({ length: quantity }, () => ({ division_type: type, territory_id: territoryId }));
}

/** Local preview only. Costs come from current server metadata; never edit confirmed balances. */
export function deploymentDraft(data, snapshot, entries) {
    const costs = {},
        upkeep = {},
        counts = {};
    let valid = entries.length > 0 && entries.length <= 100;
    for (const entry of entries) {
        const meta = data?.definitions.divisions.find((d) => d.division_type === entry.division_type);
        if (
            !meta ||
            !snapshot.ownTerritories.some((t) => t.territory_id === entry.territory_id && t.can_deploy)
        ) {
            valid = false;
            continue;
        }
        counts[entry.division_type] = (counts[entry.division_type] ?? 0) + 1;
        for (const [target, values] of [
            [costs, meta.deployment_costs],
            [upkeep, meta.upkeep_costs],
        ])
            for (const [resource, value] of Object.entries(values)) {
                if (!Number.isFinite(value) || value < 0) valid = false;
                else if (value) target[resource] = (target[resource] ?? 0) + value;
            }
    }
    const remaining = { ...data?.budget.available_production };
    for (const [resource, cost] of Object.entries(costs)) {
        if (!Number.isFinite(remaining[resource]) || cost > remaining[resource]) valid = false;
        remaining[resource] -= cost;
    }
    for (const [type, count] of Object.entries(counts)) {
        const max = deploymentMaximum(data, type);
        if (max === null || count > max) valid = false;
    }
    return { valid, costs, upkeep, remaining, counts };
}

export function remainingDeploymentMaximum(data, snapshot, entries, type) {
    const limit = deploymentMaximum(data, type);
    const meta = data?.definitions.divisions.find((d) => d.division_type === type);
    if (limit === null || !meta) return null;
    const draft = deploymentDraft(data, snapshot, entries);
    if (entries.length && !draft.valid) return 0;
    let max = Math.min(100 - entries.length, limit - (draft.counts[type] ?? 0));
    for (const [resource, cost] of Object.entries(meta.deployment_costs)) {
        if (!Number.isFinite(cost) || cost < 0) return null;
        if (!cost) continue;
        if (!Number.isFinite(draft.remaining[resource])) return null;
        max = Math.min(max, Math.floor(draft.remaining[resource] / cost));
    }
    return Math.max(0, max);
}
