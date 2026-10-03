/** Authoritative warning context in; localized text out. No economic calculations. */
export function economicWarning(i18n, warning) {
    return i18n.t(`economy.${warning.type}`, { territory: warning.territory_id });
}
