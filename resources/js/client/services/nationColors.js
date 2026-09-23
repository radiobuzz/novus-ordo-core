const valid = (value) => /^#[0-9a-f]{6}$/i.test(value);
export function primaryAllowed(color) {
    return color.primary_allowed !== false && color.primary_allowed !== 0;
}
export function nationColorChoices(catalogue, nationId, locale, primary = false) {
    return (catalogue?.colors ?? [])
        .filter((c) => !primary || primaryAllowed(c))
        .map((c) => {
            const taken =
                primary &&
                catalogue.assignments?.find((a) => a.primary_color_id === c.id && a.nation_id !== nationId);
            const label = locale === 'fr' ? c.name_fr : c.name;
            return { ...c, label: taken ? `${label} — ${taken.name}` : label, disabled: Boolean(taken) };
        });
}
/** Confirmed identity only. Local display palettes never replace national colours. */
export function nationPalette(catalogue, nationId) {
    const assignment = catalogue?.assignments?.find((a) => a.nation_id === nationId);
    const get = (id, fallback) => {
        const hex = catalogue?.colors?.find((c) => c.id === id)?.hex;
        return valid(hex) ? hex : fallback;
    };
    return {
        paint: get(assignment?.primary_color_id, '#67c1a5'),
        accent: get(assignment?.secondary_color_id, '#d6ba80'),
    };
}
export function mapNationColors(context) {
    return Object.fromEntries(
        context.territories
            .filter((t) => t.owner_nation_id)
            .map((t) => [
                t.owner_nation_id,
                {
                    id: t.owner_nation_id,
                    color: nationPalette(context.nationColors, t.owner_nation_id).paint,
                },
            ]),
    );
}
