import { randomId } from './ids.js';
import { validateAssets, RecipeError } from './recipe.js';
export const MAX_SVG_BYTES = 100_000;
const fail = () => {
    throw new RecipeError('invalidSvg');
};
const allowed = new Set([
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'ellipse',
    'polygon',
    'polyline',
    'line',
    'title',
    'desc',
]);
const attributes = new Set([
    'xmlns',
    'version',
    'viewBox',
    'width',
    'height',
    'x',
    'y',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'x1',
    'y1',
    'x2',
    'y2',
    'd',
    'points',
    'transform',
    'fill',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'fill-opacity',
    'stroke-opacity',
    'id',
]);
function numbers(value) {
    if (!value?.trim() || !/^[\d.eE+,\s-]+$/.test(value)) return fail();
    const parts = value
        .trim()
        .split(/[\s,]+/)
        .map(Number);
    if (parts.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000)) fail();
    return parts;
}
function matrix(value) {
    let result = new DOMMatrix();
    if (!value) return Array.from(result.toFloat64Array()).filter((_, i) => [0, 1, 4, 5, 12, 13].includes(i));
    const matches = [...value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)];
    if (
        value.replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)/g, '').trim() ||
        !matches.length ||
        matches.length > 16
    )
        fail();
    for (const [, type, args] of matches) {
        const n = numbers(args);
        let m = new DOMMatrix();
        if (type === 'matrix' && n.length === 6) m = new DOMMatrix(n);
        else if (type === 'translate' && n.length <= 2) m.translateSelf(n[0], n[1] ?? 0);
        else if (type === 'scale' && n.length <= 2) m.scaleSelf(n[0], n[1] ?? n[0]);
        else if (type === 'rotate' && [1, 3].includes(n.length))
            m.translateSelf(n[1] ?? 0, n[2] ?? 0)
                .rotateSelf(n[0])
                .translateSelf(-(n[1] ?? 0), -(n[2] ?? 0));
        else if (type === 'skewX' && n.length === 1) m.skewXSelf(n[0]);
        else if (type === 'skewY' && n.length === 1) m.skewYSelf(n[0]);
        else fail();
        result = result.multiply(m);
    }
    return [result.a, result.b, result.c, result.d, result.e, result.f];
}
export function importSymbol(source, name = 'Custom symbol') {
    if (new TextEncoder().encode(source).byteLength > MAX_SVG_BYTES || /<!DOCTYPE|<!ENTITY/i.test(source))
        fail();
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (document.querySelector('parsererror')) fail();
    const root = document.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') fail();
    if (root.querySelectorAll('*').length > 150) fail();
    let viewBox;
    if (root.hasAttribute('viewBox')) viewBox = numbers(root.getAttribute('viewBox'));
    else viewBox = [0, 0, Number(root.getAttribute('width')), Number(root.getAttribute('height'))];
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) fail();
    const paths = [];
    function walk(node, parent, style) {
        if (!allowed.has(node.localName) || node.namespaceURI !== root.namespaceURI) fail();
        for (const attr of node.attributes)
            if (!attributes.has(attr.name) || /url\s*\(/i.test(attr.value)) fail();
        if (['title', 'desc'].includes(node.localName)) {
            if (node.children.length) fail();
            return;
        }
        if (node !== root && node.localName === 'svg') fail();
        const m = parent.multiply(new DOMMatrix(matrix(node.getAttribute('transform'))));
        const next = { ...style };
        for (const key of ['fill', 'stroke', 'fill-rule', 'stroke-width'])
            if (node.hasAttribute(key)) next[key] = node.getAttribute(key);
        for (const key of ['fill-opacity', 'stroke-opacity'])
            if (node.hasAttribute(key) && Number(node.getAttribute(key)) !== 1) fail();
        if (node.hasAttribute('stroke-linecap') && node.getAttribute('stroke-linecap') !== 'butt') fail();
        if (node.hasAttribute('stroke-linejoin') && node.getAttribute('stroke-linejoin') !== 'miter') fail();
        if (node.hasAttribute('opacity') && Number(node.getAttribute('opacity')) !== 1) fail();
        const opacity = style.opacity * Number(node.getAttribute('opacity') ?? 1);
        const get = (key, fallback = 0) => {
            const value = Number(node.getAttribute(key) ?? fallback);
            if (!Number.isFinite(value) || Math.abs(value) > 100000) fail();
            return value;
        };
        let d;
        if (node.localName === 'path') d = node.getAttribute('d');
        if (node.localName === 'rect') {
            if (get('rx') || get('ry')) fail();
            const x = get('x'),
                y = get('y'),
                w = get('width'),
                h = get('height');
            if (w <= 0 || h <= 0) fail();
            d = `M${x} ${y}h${w}v${h}h${-w}Z`;
        }
        if (['circle', 'ellipse'].includes(node.localName)) {
            const x = get('cx'),
                y = get('cy'),
                rx = get(node.localName === 'circle' ? 'r' : 'rx'),
                ry = get(node.localName === 'circle' ? 'r' : 'ry');
            if (rx <= 0 || ry <= 0) fail();
            d = `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
        }
        if (['polygon', 'polyline'].includes(node.localName)) {
            const n = numbers(node.getAttribute('points'));
            if (n.length < 4 || n.length % 2) fail();
            d =
                'M' +
                n.slice(0, 2).join(' ') +
                'L' +
                n.slice(2).join(' ') +
                (node.localName === 'polygon' ? 'Z' : '');
        }
        if (node.localName === 'line') d = `M${get('x1')} ${get('y1')}L${get('x2')} ${get('y2')}`;
        if (d)
            paths.push({
                d,
                matrix: [m.a, m.b, m.c, m.d, m.e, m.f],
                fill: next.fill !== 'none',
                stroke: next.stroke !== 'none',
                strokeWidth: Number(next['stroke-width']),
                fillRule: next['fill-rule'],
                opacity,
            });
        else if (!['svg', 'g'].includes(node.localName)) fail();
        for (const child of node.children) walk(child, m, { ...next, opacity });
    }
    walk(root, new DOMMatrix(), {
        fill: 'black',
        stroke: 'none',
        'stroke-width': '1',
        'fill-rule': 'nonzero',
        opacity: 1,
    });
    const id = 'custom-' + randomId();
    try {
        return validateAssets([{ id, name: name.replace(/\.svg$/i, '').slice(0, 80), viewBox, paths }])[0];
    } catch {
        return fail();
    }
}
