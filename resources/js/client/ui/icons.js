/** One authored 24px outline family. Semantic names are independent of translations. */
const paths = {
    action: 'M5 12h14m-5-5 5 5-5 5',
    layers: 'm3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4',
    world: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0m0 0h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
    games: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
    nation: 'M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0',
    military: 'm5 3 14 16m-1-16L5 19M3 15l6 6m6-18 6 6M3 3l5 2-3 3zm18 18-5-2 3-3z',
    economic: 'M4 21V9h5v12m0-10 5-4v14m0-7 6-4v11M3 21h19M5 4h2m5-1h2m5 2h2',
    search: 'M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0m12 5 6 6',
    selection: 'm5 3 14 10-7 1-3 7z',
    deploy: 'M3 8h18v13H3zm0 4h18M12 3v14m-4-4 4 4 4-4',
    forces: 'M4 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0m10 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M2 21v-4c0-4 10-4 10 0v4m1-6c3-2 9-2 9 2v4',
    orders: 'M7 3h13v18H4V6h3zm1 5h8m-8 5h8m-8 5h5',
    ready: 'm4 12 5 5L20 5',
    close: 'm5 5 14 14M5 19 19 5',
    refresh: 'M20 7a9 9 0 1 0 1 8M20 2v6h-6',
    news: 'M4 4h16v17H4zm3 4h5v5H7zm8 0h2m-2 4h2M7 17h10',
    sound: 'M3 9h4l5-5v16l-5-5H3zm13-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
    save: 'M4 3h13l3 3v15H4zm4 0v6h8V3M8 21v-7h8v7',
    cancel: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0m3-6 12 12',
    move: 'M4 12h15m-5-5 5 5-5 5M4 6v12',
    undo: 'M4 4v6h6M4 10c9-10 20 3 12 10',
    fit: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
    colors: 'M12 3a9 9 0 1 0 0 18c4 0 0-5 3-6h3c5 0 4-12-6-12M7 8h.1M12 6h.1M17 9h.1M6 14h.1',
    Capital: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0m11-4H9v4h6v4H9m3-10v12',
    RecruitmentPool:
        'M5 7a3 3 0 1 0 6 0 3 3 0 1 0-6 0M2 21v-4c0-5 12-5 12 0v4m1-17a3 3 0 0 1 0 6m2 4c4 0 5 2 5 4v3',
    Food: 'M12 22V3M12 9C6 9 4 6 5 3c5 0 7 3 7 6m0 6c-6 0-8-3-7-6 5 0 7 3 7 6m0-6c6 0 8-3 7-6-5 0-7 3-7 6m0 12c6 0 8-3 7-6-5 0-7 3-7 6',
    Material: 'm3 9 9-5 9 5-9 5zm0 5 9 5 9-5M3 19l9 4 9-4',
    Ore: 'm3 16 4-9 8-3 6 9-5 8H7zm4-9 5 7 3-10m-3 10 4 7m-4-7 9-1m-18 3 9-2',
    Oil: 'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13M8 15c0 3 1 4 4 4',
};
export function iconUrl(name, color = '#d6ba80') {
    const path = paths[name] ?? paths.action;
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`)}`;
}
export function setButtonIcon(node, name = 'action') {
    node.dataset.icon = name ?? 'none';
    if (name) node.style.setProperty('--action-icon', `url("${iconUrl(name)}")`);
}
