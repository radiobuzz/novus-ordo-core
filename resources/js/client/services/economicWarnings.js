/** Authoritative warning context in; localized text out. No economic calculations. */
export function economicWarning(i18n, warning) {
    return i18n.t(`economy.${warning.type}`, {
        territory: warning.territory_id,
        resource: warning.resource_key,
        missing: warning.missing,
        program: warning.program,
        cause: warning.cause ? i18n.t(`economy.cause_${warning.cause}`) : '',
    });
}
