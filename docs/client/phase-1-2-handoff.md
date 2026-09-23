# Phases 1–2 — implementation handoff

Date: 2026-09-19

Status: Implemented and available for read-only preview. Not a full gameplay replacement or a cross-browser release candidate.

## Try it

Open **`/client` on the existing Novus Ordo host (port 8788)** while signed in. There are also “new world interface” links in the developer panel, dashboard and nation-creation page. Existing login redirects and default `/` remain unchanged.

- Drag the map to pan; scroll/pinch to zoom around the pointer/gesture; use Fit world to reset.
- Select a territory on the map or search the directory. Keyboard users can select directory buttons; canvas arrows pan, +/− zoom and Home fits the world.
- Use Map layers to control visible information. Territory names appear at a useful zoom level.
- Inspect public facts, production and nation identity; owner-only information appears for your own territory. Open a separate inspector to test the same feature in a dialog, with independent expansion/scroll state.
- At narrow widths the inspector becomes a sheet without reloading its feature. Close button, Escape, and a downward header swipe dismiss it; dialog focus uses native modal behavior.
- Map camera/layer preferences are saved per user/game with a schema version. Orders, reports and private data are not persisted.
- Refresh rereads server data. No mutation controls are implemented here. Use the legacy interface for gameplay and complete nation creation.

The observed live game was game 2 / turn 1, 600 territories (317 non-water), with no nations. Owner-specific browser verification therefore used synthetic fixtures rather than creating live test nations.

## Source boundaries

`resources/js/client/main.js` assembles the generated API + fetch transport, WorldService, SavedState and GameShell. The explicit feature registry lazy-loads World immediately and Territory only on first inspection.

- `runtime/`: Scope, Instance, Component, Host, FeatureLoader, explicit traits and scoped notifications. Instances have distinct runtime and feature identities. Hosts use accepted-operation generations plus intent tokens so denied close guards do not accidentally retire an initializing instance.
- `api/`: deterministic generated definitions, generic endpoint invocation, structured errors and fetch transport. No UI dependencies, jQuery, caller-payload mutation or implicit command retry.
- `services/`: immutable server snapshots/coherence checks versus harmless saved UI state.
- `app/`, `ui/`: shell, allowlisted hash router, adaptive host chrome, focused native dialog, safe DOM/text helpers.
- `features/world/`: camera, renderer, layers, picking, gesture controller and workspace composition.
- `features/territory/`: one reusable inspector; no device branching.
- `styles/`: SCSS modules and shared semantic CSS variables. Features keep local styles.

No React, TypeScript, JSX, virtual DOM, global game-state bus, or Sproutflix Core import.

## Build and checks

Use Node 22.23.2 on this host (`/home/chad/.nvm/versions/node/v22.23.2/bin` must be on PATH) and PHP 8.3:

```sh
npm ci
npm run generate:client
npm run check:client
npm run test:client
npm run test:client:php
npm run build
npm run test:client:browser
```

`npm run format:client` formats only the new JS/SCSS and JS tests, excluding generated definitions. Browser tests default to installed `/opt/google/chrome/chrome`; override `CLIENT_BROWSER_PATH` for another compatible Chromium executable.

Optional **explicitly read-only** real-data verification:

```sh
php8.3 tests/client/live-read-smoke.php --read-only-live
```

Evidence:

- 27 individual Node contract tests: 13 API/transport, 8 lifecycle/host/trait/loading, 4 world-service and 2 camera/saved-state tests. All pass. The Node process-isolated runner in this environment summarizes at file level; direct test-file runs also verified individual subtests.
- PHP contract check passes: deterministic route coverage, multiple placeholders, no generated private/dev data, legacy output compatibility, authenticated route, escaped Blade bootstrap and no-store headers. No DB connection permitted in this test.
- Ten Chrome browser journeys pass against production chunks: lazy loading, independent inspectors, responsive state retention, rapid/closed selections, navigation/preferences, session/upkeep recovery, image failure fallback, stable owned-resource counts, high-DPI picking, emulated touch gestures, canvas theme updates and the no-nation onboarding handoff.
- Live controller smoke passes: current game/readiness/setup, all base/turn territories, one land-territory detail and rendered client HTML. Non-read SQL blocked. HTTP guest checks confirm both `/client` and `/dashboard` redirect to login. The new production JS/CSS and unchanged legacy map script all return HTTP 200. Final game identity remained game 2 / turn 1.
- Production build passes. Approximate gzip sizes: shell JS 7.6 KB, World JS 4.9 KB, inspector JS 1.1 KB, shared component JS 0.6 KB; shell/World/inspector CSS about 1.9/1.2/0.5 KB. These exclude map images/data and are not a measured startup-time guarantee.
- Browser screenshots in `test-results/client/` are fixture demonstrations, not live nation data.

## Deployment and fallback

The new Vite entry is added beside the two existing entries. Build retains old hashed assets (`emptyOutDir: false`) to protect already-open tabs. Laravel routes were recached after adding the entry/read-route names. No server restart, PHP upgrade, scheduler change or database migration was needed.

This source tree is not a Git checkout. Before edits, source/docs/package lock and existing build were archived. A private copy is retained at `storage/app/client-backups/pre-phase-1-2-source-and-build.tar.gz`; it excludes `.env`, database, vendor and node_modules. It is a scoped source/build recovery point, **not** a complete server backup.

Immediate fallback is the unchanged default legacy entry. Do not run destructive archive extraction over newer user edits. For a source rollback, compare the saved archive with current changes, restore only authorized affected files and recache routes/rebuild coherently. Asset pruning and release-retention automation remain Phase 5 work.

## Known limits and next decision

- Tested browser: installed Linux Google Chrome **127.0.6533.88**, desktop plus narrow/high-DPI/touch emulation. Firefox, Safari, current-version browsers, real phones, assistive technology and virtual keyboards have not been verified. Emulation is not real-device evidence.
- This is the first read-only World slice. Full Nation/Economy/News views, military/orders/deployments, diplomacy/forum and historical-game mechanics are not implemented.
- Snapshot checks detect observed game/turn/session changes, not atomicity across separate requests or all same-turn edits. See integration contracts.
- Map still uses the existing raster assets/grid. Ownership currently distinguishes your nation versus other nations, not a full nation-color palette. Names intentionally require zoom. No map engine or new art was introduced.
- Resource diagnostics count owned scopes/cleanup resources, not heap bytes; they are useful regression checks, not proof of zero memory leaks.
- Session expiry offers re-login; existing login destinations are retained. Use the preview link again after login.
- A real authenticated HTTP/browser end-to-end session should be checked by the user; the automated real-data smoke used in-process auth with no persistent session. Full legacy gameplay regression awaits isolated game data and later phases.

Next: review the concrete interface together before authorizing command workflows. No Phase 3 implementation or default-client cutover is implied.
