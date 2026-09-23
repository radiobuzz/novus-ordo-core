export const featureRegistry = new Map([
    ['world', () => import('../features/world/world.feature.js')],
    ['territory', () => import('../features/territory/territory.feature.js')],
    ['gameplay', () => import('../features/gameplay/gameplay.feature.js')],
    ['production-planner', () => import('../features/gameplay/planner.feature.js')],
]);
