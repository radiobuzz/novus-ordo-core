/** Nominal unit power from server definitions, not a battle outcome prediction. */
export function selectedPower(data, selected) {
    const types = new Map((data?.definitions.divisions ?? []).map((type) => [type.division_type, type]));
    let attack = 0,
        defense = 0;
    for (const division of data?.divisions ?? []) {
        if (!selected.has(division.division_id)) continue;
        const meta = types.get(division.division_type);
        if (!Number.isFinite(meta?.attack_power) || !Number.isFinite(meta?.defense_power)) return null;
        attack += meta.attack_power;
        defense += meta.defense_power;
    }
    return { attack, defense };
}

// Engine movement happens before combat. Raids remain based at their origin;
// attacks rebase first. A target is never assumed captured by this projection.
export function defenseLocation(division) {
    const order = division.order;
    if (!order) return division.territory_id;
    switch (order.order_type) {
        case 'Disband':
            return division.territory_id; // Disband resolves after battles.
        case 'Move':
            return order.destination_territory_id;
        case 'Attack':
            return order.rebase_territory_id;
        case 'Raid':
            return division.territory_id;
        default:
            return undefined;
    }
}
export function territorialDefense(snapshot, id) {
    const territory = snapshot?.territories.find((t) => t.territory_id === id);
    if (!snapshot?.nation || territory?.owner_nation_id !== snapshot.setup.nation_id) return null;
    const data = snapshot.nation;
    const types = new Map(data.definitions.divisions.map((type) => [type.division_type, type]));
    let staying = 0,
        incoming = 0,
        deployments = 0;
    for (const division of data.divisions) {
        const location = defenseLocation(division);
        if (location === undefined) return null;
        if (location !== id) continue;
        const power = types.get(division.division_type)?.defense_power;
        if (!Number.isFinite(power)) return null;
        if (division.territory_id === id) staying += power;
        else incoming += power;
    }
    for (const deployment of data.deployments) {
        if (deployment.territory_id !== id) continue;
        const power = types.get(deployment.division_type)?.defense_power;
        if (!Number.isFinite(power)) return null;
        deployments += power;
    }
    return { staying, incoming, deployments, total: staying + incoming + deployments };
}
