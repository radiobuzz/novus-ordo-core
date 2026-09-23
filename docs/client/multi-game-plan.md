# Multiple games and legacy retirement

Status: all five accepted stages implemented 2026-09-22.

## Accepted sequence

1. Independent backend games: explicit request scope, per-game nations/setup, independent creation, turns, AI, locks and notifications.
2. Game selector and instance lifecycle: accessible active games, placeholder previews, play/setup/spectate entry, game URLs, safe switching and separate tabs.
3. Organize Games, Administration and Tools/experiments. Keep current access boundaries; no richer permissions system in this phase. Minimal installation guidance.
4. Complete the accepted UI additions: territory-owner nation inspector with leader portrait; selected-force attack and projected territorial defense; compact public productivity details; background-turn favicon attention. Preserve existing sound behavior.
5. Verify journeys, make the new interface the default, redirect old entries and remove obsolete screens/assets/routes while retaining shared operations.

Explicitly deferred: historical battle-map experience and advanced selection shortcuts. Drop picture-information UI, neighboring-territory links and the API console page. Remove legacy developer service output once its old consumers are retired; retain the new client's generated endpoint module. Generated art is separate future work.

## Stage 1 delivered contract

- `Game::createNew($map = null, $prepare = null)` creates a separate active game transactionally. It never disables an existing game or activates an archive. The optional preparation callback remains in the creation transaction (including AI provisioning). Creation contention rejects; it cannot return somebody else's newly created game. No storage migration or live-game edit was necessary.
- `GameAccess` centralizes the initial policy: all active games are available. Authentication still protects private reads/commands; ownership is resolved by `(game, user)`. Spectators have public reads without a nation. There is no invitation/role/membership-management subsystem.
- `SelectedGame` resolves a positive game ID from `game_id` query/body, `X-Game-Id`, bound `game` route parameters, or command/AI context. All supplied selectors must agree. Malformed IDs are 422, conflicts/ambiguous missing selection 409, unknown IDs 404, unavailable archived games 403. Selection never uses browser-wide session state.
- Temporary unscoped compatibility resolves **only one** active game. With multiple active games it fails explicitly. Optional entry/bootstrap resolution returns no selection when absent/ambiguous so login/global administration remain available. Explicit invalid selections still fail. The remaining `Game::getCurrent*()` methods are compatibility helpers which also reject ambiguity; production request/AI/admin paths no longer use them.
- Public, logged-in, nation and pending-setup contexts, the upkeep middleware and entry setup use the same resolver. Existing nation/object validation remains authoritative within that game.
- Authenticated `GET /games` lists active game IDs/turns and this account's nation/setup status, spectator eligibility and initial join availability. `can_join` indicates no nation plus sufficient free home territories; final geography/setup validation remains authoritative. It is the backend contract for the stage-2 selector, not a selector UI.
- Administration returns `active_game_ids`; creation no longer takes a replacement-game dependency. Its existing explicit game turn/inspection routes work with any appropriate game. Archived administration reads remain available; turn/AI mutations reject archived games.
- The engine guards cross-game turn objects and archived advance/rollback. Turn and AI work use only the target game's turn lock. The creation lock serializes creation alone. Homeland-selection locking is game-specific. Fixed the cached territory lookup's game key (it previously used a nonexistent `Game.game_id`).
- Existing static geography caches and turn-status filenames already include game identity; isolated tests verify their separation. Scheduled upkeep already iterates active games; it now works with the independent engine/AI paths. CLI advance and rollback require an explicit game ID; AI CLI no longer requires a unique global active game.
- Minimal current-client integration pins the resolved `gameId` in each transport's `X-Game-Id`, including JSON commands and multipart uploads. Entry/session boot and setup/game links retain selection. Creation responses for the standalone generator link to the created game. Existing creation wording was corrected to reflect independent games.

Open `/client` for the game selector, `/client?game_id=ID` to play, `/client?game_id=ID&mode=spectator` to watch, or `/client/entry?game_id=ID` for setup. Stage 5 later retired the old unscoped screens.

## Stage 2 delivered contract

- Unselected `/client/entry` login leads to `/client`, which lists all accessible active games, their IDs, current turns and account participation state. Cards use placeholder previews and offer Play, Join as player, Continue setup and Spectate as applicable. Loading, empty, error/retry and expired-session states are explicit. EN/FR and narrow layouts use existing controls/tokens.
- Entry and client HTML no longer implicitly choose the only active game. Explicit game URLs still validate through `SelectedGame`. Setup and its existing draft/session-recovery flow retain their selected game, with a Games link back to the directory.
- `GameApplication` owns one visible `Instance` per tab. `GameSelector` has an unscoped directory transport. Each `GameInstance` creates a fixed selected-game transport plus its own data, command, AI, sound and shell lifetimes. Switching disposes the old instance before mounting the next; polling/automation stop, reads abort and late publications are fenced. Confirmed/private snapshots and command drafts never persist in browser storage.
- A visible Games button returns to the selector without a page reload. Player/spectator links remain real URLs, supporting reload, copy/open in another tab, and Back/Forward. The selected game is never a browser-wide session or local-storage pointer. Rejected history navigation restores the current URL; it may replace that visited history entry rather than preserving an exact history stack.
- Pending human/AI commands block in-page switching. Leaving with deployment, production, movement or identity edits, or an uncertain/unreconciled outcome, requires discard/review confirmation. Native unload protection covers closing/reloading the page. No mutation is retried, and leaving does not claim to undo server work. Native unload prompts remain browser-controlled.
- Existing per-user/per-game map camera, rotation, layer and mode preferences remain in their game namespaces. Last workspace/territory routes and briefing seen markers are now also per game; player and spectator routes are distinct. Device locale/display/sound preferences remain shared. Old unscoped briefing markers are intentionally ignored, allowing one fresh briefing.
- Spectator mode is a public display even for a nation's owner: the instance does not fetch owner gameplay/territory bundles or enable player commands. Backend ownership/access rules are unchanged; this is a view choice, not a new permission system.

## Stage 3 delivered contract

- Shared destination navigation connects Games (`/client`), Administration (`/client/admin`) and Tools & experiments (`/client/tools`) from entry, the game selector and administration. Gameplay's menu also links Administration and Tools. No extra landing-screen step is required before choosing a game.
- `ClientNavigation` supplies links matching existing boundaries: administration requires authentication and development mode (including the previously permitted non-admin accounts); labs and their directory allow guests in development only. Production entry exposes Games alone. These links do not replace middleware or introduce roles/invitations.
- A guest choosing Administration reaches the new login with an allowlisted destination, then continues to administration after authentication. Normal login still reaches Games; selected-game setup and its reauthentication behavior remain intact.
- `ToolsDirectory` uses the existing Instance lifecycle and shared controls for Map Lab, Portrait Lab and UI gallery. It performs no game reads. Labs link back to the directory. Destination/directory text supports EN/FR and narrow layouts.
- Administration retains its game/account/map operations and scoped object inspector. Its former developer-resource list is replaced by the tools directory; the interface no longer advertises API-console sessions or generated legacy service output. Stage 5 subsequently removed those routes and implementations.
- New login has a small collapsed first-install hint: if no administrator exists, run `php artisan app:provision-admin ADMIN_NAME` on the server and sign in with the resulting credentials. No setup wizard, provisioning endpoint or migration was added. The existing command's actual `app:` prefix is used.

## Stage 4 delivered contract

- The persistent territory inspector offers an expandable public owner-nation card with flag, leader name/title/portrait and public nation statistics. Missing images stay absent. Ownership changes clear the former owner's identity immediately; routine refresh preserves the disclosure and inspector nodes.
- World force selection, its movement dock and Military show selected attack/defense totals from authoritative unit definitions. Owned-territory defense projects confirmed orders and deployments to the point before battles: Move destinations and Attack rebase locations count, Raids defend their origin, and units ordered to Disband still defend because disbanding occurs after combat. Staying, incoming and deployment contributions are disclosed separately. Enemy defense, militia, local unsent drafts, captures and battle outcomes are not guessed.
- Public potential production has a compact disclosure of terrain multipliers and loyal population. The existing public territory export now includes authoritative base productivity and the population unit; capacity uses population × owner loyalty × terrain rate. Resource capacities are independent alternatives, not simultaneous production. Unknown neutral population stays unknown. No economy/combat rule or schema changed.
- `GameplayService.identities()` shares the public nation/leader directory between inspectors, briefing and Reports. The game service owns cancellation, caches by local read generation and fences game/turn/generation on completion. Closing a consumer does not cancel another consumer's read. A refresh invalidates the cache; local generation is not a durable server revision.
- `TurnAttention` observes confirmed world publications within the selected game's lifetime. A higher turn received while hidden alternates the favicon; returning, losing scope, rollback or leaving the game restores the original icon and cancels the timer. Reduced motion uses a static attention icon. Initial load and same-turn refresh do not flash. Browser background throttling still controls timing. Existing game sounds are unchanged.
- The new client has an explicit small SVG favicon. EN/FR text, native disclosures, existing semantic tokens and persistent UI controls are retained. Picture credits, historical battle highlights and advanced unit-selection shortcuts remain deferred as agreed.

## Stage 5 delivered contract

- `/` now enters the authenticated game selector, with Laravel authentication continuing through `/login` to the new `/client/entry` login. Retired `/dashboard`, `GET /create-nation` and `/dev-panel` bookmarks redirect to the corresponding new Games, setup and Administration destinations. Selected `game_id` context is retained where it is meaningful.
- The Blade login, dashboard, nation form, development panel and console/test SPA were deleted with their Blade-only components. Their jQuery, dashboard and legacy map scripts were deleted as well. The client and administration no-script messages no longer advertise a fallback that does not exist.
- The development panel's mutation/read endpoints and generated JavaScript download were removed. Game creation/turn control, users/password/session switching and scoped object inspection remain through `/client/admin/api`; Map Lab, Portrait Lab and the UI gallery remain development-only through Tools & experiments.
- The runtime endpoint catalogue remains `resources/js/client/api/generated.js`, produced deterministically by `client:generate`. `JavascriptClientServicesGenerator` now owns only that ES-module catalogue; its retired jQuery class/enum/constants output and `JavascriptStaticServicesGenerator` were removed. Server-side static JSON caching used by current territory APIs remains.
- The full multipart nation operation remains `POST /create-nation` because the new wizard uses it. Its non-JSON compatibility response now enters the selected game rather than the deleted dashboard. Login form compatibility likewise enters Games. Backend game, nation, territory, division, deployment, production, readiness and asset operations used by the new client remain intact.
- Administration's account switch offers Games only; the removed original-dashboard and API-console destinations cannot be requested. Entry/game boot payloads, translations and CSS no longer carry legacy-interface links or labels.

## Verification

- `tests/client/multi-game.php` uses the guarded temporary MariaDB bootstrap. It verifies simultaneous classic/generated games, one account/two nations with the same name, selector validation, atomic failed creation, creation/turn lock independence, actual AI work in the second game, independent advance/rollback, scheduler operation, scoped caches/status files and archived-game preservation.
- `tests/client/multi-game-http.mjs` uses the isolated loopback server with real auth/CSRF. It verifies the list and all selected read contexts, spectator/public boundaries, foreign territory/nation/division rejection, conflicting commands, deployment/Ready isolation, full multipart nation creation by one account in both games and two real client tabs sharing a login cookie.
- All 31 Node test files passed, including transport selection coverage. Generated-source/no-database PHP contracts, changed PHP syntax and the production build passed.
- The existing real administration browser regression also passed: archived reads, targeted advance/rollback, account/session flows, exact saved-map creation, independent classic creation, CSRF/access and narrow layout.
- The standalone generator browser journey passed exact-map persistence, independent creation, conflicting-game rejection, game-specific redirect, interactive homeland selection and full nation creation. Its old finder/briefing interactions were updated to the current UI.
- Integration mutations were confined to a new `/tmp/no7-entry-db-*` instance; application games, nations and turns were not test fixtures.

### Stage 2 verification

- `tests/client/game-selector-browser.mjs`: real isolated login → directory → scoped setup; classic/generated games; Play/Spectate; same-document switching; Back/Forward and denied Back; pending command and draft guards; delayed old-game response; two tabs; per-game camera restoration; resource counts returning to the selector baseline; narrow layout.
- Existing entry/live-data Chromium regressions: all 14 passed, including wizard reauthentication/drafts, localization, command outcomes and persistent canvas/input behavior. All 11 dedicated persistent-panel regressions and the narrow French header/keyboard check also passed.
- All 31 Node test files passed; an added focused spectator-data test also passed. PHP contracts, changed PHP syntax, generated-source check and production build passed. Browser fixture URLs now explicitly select game 1 for gameplay journeys.
- Integration work uses the guarded disposable `/tmp/no7-entry-db-*` database only. No live game mutations or schema migration.

### Stage 3 verification

- `tests/client/destinations-browser.mjs`: actual guest login to Administration using an existing non-admin development account; Games/Admin/Tools round trips and current-link labels; lab routes and gallery return; guest directory with no game reads; provisioning hint; French/mobile layout.
- PHP contracts assert the tools route's existing development/guest boundary and development versus production destination lists. Changed PHP syntax, generated-source check, all 31 Node files and production build passed.
- All six existing entry browser regressions and the isolated game-selector journey passed, including setup/reauthentication, switching, pending/draft guards, delayed responses and two tabs.
- All session/browser integration work uses the disposable `/tmp/no7-entry-db-*` fixture. No live game/account changes or provisioning command execution.

### Stage 4 verification

- All 32 Node test files passed; focused shared-data tests also verify coalesced public identity reads, one consumer aborting, generation changes before cached delivery and game disposal. Force-summary fixtures cover moves, attack rebasing, raids, post-battle disbanding, deployments, missing metadata and public-only views.
- Twenty Chromium checks passed across the new stage-4 suite, persistent panels and HUD. The final focused stage-4 suite also passed. Coverage includes real image loading, safe leader text, live owner/productivity changes without inspector replacement, World/Military selection totals, narrow layout, background attention, acknowledgement, reduced motion and game exit.
- The real isolated multi-game journey passed again: switching, lifecycle counts, saved cameras, history, two tabs, spectator boundaries, pending/draft guards and delayed responses. Its camera assertion now waits for the rendered orientation rather than reading before the animation frame.
- Read-only PHP checks against classic/generated temporary games matched exported terrain rates, population units, single/bulk exports, public identities and owner capacity to authoritative model values. Generated definitions, no-database PHP contracts, changed PHP syntax and the production build passed. No live game/account changes or schema migration.
- Browser tests validate favicon DOM/timer behavior; actual browser-chrome animation and background throttling remain browser-controlled. Cross-browser and physical-device checks are not implied.

### Stage 5 verification

- No-database route/source contracts assert that the five retired screen URLs are redirect closures with their intended access boundaries, only the three labs plus the panel redirect remain below `/dev-panel`, removed developer route names are absent, retired files are absent and the current generated module is reproducible.
- A real isolated HTTP check verifies `/`, `/login`, `/dashboard` and `GET /create-nation` lead to the new destinations, while the old jQuery/dashboard/map assets, generated-service endpoint and test SPA return 404. The selected-game login/wizard journey passed real CSRF, localized rejection, field validation, multipart flag/portrait creation, connected homeland selection, duplicate rejection and completed-state recovery.
- The full isolated administration journey passed after removal: active/archive scope, advance/rollback guards, accounts/password/session switching, scoped inspection, map generation/save/reload/exact start, CSRF/access, no-store responses and narrow layout.
- All 32 Node test files, the generated-source/PHP contracts, changed PHP syntax and the production build passed. Representative Chromium entry, client and HUD checks passed after updating historical inspector selectors, the new setup URL, mobile drawer access and the current stale-read simulation.
- All database-backed checks used a socket-only disposable `/tmp/no7-entry-db-*` MariaDB instance and loopback server. No application game, nation, user or turn was changed. No schema migration or dependency was added.

## Remaining boundaries

All five stages are delivered. The retirement does not add broader authorization, atomic same-turn snapshot reads, a durable human-command rollback revision or new battle mechanics. Existing command no-retry behavior is preserved. Historical battle-map work, advanced selection shortcuts and generated art remain separate future work.
