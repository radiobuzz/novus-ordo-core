import { createMapModel } from '../../resources/js/map/model.js';
import { exportMap, restoreMap } from '../../resources/js/map/snapshot.js';

let generatedModel, generatedMap;
export function generatedMapFixture() {
    if (!generatedModel) {
        const snapshot = exportMap(createMapModel());
        generatedModel = restoreMap(snapshot, baseTerritories);
        generatedModel.generation = { version: snapshot.generator };
        // The shared browser journeys exercise the player's home territories.
        // Keep those regions traversable in the generated fixture instead of
        // relying on coordinates from the retired rectangular map.
        for (const region of generatedModel.regions.filter((item) =>
            [155, 156, 157, 158].includes(item.territoryId),
        ))
            for (const id of region.cellIds) {
                const cell = generatedModel.cellById.get(id);
                cell.terrain = 'plains';
                cell.terrainColor = '#79864b';
            }
        generatedMap = exportMap(generatedModel);
    }
    return generatedMap;
}

export function generatedRegionFixture(territoryId) {
    generatedMapFixture();
    const region = generatedModel.regions.find((item) => item.territoryId === territoryId);
    if (!region) throw new Error(`Generated fixture has no territory ${territoryId}.`);
    const cells = region.cellIds
        .map((id) => generatedModel.cellById.get(id))
        .sort(
            (a, b) =>
                Math.hypot(a.x - region.x, a.y - region.y) - Math.hypot(b.x - region.x, b.y - region.y) ||
                a.x - b.x ||
                a.y - b.y,
        );
    return { x: region.x, y: region.y, cells: cells.map(({ x, y }) => ({ x, y })) };
}

export const baseTerritories = Array.from({ length: 600 }, (_, i) => ({
    territory_id: i + 1,
    x: i % 30,
    y: Math.floor(i / 30),
    name:
        i === 155
            ? 'Aster Reach'
            : i === 156
              ? 'Boreal March'
              : i === 157
                ? 'Cinder Vale'
                : `Territory ${i + 1}`,
    terrain_type: i % 11 === 0 ? 'Water' : i % 4 === 0 ? 'Forest' : 'Plain',
    usable_land_ratio: 0.75,
    has_sea_access: i % 3 === 0,
    connected_land_territory_ids: [i === 155 ? 157 : Math.max(1, i)],
    connected_territory_ids: [i === 155 ? 157 : Math.max(1, i)],
    stats: [{ title: 'Land area', value: 15000, unit: 'Km2' }],
}));
export function fixtures(path, turn = 1) {
    const current = baseTerritories.map((t) => ({
        territory_id: t.territory_id,
        turn_number: turn,
        owner_nation_id:
            t.territory_id >= 155 && t.territory_id <= 157 ? 7 : t.territory_id === 158 ? 8 : null,
        stats: [
            {
                title: 'Population',
                value: t.territory_id >= 155 && t.territory_id <= 158 ? 42000 : 0,
                unit: t.territory_id >= 155 && t.territory_id <= 158 ? 'WholeNumber' : 'Unknown',
            },
        ],
        owner_production:
            t.territory_id >= 155 && t.territory_id <= 158
                ? { money: 0, food: 168, material: 42, oil: 42 }
                : null,
        loyalties:
            t.territory_id >= 155 && t.territory_id <= 158 ? [{ nation_id: 7, loyalty_ratio: 0.85 }] : [],
    }));
    if (path === '/game')
        return {
            game_id: 1,
            turn_number: turn,
            guard_enabled: true,
            nation_colors: {
                colors: [
                    'Crimson',
                    'Azure',
                    'Emerald',
                    'Gold',
                    'Violet',
                    'Coral',
                    'Turquoise',
                    'Rose',
                    'Lime',
                    'Amber',
                    'Indigo',
                    'Jade',
                    'Burgundy',
                    'Cobalt',
                    'Forest',
                    'Saffron',
                    'Orchid',
                    'Copper',
                    'Sky',
                    'Mint',
                    'Peach',
                    'Lavender',
                    'Olive',
                    'Raspberry',
                ].map((name, index) => ({
                    id: index + 1,
                    name,
                    name_fr: name,
                    hex: [
                        '#d94b57',
                        '#428ee8',
                        '#32b880',
                        '#e0b83c',
                        '#9664d8',
                        '#f08768',
                        '#32c3cb',
                        '#e978b3',
                        '#a1c944',
                        '#dd8c2e',
                        '#665cc6',
                        '#5baf9d',
                        '#9e385e',
                        '#355caa',
                        '#438148',
                        '#f0d566',
                        '#b855c1',
                        '#ae6742',
                        '#7cbde5',
                        '#8cd6a3',
                        '#eeb28b',
                        '#b3a0e9',
                        '#879341',
                        '#ce438b',
                    ][index],
                })),
                assignments: [
                    {
                        nation_id: 7,
                        primary_color_id: 1,
                        secondary_color_id: 4,
                        name: 'The Aurelian Union',
                    },
                    {
                        nation_id: 8,
                        primary_color_id: 2,
                        secondary_color_id: 4,
                        name: 'The Northern Compact',
                    },
                ],
            },
        };
    if (path === '/client/gameplay')
        return {
            game_id: 1,
            turn_number: turn,
            nation: { nation_id: 7 },
            identity: {
                turn_number: turn,
                nation_id: 7,
                usual_name: 'The Aurelian Union',
            },
            turn_summary: {
                previous_turn_number: turn > 1 ? turn - 1 : null,
                population: 126000,
                population_change: turn > 1 ? 2500 : null,
                territories: 3,
                territory_change: turn > 1 ? 1 : null,
                completed_units: turn > 1 ? { Infantry: 2 } : {},
            },
            budget: {
                free_labor: 8000000,
                labor_pools: [{ territory_id: 156, size: 10000000, free_labor: 8000000 }],
                labor_facility_allocations: [
                    {
                        territory_id: 156,
                        resource_key: 'food',
                        capacity: 10000000,
                        productivity: 1.5,
                        allocation: 2000000,
                        production: 3000000,
                    },
                    {
                        territory_id: 156,
                        resource_key: 'oil',
                        capacity: 42000000,
                        productivity: 1,
                        allocation: 42000000,
                        production: 42000000,
                    },
                ],
                turn_number: turn,
                balances: {
                    money: 10,
                    recruitment: 10,
                    food: -2,
                    material: 5,
                    ore: 0,
                    oil: 0,
                },
                stockpiles: {
                    money: 20,
                    recruitment: 0,
                    food: 42,
                    material: 15,
                    ore: 10,
                    oil: 10,
                },
                production: {
                    money: 0,
                    recruitment: 12,
                    food: 3,
                    material: 5,
                    ore: 0,
                    oil: 0,
                },
                upkeep: {
                    money: 2,
                    recruitment: 2,
                    food: 5,
                    material: 0,
                    ore: 0,
                    oil: 0,
                },
                expenses: {
                    money: 0,
                    recruitment: 0,
                    food: 0,
                    material: 0,
                    ore: 0,
                    oil: 0,
                },
                available_production: {
                    money: 30,
                    recruitment: 10,
                    food: 40,
                    material: 20,
                    ore: 10,
                    oil: 10,
                },
            },
            deployment_limits: {
                Infantry: 10,
                Armored: 2,
                Artillery: 7,
                Fighter: 3,
                Bomber: 2,
            },
            production_planning: {
                rows: {
                    recruitment: {
                        kind: 'capacity',
                        capacity: '12.000000',
                        occupied: '2.000000',
                        commands: '0.000000',
                        available: '10.000000',
                    },
                },
            },
            divisions: [
                {
                    division_id: 11,
                    division_type: 'Infantry',
                    territory_id: 156,
                    order: null,
                },
                {
                    division_id: 12,
                    division_type: 'Armored',
                    territory_id: 156,
                    order: null,
                },
            ],
            deployments: [],
            policies: { enabled: false, turn_id: turn, edit_counter: 1, current: {}, pending: {} },
            acquisitions: [
                {
                    resource_key: 'material',
                    quantity: '3.000000',
                    spending_limit: '6.000000',
                    priority: 100,
                },
            ],
            definitions: {
                id: 1,
                edit_counter: 1,
                roles: { treasury: 'money', nutrition: 'food', recruitment: 'recruitment' },
                acquisition_resources: ['food', 'material', 'ore', 'oil'],
                resources: [
                    ['money', 'currency', 'treasury', 'Treasury', 'Capital'],
                    ['recruitment', 'capacity', 'recruitment', 'Recruitment', 'RecruitmentPool'],
                    ['food', 'stock', 'nutrition', 'Food', 'Food'],
                    ['material', 'stock', null, 'Raw materials', 'Material'],
                    ['ore', 'stock', null, 'Ore', 'Ore'],
                    ['oil', 'stock', null, 'Oil', 'Oil'],
                ].map(([resource_key, kind, role, label, icon_key]) => ({
                    resource_key,
                    kind,
                    role,
                    labels: { en: label, fr: label },
                    description: label,
                    unit_labels: { en: 'units', fr: 'unités' },
                    icon_key,
                    display_decimals: 2,
                    can_be_stocked: kind !== 'capacity',
                    grantable: kind !== 'capacity',
                    can_produce: kind === 'stock',
                    base_production_by_terrain_type: {},
                })),
                divisions: ['Infantry', 'Armored', 'Artillery', 'Fighter', 'Bomber'].map(
                    (division_type, i) => ({
                        division_type,
                        deployment_costs: {
                            money: [3, 5, 4, 10, 15][i],
                            recruitment: 1,
                            ...(i ? { ore: [0, 5, 1, 1, 1][i] } : {}),
                        },
                        upkeep_costs: { money: 1 },
                        attack_costs: {},
                        moves: [1, 2, 1, 6, 8][i],
                        attack_power: 30,
                        defense_power: 30,
                        can_take_territory: i < 3,
                        can_fly: i > 2,
                    }),
                ),
            },
        };
    if (path === '/game/news')
        return turn > 1
            ? [
                  {
                      content:
                          '##nation#7#usual_name## conquered ##territory#156#name## from ##nation#8#usual_name##.',
                      context: {
                          type: 'battle',
                          battle_id: 1,
                          attacker_nation_id: 7,
                          defender_nation_id: 8,
                          territory_id: 156,
                          outcome: 'conquered',
                      },
                  },
                  {
                      content: '##nation#7#usual_name## was repelled by Neutral at ##territory#158#name##.',
                      context: {
                          type: 'battle',
                          battle_id: 2,
                          attacker_nation_id: 7,
                          defender_nation_id: null,
                          territory_id: 158,
                          outcome: 'repelled',
                      },
                  },
              ]
            : [
                  {
                      content: '##nation#7#usual_name## welcomes a new turn.',
                      context: null,
                  },
              ];
    if (path === '/game/rankings')
        return [
            {
                key: 'population',
                title: 'Population',
                ranked_nation_ids: [7, 8],
                data_unit: 'WholeNumber',
                data: [126000, 42000],
            },
            {
                key: 'army_size',
                title: 'Army size (number of divisions)',
                ranked_nation_ids: [8, 7],
                data_unit: 'ApproximateNumber',
                data: [10, 5],
            },
        ];
    if (path === '/game/ranking-history')
        return {
            game_id: 1,
            through_turn: turn,
            rankings: [
                {
                    key: 'population',
                    title: 'Population',
                    data_unit: 'WholeNumber',
                    series: [
                        {
                            nation_id: 7,
                            points: [{ turn_number: turn, rank: 1, value: 126000 }],
                        },
                        {
                            nation_id: 8,
                            points: [{ turn_number: turn, rank: 2, value: 42000 }],
                        },
                    ],
                },
            ],
        };
    if (path === '/game/victory-status') return { goals: [], progressions: [], winner_nation_id: null };
    if (path === '/nation/battle-logs')
        return turn > 1
            ? [
                  {
                      battle_id: 1,
                      turn_number: turn,
                      territory_id: 156,
                      attacker_nation_id: 7,
                      defender_nation_id: 8,
                      winner_nation_id: 7,
                      text: 'Territory conquered by attacker.',
                      attacker_formation_losses: 2,
                      attacker_division_losses: 2,
                      defender_formation_losses: 4,
                      defender_division_losses: 3,
                  },
              ]
            : [];
    if (path === '/game/identities')
        return {
            game_id: 1,
            turn_number: turn,
            nations: [
                {
                    nation_id: 7,
                    usual_name: 'The Aurelian Union',
                    flag_src: '/res/bundled/flags/flag_red.png',
                },
                {
                    nation_id: 8,
                    usual_name: 'The Northern Compact',
                    flag_src: '/res/bundled/flags/flag_blue.png',
                },
            ],
            leaders: [],
        };
    if (path === '/game/map')
        return { game_id: 1, fingerprint: 'generated-fixture', map: generatedMapFixture() };
    if (path === '/game/ready-status')
        return {
            turn_number: turn,
            nation_count: 2,
            is_game_ready: true,
            ready_for_next_turn_nation_ids: [],
            turn_expiration: null,
        };
    if (path === '/user') return { user_name: 'fixture-player' };
    if (path === '/user/nation-setup-status')
        return {
            game_id: 1,
            nation_id: 7,
            nation_setup_status: 'FinishedSetup',
        };
    if (path === '/territories/base-infos') return { data: baseTerritories };
    if (path === '/territories/turn-infos') return { data: current };
    if (path === '/nation/territories/turn-infos')
        return {
            data: [155, 156, 157].map((id) => ({
                territory_id: id,
                can_deploy: true,
                stats: [
                    {
                        title: 'Population growth rate',
                        value: 0.025,
                        unit: 'DetailedPercent',
                    },
                ],
            })),
        };
    if (/^\/territories\/\d+\/turn-info$/.test(path))
        return current.find((t) => t.territory_id === Number(path.split('/')[2]));
    if (/^\/nations\/\d+$/.test(path))
        return {
            nation_id: Number(path.split('/')[2]),
            turn_number: turn,
            usual_name: path.endsWith('/7') ? 'The Aurelian Union' : 'The Northern Compact',
            formal_name: '',
            flag_src: null,
            stats: [],
        };
    return null;
}
