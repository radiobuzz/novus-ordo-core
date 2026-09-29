/** Presentation only. Heatmap values and simulation data remain unchanged. */
export function layerDisplay(layer, locale = 'en', resource = null) {
    const t = (en, fr) => (locale === 'fr' ? fr : en);
    let convert = (v) => v,
        unit = '',
        tickUnit = '',
        description = '',
        digits = 2;
    const score = {
        rainfall: [
            'Rainfall score · low → high (not millimetres)',
            'Score de précipitations · faible → élevé (pas des millimètres)',
        ],
        moisture: ['Moisture score · dry → wet', 'Score d’humidité · sec → humide'],
        fertility: ['Suitability score · poor → favourable', 'Score de potentiel · faible → favorable'],
        exposure: [
            'Exposure score · sheltered → exposed · * boundary estimate',
            'Score d’exposition · abrité → exposé · * estimation en bord de carte',
        ],
    }[layer.id];
    if (layer.quantity) {
        unit = t(layer.quantity[0], layer.quantity[1]);
        description = t(layer.quantity[2], layer.quantity[3]);
        digits = layer.digits ?? 2;
    } else if (layer.id === 'temperature') {
        // Same display convention as the existing Map Lab inspector.
        convert = (v) => Math.round(v * 50 - 20);
        unit = tickUnit = '°C';
        description = t('Model temperature · °C', 'Température du modèle · °C');
    } else if (score) {
        convert = (v) => v * 100;
        unit = tickUnit = '/100';
        description = t(...score);
    } else if (layer.scale === 'percent') {
        convert = (v) => v * 100;
        unit = tickUnit = '%';
        description = t('Percentage · fixed 0–100% scale', 'Pourcentage · échelle fixe de 0 à 100 %');
    } else if (['potential', 'production'].includes(layer.id)) {
        const rawUnit = resource?.unit ?? 'units';
        const resourceUnit = rawUnit === 'units' ? t('units', 'unités') : rawUnit;
        unit = `${resourceUnit}/${t('season', 'saison')}`;
        tickUnit = unit;
        description = `${resource?.labels?.[locale] ?? resource?.labels?.en ?? ''} · ${unit}`;
    } else {
        const quantities = {
            elevation: ['m', 'm', 'Elevation · metres', 'Altitude · mètres'],
            depth: ['m', 'm', 'Water depth · metres', 'Profondeur de l’eau · mètres'],
            population: ['people', 'habitants', 'Population · people', 'Population · habitants'],
            workers: [
                'people',
                'personnes',
                'Unallocated workers · people',
                'Travailleurs non affectés · personnes',
            ],
            density: [
                'people/land-region area',
                'habitants/surface de région terrestre',
                'People per land-region area (not km²)',
                'Habitants par surface de région terrestre (pas par km²)',
            ],
            income: [
                'credits/season',
                'crédits/saison',
                'Civilian income · credits per season',
                'Revenu civil · crédits par saison',
            ],
            netIncome: [
                'credits/million residents',
                'crédits/million d’habitants',
                'After-tax income · credits per million residents',
                'Revenu net · crédits par million d’habitants',
            ],
            defense: ['points', 'points', 'Defense strength · points', 'Force défensive · points'],
            guard: ['points', 'points', 'Guard contribution · points', 'Contribution de la garde · points'],
            forces: ['divisions', 'divisions', 'Division count', 'Nombre de divisions'],
            capacity: [
                'capacity points',
                'points de capacité',
                'Productive capacity score',
                'Score de capacité productive',
            ],
            slope: [
                'relief units',
                'unités de relief',
                'Relief index · flat → steep (not degrees)',
                'Indice de relief · plat → abrupt (pas des degrés)',
            ],
            flow: [
                'runoff units',
                'unités de ruissellement',
                'Relative runoff · not m³/s',
                'Ruissellement relatif · pas des m³/s',
            ],
            deposits: [
                'density units',
                'unités de densité',
                'Resource density index · not extracted stock',
                'Indice de densité · pas un stock extrait',
            ],
        };
        const q = quantities[layer.id];
        if (q) {
            unit = t(q[0], q[1]);
            description = t(q[2], q[3]);
        }
        // Long units are written directly below the legend ticks; inspector always includes them.
        tickUnit = ['density', 'netIncome', 'slope', 'flow', 'deposits'].includes(layer.id) ? '' : unit;
        if (['population', 'workers', 'density', 'forces'].includes(layer.id)) digits = 0;
    }
    return {
        description,
        format(value, { tick = false, above = false } = {}) {
            if (typeof value !== 'number' || !Number.isFinite(value)) return t('Unavailable', 'Indisponible');
            const converted = convert(value);
            const number = new Intl.NumberFormat(locale, {
                maximumFractionDigits: digits,
                ...(tick && Math.abs(converted) >= 10000
                    ? { notation: 'compact', maximumFractionDigits: 1 }
                    : {}),
            }).format(converted);
            const suffix = tick ? tickUnit : unit;
            const separator = ['%', '/100'].includes(suffix) ? '' : ' ';
            return `${number}${above ? '+' : ''}${suffix ? separator + suffix : ''}`;
        },
    };
}
