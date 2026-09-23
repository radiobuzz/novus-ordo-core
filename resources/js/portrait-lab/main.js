import './portrait-lab.scss';
import { el } from '../client/ui/element.js';
import { Button, actionLink } from '../client/ui/Button.js';
import { panel } from '../client/ui/Panel.js';
import { FieldShell } from '../client/ui/FieldShell.js';
import { RangeField } from '../client/ui/RangeField.js';
import { Scope } from '../client/runtime/Scope.js';
import { hair, clothes, SIZE, accessoryStyles } from './catalog.js';
import { lensFinishes } from './collection-03.js';
import {
    defaultFittedRecipe,
    generateFittedRecipe,
    validateRecipe,
    parseRecipe,
    serializeRecipe,
    MAX_RECIPE_BYTES,
    fittedPalettes as palettes,
    fittedProfiles as profiles,
    fittedHairColors as hairColors,
} from './recipe.js';
import { PortraitRenderer, loadImage } from './renderer.js';
import {
    isFitted,
    sexFor,
    poolFor,
    fittedAsset,
    fittedOptions,
    fitAllowed,
    retargetFitted,
    comparisonDefinitions,
    faceRigs,
    allFaces as faces,
} from './fitting.js';

const STORAGE = 'novus.portrait-lab.saved.v1';
const root = document.getElementById('portrait-lab-root');
const scope = new Scope();
const renderer = new PortraitRenderer();
let recipe = defaultFittedRecipe();
let customImage = null;
let ready = false;
let operation = 0;
let frame = 0;
let examples = [];
let saved = [];
let storageWarning = '';
const controls = {};
const message = el('p', {
    class: 'portrait-status',
    role: 'status',
    text: 'Loading the painted library…',
});
function notify(text, error = false) {
    message.textContent = text;
    message.dataset.tone = error ? 'error' : 'ready';
}
function action(label, handler, variant = 'secondary') {
    const button = new Button({ label, variant });
    scope.listen(button.element, 'click', handler);
    return button.element;
}
function field(label, control, help = '') {
    return new FieldShell({ label, control, help }).element;
}
function select(label, options, handler) {
    const input = el(
        'select',
        {},
        options.map((entry) => el('option', { value: entry.id ?? entry.value, text: entry.label })),
    );
    scope.listen(input, 'change', () => handler(input.value));
    return { input, element: field(label, input) };
}
function setRecipe(next, image = null) {
    recipe = validateRecipe(next);
    customImage = image;
    operation++; // An older upload/import may not overwrite a newer selection.
    sync();
    scheduleRender();
}
function edit(mutator) {
    const next = structuredClone(recipe);
    mutator(next);
    setRecipe(next, customImage);
}
function scheduleRender() {
    if (!ready || frame || scope.closed) return;
    frame = requestAnimationFrame(() => {
        frame = 0;
        try {
            render();
        } catch (error) {
            notify(error.message, true);
        }
    });
}
const portrait = el('canvas', {
    width: SIZE[0],
    height: SIZE[1],
    role: 'img',
    'aria-label': 'Character portrait',
});
const small = el('canvas', {
    width: 96,
    height: 113,
    role: 'img',
    'aria-label': 'Portrait at roster size',
});
const caption = el('p', { class: 'portrait-caption' });
const sourceLabel = el('span', {
    class: 'portrait-eyebrow',
    text: 'MODULAR PORTRAIT',
});
const recipeText = el('pre', {
    class: 'portrait-recipe',
    tabindex: 0,
    'aria-label': 'Resolved portrait recipe',
});
const layerView = select(
    'Preview layers',
    [
        { id: 'all', label: 'Complete portrait' },
        { id: 'face', label: 'Face & neck' },
        { id: 'hair', label: 'Hair only' },
        { id: 'clothing', label: 'Clothing only' },
        { id: 'accessories', label: 'Accessories only' },
    ],
    scheduleRender,
);
const guidesInput = el('input', { type: 'checkbox' });
scope.listen(guidesInput, 'change', scheduleRender);
function render() {
    renderer.draw(portrait, recipe, {
        customImage,
        only: layerView.input.value,
        guides: guidesInput.checked,
    });
    renderer.draw(small, recipe, { customImage });
    const face = faces.find((entry) => entry.id === recipe.face);
    const garment = isFitted(recipe)
        ? fittedAsset(recipe, 'clothing')
        : clothes.find((entry) => entry.id === recipe.clothing);
    const description =
        recipe.mode === 'custom'
            ? 'Custom image · cropped locally'
            : `${face.description} · ${garment.label}`;
    caption.textContent = `${recipe.name || 'Unnamed character'} · ${description}`;
    portrait.setAttribute(
        'aria-label',
        `${recipe.name || 'Character'}: ${description}. ${layerView.input.selectedOptions[0].textContent}.`,
    );
    small.setAttribute('aria-label', `${recipe.name || 'Character'} at roster size`);
    sourceLabel.textContent = recipe.mode === 'custom' ? 'CUSTOM PORTRAIT' : 'MODULAR PORTRAIT';
    const display = { ...recipe };
    if (display.image)
        display.image = `[embedded image · ${Math.round(display.image.length / 1024)} KB; included in exported JSON]`;
    recipeText.textContent = JSON.stringify(display, null, 2);
    renderComparison();
    root.dataset.ready = 'true';
}

const nameInput = el('input', {
    type: 'text',
    maxlength: 80,
    value: recipe.name,
});
scope.listen(nameInput, 'input', () =>
    edit((next) => {
        next.name = nameInput.value;
    }),
);
const sexSelect = select(
    'Character pool',
    [
        { id: 'female', label: 'Female' },
        { id: 'male', label: 'Male' },
    ],
    (sex) => {
        const face = faces.find((entry) => sexFor(entry.id) === sex);
        setRecipe(retargetFitted(recipe, face.id), customImage);
        notify(`Switched to the ${sex} pool. Incompatible parts were replaced or removed.`);
    },
);
const faceSelect = select('Face base', faces, (value) =>
    setRecipe(retargetFitted(recipe, value), customImage),
);
controls.face = faceSelect.input;
const hairSelect = select('Hairstyle', hair, (value) =>
    edit((next) => {
        next.hair = value;
    }),
);
controls.hair = hairSelect.input;
const clothingSelect = select('Clothing', clothes, (value) =>
    edit((next) => {
        next.clothing = value;
        Object.assign(next, retargetFitted(next));
    }),
);
controls.clothing = clothingSelect.input;
const hairSwatches = el('div', {
    class: 'portrait-swatches',
    role: 'group',
    'aria-label': 'Natural hair colors',
});
for (const color of hairColors) {
    const button = action(
        color.label,
        () =>
            edit((next) => {
                next.colors.hair = color.value;
            }),
        'quiet',
    );
    button.classList.add('portrait-swatch');
    button.style.setProperty('--swatch', color.value);
    button.setAttribute('aria-label', color.label);
    button.title = color.label;
    button.dataset.color = color.value;
    hairSwatches.append(button);
}
const accessoryFields = el('div', { class: 'portrait-checks' });
const accessoryGroups = {};
for (const [key, label] of [
    ['glasses', 'Glasses'],
    ['mustache', 'Facial hair'],
    ['tie', 'Neckwear'],
]) {
    const input = el('input', { type: 'checkbox' });
    controls[key] = input;
    scope.listen(input, 'change', () =>
        edit((next) => {
            next.accessories[key] = input.checked;
        }),
    );
    const group = el(
        'div',
        { class: 'portrait-accessory-group' },
        el('label', {}, input, el('span', { text: label })),
    );
    accessoryGroups[key] = group;
    const style = select(
        {
            glasses: 'Glasses style',
            mustache: 'Facial hair style',
            tie: 'Neckwear style',
        }[key],
        accessoryStyles[key],
        (id) =>
            edit((next) => {
                next.accessoryStyles = { ...next.accessoryStyles, [key]: id };
                next.accessories[key] = true;
            }),
    );
    controls[`${key}-style`] = style.input;
    group.append(style.element);
    accessoryFields.append(group);
}
const lensFinish = select('Lens finish', lensFinishes, (finish) =>
    edit((next) => {
        next.version = 4;
        next.lenses = { finish, color: next.lenses?.color ?? '#7298ae' };
        next.accessories.glasses = true;
    }),
);
const lensColor = el('input', { type: 'color', value: '#7298ae' });
scope.listen(lensColor, 'input', () =>
    edit((next) => {
        next.version = 4;
        next.lenses = { finish: next.lenses?.finish ?? 'tinted', color: lensColor.value };
        next.accessories.glasses = true;
    }),
);
accessoryGroups.glasses.append(lensFinish.element, field('Lens tint color', lensColor));
const modularFields = el(
    'fieldset',
    { class: 'portrait-fieldset' },
    el('legend', { class: 'ui-visually-hidden', text: 'Generated appearance' }),
    sexSelect.element,
    faceSelect.element,
    el('p', {
        class: 'portrait-note',
        text: 'Each pool has its own fitted parts. Age and complexion belong to the selected face.',
    }),
    hairSelect.element,
    hairSwatches,
    clothingSelect.element,
    accessoryFields,
);
const legacyNotice = el(
    'div',
    { class: 'portrait-legacy', hidden: true },
    el('p', {
        text: 'Legacy portrait: original appearance preserved. Create a fitted copy to use the new placement and compatibility rules.',
    }),
    action(
        'Use fitted model',
        () => {
            setRecipe(retargetFitted(recipe), customImage);
            notify('Fitted copy created. Saved studies and imported files remain unchanged.');
        },
        'primary',
    ),
);
const identityPanel = panel(
    { title: 'The character' },
    field('Character name', nameInput),
    legacyNotice,
    modularFields,
);

const paletteSelect = select(
    'Palette preset',
    [{ id: 'custom', label: 'Custom colors' }, ...palettes],
    (id) => {
        const palette = palettes.find((entry) => entry.id === id);
        if (!palette) return;
        edit((next) => {
            for (const key of ['fabric', 'accent', 'background']) next.colors[key] = palette[key];
        });
    },
);
const paletteFields = el(
    'fieldset',
    { class: 'portrait-fieldset' },
    el('legend', { class: 'ui-visually-hidden', text: 'Portrait palette' }),
    paletteSelect.element,
);
const colorFields = el('div', { class: 'portrait-color-grid' });
for (const [key, label] of [
    ['fabric', 'Main fabric'],
    ['accent', 'Tie / rank trim'],
    ['hair', 'Hair & mustache'],
    ['background', 'Background'],
]) {
    const input = el('input', { type: 'color', value: recipe.colors[key] });
    controls[`color-${key}`] = input;
    scope.listen(input, 'input', () =>
        edit((next) => {
            next.colors[key] = input.value;
        }),
    );
    colorFields.append(field(label, input));
}
paletteFields.append(
    colorFields,
    el('p', {
        class: 'portrait-note',
        text: 'Painted shading is preserved. Accent colors affect the tie and officer shoulder trim.',
    }),
);
const palettePanel = panel({ title: 'Colors & materials' }, paletteFields);

const upload = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp',
});
const cropFields = el(
    'fieldset',
    { class: 'portrait-fieldset', hidden: true },
    el('legend', { class: 'ui-visually-hidden', text: 'Custom image crop' }),
);
const cropControls = {};
for (const [key, label, min, max, step, value] of [
    ['zoom', 'Crop zoom', 1, 3, 0.05, 1],
    ['x', 'Horizontal crop', 0, 100, 1, 50],
    ['y', 'Vertical crop', 0, 100, 1, 50],
]) {
    const range = new RangeField({
        scope,
        label,
        value,
        min,
        max,
        step,
        onChange: (value) => {
            if (recipe.mode === 'custom' && Number.isFinite(value) && value >= min && value <= max)
                edit((next) => {
                    next.crop[key] = value;
                });
        },
    });
    cropControls[key] = range;
    cropFields.append(range.element);
}
cropFields.append(
    action('Return to generated portrait', () => {
        setRecipe({ ...recipe, mode: 'generated' });
        notify('Returned to the generated character.');
    }),
);
async function checkedImage(url) {
    const image = await loadImage(url);
    if (image.width < 32 || image.height < 32 || image.width * image.height > 24_000_000)
        throw new Error('Use an image at least 32 × 32 pixels and no larger than 24 megapixels.');
    return image;
}
scope.listen(upload, 'change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    const ticket = ++operation;
    let url;
    try {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10_000_000)
            throw new Error('Choose a PNG, JPEG or WebP image under 10 MB.');
        notify('Preparing your custom portrait…');
        url = URL.createObjectURL(file);
        const image = await checkedImage(url);
        const normalized = document.createElement('canvas');
        const scale = Math.min(1, 1536 / Math.max(image.width, image.height));
        normalized.width = Math.round(image.width * scale);
        normalized.height = Math.round(image.height * scale);
        normalized.getContext('2d').drawImage(image, 0, 0, normalized.width, normalized.height);
        const data = normalized.toDataURL('image/webp', 0.9);
        const embedded = await checkedImage(data);
        if (scope.closed || ticket !== operation) return;
        setRecipe(
            {
                ...recipe,
                mode: 'custom',
                image: data,
                crop: { x: 50, y: 50, zoom: 1 },
            },
            embedded,
        );
        notify('Custom portrait ready. Adjust the crop; the image stays in your browser.');
    } catch (error) {
        if (!scope.closed && ticket === operation) notify(error.message, true);
    } finally {
        if (url) URL.revokeObjectURL(url);
        upload.value = '';
    }
});
const customPanel = panel(
    { title: 'Bring your own portrait' },
    field('Choose an image', upload, 'PNG, JPEG or WebP · up to 10 MB. Processed locally.'),
    el('p', {
        class: 'portrait-note',
        text: 'Custom artwork replaces the complete portrait. Hair and clothing controls apply to generated portraits.',
    }),
    cropFields,
);

const seed = el('input', {
    type: 'text',
    value: 'novus-portraits',
    maxlength: 100,
});
const population = select('Population mix', profiles, () => {});
const generationPalette = select('Population palette', palettes, () => {});
function generateExamples() {
    if (!ready) return;
    examples = Array.from({ length: 6 }, (_, index) =>
        generateFittedRecipe(`${seed.value}:${index}`, population.input.value, generationPalette.input.value),
    );
    exampleGrid.replaceChildren(
        ...examples.map((entry, index) => {
            const canvas = el('canvas', {
                width: 180,
                height: 211,
                'aria-hidden': 'true',
            });
            renderer.draw(canvas, entry);
            return el(
                'button',
                {
                    type: 'button',
                    class: 'portrait-example',
                    'data-example': index,
                    'aria-label': `Edit sample ${index + 1}: ${entry.name}`,
                },
                canvas,
                el('span', { text: entry.name }),
                el('small', {
                    text: `${sexFor(entry.face)} · ${fittedAsset(entry, 'clothing').role}`,
                }),
            );
        }),
    );
    notify('Six repeatable examples generated. Select one to edit.');
}
const exampleGrid = el('div', { class: 'portrait-examples' });
scope.listen(exampleGrid, 'click', (event) => {
    const button = event.target.closest('[data-example]');
    if (!button) return;
    setRecipe(examples[Number(button.dataset.example)]);
    notify('Sample loaded into the editor.');
});
const generationPanel = panel(
    { title: 'Population studies' },
    el('p', {
        class: 'portrait-note',
        text: 'Illustrative face weights test future population presets. Every face can still be selected independently.',
    }),
    el(
        'div',
        { class: 'portrait-generation-controls' },
        field('Generation seed', seed),
        population.element,
        generationPalette.element,
        action('Generate six examples', generateExamples),
    ),
    exampleGrid,
);

const comparisonModes = [
    { id: 'faces', label: 'Current parts across this pool’s faces' },
    { id: 'hair', label: 'Every hairstyle on this face' },
    { id: 'clothing', label: 'Every garment on this face' },
    { id: 'glasses', label: 'Every glasses style on this face' },
    { id: 'mustache', label: 'Every facial-hair style on this face' },
    { id: 'tie', label: 'Every compatible neckwear style' },
];
const compareMode = select('Comparison view', comparisonModes, scheduleRender);
const comparisonGrid = el('div', { class: 'portrait-comparison-grid' });
const comparisonNote = el('p', { class: 'portrait-note' });
const anchorText = el('p', { class: 'portrait-note' });
let comparisonItems = [];
let comparisonSignature = '';
const comparisonPanel = panel(
    { title: 'Fit comparison' },
    el('p', {
        class: 'portrait-note',
        text: 'Compare supported combinations in the selected pool. Each card includes a clean roster-size portrait; select a card to edit it.',
    }),
    compareMode.element,
    comparisonNote,
    comparisonGrid,
    el('details', { class: 'portrait-details' }, el('summary', { text: 'Placement landmarks' }), anchorText),
);
function renderComparison() {
    const enabled = isFitted(recipe) && recipe.mode === 'generated';
    const availableModes = comparisonModes.filter(
        (entry) => entry.id !== 'mustache' || poolFor(recipe.face).mustache.length,
    );
    const selectedMode = availableModes.some((entry) => entry.id === compareMode.input.value)
        ? compareMode.input.value
        : 'faces';
    refreshOptions(compareMode.input, availableModes, selectedMode);
    compareMode.input.disabled = !enabled;
    guidesInput.disabled = !enabled;
    const signature = enabled
        ? JSON.stringify([recipe, compareMode.input.value, guidesInput.checked])
        : 'unavailable';
    if (signature === comparisonSignature) return;
    comparisonSignature = signature;
    comparisonItems = enabled ? comparisonDefinitions(recipe, compareMode.input.value) : [];
    comparisonNote.textContent = !enabled
        ? 'Use a generated portrait with the fitted model to compare parts.'
        : comparisonItems.length
          ? `${sexFor(recipe.face) === 'female' ? 'Female' : 'Male'} pool · ${comparisonItems.length} supported combinations. Collar compatibility can remove neckwear when changing garments.`
          : 'No compatible parts in this category for this pool and garment.';
    anchorText.textContent = enabled
        ? Object.entries(faceRigs[recipe.face])
              .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
              .join(' · ')
        : '';
    comparisonGrid.replaceChildren(
        ...comparisonItems.map((item, index) => {
            const canvas = el('canvas', {
                width: 256,
                height: 300,
                'aria-hidden': true,
            });
            const roster = el('canvas', {
                width: 64,
                height: 75,
                'aria-hidden': true,
            });
            renderer.draw(canvas, item.recipe, { guides: guidesInput.checked });
            renderer.draw(roster, item.recipe);
            return el(
                'button',
                {
                    type: 'button',
                    class: 'portrait-example portrait-comparison-card',
                    'data-comparison': index,
                    'aria-label': `Edit comparison: ${item.label}`,
                },
                canvas,
                el('span', { text: item.label }),
                el(
                    'div',
                    { class: 'portrait-comparison-roster' },
                    roster,
                    el('small', { text: 'Roster size' }),
                ),
            );
        }),
    );
}
scope.listen(comparisonGrid, 'click', (event) => {
    const button = event.target.closest('[data-comparison]');
    if (button) setRecipe(comparisonItems[Number(button.dataset.comparison)].recipe);
});

function download(blob, extension) {
    const url = URL.createObjectURL(blob);
    const link = el('a', {
        href: url,
        download: `${
            recipe.name
                .trim()
                .replace(/[^a-z0-9_-]+/gi, '-')
                .slice(0, 60) || 'portrait'
        }.${extension}`,
    });
    document.body.append(link);
    link.click();
    link.remove();
    const release = scope.own(() => URL.revokeObjectURL(url));
    scope.timeout(release, 1000);
}
const exportPng = action('Export PNG', () => {
    if (!ready) return;
    const output = el('canvas', { width: 512, height: 600 });
    renderer.draw(output, recipe, { customImage });
    output.toBlob((blob) => {
        if (scope.closed) return;
        if (blob) {
            download(blob, 'png');
            notify('Complete portrait exported as PNG.');
        } else notify('The browser could not export this portrait.', true);
    }, 'image/png');
});
const exportJson = action('Export recipe', () => {
    download(new Blob([serializeRecipe(recipe)], { type: 'application/json' }), 'json');
    notify('Recipe exported with resolved asset IDs and colors. Custom images are embedded.');
});
const importInput = el('input', {
    type: 'file',
    accept: '.json,application/json',
});
async function loadRecipe(next) {
    const ticket = ++operation;
    const image = next.mode === 'custom' ? await checkedImage(next.image) : null;
    if (scope.closed || ticket !== operation) return;
    setRecipe(next, image);
    notify('Recipe restored. Its exact asset choices and colors were preserved.');
}
scope.listen(importInput, 'change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const ticket = ++operation;
    try {
        if (file.size > MAX_RECIPE_BYTES) throw new Error('Recipe file is too large.');
        const next = parseRecipe(await file.text());
        if (scope.closed || ticket !== operation) return;
        await loadRecipe(next);
    } catch (error) {
        if (!scope.closed) notify(error.message, true);
    } finally {
        importInput.value = '';
    }
});
const savedList = el('div', { class: 'portrait-saved' });
const savedEmpty = el('p', {
    class: 'portrait-note',
    text: 'Keep up to eight studies in this browser, or export a recipe to keep a portable copy.',
});
function displaySaved() {
    savedList.replaceChildren(
        ...saved.map((entry, index) =>
            el(
                'div',
                { class: 'portrait-saved-row' },
                el('button', {
                    type: 'button',
                    class: 'ui-button ui-button--quiet',
                    'data-load': index,
                    text: entry.name || 'Unnamed character',
                }),
                el('button', {
                    type: 'button',
                    class: 'ui-button ui-button--quiet',
                    'data-remove': index,
                    'aria-label': `Remove saved portrait ${index + 1}: ${entry.name}`,
                    text: 'Remove',
                }),
            ),
        ),
    );
}
function storeSaved(next) {
    // Commit only after storage succeeds, preserving the old shelf on quota failure.
    localStorage.setItem(STORAGE, JSON.stringify(next));
    saved = next;
    displaySaved();
}
const saveButton = action(
    'Save study',
    () => {
        try {
            if (storageWarning) throw new Error(storageWarning);
            if (saved.length >= 8)
                throw new Error('The shelf has eight studies. Remove one or export this recipe.');
            storeSaved([...saved, validateRecipe(recipe)]);
            notify('Study saved in this browser.');
        } catch (error) {
            notify(
                error.name === 'QuotaExceededError'
                    ? 'Browser storage is full. Export the recipe instead; existing studies were kept.'
                    : error.message,
                true,
            );
        }
    },
    'primary',
);
scope.listen(savedList, 'click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
        if (button.hasAttribute('data-load')) await loadRecipe(saved[Number(button.dataset.load)]);
        else if (button.hasAttribute('data-remove')) {
            storeSaved(saved.filter((_, index) => index !== Number(button.dataset.remove)));
            notify('Study removed from this browser shelf. Exported files are unaffected.');
        }
    } catch (error) {
        notify(error.message, true);
    }
});
const recipePanel = panel(
    { title: 'Your studies' },
    savedEmpty,
    savedList,
    el('div', { class: 'portrait-actions' }, exportJson),
    field('Import a recipe', importInput),
    el(
        'details',
        { class: 'portrait-details' },
        el('summary', { text: 'Inspect the saved recipe' }),
        recipeText,
    ),
);

function refreshOptions(input, entries, value) {
    const options = entries.length ? entries : [{ id: '', label: 'Not available' }];
    const signature = options.map((entry) => entry.id).join('|');
    if (input.dataset.options !== signature) {
        input.replaceChildren(
            ...options.map((entry) => el('option', { value: entry.id, text: entry.label })),
        );
        input.dataset.options = signature;
    }
    input.value = value ?? '';
}
function sync() {
    nameInput.value = recipe.name;
    const fitted = isFitted(recipe);
    legacyNotice.hidden = fitted;
    modularFields.hidden = !fitted;
    lensFinish.input.value = recipe.lenses?.finish ?? 'clear';
    lensColor.value = recipe.lenses?.color ?? '#7298ae';
    lensColor.disabled = !['tinted', 'mirror'].includes(recipe.lenses?.finish);
    if (fitted) {
        sexSelect.input.value = sexFor(recipe.face);
        refreshOptions(
            controls.face,
            faces.filter((face) => sexFor(face.id) === sexFor(recipe.face)),
            recipe.face,
        );
        for (const key of ['hair', 'clothing'])
            refreshOptions(controls[key], poolFor(recipe.face)[key], recipe[key]);
        for (const key of Object.keys(accessoryStyles)) {
            const options = fittedOptions(recipe, key);
            accessoryGroups[key].hidden = !options.length;
            controls[key].checked = recipe.accessories[key];
            controls[key].disabled = !options.length;
            refreshOptions(controls[`${key}-style`], options, recipe.accessoryStyles[key]);
            controls[`${key}-style`].disabled = !options.length;
        }
    }
    for (const key of ['fabric', 'accent', 'hair', 'background'])
        controls[`color-${key}`].value = recipe.colors[key];
    const custom = recipe.mode === 'custom';
    modularFields.disabled = custom;
    paletteFields.disabled = custom;
    layerView.input.disabled = custom;
    if (custom) layerView.input.value = 'all';
    cropFields.hidden = !custom;
    if (custom) for (const key of ['zoom', 'x', 'y']) cropControls[key].setValue(recipe.crop[key]);
    for (const button of hairSwatches.children)
        button.setAttribute('aria-pressed', String(button.dataset.color === recipe.colors.hair));
    const matchingPalette = palettes.find((entry) =>
        ['fabric', 'accent', 'background'].every((key) => entry[key] === recipe.colors[key]),
    );
    paletteSelect.input.value = matchingPalette?.id ?? 'custom';
}

const shuffle = action('Shuffle character', () => {
    if (!ready) return;
    const value = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
    seed.value = value;
    setRecipe(generateFittedRecipe(value, population.input.value, generationPalette.input.value));
    notify('New character generated. Its resolved recipe is ready to save.');
});
const previewPanel = panel(
    { title: 'Portrait preview', className: 'portrait-preview-panel' },
    el(
        'div',
        { class: 'portrait-preview-heading' },
        sourceLabel,
        el('span', {
            class: 'portrait-note',
            text: 'Clean digital · fitted study',
        }),
    ),
    el('div', { class: 'portrait-stage' }, portrait),
    caption,
    el(
        'div',
        { class: 'portrait-roster-preview' },
        small,
        el(
            'div',
            {},
            el('strong', { text: 'At roster size' }),
            el('p', {
                class: 'portrait-note',
                text: 'Recognizable faces, even in a cabinet or unit list.',
            }),
        ),
    ),
    el('div', { class: 'portrait-actions' }, shuffle, saveButton, exportPng),
    el(
        'details',
        { class: 'portrait-details' },
        el('summary', { text: 'Inspect the artwork layers' }),
        layerView.element,
        el('label', { class: 'portrait-guides' }, guidesInput, el('span', { text: 'Show placement guides' })),
    ),
);
root.replaceChildren(
    el(
        'header',
        { class: 'portrait-header' },
        el(
            'div',
            {},
            el('div', {
                class: 'portrait-eyebrow',
                text: 'NOVUS ORDO / DEVELOPMENT LABS',
            }),
            el('h1', { text: 'Portrait laboratory' }),
            el('p', {
                text: 'A face for every story. Mix, recolor, and keep a character.',
            }),
        ),
        el(
            'nav',
            {
                class: 'portrait-actions',
                'aria-label': 'Development laboratories',
            },
            actionLink('Map lab', '/dev-panel/map-lab', { variant: 'quiet' }),
            actionLink('Tools & experiments', '/client/tools', { variant: 'quiet' }),
        ),
    ),
    message,
    el(
        'div',
        { class: 'portrait-workspace' },
        el(
            'aside',
            { class: 'portrait-stack', 'aria-label': 'Character controls' },
            identityPanel,
            palettePanel,
        ),
        previewPanel,
        el(
            'aside',
            {
                class: 'portrait-stack',
                'aria-label': 'Custom portraits and saved studies',
            },
            customPanel,
            recipePanel,
        ),
    ),
    comparisonPanel,
    generationPanel,
    el(
        'footer',
        { class: 'portrait-footer' },
        el('span', {
            text: 'Collection 03 · 18 faces / 12 hairstyles + bald / 18 garments / 21 accessory designs · separate fitted pools',
        }),
        el('span', {
            text: 'Local studies only · no game characters are changed',
        }),
    ),
);
sync();
scope.own(() => {
    cancelAnimationFrame(frame);
    operation++;
    renderer.dispose();
});
scope.listen(window, 'pagehide', (event) => {
    if (!event.persisted) void scope.dispose();
});
try {
    const stored = localStorage.getItem(STORAGE);
    if (stored) {
        const entries = JSON.parse(stored);
        if (!Array.isArray(entries) || entries.length > 8) throw new Error('Invalid saved shelf.');
        saved = entries.map(validateRecipe);
        displaySaved();
    }
} catch {
    storageWarning =
        'Saved studies could not be read. Existing storage was kept; use recipe import/export in this session.';
    saveButton.disabled = true;
    notify(storageWarning, true);
}
renderer
    .ready()
    .then(() => {
        if (scope.closed) {
            renderer.dispose();
            return;
        }
        ready = true;
        render();
        generateExamples();
        notify(
            storageWarning ||
                'Painted library ready. Start with a face, then try hair, clothing, and colors.',
            Boolean(storageWarning),
        );
    })
    .catch((error) => {
        if (!scope.closed) notify(`${error.message} Reload to try loading the library again.`, true);
    });
