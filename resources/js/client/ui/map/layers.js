// Visibility descriptors consumed by the generated-world renderer.
export function createLayers() {
    return [
        { id: 'terrain', label: 'Terrain', visible: true },
        { id: 'ownership', label: 'Ownership', visible: true },
        { id: 'borders', label: 'Borders', visible: true },
        { id: 'detail', label: 'Map detail', visible: true },
        { id: 'rivers', label: 'Rivers', visible: true },
        { id: 'names', label: 'Territory names', visible: false },
        { id: 'selection', label: 'Selection', visible: true, fixed: true },
    ];
}
