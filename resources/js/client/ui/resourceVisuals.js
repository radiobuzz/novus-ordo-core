import { iconUrl } from './icons.js';
// The same authored outline family as controls. Values remain service-owned.
const icons = {
    Capital: 'capital',
    RecruitmentPool: 'recruitmentpool',
    Food: 'food',
    Material: 'material',
    Ore: 'ore',
    Oil: 'oil',
};
export function resourceIcon(type) {
    return icons[type] ? iconUrl(type) : null;
}
