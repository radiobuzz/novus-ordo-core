# Administration replacement — experimental handoff

**2026-09-22 update:** [Multi-game stage 1](multi-game-plan.md) supersedes the single-active-game and replacement behavior described below. Creation preserves existing active games; player requests select their game explicitly; administration returns `active_game_ids`. Earlier verification remains historical.

Date: 2026-09-19

## Try it

Open `/client/admin`, or **Administration** from the game shell. Since the final cutover, `/dev-panel` redirects here; the old panel and test SPA no longer exist.

The game selector sits above Overview, Map workspace, Accounts and Developer tools. Selecting a game changes inspection scope only. It does not reactivate that game. Archived games can be inspected; turn commands operate only on the active game. This first replacement does not add archived-game activation or simultaneous active games.

Access follows the user's explicit instruction: **no new permissions system**. The replacement retains the original development panel's authenticated/development-only boundary. Map generation/library/start-from-generated-map retain the already-existing `isAdmin()` check. Accounts, session switching and turn tools do not acquire a new administrator-role requirement. This is a development tool, not a production-hardened administration authorization model; do not expose it as one.

## Original capability checklist

| Original admin capability | Replacement |
| --- | --- |
| Active game ID/current turn | Overview and persistent working-game selector; includes retained older games |
| Start a classic game | Overview → Start classic-map game; explicit current-active-game replacement confirmation |
| Next turn / AJAX force-next-turn | Overview → Force next turn; both old controls invoke the same engine operation |
| Rollback last turn | Overview → Rollback; unavailable on turn 1; confirmation names game and removed turn |
| List/add users | Accounts, with native search and generated password disclosure when blank |
| Set password / generate-and-set random password | Accounts → Password management; global target named in confirmation |
| Become a user | Accounts → Games; session-switch confirmation |
| User-specific test SPA | Retired in stage 5 |
| Generated JavaScript services | Retired jQuery output; current ES-module catalogue remains build-generated |
| Division/deployment lookup | Developer tools → selected-game object inspector; cross-game IDs rejected |
| Map lab / generated game creation | Map workspace, plus retained lab and standalone generator |
| New game interface navigation | Header → Return to game; user-session tools also offer New game UI |

Stage 5 removed the developer service-code and browser-console pages after confirming that the checked-in ES-module catalogue and administration inspector cover current consumers.

## Map workflow

1. Open Map workspace. Tune the same landscape generator and settings as the standalone beta tool. Range fields now pair a native slider with an exact numeric value.
2. Generate a landscape. Editing settings marks the preview stale; stale previews cannot be saved or used to start a game.
3. Give it a name and **Save map to library**. This persists the exact validated snapshot independently of any game. Each save creates a separate immutable entry, even when names repeat. Nothing overwrites another map.
4. Load a library entry to restore the exact stored geography, not merely regenerate its seed. **Start game from this map** is enabled only for the exact loaded/saved preview.
5. Confirm creation. The *active* game named in the confirmation becomes inactive; its data remains. The new game gets its own snapshot, so later generator work cannot modify it.

Browser settings presets retain the old keys, `no7:map-beta:settings` and `no7:map-beta:presets`. They are not shared server maps. The admin's current unsaved settings/preview survive module and game-scope navigation in that page's memory; a full reload requires regenerating from browser settings or loading a saved map. Credentials are never included in that state. JSON export downloads the current clean preview; JSON import, library deletion/renaming, terrain painting and live-world map replacement are not implemented.

The standalone `/client/map-generation` now composes the same `MapStudio`, keeping its existing start endpoint and confirmation workflow. Neither consumer changes generator algorithms, resource rules, regional movement or combat.

## Ownership and source map

- `resources/js/client/app/AdminApp.js`: shell, hash navigation, selected scope, request state, in-page map draft and owned feature scopes. Stale/disposed reads cannot replace a later module. Scope switching is held while a command is pending.
- `resources/js/client/features/admin/`: overview, maps, accounts and tools. Features compose shared UI and issue explicit commands through `services/AdminService.js` and the existing transport. Admin routes are not exported into the generated player client.
- `features/map-generation/MapStudio.js`: reusable generation/settings/preset composition. `ui/map/GeographyPreview.js` reuses renderer/camera/gestures. `ui/RangeField.js` owns native slider/number synchronization; no network or game-rule knowledge.
- `ui/ConfirmDialog.js`: owned native modal, safe default focus, Escape/cancel, target/consequence supplied by callers. `ui/DataTable.js`: semantic responsive table; no data-grid framework. Shared tokens/styles continue in `_tokens.scss`/`_foundations.scss`; admin-specific arrangement stays in `styles/admin.scss`.
- `app/Http/Controllers/AdminController.php`: private bootstrap and typed Laravel endpoint parameters/validation. `app/Services/AdminGameService.php`: explicit per-game reads and turn command coordination. Existing engine methods remain authoritative.
- `app/Models/MapDraft.php` and migration `2026_09_19_230000_create_map_drafts_table.php`: named immutable snapshots plus fingerprints. Generated maps still pass `GeneratedMapData::fromArray()` validation before storage and creation.

## Command safety and limits

Turn commands carry the selected game and expected **turn ID**, not just a display turn number. The service rejects archived targets and stale turns, coordinates with the existing game-creation lock, then invokes the engine's own turn-locked methods. Rollback adds an optional expected-turn check *inside* the existing lock. Classic creation uses the independent-game creation contract.

No command retries automatically. Pending state prevents duplicate UI activation; an uncertain network response tells the operator to inspect current state before retrying. Refresh is explicit, not an automatic loop that can discard edits. The overview rejects mismatched turn/map read snapshots. These guards reduce stale actions but are not a new event log, undo stack or transactional rewrite of turn resolution.

Existing rollback semantics still apply: it deletes the latest turn and related data through existing cascades. It is not a general backup restore, and does not invent restoration of global account state or every historical readiness flag. Existing turn resolution's failure/partial-upkeep limitations remain engine concerns.

Account operations explicitly identify global scope. Entering a user session changes the cookie shared by other tabs; it is not read-only impersonation or a per-tab permission mode. Generated passwords are shown only in the immediate result, can be selected/copied, and are cleared when dismissed/replaced or leaving the module. Admin responses use `private, no-store`; no password hashes are returned.

Further review: English-first admin labels, real-device and non-Chromium behaviour, large game/user/map-list pagination, library lifecycle controls and a production permissions model. Progress/meters, historical mini charts and terrain-painting tools remain deferred. This delivery is revisable, not a frozen future architecture.

## Verification and deployment

Build/check commands:

```sh
npm run build
npm run check:client
npm run test:client
npm run test:client:php
npm run test:client:browser -- client.spec.js entry.spec.js foundations.spec.js
```

Use the explicit separate MariaDB/PHP setup from [the gameplay handoff](gameplay-experiment.md) for mutation tests. Never point these helpers at application credentials. With the isolated loopback host on `127.0.0.1:8792`:

```sh
NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-XXXXXX php8.3 tests/client/admin-seed.php
node tests/client/admin-browser.mjs
NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-XXXXXX php8.3 tests/client/admin-contracts.php
node tests/client/map-beta-browser.mjs
```

The inspector contract suite expects prior gameplay fixtures containing a division and deployment. The admin browser journey checks old/active scope, real force/rollback, stale requests, dialog cancel/focus, repeated navigation cleanup, global users/passwords/session switching, shared range input, independent saved maps, dirty preview guards, map draft navigation, exact reload/start, original-map creation, auth/CSRF/existing map access and mobile overflow. The standalone map journey covers original presets/generation/start and subsequent gameplay/nation setup.

Install **only** the additive saved-map migration for this feature:

```sh
php8.3 artisan migrate --path=database/migrations/2026_09_19_230000_create_map_drafts_table.php --force
```

It creates an empty map library; it does not start, replace or modify a game. There is no automatic live-data seed, route cutover or service restart.

Delivery evidence: this migration was installed in the development app on 2026-09-19; active game remained ID 5, turn 1. Build/PHP/generated checks, 14 Node test files, 21 fixture browser tests, isolated admin/inspector contracts, standalone map-to-nation and beta gameplay journeys passed. Screenshots reviewed at desktop and narrow sizes. Mutation tests used separate data, and temporary test services were stopped afterward.
