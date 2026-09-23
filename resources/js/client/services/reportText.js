/** Resolve the engine's news tokens to text only, never HTML. */
export function reportText(content, { nations = [], leaders = [], territories = [] } = {}) {
    const sources = { nation: nations, leader: leaders, territory: territories };
    const fields = { nation: ['usual_name', 'formal_name'], leader: ['name', 'title'], territory: ['name'] };
    return String(content).replace(
        /##(nation|leader|territory)#(\d+)#([a-z_]+)##/g,
        (token, kind, id, field) => {
            if (!fields[kind].includes(field)) return token;
            const item = sources[kind].find((item) => item[`${kind}_id`] === Number(id));
            return item?.[field] ?? `${kind} ${id}`;
        },
    );
}
