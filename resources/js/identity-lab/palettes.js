// Colour harmony is a generator detail; the editor only receives editable hex colours.
export const HARMONIES = ['monochromatic', 'analogous', 'complementary', 'split-complementary'];
export function hslToHex(hue, saturation, lightness) {
    const h = (((hue % 360) + 360) % 360) / 60;
    const s = saturation / 100,
        l = lightness / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h % 2) - 1)),
        m = l - c / 2;
    const rgb =
        h < 1
            ? [c, x, 0]
            : h < 2
              ? [x, c, 0]
              : h < 3
                ? [0, c, x]
                : h < 4
                  ? [0, x, c]
                  : h < 5
                    ? [x, 0, c]
                    : [c, 0, x];
    return (
        '#' +
        rgb
            .map((v) =>
                Math.round((v + m) * 255)
                    .toString(16)
                    .padStart(2, '0'),
            )
            .join('')
    );
}
export function luminance(hex) {
    const values = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
export function contrast(a, b) {
    const x = luminance(a),
        y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function generatePalette(rnd, harmony = HARMONIES[Math.floor(rnd() * HARMONIES.length)]) {
    if (!HARMONIES.includes(harmony)) throw new Error('Unknown colour harmony');
    const hue = rnd() * 360,
        direction = rnd() < 0.5 ? -1 : 1;
    const offsets = {
        monochromatic: [0, 0],
        analogous: [direction * 30, -direction * 30],
        complementary: [180, 0],
        'split-complementary': [150, 210],
    }[harmony];
    const saturation = 55 + rnd() * 35;
    const primary = hslToHex(hue, saturation, 16 + rnd() * 10);
    let lightness = 52 + rnd() * 15;
    let secondary = hslToHex(hue + offsets[0], saturation, lightness);
    // Tone separation matters as much as hue when a flag is displayed at 48 × 32.
    while (contrast(primary, secondary) < 3 && lightness < 90)
        secondary = hslToHex(hue + offsets[0], saturation, ++lightness);
    const supporting = hslToHex(hue + offsets[1], 18 + rnd() * 22, 94 + rnd() * 4);
    return { primary, secondary, supporting };
}

/** Derive an editable palette without ever adjusting the user's primary colour. */
export function paletteFromBase(base, harmony, variation = 0) {
    if (!/^#[0-9a-f]{6}$/i.test(base) || !HARMONIES.includes(harmony))
        throw new Error('Invalid base colour or harmony');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
    const lightness = (max + min) / 2;
    const saturation = delta ? (delta / (1 - Math.abs(2 * lightness - 1))) * 100 : 0;
    const hue = !delta
        ? 0
        : 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
    const direction = variation % 2 ? -1 : 1;
    const offsets = {
        monochromatic: [0, 0],
        analogous: [30 * direction, -30 * direction],
        complementary: [180, 0],
        'split-complementary': [150, 210],
    }[harmony];
    const dark = contrast(base, '#000000') > contrast(base, '#ffffff');
    const phase = (((variation * 0.61803398875) % 1) + 1) % 1;
    const tone = (offset, sat, desired) => {
        let result,
            distance = Infinity;
        for (let l = 0; l <= 100; l++) {
            const hex = hslToHex(hue + offset, sat, l);
            if (contrast(base, hex) >= 3 && Math.abs(l - desired) < distance) {
                result = hex;
                distance = Math.abs(l - desired);
            }
        }
        return result;
    };
    return {
        primary: base.toLowerCase(),
        secondary: tone(
            offsets[0],
            saturation * (0.75 + phase * 0.25),
            dark ? 20 + phase * 20 : 58 + phase * 20,
        ),
        supporting: tone(
            offsets[1],
            saturation * (0.2 + phase * 0.25),
            dark ? 4 + phase * 12 : 94 - phase * 12,
        ),
    };
}
