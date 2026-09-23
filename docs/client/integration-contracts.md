# Phase 1–2 integration contracts

**2026-09-22 update:** [Multi-game stage 1](multi-game-plan.md) supersedes the single-active-game and replacement behavior described below. Creation preserves existing active games; player requests select their game explicitly; administration returns `active_game_ids`. Earlier verification remains historical.

Verified 2026-09-19 by local controller/read-model inspection, isolated contracts/browser fixtures, and an opt-in read-only real-data smoke check.

## Entry and build

- `/client` uses the existing `auth` middleware, not the developer SPA or a new auth system. Unauthenticated HTTP requests redirect to `/login`.
- `ClientController` embeds only current user ID/name, CSRF, server-derived URLs and the two map image URLs. JSON uses HTML-safe escaping and the HTML response is `private, no-store`.
- Existing successful-login redirects remain unchanged. Preview links in the developer panel, dashboard and nation-creation page let users reach the client after login.
- The current no-nation case can browse the world and links to the existing full nation-creation form. No onboarding fields/uploads were replaced.
- Added names to existing GET `/game` and `/nations/{nationId}`; URLs, permissions and response bodies are unchanged. No schema or rules changes.
- `JavascriptClientServicesGenerator::generateModule()` is a separate output mode. It emits 33 named player endpoints plus the server's map dimensions, no users/state/tokens or developer routes. Legacy `generateClientService()` remains unchanged.
- Generated module is source-controlled/release source at `resources/js/client/api/generated.js` (this installation has no Git checkout). `npm run generate:client` regenerates; `npm run check:client` detects drift. Both deliberately bypass the active route cache via a reserved, nonexistent project-local cache path. Never populate `bootstrap/cache/client-source-routes.php`.
- All ESM calls take an options object `{ params, query, body, signal }`. `getAssetInfo({params:{encodedUri: rawUri}})` double-encodes a **raw** URI. Legacy callers still double-encode themselves. GET collection wrappers are preserved by transport and unwrapped explicitly by services.

## First-slice read contracts

| Read | Actual response/use |
| --- | --- |
| `/game` | `{game_id, turn_number}`; public current game identity |
| `/game/ready-status` | `turn_number`, `is_game_ready`, nation count, ready nation IDs, expiration; public, current turn |
| `/user` | Authenticated `{user_name}`; compared with boot identity on each marker check |
| `/user/nation-setup-status` | Authenticated `{game_id, nation_id, nation_setup_status}`; nullable nation ID; avoids owner-only reads before setup |
| `/territories/base-infos` | `{data: [...]}`; ID/name, integer grid x/y, terrain, usable ratio, sea access, connections and base demographic stats |
| `/territories/turn-infos?turn_number=N` | `{data: [...]}`; ID/turn/owner, demographic stats, production and loyalties. These are public by the existing backend's design |
| `/nation/territories/turn-infos?turn_number=N` | Authenticated, requires a nation; `{data: [...]}` with `territory_id`, `can_deploy`, owner-only stats. Annotation understates this owner-specific shape; service uses actual body |
| `/territories/{id}/turn-info?turn_number=N` | Single public turn-info object, not wrapped |
| `/nations/{id}` | Single public nation: ID/turn/usual and formal names/flag/stats; current turn only. Inspector compares returned turn with snapshot |

Statistics use `{title,value,unit}`. Unknown population must render **Unknown**, not a misleading zero. Production has resource names as keys. Foreign inspections do not receive another nation's owner fields. Private owner fields remain in memory only.

## Coherence and polling

The service loads game/readiness/user/setup markers, then territory data, then verifies markers again. Explicit turn queries and returned territory/nation turn checks reject known mixed-turn data. Snapshot loading retries a changed turn at most once. An inspector additionally verifies markers before returning details. Session, upkeep or stale-state errors invalidate the active snapshot and close inspectors.

Polling is once per 30 seconds, serial, skipped while hidden, with an immediate check on visibility return. It checks identity/readiness; a changed turn/game/nation triggers a full refresh. The Refresh button can explicitly replace an in-flight load; its previous request is aborted and generation-guarded. No command retries exist.

**Limit:** separate HTTP reads are not an atomic server snapshot. Same-turn changes not reflected in the marker need explicit refresh. A future version/revision endpoint could strengthen this, but no new data contract was invented for this slice. The public readiness response has no game ID, so it is paired with `/game` and setup identity. `/user` has no numeric ID, so the unique username is the available session-change check.

## Map audit and implementation

The current world is a 30×20 rectangular grid, 30×20 logical pixels per tile, 900×400 logical pixels total. Existing terrain/detail PNGs are drawn into that space. Picking uses inverse camera transforms plus a coordinate-indexed map, not geographic polygons. This reflects the current game, not a commitment to future geometry.

The old MapDisplay bound unmanaged handlers in its constructor, depended on globals/hidden images and used fixed canvas coordinates. It was **not** wrapped or modified. New code separately implements Camera, CanvasRenderer, layer descriptors, MapPicker, MapInteractions and the WorldWorkspace. Image readiness/errors, frame scheduling, ResizeObserver, DPR resizing and event cleanup are explicit.

World survey is the only current mode; browse/select is its tool. Layers are terrain, ownership (your/other nations), borders, existing map detail, optional zoom-dependent names, and selection. No pretend military/economic modes or future resources were added. Terrain art remains the existing bright raster artwork inside a dark shell; art replacement is deferred.

## Toolchain and test isolation

Verified runtime: PHP 8.3, Node 22.23.2, locked Vite 7.3.6. Added pinned Sass 1.93.3, Playwright test 1.56.1 and Prettier 3.6.2. No major build-tool upgrade or Composer install.

This production install has no PHPUnit binary and no SQLite driver. Therefore PHP contracts use the installed Laravel runtime with a deliberately invalid DB connection and in-memory sessions. Browser tests run a separate localhost fixture host on port 8791; it rejects non-GET requests and does not load Laravel. Node runtime/transport/service tests use in-memory fixtures.

An optional real-data smoke script blocks non-read SQL before execution, uses in-memory auth/session/cache, and invokes existing read controllers. It does not provision users, submit orders, migrate, advance turns or create persistent auth sessions. It may create the existing public static-data cache if absent, just as the normal read endpoint does.
