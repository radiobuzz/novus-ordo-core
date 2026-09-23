import { reportText } from '../services/reportText.js';
import { nationPalette } from '../services/nationColors.js';
import { el } from './dom.js';

function nationFor(id, nations) {
    return id == null ? null : nations.find((nation) => nation.nation_id === Number(id));
}

export function nationIdentity(nationId, { nations = [], nationColors, labels = {} } = {}) {
    const nation = nationFor(nationId, nations);
    const neutral = nationId == null;
    const name = neutral ? (labels.neutral ?? 'Neutral') : (nation?.usual_name ?? `Nation ${nationId}`);
    const badge = el('span', {
        class: `report-identity${neutral ? ' is-neutral' : ''}`,
        style: neutral ? undefined : `--identity-color: ${nationPalette(nationColors, nationId).paint}`,
    });
    if (neutral) badge.append(el('span', { class: 'report-neutral-flag', text: '🏴‍☠️', 'aria-hidden': true }));
    else if (nation?.flag_src)
        badge.append(el('img', { class: 'report-identity-flag', src: nation.flag_src, alt: '' }));
    badge.append(el('span', { text: name }));
    return badge;
}

function territoryName(id, territories) {
    return territories.find((territory) => territory.territory_id === Number(id))?.name ?? `Territory ${id}`;
}

export function battleParticipants(battle, options = {}) {
    return el(
        'span',
        { class: 'report-participants' },
        nationIdentity(battle.attacker_nation_id, options),
        el('span', { class: 'report-versus', text: options.labels?.versus ?? 'vs', 'aria-hidden': true }),
        nationIdentity(battle.defender_nation_id, options),
    );
}

export function reportEvent(item, options = {}) {
    const context = item?.context;
    if (context?.type !== 'battle')
        return el('p', {
            class: 'report-text',
            text: reportText(item?.content, options),
        });

    const conquered = context.outcome === 'conquered';
    return el(
        'article',
        { class: `report-event is-${conquered ? 'conquered' : 'repelled'}` },
        el(
            'div',
            { class: 'report-event-line' },
            nationIdentity(context.attacker_nation_id, options),
            el('span', {
                class: 'report-event-action',
                text: conquered
                    ? (options.labels?.conquered ?? 'conquered')
                    : (options.labels?.repelledBy ?? 'was repelled by'),
            }),
            nationIdentity(context.defender_nation_id, options),
        ),
        el('p', {
            class: 'report-event-territory',
            text: territoryName(context.territory_id, options.territories ?? []),
        }),
    );
}
