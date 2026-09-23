import { panel } from './Panel.js';
export function glassPanel(...children) {
    return panel({ surface: 'glass', tone: 'accent', className: 'glass-panel' }, ...children);
}
