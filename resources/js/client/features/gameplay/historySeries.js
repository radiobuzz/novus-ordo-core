import { seasonFinance } from './economyGroups.js';
const n = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const sum = (...v) =>
    v.some((x) => x == null) ? null : Math.round(v.reduce((a, b) => a + Number(b), 0) * 1e6) / 1e6;
export const spendingKeys = [
    'military',
    'operations',
    'purchases',
    'development',
    'support',
    'infrastructure',
    'interest',
    'other',
];

export function nationalPoint(record) {
    const r = record.economy;
    if (!r) return { season: record.season, values: {} };
    const f = seasonFinance(r);
    const values = {
        receipts: f.receipts,
        spending: f.spending,
        balance: f.balance,
        treasury: n(r.closing_treasury),
        debt: n(r.fiscal?.closing_debt),
        military: sum(n(r.command_costs), n(r.public_payroll_paid), Number(r.response_costs ?? 0)),
        operations: n(r.public_operations),
        purchases: n(r.government_purchases),
        development: n(r.public_development),
        support: n(r.support_paid),
        infrastructure: Object.values(r.infrastructure ?? {}).reduce((a, row) => a + Number(row.paid), 0),
        interest:
            n(r.fiscal?.interest_due) == null || n(r.fiscal?.arrears) == null
                ? null
                : n(r.fiscal.interest_due) - n(r.fiscal.arrears),
    };
    const known = sum(...spendingKeys.slice(0, -1).map((key) => values[key]));
    values.other = known == null || f.spending == null ? null : Math.round((f.spending - known) * 1e6) / 1e6;
    if (values.other < -0.00001) for (const key of spendingKeys) values[key] = null;
    else if (values.other != null) values.other = Math.max(0, values.other);
    return { season: record.season, values };
}
export function industryPoint(record, key) {
    const r = record.resources?.[key],
        details = record.economy?.industries?.[key],
        g = details?.owners?.government,
        p = details?.owners?.producer;
    return {
        season: record.season,
        values: r
            ? {
                  production: sum(n(r.production?.government), n(r.production?.producer)),
                  civilian: n(r.civilian_requested),
                  industry: n(r.industrial_requested),
                  usable: details ? sum(n(g?.usable_capacity), n(p?.usable_capacity)) : null,
                  publicCapacity: g ? n(g.closing_capacity) : null,
                  privateCapacity: p ? n(p.closing_capacity) : null,
                  publicGrowth: n(r.development?.government),
                  privateGrowth: n(r.development?.producer),
                  publicInvestment: g ? n(g.investment) : null,
                  privateInvestment: p ? n(p.investment) : null,
                  sales: details ? sum(n(g?.sales), n(p?.sales)) : null,
                  costs: details ? sum(n(g?.recognized_cost), n(p?.recognized_cost)) : null,
                  result: details ? sum(n(g?.operating_result), n(p?.operating_result)) : null,
              }
            : {},
    };
}
