/** Exact acquisition intent; settlement and affordability belong to the server. */
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
