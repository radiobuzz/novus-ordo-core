import { randomId } from './ids.js';
import './identity-lab.scss';
import { el } from '../client/ui/element.js';
import { Button, actionLink } from '../client/ui/Button.js';
import { panel } from '../client/ui/Panel.js';
import { FieldShell } from '../client/ui/FieldShell.js';
import { RangeField } from '../client/ui/RangeField.js';
import { Scope } from '../client/runtime/Scope.js';
import {
    PALETTE,
    SIZE,
    MAX_RECIPE_BYTES,
    MAX_LAYERS,
    validateRecipe,
    upgradeRecipe,
    nextLayerId,
    parseRecipe,
    serializeRecipe,
    resolveColor,
} from './recipe.js';
import { TEMPLATES, PROOF_TEMPLATES, createTemplate } from './templates.js';
import { renderFlag, compileFlag, hitTest } from './renderer.js';
import { SYMBOLS } from './catalog.js';
import { randomize, generateSamples, addSymbol } from './generator.js';
import { importSymbol, MAX_SVG_BYTES } from './import-symbol.js';
import { openShelf, listStudies, saveStudy, removeStudy } from './storage.js';
import { translate } from './strings.js';

const root = document.getElementById('identity-lab-root');
const scope = new Scope();
let pageScope;
let dragging = false;
let locale = new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
let recipe = createTemplate('nordic');
recipe.name = translate(locale, 'nordic');
let selected = recipe.flag.layers.at(-1).id,
    template = 'nordic';
let revision = 0,
    importOperation = 0,
    undo = [],
    redo = [];
let statusKey = 'ready',
    errorStatus = false,
    advancedOpen = false;
let preview, small, solid, solidLarge, output, status, undoButton, redoButton, selection;
let patterns = [],
    samples = PROOF_TEMPLATES.map((id) => createTemplate(id)),
    sampleCanvases = [];
let seed = 'flag-1',
    locks = { palette: true, shapes: false, emblem: true };
let db,
    studies = [],
    shelfState = 'storageLoading',
    saving = false,
    currentId = null,
    savedRecipe = null;
let savedState;
const t = (key) => translate(locale, key);
const field = (key, control, help = '') => new FieldShell({ label: t(key), control, help }).element;
const layer = () => recipe.flag.layers.find((l) => l.id === selected);
const clone = (value) => JSON.parse(JSON.stringify(value));
const state = () => ({ recipe: validateRecipe(recipe), template, selected });
function notify(key, error = false) {
    statusKey = key;
    errorStatus = error;
    if (status) {
        status.textContent = t(key);
        status.dataset.error = String(error);
    }
}
function commit(next, { nextTemplate = template, nextSelected = selected } = {}) {
    const clean = validateRecipe(next);
    if (JSON.stringify(clean) === JSON.stringify(recipe)) return;
    undo.push(state());
    if (undo.length > 40) undo.shift();
    redo = [];
    const upgraded = recipe.schemaVersion < clean.schemaVersion;
    if (upgraded) {
        currentId = null;
        savedRecipe = null;
    }
    recipe = clean;
    template = nextTemplate;
    selected = nextSelected;
    revision++;
    notify(upgraded ? 'upgraded' : 'edited');
    paint();
}
function edit(change) {
    const next = clone(recipe);
    change(next);
    commit(next);
}
function editLayer(change) {
    edit((next) => {
        const active = next.flag.layers.find((l) => l.id === selected);
        if (active) change(active);
    });
}
function action(key, handler, variant = 'secondary') {
    const button = new Button({ label: t(key), variant, icon: null });
    pageScope.listen(button.element, 'click', () => {
        try {
            const result = handler();
            if (result?.catch) result.catch((error) => notify(error.code ?? 'failed', true));
        } catch (error) {
            notify(error.code ?? 'failed', true);
        }
    });
    return button;
}
function canvas(className, width, height, label) {
    return el('canvas', { class: className, width, height, role: 'img', 'aria-label': label });
}
function refreshSelection() {
    const active = layer();
    selection.hidden = !active?.visible;
    if (!active) return;
    const g = active.geometry;
    const xs = g.points?.map((p) => p[0]),
        ys = g.points?.map((p) => p[1]);
    const left = xs ? Math.min(...xs) : -g.width / 2,
        top = ys ? Math.min(...ys) : -g.height / 2;
    const width = xs ? Math.max(...xs) - left : g.width,
        height = ys ? Math.max(...ys) - top : g.height;
    selection.style.left = `${active.x / 9}%`;
    selection.style.top = `${active.y / 6}%`;
    selection.style.width = `${width / 9}%`;
    selection.style.height = `${height / 6}%`;
    selection.style.transformOrigin = '0 0';
    selection.style.transform = `rotate(${active.rotation}deg) scale(${active.scale * (active.flipX ? -1 : 1)},${active.scale}) translate(${(left / width) * 100}%,${(top / height) * 100}%)`;
}
function paint() {
    if (!preview) return;
    renderFlag(preview, recipe);
    renderFlag(small, recipe);
    const base = clone(recipe);
    base.flag.layers = [];
    base.flag.background = 'primary';
    renderFlag(solid, base);
    renderFlag(solidLarge, base);
    for (const item of patterns) {
        renderFlag(item.canvas, createTemplate(item.id, recipe.palette));
        item.button.setAttribute('aria-pressed', String(template === item.id));
    }
    sampleCanvases.forEach((c, i) => renderFlag(c, samples[i]));
    output.textContent = serializeRecipe(recipe);
    undoButton.setDisabled(!undo.length);
    redoButton.setDisabled(!redo.length);
    root.dataset.revision = String(revision);
    savedState.textContent = t(savedRecipe === JSON.stringify(recipe) ? 'saved' : 'unsaved');
    refreshSelection();
}
function restore(from, to) {
    if (!from.length) return;
    to.push(state());
    const prior = from.pop();
    recipe = prior.recipe;
    template = prior.template;
    selected = prior.selected;
    revision++;
    notify('edited');
    mount();
}
function choose(next, nextTemplate = null) {
    revision++;
    commit(next, { nextTemplate, nextSelected: next.flag.layers.at(-1)?.id ?? '' });
    mount();
}
function wirePreview() {
    let gesture;
    const position = (e) => {
        const box = preview.getBoundingClientRect();
        return [((e.clientX - box.left) * 900) / box.width, ((e.clientY - box.top) * 600) / box.height];
    };
    preview.tabIndex = 0;
    preview.setAttribute('aria-describedby', 'identity-drag-help');
    pageScope.listen(preview, 'pointerdown', (e) => {
        if (e.button !== 0 || gesture) return;
        const [x, y] = position(e);
        selected = hitTest(recipe, x, y);
        refreshSelection();
        if (!selected) {
            mount();
            return;
        }
        revision++;
        dragging = true;
        gesture = { pointer: e.pointerId, start: [x, y], before: state(), x: layer().x, y: layer().y };
        preview.setPointerCapture(e.pointerId);
        preview.focus();
        e.preventDefault();
    });
    pageScope.listen(preview, 'pointermove', (e) => {
        if (!gesture || gesture.pointer !== e.pointerId) return;
        const [x, y] = position(e),
            active = layer();
        active.x = Math.round(Math.max(-900, Math.min(1800, gesture.x + x - gesture.start[0])));
        active.y = Math.round(Math.max(-600, Math.min(1200, gesture.y + y - gesture.start[1])));
        paint();
    });
    const finish = (e, cancel = false) => {
        if (!gesture || gesture.pointer !== e.pointerId) return;
        const next = recipe,
            previous = gesture.before;
        recipe = previous.recipe;
        gesture = null;
        dragging = false;
        if (!cancel) commit(next);
        mount();
        document.getElementById('identity-preview')?.focus({ preventScroll: true });
    };
    pageScope.listen(preview, 'pointerup', (e) => finish(e));
    pageScope.listen(preview, 'pointercancel', (e) => finish(e, true));
    pageScope.listen(preview, 'lostpointercapture', (e) => finish(e, true));
    pageScope.listen(preview, 'keydown', (e) => {
        if (e.key === 'Escape') {
            selected = '';
            refreshSelection();
            return;
        }
        if (gesture || !layer()) return;
        const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!moves[e.key]) return;
        e.preventDefault();
        const [dx, dy] = moves[e.key],
            step = e.shiftKey ? 10 : 1;
        editLayer((l) => {
            l.x = Math.max(-900, Math.min(1800, l.x + dx * step));
            l.y = Math.max(-600, Math.min(1200, l.y + dy * step));
        });
        mount();
        document.getElementById('identity-preview')?.focus({ preventScroll: true });
    });
}
function importControl(kind) {
    const svg = kind === 'svg';
    const input = el('input', {
        id: svg ? 'identity-svg-import' : 'identity-import',
        type: 'file',
        accept: svg ? '.svg,image/svg+xml' : '.json,application/json',
    });
    pageScope.listen(input, 'change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const operation = ++importOperation,
            before = revision;
        try {
            if (file.size > (svg ? MAX_SVG_BYTES : MAX_RECIPE_BYTES)) {
                notify(svg ? 'invalidSvg' : 'tooLarge', true);
                return;
            }
            const text = await file.text();
            if (scope.closed || operation !== importOperation) return;
            if (before !== revision) {
                notify('stale');
                return;
            }
            let next;
            if (svg) {
                next = upgradeRecipe(recipe);
                const asset = importSymbol(text, file.name);
                if (next.customAssets.length >= 8) {
                    notify('assetsFull', true);
                    return;
                }
                next.customAssets.push(asset);
                next = addSymbol(next, asset.id);
            } else next = parseRecipe(text);
            commit(next, { nextTemplate: null, nextSelected: next.flag.layers.at(-1)?.id ?? '' });
            if (!svg) {
                currentId = null;
                savedRecipe = null;
            }
            notify('imported');
            mount();
        } catch (error) {
            if (!scope.closed && operation === importOperation) notify(error.code ?? 'failed', true);
        }
    });
    return field(svg ? 'importSvg' : 'importJson', input, t(svg ? 'svgHelp' : 'fileHelp'));
}
function replaceEmblem(id) {
    if (!id) {
        const next = upgradeRecipe(recipe);
        next.flag.layers = next.flag.layers.filter((l) => l.role !== 'emblem');
        choose(next, template);
        return;
    }
    const next = upgradeRecipe(recipe),
        previous = next.flag.layers.find((l) => l.role === 'emblem');
    next.flag.layers = next.flag.layers.filter((l) => l.role !== 'emblem');
    choose(
        addSymbol(
            next,
            id,
            previous
                ? {
                      x: previous.x,
                      y: previous.y,
                      size: previous.geometry.width ?? 175,
                      color: previous.color,
                  }
                : {},
        ),
        template,
    );
}
function repeatEmblem(arrangement, count) {
    const source = layer();
    if (!source || source.role !== 'emblem') return;
    const next = upgradeRecipe(recipe);
    if (next.flag.layers.length + count - 1 > MAX_LAYERS) {
        notify('layersFull', true);
        return;
    }
    next.flag.layers = next.flag.layers.filter((l) => l.id !== source.id);
    for (let i = 0; i < count; i++) {
        const item = clone(source);
        item.id = nextLayerId(next);
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
        item.x = arrangement === 'row' ? 150 + (600 * i) / (count - 1) : 450 + 180 * Math.cos(angle);
        item.y = arrangement === 'row' ? 300 : 300 + 180 * Math.sin(angle);
        item.scale = Math.min(source.scale, 0.6);
        next.flag.layers.push(item);
    }
    choose(next, template);
}

function advancedControls() {
    const select = el(
        'select',
        { id: 'identity-layer' },
        [...recipe.flag.layers].reverse().map((l) => el('option', { value: l.id, text: t(l.name) })),
    );
    select.value = selected;
    pageScope.listen(select, 'change', () => {
        selected = select.value;
        mount();
    });
    const properties = el('div', { class: 'identity-properties' });
    const active = layer();
    if (active) {
        const color = el(
            'select',
            { id: 'identity-layer-color' },
            [...Object.keys(PALETTE), 'custom'].map((key) => el('option', { value: key, text: t(key) })),
        );
        color.value = Object.hasOwn(PALETTE, active.color) ? active.color : 'custom';
        const custom = el('input', {
            id: 'identity-custom-color',
            type: 'color',
            value: resolveColor(active.color, recipe.palette),
        });
        custom.disabled = color.value !== 'custom';
        pageScope.listen(color, 'change', () => {
            editLayer((l) => {
                l.color = color.value === 'custom' ? custom.value : color.value;
            });
            mount();
        });
        pageScope.listen(custom, 'input', () =>
            editLayer((l) => {
                l.color = custom.value;
            }),
        );
        properties.append(field('color', color), field('customColor', custom));
        for (const [key, min, max, step] of [
            ['x', -900, 1800, 1],
            ['y', -600, 1200, 1],
            ['scale', 0.05, 4, 0.05],
            ['rotation', -180, 180, 1],
        ]) {
            const range = new RangeField({
                scope: pageScope,
                label: t(key),
                value: active[key],
                min,
                max,
                step,
                onChange: (value) => {
                    if (Number.isFinite(value) && value >= min && value <= max)
                        editLayer((l) => {
                            l[key] = value;
                        });
                },
            });
            range.range.setAttribute('aria-label', `${t(key)} · ${locale === 'fr' ? 'curseur' : 'slider'}`);
            properties.append(range.element);
        }
        if (active.shape !== 'polygon') {
            const dimensions = el('div', { class: 'identity-colors' });
            for (const key of ['width', 'height']) {
                const input = el('input', {
                    type: 'number',
                    min: 1,
                    max: 2400,
                    step: 'any',
                    id: `identity-layer-${key}`,
                    value: active.geometry[key],
                });
                pageScope.listen(input, 'input', () => {
                    if (input.validity.valid && Number.isFinite(input.valueAsNumber))
                        editLayer((l) => {
                            l.geometry[key] = input.valueAsNumber;
                        });
                });
                dimensions.append(field(key, input));
            }
            properties.append(dimensions);
        }
        for (const [key, label] of [
            ['visible', 'visible'],
            ['flipX', 'flip'],
        ]) {
            const checkbox = el('input', { type: 'checkbox', checked: active[key] });
            pageScope.listen(checkbox, 'change', () =>
                editLayer((l) => {
                    l[key] = checkbox.checked;
                }),
            );
            properties.append(el('label', { class: 'identity-check' }, checkbox, t(label)));
        }
        const reorder = (direction) => {
            edit((next) => {
                const i = next.flag.layers.findIndex((l) => l.id === selected);
                const j = i + direction;
                if (j >= 0 && j < next.flag.layers.length)
                    [next.flag.layers[i], next.flag.layers[j]] = [next.flag.layers[j], next.flag.layers[i]];
            });
            mount();
        };
        const forward = action('front', () => reorder(1));
        const backward = action('back', () => reorder(-1));
        const index = recipe.flag.layers.findIndex((l) => l.id === selected);
        forward.setDisabled(index === recipe.flag.layers.length - 1);
        backward.setDisabled(index === 0);
        properties.append(el('div', { class: 'identity-actions' }, backward.element, forward.element));
    } else properties.append(el('p', { text: t('empty') }));

    const shapeSelect = el(
        'select',
        { id: 'identity-add-shape' },
        ['rect', 'ellipse', 'triangle', 'diamond', 'chevron', 'crescent'].map((key) =>
            el('option', { value: key, text: t(key) }),
        ),
    );
    const add = action('addShape', () => {
        const next = upgradeRecipe(recipe);
        if (next.flag.layers.length >= MAX_LAYERS) {
            notify('layersFull', true);
            return;
        }
        const kind = shapeSelect.value;
        const points = {
            triangle: [
                [-120, 100],
                [0, -100],
                [120, 100],
            ],
            diamond: [
                [0, -120],
                [120, 0],
                [0, 120],
                [-120, 0],
            ],
            chevron: [
                [-120, -180],
                [100, 0],
                [-120, 180],
                [-60, 180],
                [160, 0],
                [-60, -180],
            ],
        }[kind];
        next.flag.layers.push({
            id: nextLayerId(next),
            name: t(kind),
            role: 'shape',
            shape: points ? 'polygon' : kind,
            color: 'secondary',
            visible: true,
            x: 450,
            y: 300,
            scale: 1,
            rotation: 0,
            flipX: false,
            geometry: points ? { points } : { width: 220, height: 180 },
        });
        choose(next, template);
    });
    const duplicate = action('duplicate', () => {
        if (!layer()) return;
        if (recipe.flag.layers.length >= MAX_LAYERS) {
            notify('layersFull', true);
            return;
        }
        const next = clone(recipe),
            copy = clone(layer());
        copy.id = nextLayerId(next);
        copy.x = Math.min(1800, copy.x + 20);
        copy.y = Math.min(1200, copy.y + 20);
        next.flag.layers.push(copy);
        choose(next, template);
    });
    const remove = action('removeLayer', () => {
        edit((next) => {
            next.flag.layers = next.flag.layers.filter((l) => l.id !== selected);
        });
        selected = recipe.flag.layers.at(-1)?.id ?? '';
        mount();
    });
    duplicate.setDisabled(!active);
    remove.setDisabled(!active);
    const content = el(
        'div',
        {},
        field('layer', select),
        properties,
        el('div', { class: 'identity-actions' }, duplicate.element, remove.element),
        field('shape', shapeSelect),
        add.element,
    );
    if (active?.role === 'emblem') {
        const count = el('input', { type: 'number', min: 2, max: 12, value: 5, id: 'identity-repeat-count' });
        const repeat = (kind) => {
            if (count.validity.valid && Number.isInteger(count.valueAsNumber))
                repeatEmblem(kind, count.valueAsNumber);
        };
        content.append(
            field('repeatCount', count),
            el(
                'div',
                { class: 'identity-actions' },
                action('repeatRow', () => repeat('row')).element,
                action('repeatRing', () => repeat('ring')).element,
            ),
        );
    }
    const details = el(
        'details',
        { class: 'identity-advanced', open: advancedOpen },
        el('summary', { text: t('advanced') }),
        content,
    );
    pageScope.listen(details, 'toggle', () => {
        advancedOpen = details.open;
    });
    return details;
}
async function saveCurrent(asNew) {
    if (!db || saving) return;
    const snapshot = validateRecipe(recipe),
        before = revision,
        id = asNew || !currentId ? randomId() : currentId;
    const existing = studies.find((s) => s.id === id);
    saving = true;
    mount();
    try {
        const { recipe: resolved, png } = await compileFlag(snapshot);
        if (scope.closed) return;
        const now = Date.now();
        await saveStudy(db, {
            id,
            recipe: resolved,
            png,
            revision: (existing?.revision ?? 0) + 1,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
        if (scope.closed) return;
        studies = await listStudies(db);
        if (scope.closed) return;
        if (revision === before) {
            currentId = id;
            savedRecipe = JSON.stringify(resolved);
            notify('saved');
        } else notify('savedEarlier');
    } catch (error) {
        if (!scope.closed) notify(error.message === 'shelfFull' ? 'shelfFull' : 'storageFailed', true);
    } finally {
        saving = false;
        if (!scope.closed && !dragging) mount();
    }
}
function shelf() {
    const save = action('save', () => saveCurrent(false), 'primary');
    const saveNew = action('saveNew', () => saveCurrent(true));
    save.setDisabled(!db || saving);
    saveNew.setDisabled(!db || saving || studies.length >= 8);
    const cards = el('div', { class: 'identity-shelf' });
    for (const record of studies) {
        let clean;
        try {
            clean = validateRecipe(record.recipe);
        } catch {
            /* Preserve stored PNG even when its recipe is unsupported. */
        }
        const name = typeof record.recipe?.name === 'string' ? record.recipe.name : t('untitled');
        const card = el('article', { class: 'identity-study' }, el('strong', { text: name }));
        if (record.png instanceof Blob && record.png.type === 'image/png') {
            const url = URL.createObjectURL(record.png);
            pageScope.own(() => URL.revokeObjectURL(url));
            card.prepend(el('img', { src: url, alt: name, width: 240, height: 160 }));
        } else card.append(el('p', { text: t('missingImage') }));
        const load = action('load', () => {
            choose(clean);
            currentId = record.id;
            savedRecipe = JSON.stringify(clean);
            notify('loaded');
            paint();
        });
        load.setDisabled(!clean);
        const png = action('exportPng', () => downloadNamed(record.png, name, 'png'));
        png.setDisabled(!(record.png instanceof Blob));
        const remove = action('deleteStudy', async () => {
            await removeStudy(db, record.id);
            studies = await listStudies(db);
            if (scope.closed) return;
            if (currentId === record.id) {
                currentId = null;
                savedRecipe = null;
            }
            notify('removed');
            mount();
        });
        remove.setDisabled(saving);
        if (!clean) card.append(el('p', { class: 'identity-note', text: t('savedUnsupported') }));
        card.append(el('div', { class: 'identity-actions' }, load.element, png.element, remove.element));
        cards.append(card);
    }
    return panel(
        { title: `${t('shelf')} · ${studies.length}/8` },
        el('p', { class: 'identity-note', text: t(db ? 'shelfHelp' : shelfState) }),
        el('div', { class: 'identity-actions' }, save.element, saveNew.element),
        cards,
    );
}
function mount() {
    const focused = document.activeElement?.id;
    void pageScope?.dispose();
    pageScope = new Scope();
    document.documentElement.lang = locale;
    document.title = `Novus Ordo · ${t('title')}`;
    preview = canvas('identity-master', ...SIZE, t('preview'));
    preview.id = 'identity-preview';
    small = canvas('identity-small', 48, 32, t('small'));
    solid = canvas('identity-small', 48, 32, t('baseline'));
    solidLarge = canvas('identity-baseline', 240, 160, t('baseline'));
    selection = el('div', { class: 'identity-selection', 'aria-hidden': 'true' });
    status = el('p', { class: 'identity-status', role: 'status' });
    output = el('pre', { class: 'identity-recipe' });
    savedState = el('span', { class: 'identity-note' });
    undoButton = action('undo', () => restore(undo, redo));
    undoButton.element.id = 'identity-undo';
    redoButton = action('redo', () => restore(redo, undo));
    redoButton.element.id = 'identity-redo';
    const language = el(
        'select',
        { id: 'identity-language', class: 'ui-control', 'aria-label': t('language') },
        el('option', { value: 'en', text: 'EN · English' }),
        el('option', { value: 'fr', text: 'FR · Français' }),
    );
    language.value = locale;
    pageScope.listen(language, 'change', () => {
        locale = language.value;
        mount();
    });
    const tabs = el(
        'div',
        { class: 'identity-tabs', role: 'tablist', 'aria-label': t('tabs') },
        el('button', {
            type: 'button',
            id: 'identity-flag-tab',
            role: 'tab',
            'aria-selected': 'true',
            'aria-controls': 'identity-flag-panel',
            text: t('flagTab'),
        }),
        ...['emblemTab', 'armsTab'].map((key) =>
            el('button', {
                type: 'button',
                role: 'tab',
                disabled: true,
                'aria-disabled': 'true',
                'aria-selected': 'false',
                tabindex: '-1',
                text: t(key),
            }),
        ),
    );
    patterns = TEMPLATES.map((id) => {
        const image = canvas('identity-pattern-image', 150, 100, t(id));
        const button = action(id, () => {
            const next = createTemplate(id, recipe.palette);
            next.name = recipe.name;
            choose(next, id);
        }).element;
        button.className = 'identity-pattern';
        button.dataset.template = id;
        button.title = t(id);
        button.setAttribute('aria-label', t(id));
        button.replaceChildren(image);
        return { id, canvas: image, button };
    });
    const colors = el('div', { class: 'identity-colors' });
    for (const key of Object.keys(PALETTE)) {
        const control = el('input', { id: `identity-${key}`, type: 'color', value: recipe.palette[key] });
        pageScope.listen(control, 'input', () =>
            edit((next) => {
                next.palette[key] = control.value;
            }),
        );
        colors.append(field(key, control));
    }
    const symbols = el(
        'select',
        { id: 'identity-symbol' },
        el('option', { value: '', text: t('noEmblem') }),
        [...SYMBOLS, ...(recipe.customAssets ?? [])].map((s) =>
            el('option', { value: s.id, text: t(s.name) }),
        ),
    );
    const currentEmblems = upgradeRecipe(recipe).flag.layers.filter((l) => l.role === 'emblem');
    if (currentEmblems.length > 1 || currentEmblems.some((l) => l.shape !== 'symbol')) {
        symbols.append(el('option', { value: 'composition', disabled: true, text: t('currentEmblem') }));
        symbols.value = 'composition';
    } else symbols.value = currentEmblems[0]?.geometry.symbolId ?? '';
    pageScope.listen(symbols, 'change', () => replaceEmblem(symbols.value));
    const emblemColor = el(
        'select',
        { id: 'identity-emblem-color' },
        Object.keys(PALETTE).map((key) => el('option', { value: key, text: t(key) })),
    );
    const firstEmblem = currentEmblems[0];
    emblemColor.disabled = !firstEmblem;
    emblemColor.value = firstEmblem?.color ?? 'supporting';
    if (firstEmblem && !Object.hasOwn(PALETTE, firstEmblem.color)) {
        emblemColor.append(el('option', { value: firstEmblem.color, text: t('custom') }));
        emblemColor.value = firstEmblem.color;
    }
    pageScope.listen(emblemColor, 'change', () =>
        edit((next) => {
            for (const l of next.flag.layers)
                if (currentEmblems.some((e) => e.id === l.id)) l.color = emblemColor.value;
        }),
    );
    const symbolGallery = el('div', { class: 'identity-symbols' });
    for (const item of SYMBOLS) {
        const c = canvas('identity-symbol-image', 60, 40, t(item.name));
        const r = addSymbol(createTemplate('solid', recipe.palette), item.id, { size: 440 });
        renderFlag(c, r);
        const button = action(item.name, () => replaceEmblem(item.id)).element;
        button.className = 'identity-symbol';
        button.title = t(item.name);
        button.setAttribute('aria-label', t(item.name));
        button.replaceChildren(c);
        symbolGallery.append(button);
    }
    const randomButtons = el('div', { class: 'identity-randomizers' });
    for (const [part, key] of [
        ['shapes', 'randomShapes'],
        ['colors', 'randomColors'],
        ['emblem', 'randomEmblem'],
    ])
        randomButtons.append(
            action(key, () =>
                choose(randomize(recipe, part, randomId()), part === 'shapes' ? null : template),
            ).element,
        );
    const name = el('input', { id: 'identity-name', type: 'text', maxlength: 80, value: recipe.name });
    pageScope.listen(name, 'input', () =>
        edit((next) => {
            next.name = name.value;
        }),
    );
    const pngButton = action(
        'exportPng',
        async () => {
            pngButton.setPending(true);
            try {
                const snapshot = await compileFlag(recipe);
                if (scope.closed) return;
                downloadNamed(snapshot.png, snapshot.recipe.name, 'png');
                notify('exported');
            } catch {
                if (!scope.closed) notify('failed', true);
            } finally {
                pngButton.setPending(false);
            }
        },
        'primary',
    );
    const jsonButton = action('exportJson', () => {
        downloadNamed(new Blob([serializeRecipe(recipe)], { type: 'application/json' }), recipe.name, 'json');
        notify('exported');
    });
    const seedInput = el('input', { id: 'identity-seed', type: 'text', maxlength: 80, value: seed });
    pageScope.listen(seedInput, 'input', () => {
        seed = seedInput.value;
    });
    const lockControls = el('div', { class: 'identity-locks' });
    for (const [key, label] of [
        ['palette', 'lockPalette'],
        ['shapes', 'lockShapes'],
        ['emblem', 'lockEmblem'],
    ]) {
        const checkbox = el('input', { type: 'checkbox', checked: locks[key] });
        pageScope.listen(checkbox, 'change', () => {
            locks[key] = checkbox.checked;
        });
        lockControls.append(el('label', { class: 'identity-check' }, checkbox, t(label)));
    }
    const generate = () => {
        samples = generateSamples(recipe, seed, locks);
        mount();
    };
    const newSamples = action('generate', () => {
        seed = randomId().slice(0, 12);
        generate();
    });
    const generation = el(
        'details',
        {},
        el('summary', { text: t('generationOptions') }),
        field('seed', seedInput),
        lockControls,
        action('repeatGeneration', generate).element,
    );
    sampleCanvases = [];
    const sampleButtons = samples.map((sample, i) => {
        const c = canvas('identity-sample-image', 300, 200, `${t('variation')} ${i + 1}`);
        sampleCanvases.push(c);
        const button = action(`${t('variation')} ${i + 1}`, () => choose(sample)).element;
        button.className = 'identity-sample';
        button.setAttribute('aria-label', `${t('variation')} ${i + 1}`);
        button.replaceChildren(
            c,
            el('span', { class: 'identity-sample-caption', text: `${t('variation')} ${i + 1}` }),
        );
        return button;
    });
    root.replaceChildren(
        el(
            'header',
            { class: 'identity-header' },
            el(
                'div',
                {},
                el('p', { class: 'identity-eyebrow', text: t('eyebrow') }),
                el('h1', { text: t('title') }),
            ),
            el('div', { class: 'identity-actions' }, actionLink(t('tools'), '/client/tools'), language),
        ),
        tabs,
        el(
            'section',
            { id: 'identity-flag-panel', role: 'tabpanel', 'aria-labelledby': 'identity-flag-tab' },
            el('p', { class: 'identity-note', text: t('description') }),
            el(
                'div',
                { class: 'identity-workspace' },
                el(
                    'div',
                    { class: 'identity-stage-column' },
                    panel(
                        {
                            title: t('preview'),
                            className: 'identity-stage',
                            actions: el(
                                'div',
                                { class: 'identity-actions' },
                                undoButton.element,
                                redoButton.element,
                            ),
                        },
                        randomButtons,
                        el('div', { class: 'identity-canvas-wrap' }, preview, selection),
                        el('p', { id: 'identity-drag-help', class: 'identity-note', text: t('dragHelp') }),
                        el(
                            'div',
                            { class: 'identity-comparison' },
                            el('div', {}, el('span', { text: t('small') }), small),
                            el('div', {}, el('span', { text: t('baseline') }), solid),
                        ),
                        el(
                            'details',
                            { class: 'identity-baseline-details' },
                            el('summary', { text: t('baselineHelp') }),
                            solidLarge,
                        ),
                        status,
                    ),
                    panel(
                        {
                            title: t('samples'),
                            className: 'identity-gallery-panel',
                            actions: newSamples.element,
                        },
                        el('div', { class: 'identity-gallery' }, sampleButtons),
                        generation,
                    ),
                    panel(
                        { title: t('keep') },
                        field('name', name),
                        el(
                            'div',
                            { class: 'identity-actions' },
                            pngButton.element,
                            jsonButton.element,
                            savedState,
                        ),
                        el(
                            'details',
                            {},
                            el('summary', { text: t('importExportHelp') }),
                            el('p', { class: 'identity-note', text: t('archiveHelp') }),
                            importControl('json'),
                        ),
                    ),
                ),
                el(
                    'div',
                    { class: 'identity-controls' },
                    panel(
                        { title: t('pattern') },
                        el(
                            'div',
                            { class: 'identity-patterns' },
                            patterns.map((p) => p.button),
                        ),
                    ),
                    panel(
                        { title: t('palette') },
                        colors,
                        el('p', { class: 'identity-note', text: t('paletteHelp') }),
                    ),
                    panel(
                        { title: t('emblem') },
                        field('symbol', symbols),
                        field('emblemColor', emblemColor),
                        el(
                            'details',
                            {},
                            el('summary', { text: t('browseSymbols') }),
                            symbolGallery,
                            importControl('svg'),
                        ),
                    ),
                    panel({ title: t('refine') }, advancedControls()),
                ),
            ),
            shelf(),
            el('details', { class: 'identity-json' }, el('summary', { text: t('details') }), output),
        ),
    );
    wirePreview();
    notify(statusKey, errorStatus);
    paint();
    root.dataset.ready = 'true';
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
}
function downloadNamed(blob, name, extension) {
    const url = URL.createObjectURL(blob),
        release = scope.own(() => URL.revokeObjectURL(url));
    const safe = name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 64) || 'flag';
    const link = el('a', { href: url, download: `${safe}.${extension}` });
    document.body.append(link);
    link.click();
    link.remove();
    scope.timeout(release, 1500);
}
scope.own(() => pageScope?.dispose());
scope.listen(window, 'pagehide', (event) => {
    if (!event.persisted) void scope.dispose();
});
mount();
openShelf()
    .then(async (connection) => {
        if (scope.closed) {
            connection.close();
            return;
        }
        db = connection;
        scope.own(() => connection.close());
        studies = await listStudies(db);
        if (!scope.closed && !dragging) mount();
    })
    .catch(() => {
        if (!scope.closed) {
            db = null;
            shelfState = 'storageFailed';
            mount();
        }
    });
