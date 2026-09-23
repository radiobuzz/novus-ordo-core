export const defaultUnitPalette = Object.freeze({ paint: '#617859', accent: '#c5ab72' });

export function unitPalette(value) {
    return Object.fromEntries(
        Object.entries(defaultUnitPalette).map(([key, fallback]) => [
            key,
            /^#[0-9a-f]{6}$/i.test(value?.[key]) ? value[key] : fallback,
        ]),
    );
}

/** Portrait-style luminance ramps. Preserve alpha and unmasked skin/metal pixels. */
export function recolorUnitPixels(pixels, palette, aircraft = false, mask = null) {
    const colors = Object.fromEntries(
        Object.entries(unitPalette(palette)).map(([key, hex]) => [
            key,
            [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)),
        ]),
    );
    for (let i = 0; i < pixels.length; i += 4) {
        if (!pixels[i + 3]) continue;
        const [r, g, b] = pixels.slice(i, i + 3);
        const max = Math.max(r, g, b),
            min = Math.min(r, g, b),
            delta = max - min;
        if (delta < 9 || !max) continue;
        const hue =
            ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 +
                360) %
            360;
        // Authored V1 olive range; warm skin, wood and neutral metal stay original.
        let material =
            hue >= 43 && hue <= 95
                ? 'paint'
                : aircraft && hue >= 30 && hue < 43 && delta / max > 0.45
                  ? 'accent'
                  : null;
        if (mask) material = material ? mask(i / 4) : null;
        if (!material) continue;
        const light = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        const midpoint = 0.46;
        for (let channel = 0; channel < 3; channel++) {
            const base = colors[material][channel];
            pixels[i + channel] =
                light <= midpoint
                    ? (base * light) / midpoint
                    : base + (255 - base) * ((light - midpoint) / (1 - midpoint));
        }
    }
    return pixels;
}

/** Small V1 material-marking zones, in normalised sprite coordinates. Skin/metal still excluded. */
export function unitMarking(type, x, y) {
    if (type === 'Infantry') {
        if (
            (x > 0.24 && x < 0.36 && y > 0.2 && y < 0.26) ||
            (x > 0.6 && x < 0.7 && y > 0.25 && y < 0.32) ||
            (x > 0.46 && x < 0.55 && y > 0.39 && y < 0.44)
        )
            return 'paint';
        if ((x > 0.2 && x < 0.28 && y > 0.29 && y < 0.34) || (x > 0.39 && x < 0.46 && y > 0.48 && y < 0.53))
            return 'accent';
        return null;
    }
    if (type === 'Fighter' || type === 'Bomber') {
        if (x > 0.32 && x < 0.41 && y > 0.25 && y < 0.72) return 'paint';
        if (x > 0.59 && x < 0.66 && y > 0.25 && y < 0.75) return 'accent';
        return null;
    }
    if (x > 0.35 && x < 0.47 && y > 0.28 && y < 0.7) return 'paint';
    if (x > 0.56 && x < 0.62 && y > 0.3 && y < 0.72) return 'accent';
    return null;
}
