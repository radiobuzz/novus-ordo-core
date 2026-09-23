import { territorialDefense } from '../../services/forceSummary.js';
import { Component } from '../../runtime/Component.js';
import { Scope } from '../../runtime/Scope.js';
import { el, button, formatStat } from '../../ui/dom.js';
import { CompactMessage } from '../../ui/CompactMessage.js';
import './territory.scss';

class TerritoryInspector extends Component {
    async render() {
        const { world, i18n } = this.services;
        this.snapshot = world.snapshot;
        const terrain = el('p', { class: 'eyebrow' });
        const name = el('h3');
        const ownership = el('p', { class: 'ownership' });
        const ownerSummary = el('summary');
        const portrait = el('img', { class: 'nation-portrait', alt: '' });
        const flag = el('img', { class: 'nation-flag', alt: '' });
        const leaderName = el('p');
        const nationStats = el('dl', { class: 'fact-list' });
        const nationCard = el(
            'details',
            { class: 'inspector-section nation-inspector' },
            ownerSummary,
            flag,
            portrait,
            leaderName,
            nationStats,
        );
        this.scope.listen(portrait, 'error', () => {
            portrait.hidden = true;
        });
        this.scope.listen(flag, 'error', () => {
            flag.hidden = true;
        });
        const defense = el('p', { class: 'defense-summary' });
        const defenseDetail = el('p', { class: 'muted' });
        const productivityTitle = el('summary');
        const population = el('p', { class: 'muted' });
        const rates = el('dl', { class: 'fact-list' });
        const productivityHint = el('p', { class: 'muted' });
        const productivity = el(
            'details',
            { class: 'inspector-section productivity-details' },
            productivityTitle,
            population,
            rates,
            productivityHint,
        );
        const facts = el('dl', { class: 'fact-list' });
        const productionTitle = el('h4');
        const productionValues = el('dl', { class: 'fact-list' });
        const noProduction = el('p', { class: 'muted' });
        const production = el(
            'section',
            { class: 'inspector-section' },
            productionTitle,
            productionValues,
            noProduction,
            productivity,
        );
        const ownerTitle = el('h4');
        const deployment = el('p');
        const ownerStats = el('dl', { class: 'fact-list' });
        const owner = el(
            'section',
            { class: 'inspector-section' },
            ownerTitle,
            deployment,
            ownerStats,
            defense,
            defenseDetail,
            el('p', {}, el('a', { href: '#/military', text: 'Manage divisions and deployments' })),
            el('p', {}, el('a', { href: '#/economy', text: 'Review production and resources' })),
        );
        const publicNote = el('p', { class: 'muted inspector-note' });
        const summary = el('summary');
        const connections = el('p', { class: 'muted' });
        const loyalties = el('div');
        const details = el(
            'details',
            { class: 'inspector-section territory-connections' },
            summary,
            connections,
            loyalties,
        );
        const turn = el('p', { class: 'snapshot-note' });
        const feedback = new CompactMessage(this.scope);
        const retry = button(i18n.t('common.retry'));
        retry.hidden = true;
        const compare = button(i18n.t('territory.compare'));
        compare.hidden = Boolean(this.inputs.dialog);
        this.scope.listen(compare, 'click', () => this.services.openInspectorDialog(this.inputs.id));
        this.element.append(
            el('div', { class: 'territory-identity' }, terrain, name, ownership),
            nationCard,
            facts,
            production,
            owner,
            publicNote,
            details,
            turn,
            feedback.element,
            retry,
            compare,
        );
        const updateFacts = (list, rows) => {
            while (list.children.length > rows.length) list.lastElementChild.remove();
            rows.forEach(([label, value], index) => {
                const row = list.children[index] ?? el('div', {}, el('dt'), el('dd'));
                if (!row.parentElement) list.append(row);
                if (row.firstChild.textContent !== label) row.firstChild.textContent = label;
                if (row.lastChild.textContent !== value) row.lastChild.textContent = value;
            });
        };
        const update = () => {
            const t = this.snapshot?.territories.find((item) => item.territory_id === this.inputs.id);
            if (!t) return;
            const own = t.owner_nation_id != null && t.owner_nation_id === this.snapshot.setup.nation_id;
            const ownerInfo = own
                ? this.snapshot.ownTerritories.find((item) => item.territory_id === this.inputs.id)
                : null;
            const nation = this.nation?.nation_id === t.owner_nation_id ? this.nation : null;
            const nationName = this.snapshot.nation_colors?.assignments.find(
                (item) => item.nation_id === t.owner_nation_id,
            )?.name;
            terrain.textContent = i18n.t('terrain.' + t.terrain_type) + ' · ' + (t.x + 1) + ' / ' + (t.y + 1);
            name.textContent = t.name;
            ownership.textContent = own
                ? i18n.t('world.ownTerritory')
                : nation?.usual_name || nationName || i18n.t('territory.unclaimed');
            ownership.classList.toggle('ownership--own', own);
            updateFacts(facts, [
                [
                    i18n.t('territory.nation'),
                    nation?.formal_name || nation?.usual_name || nationName || i18n.t('territory.noNation'),
                ],
                [
                    i18n.t('territory.land'),
                    i18n.number(t.usable_land_ratio, { style: 'percent', maximumFractionDigits: 0 }),
                ],
                [i18n.t('territory.sea'), i18n.t(t.has_sea_access ? 'common.yes' : 'common.no')],
                ...t.stats.map((stat) => [stat.title, formatStat(stat, i18n)]),
            ]);
            nationCard.hidden = !t.owner_nation_id;
            ownerSummary.textContent = i18n.t('territory.inspectNation', {
                name: nation?.usual_name || nationName || `#${t.owner_nation_id}`,
            });
            const leader = this.leaders?.find((item) => item.nation_id === t.owner_nation_id);
            const setImage = (image, src) => {
                if (src && image.getAttribute('src') !== src) {
                    image.hidden = false;
                    image.src = src;
                }
                if (!src) {
                    image.hidden = true;
                    image.removeAttribute('src');
                }
            };
            setImage(flag, nation?.flag_src);
            setImage(portrait, leader?.picture_src);
            leaderName.textContent = leader
                ? [leader.title, leader.name].filter(Boolean).join(' ')
                : i18n.t('territory.noLeader');
            updateFacts(
                nationStats,
                (nation?.stats ?? []).map((stat) => [stat.title, formatStat(stat, i18n)]),
            );
            const projected = territorialDefense(this.snapshot, t.territory_id);
            defense.textContent = projected
                ? i18n.t('forces.projected', { value: i18n.number(projected.total) })
                : '';
            defenseDetail.textContent = projected
                ? i18n.t(
                      'forces.breakdown',
                      Object.fromEntries(Object.entries(projected).map(([k, v]) => [k, i18n.number(v)])),
                  )
                : '';
            productivityTitle.textContent = i18n.t('territory.productivity');
            const pop = t.stats.find((stat) => stat.title === 'Population');
            const loyalty = t.loyalties.find((item) => item.nation_id === t.owner_nation_id)?.loyalty_ratio;
            population.textContent =
                pop && pop.unit !== 'Unknown' && Number.isFinite(loyalty)
                    ? i18n.t('territory.loyalPopulation', {
                          value: i18n.number(
                              (pop.value * loyalty) / (t.production_population_unit || 1000000),
                              { maximumFractionDigits: 2 },
                          ),
                      })
                    : i18n.t('territory.populationUnknown');
            updateFacts(
                rates,
                Object.entries(t.base_productivity ?? {}).map(([resource, rate]) => [
                    i18n.t('command.resource.' + resource),
                    i18n.number(rate, { maximumFractionDigits: 2 }) + '×',
                ]),
            );
            productivity.hidden = !Object.keys(t.base_productivity ?? {}).length;
            productivityHint.textContent = i18n.t('territory.productivityHint');
            productionTitle.textContent = i18n.t('territory.potential');
            noProduction.textContent = i18n.t('territory.noProduction');
            noProduction.hidden = Boolean(t.owner_production);
            updateFacts(
                productionValues,
                Object.entries(t.owner_production ?? {}).map(([resource, value]) => [
                    i18n.t('command.resource.' + resource),
                    i18n.number(value, { maximumFractionDigits: 1 }),
                ]),
            );
            owner.hidden = !ownerInfo;
            ownerTitle.textContent = ownerInfo ? i18n.t('territory.owner') : '';
            deployment.textContent = ownerInfo
                ? i18n.t(ownerInfo.can_deploy ? 'territory.deploy' : 'territory.noDeploy')
                : '';
            updateFacts(
                ownerStats,
                (ownerInfo?.stats ?? []).map((stat) => [stat.title, formatStat(stat, i18n)]),
            );
            publicNote.hidden = Boolean(ownerInfo);
            publicNote.textContent = i18n.t('territory.public');
            summary.textContent = i18n.t('territory.connections');
            connections.textContent = i18n.t('territory.connectionCount', {
                land: t.connected_land_territory_ids.length,
                total: t.connected_territory_ids.length,
            });
            const values = t.loyalties.map((loyalty) =>
                i18n.t('territory.loyalty', {
                    nation: loyalty.nation_id,
                    loyalty: i18n.number(loyalty.loyalty_ratio, {
                        style: 'percent',
                        maximumFractionDigits: 1,
                    }),
                }),
            );
            while (loyalties.children.length > values.length) loyalties.lastElementChild.remove();
            values.forEach((text, index) => {
                const line = loyalties.children[index] ?? el('p');
                if (!line.parentElement) loyalties.append(line);
                if (line.textContent !== text) line.textContent = text;
            });
            turn.textContent = i18n.t('territory.turn', { turn: t.turn_number });
            compare.textContent = i18n.t('territory.compare');
            retry.textContent = i18n.t('common.retry');
        };
        let request, loadedKey;
        this.scope.own(() => request?.dispose());
        const readIdentity = async () => {
            const territory = this.snapshot?.territories.find((t) => t.territory_id === this.inputs.id);
            if (!territory) return;
            const key = world.generation + ':' + territory.owner_nation_id;
            if (key === loadedKey) return;
            loadedKey = key;
            void request?.dispose();
            request = new Scope();
            const signal = AbortSignal.any([request.signal, this.scope.signal]);
            try {
                const identities = territory.owner_nation_id
                    ? await this.services.gameplay.identities(this.snapshot, signal)
                    : null;
                signal.throwIfAborted();
                this.nation =
                    identities?.nations.find((item) => item.nation_id === territory.owner_nation_id) ?? null;
                this.leaders = identities?.leaders ?? [];
                feedback.show('');
                retry.hidden = true;
                update();
            } catch (error) {
                if (signal.aborted) return;
                if (['session', 'forbidden'].includes(error.category)) {
                    world.invalidate(error);
                    return;
                }
                loadedKey = null;
                feedback.show(i18n.error(error), error.message);
                retry.hidden = false;
            }
        };
        this.scope.listen(retry, 'click', () => void readIdentity());
        i18n.changed.subscribe(this.scope, update);
        world.store.subscribe(this.scope, (state) => {
            if (state.status !== 'ready' || !world.sameScope(this.snapshot, state.snapshot)) return;
            this.snapshot = state.snapshot;
            update();
            void readIdentity();
        });
    }
}
export function createInstance(options) {
    return new TerritoryInspector(options);
}
