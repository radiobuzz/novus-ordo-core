/** Only harmless identity is persisted; never store reports or private economic values. */
export function turnKey(snapshot) {
    return snapshot?.setup.nation_id
        ? `${snapshot.game_id}:${snapshot.setup.nation_id}:${snapshot.turn_number}`
        : null;
}

export function resourceValues(data, type) {
    const budget = data?.budget;
    const value = (field) => (Number.isFinite(budget?.[field]?.[type]) ? budget[field][type] : null);
    return {
        balance: value('balances'),
        reserve: value('stockpiles'),
        production: value('production'),
        upkeep: value('upkeep'),
        expenses: value('expenses'),
        available: value('available_production'),
    };
}
