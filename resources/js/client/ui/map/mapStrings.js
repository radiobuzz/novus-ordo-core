// Feature-local copy; geographic proper names remain those saved with the map.
const fr = {
    'Find a feature': 'Rechercher un lieu',
    '{cells} cells · potential {quantity} units · capacity {capacity}/season':
        '{cells} cellules · potentiel de {quantity} unités · capacité de {capacity}/saison',
    World: 'Monde',
    Terrain: 'Relief',
    Climate: 'Climat',
    'Water & coasts': 'Eau et côtes',
    Resources: 'Ressources',
    Names: 'Noms',
    Layers: 'Couches',
    'World seed': 'Graine du monde',
    'Regions wide': 'Régions en largeur',
    'Regions tall': 'Régions en hauteur',
    Resolution: 'Résolution',
    'Continental cores': 'Noyaux continentaux',
    'Land target': 'Proportion de terres',
    'Coastal detail': 'Détail des côtes',
    'Small island abundance': 'Abondance des petites îles',
    'Lake abundance': 'Abondance des lacs',
    'Polar extent': 'Étendue polaire',
    'Mountain snowline': 'Altitude des neiges',
    'Mountain strength': 'Importance des montagnes',
    'Landscape scale': 'Échelle du paysage',
    Wetness: 'Humidité',
    'Generate landscape': 'Générer le paysage',
    'Try another seed': 'Essayer une autre graine',
    'Cancel generation': 'Annuler la génération',
    'Preset name': 'Nom du préréglage',
    'Save settings': 'Enregistrer les réglages',
    'Saved browser presets': 'Préréglages du navigateur',
    'Load preset': 'Charger le préréglage',
    Inspector: 'Inspection',
    'Landscape preview': 'Aperçu du paysage',
    'Map settings': 'Réglages de la carte',
    Abundance: 'Abondance',
    Concentration: 'Concentration',
    Richness: 'Richesse',
    'Geographic feature': 'Élément géographique',
    Name: 'Nom',
    'Analysis layer': 'Couche d’analyse',
    terrain: 'Terrain',
    elevation: 'Altitude',
    temperature: 'Température',
    moisture: 'Humidité',
    drainage: 'Drainage',
    fertility: 'Potentiel agricole',
    depth: 'Profondeur',
    coast: 'Accessibilité côtière',
    'Fictional English · saved names stay unchanged when the naming pack changes.':
        'Anglais fictif · les noms enregistrés restent inchangés si le jeu de noms évolue.',
    'Generate a preview or load an exact saved map.': 'Générez un aperçu ou chargez une carte enregistrée.',
    'Settings changed. Generate to update the preview before saving or starting.':
        'Réglages modifiés. Générez l’aperçu avant d’enregistrer ou de démarrer.',
    'Generating geography and resources…': 'Génération de la géographie et des ressources…',
    'Generation cancelled. Previous preview retained.': 'Génération annulée. Aperçu précédent conservé.',
    'Enter a preset name and valid settings.': 'Saisissez un nom de préréglage et des valeurs valides.',
    'Settings preset saved in this browser.': 'Préréglage enregistré dans ce navigateur.',
    'Browser storage is unavailable.': 'Le stockage du navigateur est indisponible.',
    'Fit world': 'Cadrer le monde',
    'Zoom in': 'Agrandir',
    'Zoom out': 'Réduire',
    'Region boundaries': 'Limites des régions',
    'Shore edge': 'Segment côtier',
    'Select a region to inspect its land cells.': 'Sélectionnez une région pour examiner ses cellules.',
    'Landscape preview. Drag to pan; use zoom controls or keyboard.':
        'Aperçu du paysage. Faites glisser pour déplacer la carte ; utilisez les commandes de zoom ou le clavier.',
    '{n} microcells per region': '{n} microcellules par région',
    '{regions} regions · {cells} microcells · limit {limit}':
        '{regions} régions · {cells} microcellules · limite {limit}',
    'Uncheck {name} to select this resource.': 'Décochez {name} pour sélectionner cette ressource.',
    '{columns} × {rows} · {count} microcells per region · preview ready':
        '{columns} × {rows} · {count} microcellules par région · aperçu prêt',
    'Density: absent (dark), low (brown), high (orange). Static potential, not production.':
        'Densité : absente (sombre), faible (brun), forte (orange). Potentiel naturel, pas une production.',
    'Green: favourable · yellow: limited · orange: difficult · red: unsuitable. Select a land cell to inspect each shore edge.':
        'Vert : favorable · jaune : limité · orange : difficile · rouge : inadapté. Sélectionnez une cellule terrestre pour examiner chaque segment côtier.',
    'Suitability: low (brown) to high (green). No farmland is implied.':
        'Potentiel : faible (brun) à élevé (vert). Cela ne représente pas des terres cultivées.',
    'Water depth: shallow (light) to deep (dark).': 'Profondeur : faible (clair) à importante (sombre).',
    'Normalized index, 0–1.': 'Indice normalisé de 0 à 1.',
};
export const mapLocale = () => (globalThis.document?.documentElement.lang?.startsWith('fr') ? 'fr' : 'en');
export function mapText(english, values = {}) {
    const text = (mapLocale() === 'fr' ? fr[english] : null) ?? english;
    return text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}
