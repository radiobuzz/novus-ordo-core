import { seasonFinance } from './economyGroups.js';
const n = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const sum = (...v) =>
    v.some((x) => x == null) ? null : Math.round(v.reduce((a, b) => a + Number(b), 0) * 1e6) / 1e6;
export const spendingKeys = [
    'military',
    'services',
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
        earnedIncome: n(r.earned_income),
        disposableIncome: n(r.disposable_income_estimate),
        economicStrength:
            r.indicators?.economic_strength == null ? null : n(r.indicators.economic_strength) * 100,
        dynamism: r.indicators?.dynamism == null ? null : n(r.indicators.dynamism) * 100,
        receipts: f.receipts,
        spending: f.spending,
        balance: f.balance,
        treasury: n(r.closing_treasury),
        debt: n(r.fiscal?.closing_debt),
        military: sum(n(r.command_costs), n(r.military_costs_paid), Number(r.response_costs ?? 0)),
        services: sum(
            ...['health', 'education', 'police', 'welfare', 'environment'].map((key) =>
                n(r.programs?.[key]?.paid),
            ),
        ),
        purchases: n(r.government_purchases),
        development: n(r.public_development),
        support: n(r.support_paid),
        infrastructure: Object.values(r.infrastructure ?? {}).reduce((a, row) => a + Number(row.paid), 0),
        interest: n(r.fiscal?.interest_paid),
    };
    const known = sum(...spendingKeys.slice(0, -1).map((key) => values[key]));
    values.other = known == null || f.spending == null ? null : Math.round((f.spending - known) * 1e6) / 1e6;
    if (values.other < -0.00001) for (const key of spendingKeys) values[key] = null;
    else if (values.other != null) values.other = Math.max(0, values.other);
    return { season: record.season, values };
}
export function industryPoint(record, key) {
    const r = record.resources?.[key],
        d = record.economy?.industries?.[key];
    return {
        season: record.season,
        values: r
            ? {
                  production: n(r.production?.national),
                  civilian: n(r.civilian_requested),
                  industry: n(r.industrial_requested),
                  usable: n(d?.usable_capacity),
                  capacity: n(d?.closing_capacity),
                  growth: n(r.development?.total),
                  publicInvestment: n(d?.public_development),
                  privateInvestment: n(d?.private_development),
                  acquisitions: n(d?.government_delivered),
                  acquisitionSpending: n(d?.acquisition_spending),
              }
            : {},
    };
}
