export class NationSetupService {
    constructor(api) {
        this.api = api;
    }
    async load(signal) {
        const options = await this.api.getEntrySetup({ signal });
        if (options.status === 'FinishedSetup') return { ...options, territories: [] };
        if (!['NotCreated', 'HomeTerritoriesSelection'].includes(options.status))
            throw new Error('Unknown setup state');
        const [base, map] = await Promise.all([
            this.api.getAllTerritoriesBaseInfo({ signal }),
            this.api.getGameMap({ query: { game_id: options.game_id }, signal }),
        ]);
        const after = await this.api.getEntrySetup({ signal });
        if (
            map?.game_id !== options.game_id ||
            after.game_id !== options.game_id ||
            after.status !== options.status
        )
            throw new Error('The game changed. Reload before choosing a homeland.');
        const territories = base.data ?? base;
        return {
            ...after,
            territories,
            map: map.map,
            suitable_ids: map.map
                ? connectedHomelands(territories, after.suitable_ids, after.required_territories)
                : after.suitable_ids,
        };
    }
    async submit(draft, signal) {
        const body = new FormData();
        for (const [name, value] of Object.entries({ ...draft.identity, ...draft.leader })) {
            if (value !== null && value !== undefined) body.append(name, value);
        }
        body.append('territory_ids_as_json', JSON.stringify(draft.homeland));
        return this.api.storeNation({ body, signal });
    }
}

export function connectedHomelands(territories, suitableIds, required) {
    const byId = new Map(territories.map((t) => [t.territory_id, t]));
    const remaining = new Set(suitableIds),
        eligible = [];
    while (remaining.size) {
        const component = [remaining.values().next().value];
        remaining.delete(component[0]);
        for (let cursor = 0; cursor < component.length; cursor++)
            for (const id of byId.get(component[cursor])?.connected_land_territory_ids ?? [])
                if (remaining.delete(id)) component.push(id);
        if (component.length >= required) eligible.push(...component);
    }
    return eligible;
}
