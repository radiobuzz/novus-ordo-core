import './styles/ui-foundations.scss';
import { el } from './ui/dom.js';
import { Button, actionLink } from './ui/Button.js';
import { panel } from './ui/Panel.js';
import { StatusBadge } from './ui/StatusBadge.js';
import { MetricCard, cardStrip } from './ui/MetricCard.js';
import { FieldShell } from './ui/FieldShell.js';
import { RangeField } from './ui/RangeField.js';
import { Tooltip } from './ui/Tooltip.js';
import { CompactMessage } from './ui/CompactMessage.js';
import { confirmDialog } from './ui/ConfirmDialog.js';
import { dataTable } from './ui/DataTable.js';
import { Scope } from './runtime/Scope.js';
import { ImageChoice } from './ui/ImageChoice.js';
import { unitVisual } from './ui/unitVisuals.js';

// This entry imports no API/services/game data. All interactions are local samples.
const scope = new Scope();
const helpSample = new Tooltip({
    scope,
    label: 'Help: production example',
    text: 'Optional instructions appear here. Hover, focus or tap the question mark; Escape dismisses this help.',
});
const errorSample = new CompactMessage(scope, { role: 'note' });
errorSample.show(
    'Insufficient Ore.',
    'Insufficient Ore. This synthetic example needs 5 Ore, but only 2 are available. No game command was sent.',
);
const root = document.getElementById('ui-foundations-root');
const log = el('p', {
    class: 'gallery-log',
    role: 'status',
    text: 'Synthetic samples only. No game commands.',
});
const locale = el(
    'select',
    { id: 'gallery-language' },
    el('option', { value: 'en', text: 'English' }),
    el('option', { value: 'fr', text: 'Français' }),
);
const theme = new Button({ label: 'Try alternate accent', variant: 'quiet' });
let alternate = false;
scope.listen(theme.element, 'click', () => {
    alternate = !alternate;
    document.documentElement.style.setProperty('--accent', alternate ? '#addde0' : '#d6ba80');
    document.documentElement.style.setProperty('--command-start', alternate ? '#c5ebed' : '#e7ce9a');
    document.documentElement.style.setProperty('--command-end', alternate ? '#81b7bb' : '#c2a56c');
    theme.element.setAttribute('aria-pressed', String(alternate));
});
theme.element.setAttribute('aria-pressed', 'false');
const header = el(
    'header',
    { class: 'gallery-header' },
    el(
        'div',
        {},
        el('div', { class: 'gallery-brand', text: '◇ NOVUS ORDO / UI FOUNDATIONS' }),
        el('h1', { text: 'Shared blocks. One game identity.' }),
        el('p', {
            class: 'gallery-note',
            text: 'Development gallery · F1/F2 · real components, synthetic values',
        }),
    ),
    el(
        'div',
        { class: 'gallery-toolbar' },
        actionLink('Tools & experiments', '/client/tools', { variant: 'quiet' }),
        new FieldShell({ control: locale, label: 'Sample language' }).element,
        theme.element,
    ),
);
const buttons = ['primary', 'secondary', 'quiet', 'danger'].map(
    (variant) =>
        new Button({
            label: {
                primary: 'Primary command',
                secondary: 'Secondary action',
                quiet: 'Quiet action',
                danger: 'Danger action',
            }[variant],
            variant,
        }),
);
for (const control of buttons)
    scope.listen(control.element, 'click', () => {
        log.textContent = `${control.element.textContent}: local demonstration only.`;
    });
const disabled = new Button({ label: 'Unavailable', disabled: true });
const pending = new Button({ label: 'Pending sample' });
pending.setPending(true);
const toggle = new Button({ label: 'Toggle selected state', variant: 'quiet' });
toggle.element.setAttribute('aria-pressed', 'false');
scope.listen(toggle.element, 'click', () =>
    toggle.element.setAttribute(
        'aria-pressed',
        String(toggle.element.getAttribute('aria-pressed') !== 'true'),
    ),
);
const tones = ['neutral', 'accent', 'ready', 'warning', 'danger'];
const badges = tones.map(
    (tone) =>
        new StatusBadge({
            label: {
                neutral: 'Not started',
                accent: 'Selected',
                ready: 'Ready',
                warning: 'Waiting',
                danger: 'Action required',
            }[tone],
            tone,
        }),
);
const metric = new MetricCard({ label: 'Current turn', value: 24, detail: 'Synthetic example' });
const metrics = cardStrip(
    'Example status strip',
    metric,
    new MetricCard({
        label: 'Nations ready',
        value: '6 / 8',
        detail: 'Readiness is not a loading percentage',
    }),
    new MetricCard({ label: 'Pending orders', value: 0, detail: 'Zero is a valid value' }),
    new MetricCard({ label: 'Unavailable value', value: null, detail: 'Unknown is not zero' }),
);
const name = new FieldShell({
    control: el('input', { id: 'sample-name', required: true, value: 'Archipelago', autocomplete: 'off' }),
    label: 'World name',
    help: 'A local example; nothing is saved.',
});
const quantity = new FieldShell({
    control: el('input', {
        id: 'sample-quantity',
        type: 'number',
        min: 0,
        max: 10,
        step: 1,
        value: 4,
        required: true,
    }),
    label: 'Quantity',
    help: 'Whole units, from 0 to 10.',
});
const invalid = new FieldShell({
    control: el('input', { id: 'sample-invalid', value: '11' }),
    label: 'Validation example',
    help: 'Help and error can coexist.',
});
invalid.setError('Choose a value between 0 and 10.');
const readOnly = new FieldShell({
    control: el('input', { id: 'sample-readonly', value: 'Game #14', readonly: true }),
    label: 'Read-only identity',
    help: 'Readable and focusable; not editable.',
});
const unavailable = new FieldShell({
    control: el('input', { id: 'sample-disabled', value: 'Unavailable', disabled: true }),
    label: 'Disabled control',
});
const option = new FieldShell({
    control: el(
        'select',
        { id: 'sample-choice' },
        el('option', { text: 'World overview' }),
        el('option', { text: 'Military overview' }),
    ),
    label: 'Native selection',
});
const checkbox = new FieldShell({
    control: el('input', { type: 'checkbox', id: 'sample-checkbox' }),
    label: 'Show territory names',
});
const save = new Button({ label: 'Simulate local save', variant: 'primary', type: 'submit' });
const form = el(
    'form',
    { class: 'gallery-form' },
    el('div', { class: 'gallery-fields' }, name.element, quantity.element, option.element, checkbox.element),
    save.element,
);
let completed = 0;
scope.listen(form, 'submit', (event) => {
    event.preventDefault();
    if (save.pending) return;
    save.setPending(true);
    scope.timeout(() => {
        save.setPending(false);
        completed++;
        log.textContent = `Local sample completed ${completed} time(s). No request sent.`;
        metric.update({ value: 24, detail: `${completed} local demonstration(s)` });
    }, 700);
});
const sampleA = new FieldShell({
    control: el('input', { value: 'First instance' }),
    label: 'Independent field A',
});
const sampleB = new FieldShell({
    control: el('input', { value: 'Second instance' }),
    label: 'Independent field B',
});
const swap = new Button({ label: 'Mount temporary control', variant: 'quiet' });
const temporary = el('div');
let child;
scope.listen(swap.element, 'click', async () => {
    if (child) {
        await child.dispose();
        child = null;
        temporary.replaceChildren();
        swap.setLabel('Mount temporary control');
        return;
    }
    child = new Scope();
    const control = new Button({ label: 'Temporary action' });
    child.listen(control.element, 'click', () => {
        log.textContent = 'Temporary scope owns this listener.';
    });
    temporary.replaceChildren(control.element);
    swap.setLabel('Unmount temporary control');
});
scope.own(() => child?.dispose());
const language = () => {
    const fr = locale.value === 'fr';
    document.documentElement.lang = fr ? 'fr' : 'en';
    name.label.textContent = fr ? 'Nom complet du monde expérimental' : 'World name';
    name.setHelp(
        fr
            ? 'Exemple local : aucune donnée de partie ne sera enregistrée.'
            : 'A local example; nothing is saved.',
    );
    quantity.label.textContent = fr ? 'Quantité demandée' : 'Quantity';
    quantity.setHelp(fr ? 'Unités entières, de 0 à 10.' : 'Whole units, from 0 to 10.');
    save.setLabel(fr ? 'Simuler un enregistrement local' : 'Simulate local save');
};
scope.listen(locale, 'change', language);
const range = new RangeField({
    scope,
    label: 'Sample range',
    value: 50,
    min: 0,
    max: 100,
    unit: '%',
    onChange: (value) => {
        log.textContent = `Local preview: ${value}%. No command sent.`;
    },
});
const confirmSample = new Button({ label: 'Try confirmation dialog' });
scope.listen(confirmSample.element, 'click', async () => {
    const accepted = await confirmDialog(scope, {
        title: 'Confirm a local sample?',
        message: 'Synthetic game #42, turn 7. This demonstration never changes a game.',
        confirmLabel: 'Confirm sample',
    });
    log.textContent = accepted ? 'Local sample confirmed. No request sent.' : 'Local sample cancelled.';
});
const imageChoices = ['Infantry', 'Armored', 'Fighter'].map(
    (type, index) =>
        new ImageChoice({
            label: `Sample ${type}`,
            image: unitVisual(type),
            detail: index === 2 ? 'Unavailable sample — inspectable' : 'Synthetic choice',
            selected: index === 0,
            unavailable: index === 2,
        }),
);
imageChoices[1].setBadges([
    { text: '4', label: '4 available in this synthetic example' },
    { text: '◇ 2', label: '2 selected in this synthetic example' },
]);
for (const choice of imageChoices)
    scope.listen(choice.element, 'click', () => {
        for (const item of imageChoices) item.setSelected(item === choice);
        log.textContent = 'Local image selection only. No command sent.';
    });
root.append(
    header,
    el(
        'div',
        { class: 'gallery-sections' },
        metrics,
        panel(
            { title: 'Buttons & action states', tone: 'accent' },
            el(
                'div',
                { class: 'gallery-row' },
                ...buttons.map((b) => b.element),
                disabled.element,
                pending.element,
                toggle.element,
                actionLink('Jump to fields', '#fields', { variant: 'quiet' }),
            ),
            log,
        ),
        panel(
            { title: 'Status vocabulary' },
            el('div', { class: 'gallery-row' }, ...badges.map((b) => b.element)),
        ),
        el(
            'div',
            { class: 'gallery-grid' },
            panel(
                {
                    title: 'Operational panel',
                    tone: 'accent',
                    headingLevel: 2,
                    footer: 'Footer content is composed by its feature.',
                },
                el('p', { text: 'Shared heading, surface, spacing and command accent.' }),
            ),
            panel(
                { title: 'Attention required', tone: 'danger' },
                el('p', { text: 'Color reinforces the message. It never replaces it.' }),
            ),
            panel(
                { title: 'Atmospheric surface', surface: 'glass', tone: 'accent' },
                el('p', { text: 'The entry glass panel uses this same foundation.' }),
            ),
        ),
        Object.assign(
            panel(
                { title: 'Form fields & native controls' },
                form,
                el(
                    'div',
                    { class: 'gallery-fields gallery-samples' },
                    invalid.element,
                    readOnly.element,
                    unavailable.element,
                ),
            ),
            { id: 'fields' },
        ),
        panel(
            {
                title: 'Independent instances & lifecycle',
                footer: el('div', { class: 'gallery-row' }, swap.element, temporary),
            },
            el('div', { class: 'gallery-fields' }, sampleA.element, sampleB.element),
        ),
        panel(
            { title: 'Controls introduced with administration' },
            range.element,
            confirmSample.element,
            dataTable(
                'Sample operations',
                ['Target', 'State'],
                [
                    ['Synthetic game #42', 'No command sent'],
                    ['Saved map example', 'No real data'],
                ],
            ),
        ),
        panel(
            { title: 'Planned, not implemented' },
            el('p', {
                text: 'Progress/meters and mini charts will arrive with real features. This gallery does not pretend those controls exist.',
            }),
        ),
        panel({ title: 'Contextual help and short errors' }, helpSample.element, errorSample.element),
        panel(
            { title: 'Selectable image choices' },
            el(
                'div',
                { class: 'gallery-image-choices' },
                imageChoices.map((choice) => choice.element),
            ),
        ),
    ),
    el('footer', {
        class: 'gallery-footer',
        text: 'Shared semantic CSS variables · Native controls · Owned interactions · No game data or commands',
    }),
);
Object.defineProperty(window, 'novusFoundationDiagnostics', {
    value: () => Scope.diagnostics(),
    configurable: true,
});
if (import.meta.hot)
    import.meta.hot.dispose(async () => {
        await scope.dispose();
        delete window.novusFoundationDiagnostics;
    });
