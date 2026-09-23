/** View projection only. Deployment IDs and active-division IDs stay in separate command batches. */
export function pendingOrderGroups(data) {
    const groups = new Map();
    const items = [
        ...data.deployments.map((d) => ({
            key: `deployment-${d.deployment_id}`,
            id: d.deployment_id,
            type: d.division_type,
            action: 'Deploy',
            destination: d.territory_id,
            origin: d.territory_id,
            command: 'cancelDeployments',
            idField: 'deployment_ids',
        })),
        ...data.divisions
            .filter((d) => d.order)
            .map((d) => ({
                key: `division-${d.division_id}`,
                id: d.division_id,
                type: d.division_type,
                action: d.order.order_type,
                destination: d.order.destination_territory_id ?? d.order.target_territory_id ?? null,
                origin: d.territory_id,
                command: 'cancelOrders',
                idField: 'division_ids',
            })),
    ];
    for (const item of items) {
        const key = JSON.stringify([item.command, item.action, item.destination]);
        const group = groups.get(key) ?? {
            key,
            action: item.action,
            destination: item.destination,
            command: item.command,
            idField: item.idField,
            items: [],
            counts: {},
        };
        group.items.push(item);
        group.counts[item.type] = (group.counts[item.type] ?? 0) + 1;
        groups.set(key, group);
    }
    return [...groups.values()];
}
