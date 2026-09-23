// Original monochrome vector artwork, bundled with the flag editor (no requests per symbol).
const path = (d) => ({
    d,
    matrix: [1, 0, 0, 1, 0, 0],
    fill: true,
    stroke: false,
    strokeWidth: 1,
    fillRule: 'evenodd',
    opacity: 1,
});
const icon = (id, name, d) => ({ id, name, viewBox: [0, 0, 100, 100], paths: [path(d)] });
function radial(tips, inner) {
    return (
        Array.from({ length: tips * 2 }, (_, i) => {
            const angle = -Math.PI / 2 + (i * Math.PI) / tips,
                r = i % 2 ? inner : 46;
            return `${i ? 'L' : 'M'}${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`;
        }).join(' ') + 'Z'
    );
}
export const SYMBOLS = Object.freeze([
    icon('star', 'Star', radial(5, 19)),
    icon('sun', 'Sun', radial(12, 33)),
    icon('crescent', 'Crescent', 'M72 8 A44 44 0 1 0 72 92 A39 39 0 0 1 72 8Z'),
    icon('disc', 'Disc', 'M50 4 A46 46 0 1 1 49.99 4Z'),
    icon('diamond', 'Diamond', 'M50 3 96 50 50 97 4 50Z'),
    icon('cross', 'Cross', 'M39 5H61V39H95V61H61V95H39V61H5V39H39Z'),
    icon('lightning', 'Lightning', 'M53 2 13 58H43L34 98 87 35H55L70 2Z'),
    icon('mountain', 'Mountain', 'M2 88 37 15 56 55 70 30 98 88Z M29 51 37 34 45 51 37 46Z'),
    icon('tree', 'Tree', 'M50 2 25 33H37L17 57H31L8 82H43V98H57V82H92L69 57H83L63 33H75Z'),
    icon(
        'tower',
        'Tower',
        'M15 4H30V18H42V4H58V18H70V4H85V36H76V92H24V36H15Z M43 92V68A7 7 0 0 1 57 68V92Z M36 41V53H44V41Z M56 41V53H64V41Z',
    ),
    icon(
        'anchor',
        'Anchor',
        'M43 23A13 13 0 1 1 57 23V40H75V50H57V80C72 76 79 67 80 57L70 60 88 38 98 66 88 60C84 80 71 92 50 98 29 92 16 80 12 60L2 66 12 38 30 60 20 57C21 67 28 76 43 80V50H25V40H43Z M50 7A6 6 0 1 0 50.01 7Z',
    ),
    icon(
        'wheat',
        'Wheat',
        'M46 98V60C23 58 13 42 17 29 35 30 44 39 46 52V39C30 36 25 22 29 11 40 14 45 21 46 28V14L50 1 54 14V28C55 21 60 14 71 11 75 22 70 36 54 39V52C56 39 65 30 83 29 87 42 77 58 54 60V98Z',
    ),
    icon(
        'bird',
        'Bird',
        'M50 28 43 21 44 13 53 8 63 17 55 19 56 30 94 9 85 34 69 44 94 39 82 56 63 60 76 85 58 78 50 96 42 78 24 85 37 60 18 56 6 39 31 44 15 34 6 9 44 30Z',
    ),
    icon(
        'fleur',
        'Fleur-de-lis',
        'M50 2C24 27 38 40 42 57H35C34 34 4 27 4 48 4 62 17 63 20 53 22 48 29 51 29 57H22V67H42C41 79 31 89 23 93 38 98 45 88 50 78 55 88 62 98 77 93 69 89 59 79 58 67H78V57H71C71 51 78 48 80 53 83 63 96 62 96 48 96 27 66 34 65 57H58C62 40 76 27 50 2Z',
    ),
]);
export const symbolById = (id) => SYMBOLS.find((symbol) => symbol.id === id);
