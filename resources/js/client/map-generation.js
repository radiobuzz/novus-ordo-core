import { Scope } from './runtime/Scope.js';
import { MapStudio } from './features/map-generation/MapStudio.js';
import { Button, actionLink } from './ui/Button.js';
import { el } from './ui/dom.js';
import { createTransport } from './api/createTransport.js';
import './styles/map-generation.scss';
import { aiSetupFields } from './experimental-ai/setup.js';

const boot = JSON.parse(document.getElementById('map-generation-boot').textContent);
const root = document.getElementById('map-generation-root');
const scope = new Scope();
const transport = createTransport({ baseUrl: location.origin, csrfToken: boot.csrfToken });
const start = new Button({ label: 'Start new game with this map', variant: 'primary', disabled: true });
const message = el('p', { role: 'status' });
const ai = aiSetupFields(scope);
const studio = new MapStudio({ scope, onChange: () => start.setDisabled(!studio.snapshot) });
studio.message.classList.add('generation-summary');
root.replaceChildren(
    el(
        'div',
        { class: 'generation-shell' },
        el(
            'header',
            {},
            el('h1', { text: 'Shape the next world' }),
            actionLink('Return to game', boot.worldUrl, { variant: 'quiet' }),
        ),
        studio.element,
        el('aside', {}, ai.element, start.element, message),
    ),
);
scope.listen(start.element, 'click', async () => {
    const snapshot = studio.snapshot;
    if (!snapshot) return;
    if (!window.confirm('Start a new game with this map? Existing games remain active.')) return;
    studio.setBusy(true);
    start.setPending(true);
    message.textContent = 'Saving the exact map and creating the game…';
    try {
        const result = await transport({
            method: 'POST',
            path: new URL(boot.startUrl, location.origin).pathname,
            body: { map: snapshot, ai: ai.value() },
        });
        window.location.assign(result.url);
    } catch (error) {
        message.textContent = error.uncertain
            ? 'The result is uncertain. Check the game list before retrying.'
            : Object.values(error.fields ?? {})
                  .flat()
                  .join(' ') || error.message;
        studio.setBusy(false);
        start.setPending(false);
    }
});
scope.listen(window, 'pagehide', () => void scope.dispose());
if (import.meta.hot) import.meta.hot.dispose(() => scope.dispose());
void studio.generate();
