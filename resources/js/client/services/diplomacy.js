/** Confirmed bilateral permissions; the backend always revalidates commands. */
export function relationTo(snapshot, otherId) {
    const own = snapshot?.setup?.nation_id;
    if (own === otherId) return { state: 'Allied' };
    return (
        snapshot?.nation?.diplomacy?.relations?.find(
            (row) =>
                (row.nation_a_id === own && row.nation_b_id === otherId) ||
                (row.nation_b_id === own && row.nation_a_id === otherId),
        ) ?? { state: 'NoRelations', revision: null }
    );
}

export function canPass(snapshot, otherId) {
    return (
        otherId === snapshot?.setup?.nation_id ||
        (otherId != null && relationTo(snapshot, otherId).state === 'Allied')
    );
}

export function protectedFromAttack(snapshot, otherId) {
    return otherId != null && ['Peace', 'Allied'].includes(relationTo(snapshot, otherId).state);
}

export function requestKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
