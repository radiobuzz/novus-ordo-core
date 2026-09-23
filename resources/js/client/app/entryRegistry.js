export const entryRegistry = new Map([
    ['login', () => import('../features/login/login.feature.js')],
    ['nation-creation', () => import('../features/nation-creation/nation-creation.feature.js')],
]);
