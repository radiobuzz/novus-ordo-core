// Presentation only: the shared server snapshot owns forecasts and fiscal rules.
import { financialAmount as amount, seasonalBalance } from '../ui/financeProjection.js';

export function headerFinance(economy) {
    const forecast = economy?.forecast?.expected;
    const fiscal = forecast?.fiscal;
    const debt = amount(economy?.state?.debt);
    const closingDebt = amount(fiscal?.closing_debt);
    const creditLimit = amount(fiscal?.credit_limit);
    const change =
        debt === null || closingDebt === null ? null : Math.round((closingDebt - debt) * 1e6) / 1e6;
    const restricted = Boolean(fiscal?.default_episode || fiscal?.credit_lock > 0);
    const warning = (economy?.forecast?.warnings ?? []).some(({ type }) =>
        ['credit_low', 'default'].includes(type),
    );
    return {
        debt,
        closingDebt,
        change,
        trend: change === null ? 'unknown' : change > 0 ? 'rising' : change < 0 ? 'falling' : 'steady',
        interest: amount(fiscal?.interest_due),
        remainingCredit: restricted
            ? 0
            : creditLimit === null || closingDebt === null
              ? null
              : Math.max(0, creditLimit - closingDebt),
        restricted,
        tone: warning || restricted ? 'danger' : debt > 0 || closingDebt > 0 ? 'warning' : 'muted',
        // Borrowing is not income; principal repayment is not an operating expense.
        balance: seasonalBalance(forecast),
    };
}
