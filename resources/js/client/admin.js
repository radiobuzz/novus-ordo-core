import './styles/admin.scss';
import { AdminApp } from './app/AdminApp.js';
const app = new AdminApp(
    document.getElementById('admin-root'),
    JSON.parse(document.getElementById('admin-boot').textContent),
);
void app.start();
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
