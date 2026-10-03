/** Exact acquisition intent; settlement and affordability belong to the server. */
export function publicInvestmentAllowed(policies, changes = null) {
    const choices = { ...policies?.current, ...(changes ?? policies?.pending) };
    const effect = (policies?.catalogue?.policies ?? [])
        .filter((p) => p.status === 'active')
        .flatMap((p) => p.options.find((o) => o.key === choices[p.key]?.option)?.effects ?? [])
        .find(
            (e) =>
                e.effect_type === 'institutions.development_ownership' && e.arguments.sector === 'production',
        );
    return effect?.arguments.arrangement !== 'private';
}

export function publicInvestmentControl(data, resource, changes = null) {
    const policies = data.policies;
    if (!policies?.enabled) return null;
    const choices = { ...policies.current, ...(changes ?? policies.pending) };
    for (const policy of policies.catalogue.policies) {
        if (policy.status !== 'active') continue;
        const choice = choices[policy.key];
        const option = policy.options.find((o) => o.key === choice?.option && !o.retired);
        for (const effect of option?.effects ?? []) {
            if (effect.effect_type !== 'production.development_funding') continue;
            const target = effect.arguments.resource;
            const key = target.startsWith('role:') ? data.definitions.roles[target.slice(5)] : target;
            const parameter = policy.parameters.find(
                (p) => p.key === effect.arguments.funding_ratio?.parameter,
            );
            if (key === resource && parameter?.unit_key?.startsWith('fraction_'))
                return { policy: policy.key, parameter, value: choice.parameters[parameter.key] };
        }
    }
    return null;
}

export function acquisitionPlan(data, drafts) {
    return data.definitions.acquisition_resources.map((resource) => {
        const saved = data.acquisitions.find((row) => row.resource_key === resource);
        const quantity = String(drafts[resource]?.quantity ?? saved?.quantity ?? '0');
        const spending = String(drafts[resource]?.spending_limit ?? saved?.spending_limit ?? '0');
        const priorityText = String(drafts[resource]?.priority ?? saved?.priority ?? 100);
        const priority = Number(priorityText);
        if (
            ![quantity, spending].every((v) => /^\d{1,14}(?:\.\d{1,6})?$/.test(v)) ||
            !/^\d+$/.test(priorityText) ||
            !Number.isSafeInteger(priority) ||
            priority < 0 ||
            priority > 2147483647
        )
            throw new Error('Use non-negative decimal quantities and an integer priority.');
        return { resource_key: resource, quantity, spending_limit: spending, priority };
    });
}
