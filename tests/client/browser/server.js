// Test-only fixture host. Never installs routes in Laravel or touches its database.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixtures } from '../fixtures.js';
const root = process.cwd();
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1:8791');
        if (url.pathname === '/client/map-generation') {
            const manifest = JSON.parse(await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'));
            const entry = manifest['resources/js/client/map-generation.js'];
            const css = new Set();
            const collect = (part) => { for(const file of part.css??[])css.add(file);for(const key of part.imports??[])collect(manifest[key]); };collect(entry);
            const boot = { csrfToken:'fixture-only', startUrl:'/fixture-no-mutations', worldUrl:'/client', mapLimits:{maxCells:80000} };
            res.setHeader('Content-Type','text/html');
            res.end(`<!doctype html><html lang="${url.searchParams.get('lang')==='fr'?'fr':'en'}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${[...css].map((file)=>`<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="map-generation-page"><main id="map-generation-root"></main><script id="map-generation-boot" type="application/json">${JSON.stringify(boot)}</script><script type="module" src="/build/${entry.file}"></script></body></html>`);
            return;
        }
        if (url.pathname === '/client/entry') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/client/entry.js'];
            const boot = {
                gameId: Number(url.searchParams.get('game_id')) || null,
                userId: null,
                baseUrl: 'http://127.0.0.1:8791',
                csrfToken: 'fixture-only',
                urls: {
                    entry: '/client/entry',
                    client: '/client',
                    login: '/client/entry',
                    admin: null,
                },
                assets: {
                    background: '/res/bundled/entry/2026-09-26-static.png',
                    backgroundSlides: [
                        '2026-09-26-01-0a.png',
                        '2026-09-26-02-0b.png',
                        '2026-09-26-03-1.png',
                        '2026-09-26-04-2.png',
                        '2026-09-26-05-3.png',
                        '2026-09-26-06-4.png',
                        '2026-09-26-07-5.png',
                        '2026-09-26-08-6.png',
                    ].map((file) => `/res/bundled/entry/${file}`),
                    soundtrack: '/res/bundled/entry/intro.mp3',
                },
            };
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="no-entry"><div id="entry-root"></div><script id="entry-boot" type="application/json">${JSON.stringify(boot)}</script><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (url.pathname === '/client/admin') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/client/admin.js'];
            const boot = {
                destinations: [
                    { id: 'games', url: '/client' },
                    { id: 'admin', url: '/client/admin' },
                    { id: 'tools', url: '/client/tools' },
                ],
                baseUrl: 'http://127.0.0.1:8791',
                csrfToken: 'fixture-only',
                userId: 1,
                userName: 'fixture-admin',
                canCreateMaps: true,
                apiUrl: '/client/admin/api/games',
                canMaintainWorlds: true,
                urls: { logout: '/logout', tools: '/client/tools', client: '/client', lab: '/map-lab' },
            };
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="no-admin"><main id="admin-root"></main><script id="admin-boot" type="application/json">${JSON.stringify(boot)}</script><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (req.method !== 'GET') {
            res.writeHead(405);
            res.end('Fixture tests are read-only');
            return;
        }
        if (url.pathname === '/dev-panel/ui-foundations') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/client/ui-foundations.js'];
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="ui-gallery-page"><main id="ui-foundations-root"></main><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (url.pathname === '/dev-panel/economy-lab') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/economy-lab/main.js'];
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="economy-lab-page"><main id="economy-lab-root"></main><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (url.pathname === '/dev-panel/identity-lab') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/identity-lab/main.js'];
            const styles = new Set();
            const collectStyles = (asset) => {
                for (const file of asset.css ?? []) styles.add(file);
                for (const key of asset.imports ?? []) collectStyles(manifest[key]);
            };
            collectStyles(entry);
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">${[...styles].map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="identity-lab-page"><main id="identity-lab-root"></main><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (url.pathname === '/dev-panel/portrait-lab') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/portrait-lab/main.js'];
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="portrait-lab-page"><main id="portrait-lab-root"></main><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (url.pathname === '/map-lab') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/map-lab/main.js'];
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Map lab fixture</title>${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="map-lab-page"><main id="map-lab-root"></main><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        if (url.pathname === '/client') {
            const manifest = JSON.parse(
                await readFile(path.join(root, 'public/build/manifest.json'), 'utf8'),
            );
            const entry = manifest['resources/js/client/main.js'];
            const boot = {
                gameId: Number(url.searchParams.get('game_id')) || null,
                userId: 1,
                userName: 'fixture-player',
                baseUrl: 'http://127.0.0.1:8791',
                csrfToken: 'fixture-only',
                urls: {
                    setup: '/client/entry',
                    login: '/client/entry',
                    logout: '/logout',
                },
            };
            res.setHeader('Content-Type', 'text/html');
            res.end(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Novus Ordo fixture</title><link rel="icon" type="image/svg+xml" href="/res/bundled/novus-icon.svg">${entry.css.map((file) => `<link rel="stylesheet" href="/build/${file}">`).join('')}</head><body class="no-client"><div id="client-root"></div><script id="client-boot" type="application/json">${JSON.stringify(boot)}</script><script type="module" src="/build/${entry.file}"></script></body></html>`,
            );
            return;
        }
        const data = fixtures(url.pathname);
        if (data) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return;
        }
        if (url.pathname.startsWith('/build/') || url.pathname.startsWith('/res/bundled/')) {
            const file = path.resolve(root, 'public', `.${url.pathname}`);
            if (!file.startsWith(path.join(root, 'public') + '/')) throw new Error('Bad path');
            const content = await readFile(file);
            const types = {
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.png': 'image/png',
                '.svg': 'image/svg+xml',
                '.json': 'application/json',
                '.mp3': 'audio/mpeg',
            };
            res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
            res.end(content);
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    } catch {
        res.writeHead(500);
        res.end('Fixture host failed');
    }
});
server.listen(8791, '127.0.0.1');
