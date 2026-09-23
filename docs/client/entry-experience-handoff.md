# Entry experience — first implementation

Date: 2026-09-19

Status: Implemented as an opt-in entry, ready for visual review. Default game entry is unchanged.

## Try it

Open `/client/entry` on the game host (port 8788), or simply open `/` and follow the new default flow. Use an existing account. An unselected login reaches Games; selecting Join opens `/client/entry?game_id=ID`. Signed-in players without a nation enter the wizard, while completed players return to the selected game. Retired `/login` and `GET /create-nation` bookmarks redirect here.

The login background cycles through the supplied numbered images 1–6 (copied unchanged to `public/res/bundled/entry/`). It fades in from black, holds images 1–5 for five seconds each, and crossfades in order. Image 6 holds for ten seconds, then fades to black before restarting. Each fade lasts 2.2 seconds, separate from the hold durations, with a 100 ms black endpoint. The login form does not fade or reset. All six images are included as confirmed by the user.

The reusable `AtmosphereBackground` owns its timers and image listeners through Scope; EntryController supplies the ordered playlist and EntryProcess enables it only for login. Nation creation and the ready screen retain the original static cityscape. Reduced-motion preference shows a still image. Hidden tabs stop advancing and restart on return. Failed images are skipped after an eight-second loading deadline; if all fail, the original cityscape is used. No credentials or form state are affected.

The soundtrack is enabled by a user gesture, with remembered mute/volume. It stops immediately when login ends; nation creation and gameplay remain silent. The 5-minute-25-second source track is used unchanged and loops independently on login. Fine loop transitions and further visual polish remain review topics.

Nation creation has four chapters: Identity, Leadership, Homeland, Foundation. Back preserves values and selected files. Homeland shares the existing map camera/rendering/picking machinery and supports a keyboard-accessible territory list. Final review is the only creation action. The desktop panel expands for the map; mobile remains scrollable.

English/French switches immediately without discarding input, wizard position, map selection or inspector expansion. Preferences are device-local. Drafts and files stay in memory; reload cannot restore unsaved files. Same-user reauthentication preserves the in-memory draft; a different user/game discards it.

## Architecture delivered

- Existing Instance, Component, Host, Scope, FeatureLoader and Signal retained.
- Separate `entry.js` composition and EntryShell/EntryProcess/EntryRouter; game `main.js` remains separate.
- Shared Wizard with a child Host; nation-specific workflow/draft validation stays in NationCreationProcess.
- Shared FormField, ImageField, glass surface, feedback, language/audio controls and atmosphere component.
- Shared map implementation in `ui/map/`; compatibility exports preserve prior world/test imports. Both world browsing and Homeland use MapViewport's connection contract.
- LocalizationService, central `strings/en.js`/`fr.js`, AudioService, SessionService and NationSetupService. Existing SavedState supplies the device namespace.
- Semantic entry theme tokens extend the existing SCSS theme. No new frontend framework or dependency was introduced.

## Integration contracts

| Route | Input / access | Result |
| --- | --- | --- |
| `GET /client/entry` | Guest or authenticated browser | Private/no-store HTML with safe runtime bootstrap and supplied asset URLs |
| `GET /client/session` | Guest or authenticated session | Current user ID/name when signed in, fresh CSRF, server-derived URLs and asset configuration; no-store |
| `POST /login-user` | Existing throttle/session/CSRF; `username`, `password`; JSON Accept header | JSON bootstrap on success; 422 field errors on rejection. HTML callers retain existing redirects. |
| `GET /client/setup` | Authenticated; allowlisted locale header | User/game ID, setup status, pending name, required count, suitable/taken IDs and upload constraints. 503 for missing game/upkeep. |
| `POST /create-nation` | Authenticated, CSRF, upkeep check; multipart `nation_name`, `nation_formal_name`, `nation_flag`, `leader_name`, `leader_title`, `leader_picture`, `territory_ids_as_json` | JSON 201 with nation ID/FinishedSetup, 422 field errors, 409 completed-state conflict; non-JSON compatibility enters the selected new-client game. |

`X-Client-Locale` is restricted to `en`/`fr`. Login and full creation are included through an explicit route-name allowlist in the ESM generator. The retired jQuery generator is gone. Transport handles FormData without setting a multipart boundary, obtains current CSRF through an injected getter and retains structured error categories. No automatic mutation retry.

PNG/JPEG/WebP images are optional, at most 2 MB and 4096 pixels in either dimension. Flag and portrait use existing 300×200 and 200×400 crop behavior. Full form and JSON callers share NationCreationService. Requests to that service serialize per game to protect name/creation checks; finalization revalidates territory eligibility under the existing global home-selection lock and a database transaction. Nation status, details, leader, territory assignments and finalization effects commit together. An initial pending identity may remain after a failed upload/finalization; setup can recover its name. Files generated by a failed invocation are cleaned up.

Names are measured in Unicode characters to align model length checks with Laravel validation and French input. An uncertain client result triggers a setup read before offering another deliberate submission. The pre-existing narrower `/nation:select-home-territories` leader-argument mismatch was not repaired; this wizard does not use that endpoint.

## Verification evidence

- Production build and generated-client reproducibility check pass; PHP source syntax and no-database contract checks pass.
- Existing Node suites passed. Five additional entry checks cover table parity, draft/file ownership and adjacency, duplicate/uncertain submission, multipart/current-token transport and late audio resolution.
- Sixteen Chromium browser journeys pass: ten existing world regressions plus entry/locale/upload flow, mobile French/deep-link guards, world locale state preservation, same-user reauthentication recovery, the full slideshow timeline/black loop/login exit, and reduced-motion/image-failure handling.
- A separate MariaDB instance was initialized under a unique `/tmp/no7-entry-db-*` directory, with no network listener and no production credentials. A loopback-only PHP test server used this database and isolated session/view/upload directories.
- Real HTTP browser integration against that isolated server passed rejected French credentials, successful login, CSRF rejection, field validation, full flag/portrait multipart submission, connected territory creation, duplicate rejection and reload recovery.
- Isolated persistence checks verified formal identity, exact home-territory count and both resized uploads. An injected finalization failure rolled back nation details/completion and cleaned the invocation's image while leaving a recoverable pending identity.
- Final cutover checks confirm that the old login, dashboard and creation-form URLs redirect to the new destinations, while their deleted assets return 404.
- Supplied image/audio are served by the real entry. Screenshots were inspected at desktop and 390px mobile widths. No active-game nation or orders were created for tests.
- Final guest-browser smoke on the actual game host returned HTTP 200, loaded the supplied background and reported no JavaScript errors. The temporary PHP/MariaDB test services were stopped after verification; their isolated fixture files remain under `/tmp` for inspection.
- Slideshow follow-up guest smoke returned HTTP 200 with all five numbered images loaded and no JavaScript errors. Screenshot: `test-results/entry-slideshow-live.png`. Build, generated-client check, PHP contracts/lint and focused Node suites passed again; no database changes were needed for the slideshow.

Browser evidence uses installed Linux Chromium/Chrome with narrow-screen emulation. Real phones, Safari/Firefox, assistive technology and subjective soundtrack/loop quality still need user review. New-client interface copy, terrain labels, controls and supported entry validation are localized.

## Reproduce checks

Normal source verification:

```sh
npm run check:client
npm run build
node --test tests/client/api.test.js tests/client/runtime.test.js tests/client/services.test.js tests/client/entry.test.js
npm run test:client:php
npx playwright test --config tests/client/browser/playwright.config.js client.spec.js entry.spec.js
```

Integration helpers are `tests/client/isolated-app.php`, `entry-seed.php`, `entry-server.php`, `entry-integration.mjs`, `entry-transactions.php` and `entry-legacy.mjs`. They require an explicitly created temporary MariaDB socket root named `/tmp/no7-entry-db-*`, database `no7_entry_test`, and the loopback test server on 8792. Seed once into a fresh isolated database; successful integration journeys consume their synthetic accounts' nation setup. These helpers must never target the active game. The bootstrap rejects a missing or non-temporary root, overrides the connection explicitly, and redirects uploads/session/view files into that root. Real CSRF remains enabled.

## Release and next work

The source and build-manifest snapshot is `storage/app/client-backups/pre-entry-20260919.tar.gz`. It excludes credentials, database data, dependencies and supplied assets; hashed build files are retained separately in `public/build/assets`. There were no schema migrations, production service restarts, dependency changes or default-route cutover.

Review the visible login, wizard pacing, image crop, panel translucency and wording next. This entry completes the approved onboarding slice; military/economy/report replacement and broader gameplay modernization remain later work. Existing gameplay is still the destination for game commands.
