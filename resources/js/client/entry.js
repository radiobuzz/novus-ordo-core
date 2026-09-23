import './styles/entry.scss';
import { Scope } from './runtime/Scope.js';
import { SavedState } from './services/SavedState.js';
import { LocalizationService } from './services/LocalizationService.js';
import { AudioService } from './services/AudioService.js';
import { SessionService } from './services/SessionService.js';
import { NationSetupService } from './services/NationSetupService.js';
import { createTransport } from './api/createTransport.js';
import { createEndpointClient } from './api/createEndpointClient.js';
import { endpoints } from './api/generated.js';
import { EntryShell } from './app/EntryShell.js';
import { EntryProcess } from './app/EntryProcess.js';

const boot = JSON.parse(document.getElementById('entry-boot').textContent);
const scope = new Scope();
let storage;
try {
    storage = localStorage;
} catch {
    /* Preferences are optional. */
}
const preferences = new SavedState(storage, 'device');
const i18n = new LocalizationService(preferences);
const session = new SessionService(boot);
const api = createEndpointClient(
    endpoints,
    createTransport({
        ...boot,
        getGameId: () => boot.gameId,
        getCsrfToken: () => boot.csrfToken,
        getLocale: () => i18n.locale,
    }),
);
session.api = api;
const audio = new AudioService(boot.assets.soundtrack, preferences);
const services = { boot, i18n, session, audio, setup: new NationSetupService(api) };
const entry = new EntryProcess(services);
services.entry = entry;
const shell = new EntryShell(document.getElementById('entry-root'), services);
scope.own(() => audio.dispose());
scope.own(() => entry.dispose());
scope.own(() => shell.dispose());
scope.listen(document, 'pointerdown', (event) => {
    if (!document.hidden && !event.target.closest('.music-controls')) void audio.play();
});
scope.listen(document, 'keydown', (event) => {
    if (!document.hidden && !event.target.closest('.music-controls')) void audio.play();
});
scope.listen(document, 'visibilitychange', () => {
    if (document.hidden) audio.pause();
    else void audio.play();
});
scope.listen(window, 'pagehide', () => audio.pause());
void entry.start(shell);
if (import.meta.hot) import.meta.hot.dispose(() => scope.dispose());
