import './economy-lab.scss';
import { el } from '../client/ui/element.js';
import { Button, actionLink } from '../client/ui/Button.js';
import { panel } from '../client/ui/Panel.js';
import { FieldShell } from '../client/ui/FieldShell.js';
import { Scope } from '../client/runtime/Scope.js';
import {
    COUNTRY_IDS,
    MAX_SEASONS,
    defaultSettings,
    createState,
    advanceSeason,
    compareInvestment,
} from './model.js';

const root = document.getElementById('economy-lab-root');
let locale = new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
let settings = defaultSettings();
let state = createState(settings);
let selectedSeason = 0;
let scope;
let form;
let results;
let status;
let advance;
let batch;
let controls;
let comparison = null;
let comparisonResults;
const t = (en, fr) => (locale === 'fr' ? fr : en);
const fmt = (value, digits = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
        Math.abs(value) < 1e-7 ? 0 : value,
    );
const countryName = (id) => (id === 'aurelia' ? 'Aurelia' : 'Borealis');
const activityName = (id) =>
    ({
        operations: t('Civilian operations', 'Activité civile'),
        expansion: t('Civilian expansion', 'Expansion civile'),
        military: t('Military procurement', 'Approvisionnement militaire'),
    })[id];
const seasonName = (number) =>
    `${t('Year', 'Année')} ${Math.ceil(number / 4)} · ${[t('Spring', 'Printemps'), t('Summer', 'Été'), t('Autumn', 'Automne'), t('Winter', 'Hiver')][(number - 1) % 4]}`;

function action(label, callback, variant = 'secondary') {
    const button = new Button({ label, variant, icon: null });
    scope.listen(button.element, 'click', callback);
    return button;
}

function field(key, label, help, options = {}) {
    const input = el('input', {
        type: 'number',
        min: 0,
        max: 10000,
        step: 'any',
        required: true,
        ...options,
        'data-setting': key,
    });
    const parts = key.split('.');
    const value = () => (parts.length === 2 ? settings.countries[parts[0]][parts[1]] : settings[key]);
    input.value = value();
    controls.set(key, input);
    const shell = new FieldShell({ control: input, label, help });
    scope.listen(input, 'input', () => {
        if (input.validity.valid) {
            if (parts.length === 2) settings.countries[parts[0]][parts[1]] = input.valueAsNumber;
            else settings[key] = input.valueAsNumber;
        }
        shell.setError(
            input.validity.valid
                ? ''
                : t('Enter a number within the limits.', 'Saisissez un nombre dans les limites.'),
        );
        status.textContent = t(
            'Edits apply next season. Starting stocks apply only after Reset run.',
            'Les changements s’appliquent à la prochaine saison. Les stocks initiaux nécessitent Réinitialiser.',
        );
        updateButtons();
    });
    return shell.element;
}

function syncControls() {
    for (const [key, input] of controls) {
        const parts = key.split('.');
        if (input.type === 'checkbox') input.checked = settings[key];
        else input.value = parts.length === 2 ? settings.countries[parts[0]][parts[1]] : settings[key];
        input.dispatchEvent(new Event('input'));
    }
    updateButtons();
}

function updateButtons() {
    const disabled = !form.checkValidity() || state.season >= MAX_SEASONS;
    advance.setDisabled(disabled);
    batch.setDisabled(disabled);
}

function run(count) {
    if (!form.reportValidity()) return;
    try {
        for (let i = 0; i < count && state.season < MAX_SEASONS; i++) state = advanceSeason(state, settings);
        selectedSeason = state.season;
        renderResults();
        status.textContent =
            state.season >= MAX_SEASONS
                ? t(
                      '200 seasons reached. Export or reset to start another run.',
                      '200 saisons atteintes. Exportez ou réinitialisez la simulation.',
                  )
                : `${t('Completed season', 'Saison terminée')} ${state.season}. ${t('Copper and money accounts balance.', 'Les comptes de cuivre et d’argent sont équilibrés.')}`;
    } catch (error) {
        status.textContent = `${t('Simulation stopped', 'Simulation arrêtée')}: ${error.message}`;
    }
    updateButtons();
}

function reset() {
    if (!form.reportValidity()) return;
    state = createState(settings);
    selectedSeason = 0;
    renderResults();
    updateButtons();
    status.textContent = t(
        'New run with the current assumptions. History, projects and supplier cash cleared.',
        'Nouvelle simulation avec les hypothèses actuelles. Historique, projets et trésorerie des producteurs remis à zéro.',
    );
}

function download() {
    const blob = new Blob(
        [JSON.stringify({ version: 2, comparison, model: 'copper-market-lab', settings, state }, null, 2)],
        { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `novus-economy-${state.season}-seasons.json` });
    root.append(link);
    link.click();
    link.remove();
    scope.timeout(() => URL.revokeObjectURL(url), 1000);
    scope.own(() => URL.revokeObjectURL(url));
}

function investmentControls() {
    const toggle = el('input', { type: 'checkbox', id: 'private-investment' });
    toggle.checked = settings.investmentEnabled;
    controls.set('investmentEnabled', toggle);
    scope.listen(toggle, 'change', () => {
        settings.investmentEnabled = toggle.checked;
        status.textContent = t(
            'New investment changed. Already funded projects still complete; reset for a clean comparison.',
            'Nouvel investissement modifié. Les projets financés seront achevés ; réinitialisez pour comparer.',
        );
    });
    return panel(
        {
            title: t('Final experiment · private investment', 'Dernière expérience · investissement privé'),
            className: 'economy-investment-controls',
        },
        el(
            'label',
            { class: 'economy-toggle', for: toggle.id },
            toggle,
            t('Automatic private investment in Aurelia', 'Investissement privé automatique dans Aurelia'),
        ),
        el('p', {
            class: 'economy-muted',
            text: t(
                'Retained earnings fund projects that finish later. Borealis stays the manual comparison. Turning investment off stops new commitments, not existing projects or price-driven idling.',
                'Les bénéfices conservés financent des projets achevés plus tard. Borealis reste la comparaison manuelle. Désactiver arrête les nouveaux engagements, pas les projets existants ni les arrêts liés au prix.',
            ),
        }),
        action(t('Compare three stories', 'Comparer trois scénarios'), () => {
            if (!form.reportValidity()) return;
            comparison = compareInvestment(settings);
            renderComparison();
            status.textContent = t(
                'Six independent 32-season runs completed. Your interactive run is unchanged. Comparison settings are captured; rerun after edits.',
                'Six simulations indépendantes de 32 saisons terminées. Votre simulation interactive est conservée. Paramètres capturés ; relancez après modification.',
            );
            comparisonResults.scrollIntoView({ block: 'start' });
            comparisonResults.querySelector('summary').focus();
        }).element,
        el(
            'details',
            {},
            el('summary', { text: t('Investment assumptions', 'Hypothèses d’investissement') }),
            el(
                'div',
                { class: 'economy-fields' },
                field(
                    'investmentWindow',
                    t('Profit observation window', 'Période d’observation des marges'),
                    t(
                        'Completed seasons before investing · 1–12',
                        'Saisons observées avant investissement · 1–12',
                    ),
                    { min: 1, max: 12, step: 1 },
                ),
                field(
                    'investmentDelay',
                    t('Construction delay', 'Délai de construction'),
                    t('Seasons until funded capacity opens · 1–12', 'Saisons avant mise en service · 1–12'),
                    { min: 1, max: 12, step: 1 },
                ),
                field(
                    'investmentCost',
                    t('Cost per new capacity unit', 'Coût par unité de capacité'),
                    t(
                        'Money spent now per extra copper / season',
                        'Argent dépensé maintenant par cuivre / saison',
                    ),
                    { min: 1 },
                ),
                field(
                    'investmentShare',
                    t('Share of eligible cash invested', 'Part de trésorerie admissible investie'),
                    t('0–1 · 0.35 means 35%', '0–1 · 0,35 signifie 35 %'),
                    { max: 1 },
                ),
                field(
                    'investmentThreshold',
                    t('Required recent unit margin', 'Marge unitaire récente requise'),
                    t(
                        'Operating cash surplus / installed capacity',
                        'Excédent monétaire d’exploitation / capacité installée',
                    ),
                ),
                field(
                    'reserveSeasons',
                    t('Working cash reserve', 'Réserve de trésorerie'),
                    t('Seasons of full-capacity operating costs', 'Saisons de coûts à pleine capacité'),
                    { max: 12 },
                ),
            ),
            el('p', {
                class: 'economy-muted',
                text: t(
                    'Cash remaining after the reserve is further limited by cumulative operating earnings minus prior investment. Outside financing never counts as earnings. Projects keep the cost and completion date agreed when funded. Pending capacity is not forecast by investors; this deliberate blind spot can cause overbuilding. No guarantee of a crash.',
                    'La trésorerie après réserve est limitée par les bénéfices d’exploitation cumulés, moins les investissements passés. Le financement externe n’est jamais un bénéfice. Coût et échéance sont fixés au financement. Les investisseurs ne prévoient pas la capacité en chantier ; cet angle mort volontaire peut provoquer une surconstruction. Aucune crise garantie.',
                ),
            }),
        ),
    );
}

function investmentReport(report) {
    const c = report.countries.aurelia;
    const reasons = {
        off: t('New investment is switched off.', 'Le nouvel investissement est désactivé.'),
        history: t(
            'Waiting for a full observation window.',
            'En attente d’une période d’observation complète.',
        ),
        margin: t(
            'Recent margins or the current price do not justify expansion.',
            'Les marges récentes ou le prix actuel ne justifient pas une expansion.',
        ),
        cash: t(
            'No eligible cash after the reserve, or investment share is zero.',
            'Aucune trésorerie admissible après réserve, ou part investie nulle.',
        ),
        invested: t(
            'Recent margins and earned cash funded new capacity.',
            'Les marges récentes et les bénéfices ont financé une nouvelle capacité.',
        ),
    };
    return panel(
        { title: t('Aurelia · investment and capacity', 'Aurelia · investissement et capacité') },
        el('p', { text: reasons[c.investmentReason] }),
        table(
            t('Production and investment this season', 'Production et investissement de la saison'),
            [t('Observation', 'Observation'), t('Value', 'Valeur')],
            [
                [t('Installed capacity', 'Capacité installée'), fmt(c.capacity)],
                [t('Actual production', 'Production réelle'), fmt(c.production)],
                [t('Idle capacity', 'Capacité inactive'), fmt(c.idleCapacity)],
                [t('Newly completed capacity', 'Capacité nouvellement achevée'), fmt(c.completedCapacity)],
                [t('Operating cash surplus', 'Excédent monétaire d’exploitation'), fmt(c.margin)],
                [
                    t('Recent margin per installed unit', 'Marge récente par unité installée'),
                    fmt(c.expectedMargin),
                ],
                [
                    t('Required margin in this season', 'Marge requise cette saison'),
                    fmt(report.settings.investmentThreshold),
                ],
                [t('Working cash reserve', 'Réserve de trésorerie'), fmt(c.workingReserve)],
                [
                    t('Eligible cash before commitment', 'Trésorerie admissible avant engagement'),
                    fmt(c.investableCash),
                ],
                [t('Construction expenditure', 'Dépense de construction'), fmt(c.investment)],
                [
                    t('Capacity still under construction', 'Capacité encore en construction'),
                    fmt(c.pendingCapacity),
                ],
            ],
        ),
        chart(t('Aurelia capacity · full run', 'Capacité d’Aurelia · simulation entière'), [
            { label: t('Installed', 'Installée'), value: (r) => r.countries.aurelia.capacity },
            { label: t('Producing', 'Exploitée'), value: (r) => r.countries.aurelia.production },
            {
                label: t('In construction', 'En construction'),
                value: (r) => r.countries.aurelia.pendingCapacity,
            },
        ]),
        c.projects.length
            ? table(
                  t('Funded completion schedule', 'Échéancier des projets financés'),
                  [
                      t('Funded season', 'Saison financée'),
                      t('Available season', 'Saison disponible'),
                      t('Capacity', 'Capacité'),
                      t('Money already spent', 'Argent déjà dépensé'),
                  ],
                  c.projects.map((p) => [p.committedSeason, p.readySeason, fmt(p.capacity), fmt(p.spending)]),
              )
            : el('p', {
                  class: 'economy-muted',
                  text: t('No capacity under construction.', 'Aucune capacité en construction.'),
              }),
    );
}

function renderComparison() {
    if (!comparison) {
        comparisonResults.replaceChildren();
        return;
    }
    const names = {
        stable: t('Stable demand', 'Demande stable'),
        sustained: t('Sustained military buildup', 'Mobilisation durable'),
        temporary: t('Temporary military buildup', 'Mobilisation temporaire'),
    };
    const rows = comparison.stories.flatMap(({ story, runs }) =>
        runs.map(({ enabled, state: result }) => {
            const h = result.history;
            return [
                names[story],
                enabled ? t('On', 'Activé') : t('Off', 'Désactivé'),
                fmt(Math.min(...h.slice(12).map((r) => r.price))),
                fmt(h.at(-1).price),
                fmt(result.countries.aurelia.builtCapacity),
                fmt(h.reduce((n, r) => n + r.accounts.investmentSpending, 0)),
                h.filter((r) => r.countries.aurelia.idleCapacity > 1e-7).length,
            ];
        }),
    );
    comparisonResults.replaceChildren(
        el(
            'details',
            { open: true },
            el('summary', {
                text: t(
                    'Investment comparison · 3 stories × on / off',
                    'Comparaison d’investissement · 3 scénarios × activé / désactivé',
                ),
            }),
            panel(
                {
                    title: t(
                        'Same starting conditions, different investment decisions',
                        'Mêmes conditions initiales, décisions d’investissement différentes',
                    ),
                },
                el('p', {
                    text: t(
                        '32 seasons per run. Demand rises in season 5; the temporary buildup ends after season 12. Each pair starts fresh with your captured controls, changing only the investment switch. Existing interactive stocks and projects are not copied.',
                        '32 saisons par simulation. La demande augmente à la saison 5 ; la mobilisation temporaire se termine après la saison 12. Chaque paire repart des paramètres capturés, seul l’investissement change. Stocks et projets interactifs ne sont pas copiés.',
                    ),
                }),
                el('p', {
                    class: 'economy-muted',
                    text: `${t('Captured assumptions', 'Hypothèses capturées')}: ${t('delay', 'délai')} ${comparison.settings.investmentDelay}, ${t('unit cost of capacity', 'coût unitaire de capacité')} ${fmt(comparison.settings.investmentCost)}, ${t('investment share', 'part investie')} ${fmt(comparison.settings.investmentShare * 100)}%. ${t('Export observations includes the exact settings and every comparison season.', 'L’export inclut les paramètres exacts et chaque saison comparée.')}`,
                }),
                table(
                    t('Comparison outcomes', 'Résultats comparés'),
                    [
                        t('Story', 'Scénario'),
                        t('Investment', 'Investissement'),
                        t('Lowest price, seasons 13–32', 'Prix minimum, saisons 13–32'),
                        t('Final paid price', 'Dernier prix payé'),
                        t('Added capacity', 'Capacité ajoutée'),
                        t('Construction spending', 'Dépenses de construction'),
                        t('Idle seasons', 'Saisons inactives'),
                    ],
                    rows,
                ),
                ...comparison.stories.map(({ story, runs }) =>
                    el(
                        'div',
                        {},
                        chart(
                            `${names[story]} · ${t('price paid', 'prix payé')}`,
                            runs.map(({ enabled, state: result }) => ({
                                label: enabled
                                    ? t('Investment on', 'Investissement activé')
                                    : t('Investment off', 'Investissement désactivé'),
                                value: (_, index) => result.history[index].price,
                            })),
                            runs[0].state.history,
                        ),
                        el(
                            'details',
                            {},
                            el('summary', {
                                text: t('Exact comparison values', 'Valeurs exactes de comparaison'),
                            }),
                            table(
                                names[story],
                                [
                                    t('Season', 'Saison'),
                                    t('Price · off', 'Prix · désactivé'),
                                    t('Price · on', 'Prix · activé'),
                                    t('Installed · on', 'Installée · activé'),
                                    t('Producing · on', 'Exploitée · activé'),
                                    t('In construction · on', 'En construction · activé'),
                                ],
                                runs[0].state.history.map((r, i) => {
                                    const other = runs[1].state.history[i];
                                    return [
                                        r.season,
                                        fmt(r.price),
                                        fmt(other.price),
                                        fmt(other.countries.aurelia.capacity),
                                        fmt(other.countries.aurelia.production),
                                        fmt(other.countries.aurelia.pendingCapacity),
                                    ];
                                }),
                            ),
                        ),
                    ),
                ),
                el('p', {
                    class: 'economy-muted',
                    text: t(
                        'A fall in price is an observation, not a guaranteed crash. Complete idling/restarting and the posted-price rule can themselves cause oscillation. This is the final experiment for this theme; broader economic integration remains a separate design task.',
                        'Une baisse de prix est une observation, pas une crise garantie. Les arrêts/redémarrages complets et le prix affiché peuvent eux-mêmes créer des oscillations. Dernière expérience sur ce thème ; l’intégration économique reste un travail distinct.',
                    ),
                }),
            ),
        ),
    );
}

function countryControls(id) {
    const unit = t('Copper units / season', 'Unités de cuivre / saison');
    return panel(
        { title: countryName(id), className: `economy-country economy-country--${id}` },
        el('p', {
            class: 'economy-muted',
            text:
                id === 'aurelia'
                    ? t(
                          'Private copper producer · civilian and government buyers',
                          'Producteur privé · acheteurs civils et gouvernementaux',
                      )
                    : t(
                          'State copper enterprise · civilian and government buyers',
                          'Entreprise publique · acheteurs civils et gouvernementaux',
                      ),
        }),
        el(
            'div',
            { class: 'economy-fields' },
            field(
                `${id}.capacity`,
                t('Base installed capacity', 'Capacité installée de base'),
                t(
                    'Units / season · private additions are kept separately',
                    'Unités / saison · ajouts privés conservés séparément',
                ),
            ),
            field(
                `${id}.exportCap`,
                t('Export limit', 'Limite d’exportation'),
                t('Surplus only · units / season', 'Excédent seulement · unités / saison'),
            ),
            field(`${id}.operations`, t('Civilian operating need', 'Besoin de l’activité civile'), unit),
            field(`${id}.expansion`, t('Desired expansion', 'Expansion souhaitée'), unit),
            field(
                `${id}.civilianBudget`,
                t('Civilian purchasing budget', 'Budget d’achat civil'),
                t(
                    'Money / season · operations funded first',
                    'Argent / saison · activité financée en premier',
                ),
                { max: 1000000 },
            ),
            field(`${id}.military`, t('Military copper need', 'Besoin militaire en cuivre'), unit),
            field(
                `${id}.militaryBudget`,
                t('Military purchasing budget', 'Budget d’achat militaire'),
                t('Money / season · separate from civilians', 'Argent / saison · séparé des civils'),
                { max: 1000000 },
            ),
        ),
        el(
            'details',
            {},
            el('summary', { text: t('Stocks and production costs', 'Stocks et coûts de production') }),
            el(
                'div',
                { class: 'economy-fields' },
                field(
                    `${id}.stock`,
                    t('Starting copper stock', 'Stock initial de cuivre'),
                    t('Reset run to apply', 'Réinitialiser pour appliquer'),
                ),
                field(
                    `${id}.unitCost`,
                    t('Production cost per unit', 'Coût de production unitaire'),
                    t(
                        'Variable cost / unit · Aurelia idles below cost',
                        'Coût variable / unité · Aurelia s’arrête sous ce coût',
                    ),
                ),
            ),
        ),
    );
}

function table(caption, headings, rows) {
    return el(
        'div',
        { class: 'economy-table-wrap', tabindex: '0', role: 'region', 'aria-label': caption },
        el(
            'table',
            {},
            el('caption', { text: caption }),
            el(
                'thead',
                {},
                el(
                    'tr',
                    {},
                    headings.map((heading) => el('th', { scope: 'col', text: heading })),
                ),
            ),
            el(
                'tbody',
                {},
                rows.map((row) =>
                    el(
                        'tr',
                        {},
                        row.map((cell, index) =>
                            el(index === 0 ? 'th' : 'td', {
                                ...(index === 0 ? { scope: 'row' } : {}),
                                text: cell,
                            }),
                        ),
                    ),
                ),
            ),
        ),
    );
}

function metric(label, value, help) {
    return el(
        'div',
        { class: 'economy-metric' },
        el('span', { text: label }),
        el('strong', { text: value }),
        el('small', { text: help }),
    );
}

function chart(title, series, history = state.history) {
    const width = 640,
        height = 190,
        left = 50,
        right = 15,
        top = 15,
        bottom = 30;
    const values = series.flatMap((line) => history.map(line.value));
    const max = Math.max(1, ...values) * 1.1;
    const x = (index) => left + (index / Math.max(1, history.length - 1)) * (width - left - right);
    const y = (value) => height - bottom - (value / max) * (height - top - bottom);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
        'aria-label',
        `${title}. ${t('Exact values in seasonal history below.', 'Valeurs exactes dans l’historique ci-dessous.')}`,
    );
    function node(tag, attributes, text) {
        const child = document.createElementNS(svg.namespaceURI, tag);
        for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, value);
        if (text != null) child.textContent = text;
        svg.append(child);
        return child;
    }
    for (let tick = 0; tick <= 2; tick++) {
        const value = (max * tick) / 2;
        node('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: 'economy-grid-line' });
        node('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end' }, fmt(value, 1));
    }
    node('text', { x: left, y: height - 5 }, '1');
    if (history.length > 1)
        node('text', { x: width - right, y: height - 5, 'text-anchor': 'end' }, String(history.length));
    series.forEach((line, index) => {
        const points = history.map((report, i) => `${x(i)},${y(line.value(report, i))}`).join(' ');
        node('polyline', {
            points,
            fill: 'none',
            class: `economy-series economy-series--${index}`,
            'stroke-width': 2.5,
            ...(index ? { 'stroke-dasharray': '6 4' } : {}),
        });
        const last = history.at(-1);
        if (last)
            node('circle', {
                cx: x(history.length - 1),
                cy: y(line.value(last, history.length - 1)),
                r: 3.5,
                class: `economy-dot economy-dot--${index}`,
            });
    });
    return el(
        'figure',
        { class: 'economy-chart' },
        el('figcaption', { text: title }),
        svg,
        el(
            'div',
            { class: 'economy-legend' },
            series.map((line, index) =>
                el('span', { class: `economy-key economy-key--${index}`, text: line.label }),
            ),
        ),
    );
}

function narrative(report) {
    const messages = [];
    const previous = state.history[report.season - 2];
    if (previous) {
        for (const id of COUNTRY_IDS) {
            const before = previous.settings.countries[id];
            const after = report.settings.countries[id];
            if (after.military !== before.military)
                messages.push(
                    `${countryName(id)}: ${t('military need changed from', 'le besoin militaire passe de')} ${fmt(before.military)} → ${fmt(after.military)}.`,
                );
            if (after.exportCap !== before.exportCap)
                messages.push(
                    `${countryName(id)}: ${t('export limit changed from', 'la limite d’exportation passe de')} ${fmt(before.exportCap)} → ${fmt(after.exportCap)}.`,
                );
            if (after.capacity !== before.capacity)
                messages.push(
                    `${countryName(id)}: ${t('manual base capacity changed from', 'la capacité de base manuelle passe de')} ${fmt(before.capacity)} → ${fmt(after.capacity)}.`,
                );
        }
        if (previous.settings.allocation !== report.settings.allocation)
            messages.push(
                t(
                    'The shortage allocation rule changed this season.',
                    'La règle de répartition en pénurie a changé cette saison.',
                ),
            );
    }
    for (const id of COUNTRY_IDS) {
        const country = report.countries[id];
        if (country.imports > 1e-7)
            messages.push(
                `${countryName(id)} ${t('imported', 'a importé')} ${fmt(country.imports)} ${t('copper for', 'unités de cuivre pour')} ${fmt(country.importPayment)}.`,
            );
        for (const request of country.requests) {
            const unfunded = request.wanted - request.funded;
            const shortage = request.funded - request.delivered;
            if (unfunded > 1e-7)
                messages.push(
                    `${countryName(id)} · ${activityName(request.activity)}: ${fmt(unfunded)} ${t('units could not be funded.', 'unités n’ont pas pu être financées.')}`,
                );
            if (shortage > 1e-7)
                messages.push(
                    `${countryName(id)} · ${activityName(request.activity)}: ${fmt(shortage)} ${t('funded units could not be supplied.', 'unités financées n’ont pas pu être livrées.')}`,
                );
            if (request.need - request.wanted > 1e-7)
                messages.push(
                    `${countryName(id)}: ${fmt(request.need - request.wanted)} ${t('units of expansion were deferred because copper exceeded the base price.', 'unités d’expansion ont été reportées car le cuivre dépasse le prix de base.')}`,
                );
        }
        if (country.restrictedStock > 1e-7)
            messages.push(
                `${countryName(id)}: ${fmt(country.restrictedStock)} ${t('units were withheld from export by the limit.', 'unités exclues des exportations par la limite.')}`,
            );
    }
    const producer = report.countries.aurelia;
    if (producer.completedCapacity > 1e-7)
        messages.push(
            `${t('Aurelia completed', 'Aurelia a achevé')} ${fmt(producer.completedCapacity)} ${t('units of capacity from earlier investment.', 'unités de capacité financées auparavant.')}`,
        );
    if (producer.investment > 1e-7)
        messages.push(
            `${t('Aurelia invested', 'Aurelia a investi')} ${fmt(producer.investment)} ${t('in', 'dans')} ${fmt(producer.newCapacity)} ${t('capacity, available in season', 'unités de capacité, disponibles à la saison')} ${report.season + report.settings.investmentDelay}.`,
        );
    if (producer.idleCapacity > 1e-7)
        messages.push(
            t(
                'Aurelia idled its capacity: price is below variable cost. Installed capacity survives and can restart.',
                'Aurelia a arrêté sa production : le prix est inférieur au coût variable. La capacité installée reste disponible pour redémarrer.',
            ),
        );
    messages.push(
        `${t('Funded demand', 'Demande financée')} ${fmt(report.fundedDemand)} / ${t('accessible supply', 'offre accessible')} ${fmt(report.accessibleSupply)}. ${t('Next quoted price', 'Prochain prix affiché')}: ${fmt(report.nextPrice)}.`,
    );
    if (messages.length === 1)
        messages.unshift(
            t(
                'All desired activity received its copper this season.',
                'Toutes les activités souhaitées ont reçu leur cuivre cette saison.',
            ),
        );
    return el(
        'ul',
        { class: 'economy-explanation' },
        messages.map((text) => el('li', { text })),
    );
}

function renderResults() {
    if (!state.history.length) {
        results.replaceChildren(
            panel(
                {
                    title: t('Ready for the first season', 'Prêt pour la première saison'),
                    className: 'economy-empty',
                },
                el('p', {
                    text: t(
                        'Aurelia produces 40 units and wants 60. Borealis produces 60 and wants 40. At the default price of 10, its 20-unit surplus can cover Aurelia’s needs.',
                        'Aurelia produit 40 unités et en souhaite 60. Borealis en produit 60 et en souhaite 40. Au prix initial de 10, son excédent de 20 unités couvre les besoins d’Aurelia.',
                    ),
                }),
                el('p', {
                    class: 'economy-muted',
                    text: t(
                        'This describes the baseline preset. Adjust assumptions, then advance a season to see your results.',
                        'Ceci décrit le scénario de référence. Ajustez les hypothèses, puis avancez d’une saison pour voir vos résultats.',
                    ),
                }),
            ),
        );
        return;
    }
    const report = state.history[selectedSeason - 1] ?? state.history.at(-1);
    const accounts = report.accounts;
    const select = el(
        'select',
        { class: 'ui-control', id: 'economy-season' },
        state.history.map((item) =>
            el('option', { value: item.season, text: `${item.season} · ${seasonName(item.season)}` }),
        ),
    );
    select.value = report.season;
    const requestRows = COUNTRY_IDS.flatMap((id) =>
        report.countries[id].requests.map((r) => [
            `${countryName(id)} · ${activityName(r.activity)}`,
            fmt(r.need),
            fmt(r.wanted),
            fmt(r.funded),
            fmt(r.delivered),
            fmt(r.delivered * report.price),
        ]),
    );
    const copperRows = COUNTRY_IDS.map((id) => {
        const c = report.countries[id];
        return [
            countryName(id),
            fmt(c.openingStock),
            fmt(c.production),
            fmt(c.imports),
            fmt(c.consumed),
            fmt(c.exports),
            fmt(c.closingStock),
        ];
    });
    const moneyRows = COUNTRY_IDS.map((id) => {
        const c = report.countries[id];
        return [
            countryName(id),
            fmt(c.openingCash),
            fmt(c.financing),
            fmt(c.costs),
            fmt(c.receipts),
            fmt(c.investment),
            fmt(c.closingCash),
        ];
    });
    results.replaceChildren(
        el(
            'div',
            { class: 'economy-results-heading' },
            el('h2', { text: t('Seasonal observations', 'Observations saisonnières') }),
            el(
                'div',
                {},
                el('label', { for: select.id, text: t('Inspect season', 'Examiner la saison') }),
                select,
            ),
        ),
        el(
            'div',
            { class: 'economy-metrics' },
            metric(
                t('Copper price paid', 'Prix du cuivre payé'),
                fmt(report.price),
                t(
                    'One quote for domestic and foreign sales',
                    'Prix commun aux ventes nationales et étrangères',
                ),
            ),
            metric(
                t('Next season’s quote', 'Prix de la prochaine saison'),
                fmt(report.nextPrice),
                `${t('Base', 'Base')} ${fmt(report.settings.basePrice)} · ${t('Target', 'Cible')} ${fmt(report.targetPrice)}`,
            ),
            metric(
                t('Delivered / desired', 'Livré / souhaité'),
                `${fmt(accounts.consumed)} / ${fmt(report.need)}`,
                t('Copper units · all activities', 'Unités de cuivre · toutes les activités'),
            ),
            metric(
                t('International trade', 'Commerce international'),
                fmt(report.countries.aurelia.imports + report.countries.borealis.imports),
                t('Copper units crossing the border', 'Unités de cuivre traversant la frontière'),
            ),
        ),
        panel(
            { title: `${seasonName(report.season)} · ${t('What happened', 'Ce qui s’est passé')}` },
            narrative(report),
        ),
        el(
            'div',
            { class: 'economy-charts' },
            chart(t('Price paid · money per copper unit', 'Prix payé · argent par unité de cuivre'), [
                { label: t('Market price', 'Prix du marché'), value: (r) => r.price },
            ]),
            chart(t('Demand and deliveries · copper units', 'Demande et livraisons · unités de cuivre'), [
                { label: t('Desired', 'Souhaité'), value: (r) => r.need },
                { label: t('Funded', 'Financé'), value: (r) => r.fundedDemand },
                { label: t('Delivered', 'Livré'), value: (r) => r.accounts.consumed },
            ]),
        ),
        investmentReport(report),
        panel(
            { title: t('Who received the copper?', 'Qui a reçu le cuivre ?') },
            table(
                t('Purchases this season', 'Achats de la saison'),
                [
                    t('Buyer / activity', 'Acheteur / activité'),
                    t('Desired', 'Souhaité'),
                    t('After price response', 'Après effet du prix'),
                    t('Funded', 'Financé'),
                    t('Delivered', 'Livré'),
                    t('Paid', 'Payé'),
                ],
                requestRows,
            ),
            el('p', {
                class: 'economy-muted',
                text: t(
                    'Desired → after price response → funded → delivered. Expansion responds to price; budgets constrain requests; supply constrains deliveries. Missing copper measures curtailed activity, not simulated GDP.',
                    'Souhaité → après effet du prix → financé → livré. L’expansion réagit au prix ; les budgets limitent les demandes ; l’offre limite les livraisons. Le cuivre manquant mesure l’activité empêchée, pas un PIB simulé.',
                ),
            }),
        ),
        panel(
            { title: t('Copper and money accounts', 'Comptes de cuivre et d’argent') },
            el('p', {
                class: 'economy-check',
                'data-testid': 'conservation',
                text: t(
                    'Balanced · every delivered unit and every payment is accounted for.',
                    'Équilibré · chaque unité livrée et chaque paiement sont comptabilisés.',
                ),
            }),
            table(
                t('National copper balances', 'Bilans nationaux du cuivre'),
                [
                    t('Country', 'Pays'),
                    t('Opening', 'Initial'),
                    t('Produced', 'Produit'),
                    t('Imported', 'Importé'),
                    t('Consumed', 'Consommé'),
                    t('Exported', 'Exporté'),
                    t('Closing', 'Final'),
                ],
                copperRows,
            ),
            table(
                t('Producer cash balances', 'Trésorerie des producteurs'),
                [
                    t('Producer', 'Producteur'),
                    t('Opening', 'Initiale'),
                    t('External financing', 'Financement externe'),
                    t('Operating costs', 'Coûts'),
                    t('Sales receipts', 'Recettes'),
                    t('Investment', 'Investissement'),
                    t('Closing', 'Finale'),
                ],
                moneyRows,
            ),
            el('p', {
                class: 'economy-muted',
                text: t(
                    'Aurelia’s receipts belong to its private producers. Borealis’s receipts stay in its state enterprise account. Neither automatically replenishes procurement budgets.',
                    'Les recettes d’Aurelia appartiennent aux producteurs privés. Celles de Borealis restent dans le compte de son entreprise publique. Elles ne renouvellent pas automatiquement les budgets d’achat.',
                ),
            }),
            table(
                t('Open-economy money reconciliation', 'Réconciliation monétaire du modèle ouvert'),
                [t('Account', 'Compte'), t('Money', 'Argent')],
                [
                    [
                        t('Opening supplier cash', 'Trésorerie initiale des producteurs'),
                        fmt(accounts.openingCash),
                    ],
                    [t('+ External purchasing budgets', '+ Budgets d’achat externes'), fmt(accounts.budgets)],
                    [
                        t('+ External producer financing', '+ Financement externe des producteurs'),
                        fmt(accounts.financing),
                    ],
                    [
                        t('− Operating costs paid outside the model', '− Coûts payés hors du modèle'),
                        fmt(accounts.operatingCosts),
                    ],
                    [
                        t(
                            '− Unspent budgets returned outside the model',
                            '− Budgets inutilisés rendus hors du modèle',
                        ),
                        fmt(accounts.returnedBudgets),
                    ],
                    [
                        t(
                            '− Construction spending outside the model',
                            '− Dépenses de construction hors du modèle',
                        ),
                        fmt(accounts.investmentSpending),
                    ],
                    [
                        t('= Closing supplier cash', '= Trésorerie finale des producteurs'),
                        fmt(accounts.closingCash),
                    ],
                    [
                        t('Payment / receipt mismatch', 'Écart paiements / recettes'),
                        fmt(accounts.settlementError, 8),
                    ],
                    [
                        t('Money conservation error', 'Erreur de conservation monétaire'),
                        fmt(accounts.moneyError, 8),
                    ],
                    [
                        t('Copper conservation error', 'Erreur de conservation du cuivre'),
                        fmt(accounts.copperError, 8),
                    ],
                ],
            ),
        ),
        el(
            'details',
            { class: 'economy-history' },
            el('summary', { text: t('Exact seasonal history', 'Historique saisonnier exact') }),
            table(
                t('All completed seasons', 'Toutes les saisons terminées'),
                [
                    t('Season', 'Saison'),
                    t('Price paid', 'Prix payé'),
                    t('Next price', 'Prix suivant'),
                    t('Desired', 'Souhaité'),
                    t('Funded', 'Financé'),
                    t('Delivered', 'Livré'),
                    t('Trade', 'Commerce'),
                    t('Stocks', 'Stocks'),
                    t('Aurelia capacity', 'Capacité Aurelia'),
                    t('Aurelia output', 'Production Aurelia'),
                    t('In construction', 'En construction'),
                    t('Investment', 'Investissement'),
                ],
                state.history.map((r) => [
                    r.season,
                    fmt(r.price),
                    fmt(r.nextPrice),
                    fmt(r.need),
                    fmt(r.fundedDemand),
                    fmt(r.accounts.consumed),
                    fmt(r.countries.aurelia.imports + r.countries.borealis.imports),
                    fmt(r.accounts.closingStock),
                    fmt(r.countries.aurelia.capacity),
                    fmt(r.countries.aurelia.production),
                    fmt(r.countries.aurelia.pendingCapacity),
                    fmt(r.countries.aurelia.investment),
                ]),
            ),
        ),
    );
}

function renderPage() {
    scope?.dispose();
    scope = new Scope();
    controls = new Map();
    document.documentElement.lang = locale;
    const language = el(
        'select',
        { class: 'ui-control', 'aria-label': t('Language', 'Langue') },
        el('option', { value: 'en', text: 'English' }),
        el('option', { value: 'fr', text: 'Français' }),
    );
    language.value = locale;
    scope.listen(language, 'change', () => {
        locale = language.value;
        renderPage();
        root.querySelector('[aria-label="Language"], [aria-label="Langue"]').focus();
    });
    form = el('form', { class: 'economy-assumptions' });
    scope.listen(form, 'submit', (event) => event.preventDefault());
    const allocation = el(
        'select',
        { class: 'ui-control', 'data-setting': 'allocation' },
        el('option', {
            value: 'proportional',
            text: t('Proportional to funded requests', 'Proportionnelle aux demandes financées'),
        }),
        el('option', {
            value: 'military',
            text: t('Military procurement first', 'Approvisionnement militaire prioritaire'),
        }),
    );
    allocation.value = settings.allocation;
    controls.set('allocation', allocation);
    scope.listen(allocation, 'change', () => {
        settings.allocation = allocation.value;
        status.textContent = t(
            'Allocation change applies next season.',
            'Le changement de répartition s’applique à la prochaine saison.',
        );
    });
    form.append(
        el('div', { class: 'economy-countries' }, COUNTRY_IDS.map(countryControls)),
        investmentControls(),
        el(
            'details',
            { class: 'economy-rules' },
            el('summary', { text: t('Market rules and assumptions', 'Règles et hypothèses du marché') }),
            panel(
                {
                    title: t(
                        'Provisional rules · change and compare',
                        'Règles provisoires · modifier et comparer',
                    ),
                },
                new FieldShell({
                    control: allocation,
                    label: t('Allocation during shortages', 'Répartition en pénurie'),
                    help: t(
                        'Applied within each national pool, then to imports. Domestic funded demand is always served before exports.',
                        'Appliquée dans chaque pays, puis aux importations. La demande nationale financée est toujours servie avant les exportations.',
                    ),
                }).element,
                el(
                    'div',
                    { class: 'economy-fields' },
                    field(
                        'basePrice',
                        t('Base copper price', 'Prix de base du cuivre'),
                        t(
                            'Money / unit · starting quote after reset',
                            'Argent / unité · prix initial après réinitialisation',
                        ),
                        { min: 0.1, max: 1000 },
                    ),
                    field(
                        'sensitivity',
                        t('Scarcity sensitivity', 'Sensibilité à la rareté'),
                        t(
                            '0–3 · strength of supply/demand adjustment',
                            '0–3 · intensité de l’ajustement offre/demande',
                        ),
                        { max: 3 },
                    ),
                    field(
                        'maxChange',
                        t('Maximum seasonal price change', 'Variation maximale du prix par saison'),
                        t('0–1 · 0.2 means 20%', '0–1 · 0,2 signifie 20 %'),
                        { max: 1 },
                    ),
                ),
                el('p', {
                    text: t(
                        'Price is posted at the start of a season. Funded demand and accessible supply set next season’s target. The target stays between ¼ and 3× the base price; the seasonal change limit controls how quickly the quote approaches it.',
                        'Le prix est affiché au début de la saison. La demande financée et l’offre accessible déterminent la cible suivante. Elle reste entre ¼ et 3× le prix de base ; la limite saisonnière détermine la vitesse d’ajustement.',
                    ),
                }),
                el('p', {
                    class: 'economy-formula',
                    text: t(
                        'Pressure = (funded demand − accessible supply) / max(demand, supply). Target = base × clamp(1 + sensitivity × pressure, 0.25, 3).',
                        'Pression = (demande financée − offre accessible) / max(demande, offre). Cible = base × borner(1 + sensibilité × pression, 0,25, 3).',
                    ),
                }),
                el(
                    'ul',
                    {},
                    [
                        t(
                            'Expansion wanted = desired expansion × min(1, base / price). This is an authored response, not a profit model.',
                            'Expansion demandée = expansion souhaitée × min(1, base / prix). C’est une règle choisie, pas un modèle de profit.',
                        ),
                        t(
                            'Civilian operations reserve their budget first. Unaffordable demand does not push up prices.',
                            'L’activité civile réserve son budget en premier. La demande non finançable ne fait pas monter les prix.',
                        ),
                        t(
                            'Unsold copper carries forward. Surplus above the export limit is excluded from accessible market supply.',
                            'Le cuivre invendu est conservé. L’excédent au-delà de la limite d’exportation est exclu de l’offre accessible.',
                        ),
                        t(
                            'One shared price; no freight, tariffs, exchange rates or separate domestic prices yet.',
                            'Un prix commun ; transport, droits de douane, devises et prix nationaux distincts restent à étudier.',
                        ),
                        t(
                            'Borealis keeps its manually set capacity running. Aurelia runs installed capacity when price covers variable cost, otherwise it idles. Cash pays actual operating costs first; shortfalls receive explicit external financing, which is excluded from investment earnings.',
                            'Borealis exploite sa capacité manuelle. Aurelia produit si le prix couvre le coût variable, sinon elle s’arrête. La trésorerie paie les coûts réels ; le financement externe couvre les manques et est exclu des bénéfices réinvestissables.',
                        ),
                        t(
                            'Purchasing budgets renew from outside the model every season. Unspent purchasing money returns outside; supplier cash carries forward. Construction spending leaves the model; no household income, taxes, debt repayment or construction-material chain.',
                            'Les budgets d’achat sont renouvelés hors du modèle chaque saison. L’argent inutilisé y retourne ; la trésorerie des producteurs est conservée. Les dépenses de construction sortent du modèle ; revenus, impôts, remboursements et matériaux de construction ne sont pas simulés.',
                        ),
                    ].map((text) => el('li', { text })),
                ),
            ),
        ),
    );
    advance = action(t('Advance one season', 'Avancer d’une saison'), () => run(1), 'primary');
    batch = action(t('Run 20 seasons', 'Simuler 20 saisons'), () => run(20));
    status = el('p', {
        class: 'economy-status',
        role: 'status',
        'aria-live': 'polite',
        text: t(
            'Edit assumptions, then advance. Nothing is saved on reload.',
            'Ajustez les hypothèses, puis avancez. Rien n’est conservé au rechargement.',
        ),
    });
    results = el('div', { class: 'economy-results' });
    comparisonResults = el('div', { class: 'economy-comparison' });
    scope.listen(results, 'change', (event) => {
        if (event.target.id === 'economy-season') {
            selectedSeason = Number(event.target.value);
            renderResults();
            document.getElementById('economy-season').focus();
        }
    });
    const eventAction = (label, change, message) =>
        action(label, () => {
            change();
            syncControls();
            status.textContent = message;
        });
    root.replaceChildren(
        el(
            'header',
            { class: 'economy-header' },
            el(
                'div',
                {},
                el('p', {
                    class: 'economy-eyebrow',
                    text: t('NOVUS ORDO / EXPERIMENTS', 'NOVUS ORDO / EXPÉRIMENTATIONS'),
                }),
                el('h1', { text: t('Economy Lab', 'Laboratoire économique') }),
                el('p', {
                    class: 'economy-muted',
                    text: t(
                        'Two countries. One resource. Follow the consequences.',
                        'Deux pays. Une ressource. Observer les conséquences.',
                    ),
                }),
            ),
            el(
                'div',
                { class: 'economy-actions' },
                actionLink(t('Tools & experiments', 'Outils et expériences'), '/client/tools'),
                language,
            ),
        ),
        el(
            'aside',
            { class: 'economy-intro' },
            el('strong', {
                text: t(
                    'A market hypothesis, not a finished economy.',
                    'Une hypothèse de marché, pas une économie complète.',
                ),
            }),
            el('p', {
                text: t(
                    'Start with a balanced season, introduce a military buildup, then restrict exports. Watch who gets copper, who pays, and how the next price reacts. All rules are provisional; this runs only in your browser.',
                    'Commencez par une saison équilibrée, augmentez les besoins militaires, puis limitez les exportations. Observez qui reçoit le cuivre, qui paie et comment le prix réagit. Règles provisoires ; simulation locale au navigateur.',
                ),
            }),
            el('p', {
                class: 'economy-muted',
                text: t(
                    'Final copper experiment · delayed private investment · externally renewed buyer budgets',
                    'Dernière expérience cuivre · investissement privé différé · budgets d’achat externes renouvelés',
                ),
            }),
        ),
        form,
        el(
            'section',
            { class: 'economy-events', 'aria-label': t('Experiment events', 'Événements expérimentaux') },
            el('span', { text: t('Try next season:', 'À essayer la prochaine saison :') }),
            eventAction(
                t('Military buildup', 'Mobilisation militaire'),
                () => {
                    settings.countries.aurelia.military = 40;
                    settings.countries.aurelia.militaryBudget = 600;
                },
                t(
                    'Queued: Aurelia needs 40 military copper and can spend 600 per season.',
                    'Prévu : Aurelia souhaite 40 unités militaires et peut dépenser 600 par saison.',
                ),
            ).element,
            eventAction(
                t('End military buildup', 'Fin de la mobilisation'),
                () => {
                    settings.countries.aurelia.military = 20;
                    settings.countries.aurelia.militaryBudget = 200;
                },
                t(
                    'Military demand returns to 20 and budget to 200. Funded projects keep their completion dates.',
                    'Le besoin militaire revient à 20 et le budget à 200. Les projets financés conservent leur échéance.',
                ),
            ).element,
            eventAction(
                t('Borealis export ban', 'Embargo de Borealis'),
                () => {
                    settings.countries.borealis.exportCap = 0;
                },
                t(
                    'Queued: Borealis keeps its surplus. Export limit is now zero.',
                    'Prévu : Borealis conserve son excédent. Exportations limitées à zéro.',
                ),
            ).element,
            eventAction(
                t('Borealis production loss', 'Perte de production de Borealis'),
                () => {
                    settings.countries.borealis.capacity = 30;
                },
                t(
                    'Queued: Borealis production falls to 30 units per season.',
                    'Prévu : Borealis produit désormais 30 unités par saison.',
                ),
            ).element,
            eventAction(
                t('Restore baseline settings', 'Rétablir les paramètres initiaux'),
                () => {
                    settings = defaultSettings();
                },
                t(
                    'Baseline settings restored. Stocks, built capacity, projects and history remain until Reset run.',
                    'Paramètres initiaux rétablis. Stocks, capacité construite, projets et historique conservés jusqu’à la réinitialisation.',
                ),
            ).element,
        ),
        el(
            'div',
            { class: 'economy-run' },
            el(
                'div',
                { class: 'economy-actions' },
                advance.element,
                batch.element,
                action(t('Reset run', 'Réinitialiser'), reset).element,
                action(t('Export observations', 'Exporter les observations'), download, 'quiet').element,
            ),
            status,
        ),
        comparisonResults,
        results,
    );
    updateButtons();
    renderResults();
    renderComparison();
}

renderPage();
