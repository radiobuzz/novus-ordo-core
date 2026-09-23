import './styles/main.scss';
import { GameApplication } from './app/GameApplication.js';
import { Scope } from './runtime/Scope.js';
const boot = JSON.parse(document.getElementById('client-boot').textContent);
const app = new GameApplication(document.getElementById('client-root'), boot);
void app.start();
Object.defineProperty(window, 'novusClientDiagnostics', {
    value: () => Scope.diagnostics(),
    configurable: true,
});
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
