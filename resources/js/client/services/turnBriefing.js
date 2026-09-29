/** Only harmless identity is persisted; never store reports or private economic values. */
export function turnKey(snapshot) {
    return snapshot?.setup.nation_id
        ? `${snapshot.game_id}:${snapshot.setup.nation_id}:${snapshot.turn_number}`
        : null;
}

export function resourceValues(data, type) {
    if (type === data?.definitions?.roles?.treasury && data?.economy) {
        const e = data.economy,
            forecast = e.forecast?.expected;
        return {
            balance: forecast ? Number(forecast.closing_treasury) - Number(forecast.opening_treasury) : null,
            reserve: e.available_cash,
            production: forecast?.tax_receipts ?? null,
            upkeep: forecast ? Number(forecast.treasury_outflows) - Number(forecast.command_costs) : null,
            expenses: e.committed_cash,
            available: e.available_cash,
        };
    }
    if (data?.definitions?.resources?.find((r) => r.resource_key === type)?.kind === 'capacity') {
        const row = data.production_planning?.rows[type];
        return {
            balance: Number(row?.available ?? 0),
            reserve: null,
            production: Number(row?.capacity ?? 0),
            upkeep: Number(row?.occupied ?? 0),
            expenses: Number(row?.commands ?? 0),
            available: Number(row?.available ?? 0),
        };
    }
    const budget = data?.budget;
    const value = (field) =>
        budget?.[field]?.[type] != null && Number.isFinite(Number(budget[field][type]))
            ? Number(budget[field][type])
            : null;
    return {
        balance: value('balances'),
        reserve: value('stockpiles'),
        production: value('production'),
        upkeep: value('upkeep'),
        expenses: value('expenses'),
        available: value('available_production'),
    };
}
