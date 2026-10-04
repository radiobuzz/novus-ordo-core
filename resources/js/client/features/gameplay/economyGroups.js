import { financialAmount, seasonalBalance, treasuryChange } from '../../ui/financeProjection.js';
// Catalogue semantics choose presentation groups; unknown policies remain accessible.
export function policyGroup(policy) {
    const effects = policy.options.flatMap((o) => o.effects);
    const types = new Set(effects.map((e) => e.effect_type));
    if (types.has('finance.income_tax')) return 'taxation';
    if (types.has('budget.income_support')) return 'support';
    if ([...types].some((t) => t.startsWith('food.'))) return 'food';
    if (effects.some((e) => e.arguments?.resource === 'role:nutrition')) return 'food';
    if (
        effects.some(
            (e) => e.effect_type === 'budget.program_funding' && e.arguments.program !== 'infrastructure',
        )
    )
        return 'services';
    if (
        types.has('budget.program_funding') ||
        types.has('budget.program_target') ||
        types.has('budget.program_cost') ||
        types.has('allocation.infrastructure_priority')
    )
        return 'infrastructure';
    if (types.has('production.development_funding') || types.has('allocation.production_priority'))
        return 'production';
    if ([...types].some((t) => t.startsWith('institutions.'))) return 'institutions';
    if (types.has('finance.treasury_reserve')) return 'finance';
    return 'other';
}

export function seasonFinance(report) {
    const inflow = financialAmount(report?.treasury_inflows),
        outflow = financialAmount(report?.treasury_outflows);
    const borrow = financialAmount(report?.fiscal?.borrowing),
        repaid = financialAmount(report?.fiscal?.principal_repaid);
    return {
        receipts: inflow == null || borrow == null ? null : inflow - borrow,
        spending: outflow == null || repaid == null ? null : outflow - repaid,
        balance: seasonalBalance(report),
        treasuryChange: treasuryChange(report),
    };
}
