// Presentation arithmetic over authoritative reports; no tax/debt rule simulation.
export const financialAmount = (value) =>
    value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function treasuryChange(report) {
    const opening = financialAmount(report?.opening_treasury),
        closing = financialAmount(report?.closing_treasury);
    return opening == null || closing == null ? null : Math.round((closing - opening) * 1e6) / 1e6;
}
export function seasonalBalance(report) {
    const values = [
        report?.closing_treasury,
        report?.opening_treasury,
        report?.fiscal?.borrowing,
        report?.fiscal?.principal_repaid,
    ].map(financialAmount);
    return values.some((v) => v === null)
        ? null
        : Math.round((values[0] - values[1] - values[2] + values[3]) * 1e6) / 1e6;
}
