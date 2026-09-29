import { el } from '../element.js';
import { Button } from '../Button.js';
import { RangeField } from '../RangeField.js';
import { groups, gameCatalogue, resourceLayers } from './analysis/catalogue.js';
import { availableLayers, resourcesFor, geographyValues, territoryValues } from './analysis/data.js';
import { analysisStyle } from './analysis/palettes.js';
import { layerDisplay } from './analysis/display.js';
import { defenseGradientCss } from './defenseHeatmap.js';
import './map-layer-menu.scss';

export const appearanceDefaults = Object.freeze({
    ocean: true,
    terrain: true,
    detail: true,
    detailThreshold: 96,
    ownership: true,
    ownershipOpacity: 0.23,
    borders: true,
    bordersOpacity: 0.5,
    nationalBorders: true,
    nationalBordersOpacity: 1,
    microGrid: false,
    microGridOpacity: 0.35,
    coastlines: true,
    coastlinesOpacity: 0.85,
    rivers: true,
    riversOpacity: 1,
    names: true,
    namesOpacity: 1,
    territoryNames: false,
    nameSize: 12,
    nameSpacing: 8,
    opacity: 0.78,
    unitsOpacity: 1,
    battlesOpacity: 1,
});
let serial = 0;
/** Map-specific presentation/projection. Supplied snapshots only; no network or simulation ownership. */
export class MapLayerMenu {
    constructor({
        scope,
        i18n,
        model,
        snapshot,
        host,
        controls,
        saved = {},
        homeland = false,
        military = null,
        onChange = () => {},
    }) {
        Object.assign(this, { scope, i18n, model, snapshot, homeland, military, onChange });
        this.id = `map-layers-${++serial}`;
        this.appearance = { ...appearanceDefaults, ...saved.appearance };
        this.nameTypes = { ...saved.nameTypes };
        this.type = saved.type ?? 'terrain';
        this.resource = saved.resource ?? '';
        this.coverage = null;
        this.coverageStatus = 'loading';
        this.labels = [];
        this.rows = new Map();
        this.tabs = new Map();
        this.panels = new Map();
        this.inputs = new Map();
        this.tabbar = el('div', { class: 'ml-tabs', role: 'tablist' });
        this.text(this.tabbar, 'Layer categories', 'Catégories de couches', 'aria-label');
        this.drawer = el('section', { class: 'ml-drawer', hidden: true });
        this.title = el('strong');
        this.close = this.button('Close layers', 'Fermer les couches', 'close', () => this.closePanel());
        this.drawer.append(el('header', {}, this.title, this.close));
        this.legend = el('aside', { class: 'ml-legend', hidden: true, 'aria-live': 'polite' });
        this.retry = this.button('Retry coverage', 'Réessayer la couverture', 'refresh', () =>
            this.onChange('analysis'),
        );
        this.selection = el('small', { class: 'ml-selection' });
        this.clear = this.button('Clear analysis', 'Effacer l’analyse', 'eraser', () => {
            this.type = 'terrain';
            this.changed();
        });
        this.tabbar.append(this.clear);
        controls.append(this.tabbar);
        controls.classList.add('ml-controls');
        host.append(this.drawer, this.legend);
        host.classList.add('ml-host');
        for (const [key, icon, en, fr] of groups) {
            const tab = this.button(en, fr, icon, () => this.open(key));
            tab.setAttribute('role', 'tab');
            tab.id = `${this.id}-${key}`;
            tab.setAttribute('aria-controls', `${tab.id}-panel`);
            tab.setAttribute('aria-selected', 'false');
            const panel = el('div', {
                id: `${tab.id}-panel`,
                role: 'tabpanel',
                'aria-labelledby': tab.id,
                hidden: true,
            });
            this.tabs.set(key, tab);
            this.panels.set(key, panel);
            this.tabbar.insertBefore(tab, this.clear);
            this.drawer.append(panel);
            scope.listen(tab, 'keydown', (e) => {
                const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                if (!keys.includes(e.key)) return;
                e.preventDefault();
                const tabs = [...this.tabs.values()].filter((t) => !t.hidden),
                    i = tabs.indexOf(tab);
                const next =
                    e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? tabs.length - 1
                          : (i + (e.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
                tabs[next].click();
                tabs[next].focus();
            });
        }
        for (const l of gameCatalogue) {
            const input = el('input', { type: 'radio', name: this.id, value: l.id });
            const label = this.text(el('span'), l.en, l.fr);
            const row = el('label', { class: 'ml-choice' }, input, label);
            this.panels.get(l.group).append(row);
            this.rows.set(l.id, { input, row, label });
            scope.listen(input, 'change', () => {
                this.type = l.id;
                this.changed();
            });
        }
        this.resourceSelect = el('select');
        this.resourceLabel = this.text(el('span'), 'Resource', 'Ressource');
        this.resourceField = el('label', { class: 'ml-resource' }, this.resourceLabel, this.resourceSelect);
        this.drawer.append(this.resourceField);
        scope.listen(this.resourceSelect, 'change', () => {
            this.resource = this.resourceSelect.value;
            this.changed();
        });
        this.buildDisplay();
        if (military)
            for (const [key, en, fr] of [
                ['showUnits', 'Show units', 'Afficher les unités'],
                ['lastTurnBattles', 'Show last-turn battles', 'Afficher les batailles précédentes'],
                ['unitDetails', 'Show unit details', 'Afficher les détails des unités'],
                ['muteForeignColors', 'Mute foreign colours', 'Atténuer les couleurs étrangères'],
            ]) {
                const input = this.checkbox(this.panels.get('military'), en, fr, military[key], (v) => {
                    military[key] = v;
                    this.changed('military');
                });
                this.inputs.set(key, input);
            }
        scope.listen(
            document,
            'keydown',
            (e) => {
                if (e.key === 'Escape' && !this.drawer.hidden && !document.querySelector('dialog[open]')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closePanel();
                }
            },
            true,
        );
        const observer = new ResizeObserver(() => {
            host.style.setProperty('--ml-dock-height', `${controls.getBoundingClientRect().height}px`);
            host.style.setProperty(
                '--ml-legend-height',
                `${this.legend.hidden ? 0 : this.legend.getBoundingClientRect().height}px`,
            );
        });
        observer.observe(controls);
        observer.observe(this.legend);
        scope.own(() => observer.disconnect());
        i18n.changed.subscribe(scope, () => {
            for (const [node, en, fr, attr] of this.labels)
                attr ? node.setAttribute(attr, this.t(en, fr)) : (node.textContent = this.t(en, fr));
            for (const [r, en, fr] of this.ranges ?? []) r.setLabel(this.t(en, fr));
            this.refresh();
        });
        this.refresh();
    }
    t(en, fr) {
        return this.i18n.locale === 'fr' ? fr : en;
    }
    text(node, en, fr, attr = null) {
        this.labels.push([node, en, fr, attr]);
        if (attr) node.setAttribute(attr, this.t(en, fr));
        else node.textContent = this.t(en, fr);
        return node;
    }
    button(en, fr, icon, fn) {
        const node = new Button({ label: '', icon, className: 'ml-icon' }).element;
        this.text(node, en, fr, 'aria-label');
        this.text(node, en, fr, 'title');
        this.scope.listen(node, 'click', fn);
        return node;
    }
    checkbox(parent, en, fr, value, fn) {
        const input = el('input', { type: 'checkbox', checked: value });
        parent.append(el('label', { class: 'ml-choice' }, input, this.text(el('span'), en, fr)));
        this.scope.listen(input, 'change', () => fn(input.checked));
        return input;
    }
    range(parent, key, en, fr, min, max, step = 1) {
        const percent = key.endsWith('Opacity') || key === 'opacity';
        const field = new RangeField({
            scope: this.scope,
            label: this.t(en, fr),
            value: this.appearance[key] * (percent ? 100 : 1),
            min,
            max,
            step,
            onChange: (v) => {
                if (!Number.isFinite(v) || v < min || v > max) return;
                this.appearance[key] = v / (percent ? 100 : 1);
                this.changed('display');
            },
        });
        (this.ranges ??= []).push([field, en, fr]);
        parent.append(field.element);
    }
    buildDisplay() {
        const panel = this.panels.get('display');
        const section = (en, fr) => {
            const d = el('details', {}, this.text(el('summary'), en, fr));
            panel.append(d);
            return d;
        };
        const base = section('Base map', 'Fond de carte');
        for (const [key, en, fr] of [
            ['terrain', 'Landscape', 'Paysage'],
            ['ocean', 'Ocean', 'Océan'],
            ['detail', 'Landscape details', 'Détails du paysage'],
        ])
            this.checkbox(base, en, fr, this.appearance[key], (v) => {
                this.appearance[key] = v;
                this.changed('display');
            });
        this.range(base, 'detailThreshold', 'Detail zoom threshold', 'Seuil de zoom des détails', 8, 192, 4);
        this.detailStatus = el('small');
        base.append(this.detailStatus);
        this.range(base, 'opacity', 'Analysis opacity', 'Opacité de l’analyse', 0, 100);
        const lines = section('Lines & markers', 'Lignes et repères');
        for (const [key, en, fr] of [
            ['borders', 'Region borders', 'Limites des régions'],
            ['nationalBorders', 'National borders', 'Frontières nationales'],
            ['microGrid', 'Microcell grid', 'Grille des microcellules'],
            ['coastlines', 'Coastlines', 'Littoral'],
            ['rivers', 'Rivers', 'Rivières'],
        ]) {
            this.checkbox(lines, en, fr, this.appearance[key], (v) => {
                this.appearance[key] = v;
                this.changed('display');
            });
            this.range(lines, `${key}Opacity`, `${en} opacity`, `Opacité : ${fr}`, 0, 100);
        }
        if (this.military) {
            this.range(lines, 'unitsOpacity', 'Unit opacity', 'Opacité des unités', 10, 100);
            this.range(lines, 'battlesOpacity', 'Battle opacity', 'Opacité des batailles', 0, 100);
        }
        const political = this.panels.get('politics');
        this.checkbox(
            political,
            'National ownership',
            'Souveraineté nationale',
            this.appearance.ownership,
            (v) => {
                this.appearance.ownership = v;
                this.changed('display');
            },
        );
        this.range(political, 'ownershipOpacity', 'Ownership opacity', 'Opacité des possessions', 0, 100);
        const names = section('Names', 'Noms');
        this.checkbox(names, 'Geographic names', 'Noms géographiques', this.appearance.names, (v) => {
            this.appearance.names = v;
            this.changed('display');
        });
        const types = {
            ocean: ['Oceans & seas', 'Océans et mers'],
            continent: ['Continents', 'Continents'],
            island: ['Islands', 'Îles'],
            lake: ['Lakes', 'Lacs'],
            bay: ['Bays', 'Baies'],
            river: ['River names', 'Noms des rivières'],
            mountain: ['Mountain ranges', 'Chaînes de montagnes'],
        };
        for (const key of new Set((this.model.atlas?.features ?? []).map((f) => f.type))) {
            const [en, fr] = types[key] ?? [key, key];
            this.checkbox(names, en, fr, this.nameTypes[key] !== false, (v) => {
                this.nameTypes[key] = v;
                this.changed('display');
            });
        }
        this.checkbox(
            names,
            'Territory names',
            'Noms des territoires',
            this.appearance.territoryNames,
            (v) => {
                this.appearance.territoryNames = v;
                this.changed('display');
            },
        );
        this.range(names, 'namesOpacity', 'Name opacity', 'Opacité des noms', 0, 100);
        this.range(names, 'nameSize', 'Label size', 'Taille des noms', 9, 20);
        this.range(names, 'nameSpacing', 'Label spacing', 'Espacement des noms', 4, 32);
    }
    open(key) {
        const closing = this.category === key && !this.drawer.hidden;
        this.category = key;
        this.drawer.hidden = closing;
        this.updatePanels();
    }
    closePanel() {
        this.drawer.hidden = true;
        this.tabs.get(this.category)?.focus();
        this.updatePanels();
    }
    updatePanels() {
        for (const [key, p] of this.panels) {
            p.hidden = key !== this.category;
            this.tabs
                .get(key)
                .setAttribute('aria-selected', String(key === this.category && !this.drawer.hidden));
        }
        const focusKey =
            this.category && !this.tabs.get(this.category)?.hidden
                ? this.category
                : [...this.tabs.keys()].find((k) => !this.tabs.get(k).hidden);
        for (const [key, tab] of this.tabs) tab.tabIndex = key === focusKey ? 0 : -1;
        const g = groups.find((g) => g[0] === this.category);
        this.title.textContent = g ? this.t(g[2], g[3]) : '';
        this.resourceField.hidden =
            !resourceLayers.has(this.type) || !['resources', 'economy'].includes(this.category);
    }
    preferences() {
        return {
            type: this.type,
            resource: this.resource,
            appearance: { ...this.appearance },
            nameTypes: { ...this.nameTypes },
        };
    }
    changed(kind = 'analysis') {
        this.refresh();
        this.onChange(kind);
    }
    setSnapshot(snapshot) {
        this.snapshot = snapshot;
        this.coverage = null;
        this.coverageStatus = 'loading';
        this.refresh();
    }
    setCoverage(value, status = 'ready') {
        this.coverage = value;
        this.coverageStatus = status;
        this.refresh();
    }
    refresh() {
        const available = availableLayers(this.model, this.snapshot, this.homeland);
        if (!available.some((l) => l.id === this.type)) this.type = 'terrain';
        this.active = available.find((l) => l.id === this.type);
        this.resources = resourcesFor(this.model, this.snapshot, this.type);
        if (!this.resources.some((r) => r.key === this.resource))
            this.resource = this.resources[0]?.key ?? '';
        const options = this.resources.map((r) => [
            r.key,
            r.labels?.[this.i18n.locale] ?? r.labels?.en ?? r.key,
        ]);
        const signature = JSON.stringify(options);
        if (signature !== this.resourceSignature) {
            this.resourceSignature = signature;
            this.resourceSelect.replaceChildren(
                ...options.map(([value, text]) => el('option', { value, text })),
            );
        }
        this.resourceSelect.value = this.resource;
        this.resourceSelect.setAttribute('aria-label', this.t('Resource', 'Ressource'));
        this.resourceProfile = this.resources.find((r) => r.key === this.resource);
        for (const l of gameCatalogue) {
            const row = this.rows.get(l.id);
            row.row.hidden = !available.some((a) => a.id === l.id);
            row.input.checked = l.id === this.type;
        }
        for (const [key, tab] of this.tabs)
            tab.hidden =
                ![
                    'display',
                    ...(!this.homeland ? ['politics'] : []),
                    ...(this.military ? ['military'] : []),
                ].includes(key) && !available.some((l) => l.group === key);
        if (this.tabs.get(this.category)?.hidden) this.drawer.hidden = true;
        this.clear.disabled = this.type === 'terrain';
        const cacheKey = `${this.type}:${this.resource}:${this.appearance.ocean}`;
        if (this.active.source === 'geography' && this.geographyCache?.key === cacheKey) {
            this.result = this.geographyCache.result;
            this.style = this.geographyCache.style;
        } else {
            this.result =
                this.active.source === 'geography'
                    ? {
                          values: geographyValues(this.model, this.active, this.resource, {
                              ocean: this.appearance.ocean,
                          }),
                          entries: [],
                      }
                    : territoryValues(this.snapshot, this.type, this.resource, this.coverage);
            this.style = analysisStyle(this.active, this.result.values, this.resourceProfile);
            if (this.active.source === 'geography')
                this.geographyCache = { key: cacheKey, result: this.result, style: this.style };
        }
        const resource = this.resourceProfile;
        const treasury = this.snapshot.nation?.definitions?.resources?.find(
            (r) => r.resource_key === this.snapshot.nation.definitions.roles?.treasury,
        );
        const currency =
            treasury?.unit_labels?.[this.i18n.locale] ??
            treasury?.unit_labels?.en ??
            this.t('credits', 'crédits');
        this.display = layerDisplay(
            {
                ...this.active,
                ...(this.type === 'density'
                    ? {
                          quantity: [
                              'people/km²',
                              'habitants/km²',
                              'Population per land km²',
                              'Population par km² terrestre',
                          ],
                      }
                    : {}),
                ...(this.type === 'income'
                    ? {
                          quantity: [
                              `${currency}/season`,
                              `${currency}/saison`,
                              this.t('Last-season civilian income', 'Revenu civil — saison passée'),
                              this.t('Last-season civilian income', 'Revenu civil — saison passée'),
                          ],
                      }
                    : {}),
                ...(this.type === 'netIncome'
                    ? {
                          quantity: [
                              `${currency}/person/season`,
                              `${currency}/habitant/saison`,
                              'Last-season net income per resident',
                              'Revenu net par habitant — saison passée',
                          ],
                          digits: 6,
                      }
                    : {}),
            },
            this.i18n.locale,
            resource
                ? {
                      ...resource,
                      unit:
                          resource.unit_labels?.[this.i18n.locale] ??
                          resource.unit_labels?.en ??
                          resource.unit,
                  }
                : null,
        );
        this.renderLegend();
        this.updatePanels();
        this.inspect();
    }
    renderLegend() {
        this.legend.classList.toggle(
            'ml-legend--categories',
            this.active.scale === 'category' && this.style.categories.length > 4,
        );
        this.legend.hidden = this.type === 'terrain';
        this.legend.replaceChildren();
        if (this.legend.hidden) return;
        const title =
            this.type === 'deposits'
                ? this.resourceProfile?.method === 'deposit'
                    ? this.t('Mineral deposits', 'Gisements minéraux')
                    : this.t('Natural resource distribution', 'Répartition des ressources naturelles')
                : this.type === 'potential' && this.resourceProfile?.method === 'agriculture'
                  ? this.t('Food production potential', 'Potentiel de production alimentaire')
                  : this.t(this.active.en, this.active.fr);
        this.legend.append(
            el('strong', {
                text:
                    title +
                    (resourceLayers.has(this.type)
                        ? ` · ${this.resourceProfile?.labels?.[this.i18n.locale] ?? this.resourceProfile?.labels?.en ?? this.resource}`
                        : ''),
            }),
        );
        this.legend.append(
            el('small', {
                text:
                    this.active.source === 'geography'
                        ? this.t('Microcell geography', 'Géographie des microcellules')
                        : this.t(
                              'Territorial values · unknown values hatched',
                              'Valeurs territoriales · inconnues hachurées',
                          ),
            }),
        );
        if (['defense', 'guard'].includes(this.type) && this.coverageStatus !== 'ready') {
            this.legend.append(
                el('p', {
                    text:
                        this.coverageStatus === 'error'
                            ? this.t(
                                  'Coverage unavailable. Use Retry to try again.',
                                  'Couverture indisponible. Utilisez Réessayer.',
                              )
                            : this.t('Loading coverage…', 'Chargement de la couverture…'),
                }),
            );
            if (this.coverageStatus === 'error') this.legend.append(this.retry);
            return;
        }
        if (!this.style.hasValues && this.active.scale !== 'shore') {
            this.legend.append(
                el('small', { text: this.t('No available values', 'Aucune valeur disponible') }),
                this.selection,
            );
            return;
        }
        if (this.active.scale === 'category' || this.type === 'coast') {
            const list = el('div', { class: 'ml-swatches', tabindex: 0 });
            const items =
                this.type === 'coast'
                    ? [
                          [this.t('Accessible', 'Accessible'), '#65d6bc'],
                          [this.t('Moderate', 'Modéré'), '#b7d77a'],
                          [this.t('Difficult', 'Difficile'), '#edb65d'],
                          [this.t('Cliffs / inaccessible', 'Falaises / inaccessible'), '#e77c77'],
                      ]
                    : this.style.categories.map((c) => [
                          categoryLabel(c, this.i18n.locale),
                          this.style.colour(c),
                      ]);
            for (const [text, color] of items) {
                const chip = el('i');
                chip.style.backgroundColor = color;
                list.append(el('span', {}, chip, el('span', { text })));
            }
            this.legend.append(list);
        } else {
            const gradient = el('div', { class: 'ml-gradient' });
            gradient.style.background =
                this.type === 'defense'
                    ? defenseGradientCss
                    : `linear-gradient(90deg,${this.style.colours.join(',')})`;
            const fixed = ['percent', 'index'].includes(this.active.scale) || this.type === 'exposure',
                max = this.style.maximum,
                min = this.style.lower;
            const mid = fixed ? 0.5 : min < 0 ? (min + max) / 2 : (max * (Math.sqrt(5) - 1)) / 4;
            this.legend.append(
                gradient,
                el(
                    'div',
                    { class: 'ml-ticks' },
                    ...[min, mid, max].map((v, i) =>
                        el('span', {
                            text: this.display.format(v, { tick: true, above: i === 2 && !fixed && max > 0 }),
                        }),
                    ),
                ),
                el('small', { text: this.display.description }),
            );
        }
        if (this.active.scale === 'adaptive' && this.style.maximum > 0)
            this.legend.append(
                el('small', {
                    text: this.t(
                        'Relative colours · + exceeds the colour scale',
                        'Couleurs relatives · + dépasse l’échelle de couleurs',
                    ),
                }),
            );
        if (['defense', 'guard'].includes(this.type))
            this.legend.append(
                el('small', {
                    text: this.t(
                        'Potential against one attack at this location; Guard may also cover other territories.',
                        'Potentiel contre une attaque ici ; la garde peut aussi couvrir d’autres territoires.',
                    ),
                }),
            );
        if (this.type === 'potential')
            this.legend.append(
                el('small', {
                    text: this.t(
                        'Potential before workforce and allocation; not actual output.',
                        'Potentiel avant main-d’œuvre et affectation ; pas une production réelle.',
                    ),
                }),
            );
        this.legend.append(
            el('small', {
                text: this.t('Uncoloured: excluded / not applicable', 'Sans couleur : exclu / sans objet'),
            }),
            this.selection,
        );
    }
    inspect(cell = this.selectedCell, territoryId = this.selectedTerritory) {
        this.selectedCell = cell;
        this.selectedTerritory = territoryId;
        const regional = this.active.source === 'territory';
        const id = regional ? territoryId : cell?.id;
        if (this.active.scale === 'shore' && cell) {
            const shores = (this.model.atlas?.coasts?.shores ?? []).filter((s) => s.landId === cell.id);
            this.selection.hidden = false;
            this.selection.textContent = shores.length
                ? shores
                      .map((s) =>
                          this.type === 'exposure'
                              ? this.display.format(s.exposure) + (s.truncated ? ' *' : '')
                              : this.t(
                                    ['Accessible', 'Moderate', 'Difficult', 'Inaccessible'][s.accessGrade],
                                    ['Accessible', 'Modéré', 'Difficile', 'Inaccessible'][s.accessGrade],
                                ),
                      )
                      .join(' · ')
                : this.t('No shore here', 'Aucun littoral ici');
            return;
        }
        const value = this.result.values.get(id);
        const title = regional
            ? this.snapshot.territories.find((t) => t.territory_id === id)?.name
            : this.t('Microcell', 'Microcellule');
        this.selection.hidden = id == null;
        this.selection.textContent = `${title ?? ''} · ${typeof value === 'string' ? categoryLabel(value, this.i18n.locale) : this.display.format(value)}`;
    }
    updateDetailStatus(renderer) {
        const s = renderer.getState().detailStatus;
        this.detailStatus.textContent =
            s?.reason === 'active'
                ? this.t('Landscape detail active', 'Détails du paysage actifs')
                : s?.reason === 'zoom'
                  ? this.t('Zoom in or lower the threshold', 'Zoomez ou abaissez le seuil')
                  : this.t(
                        'Details disabled or rendering budget exceeded',
                        'Détails désactivés ou budget de rendu dépassé',
                    );
    }
}
function categoryLabel(key, locale) {
    const labels = {
        desert: ['Desert', 'Désert'],
        drylands: ['Drylands', 'Terres arides'],
        forest: ['Forest', 'Forêt'],
        grassland: ['Grassland', 'Prairie'],
        tundra: ['Tundra', 'Toundra'],
        snow: ['Snow', 'Neige'],
        ocean: ['Ocean', 'Océan'],
        lake: ['Lake', 'Lac'],
        'Snow / ice': ['Snow / ice', 'Neige / glace'],
        'No snow / ice': ['No snow / ice', 'Sans neige / glace'],
        Forest: ['Forest', 'Forêt'],
        'Other land': ['Other land', 'Autres terres'],
        'Detected bay': ['Detected bay', 'Baie détectée'],
    };
    return labels[key]?.[locale === 'fr' ? 1 : 0] ?? String(key);
}
