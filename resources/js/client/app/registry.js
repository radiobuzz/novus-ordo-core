export const featureRegistry = new Map([
    ['diplomacy', () => import('../features/diplomacy/diplomacy.feature.js')],
    ['world', () => import('../features/world/world.feature.js')],
    ['territory', () => import('../features/territory/territory.feature.js')],
    ['gameplay', () => import('../features/gameplay/gameplay.feature.js')],
    ['production-planner', () => import('../features/gameplay/planner.feature.js')],
]);
