# Current Novus Ordo client — phased implementation plan

Status: Phases 1–2 and the entry/onboarding slice implemented; remaining gameplay phases pending

Date: 2026-09-18

Depends on: [technical baseline](technical-baseline.md), accepted directions in ADRs 0001/0003/0004, and review of the proposed loading decision 0002.

## Goal and completion boundary

Deliver a map-centered, responsive interface for the current game, with supported actions and trustworthy error/turn behavior. Keep the old client as a fallback until an explicit release decision.

Completion is not building every future navigation label from the concept image. New economics, diplomacy/forum rules, LLM news, and historical mechanics are outside this plan. Any current feature intentionally left in the legacy interface is a visible, documented migration boundary, not silently marked complete.

## Phase overview

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 | Current-game parity and integration contract | Every intended current action/data source identified; gaps and test environment recorded |
| 1 | API boundary and minimal tested runtime | Generated calls/transport and scope/host/trait contracts pass isolated tests |
| 2 | First usable read-only World workspace | Adaptive shell, natural map navigation, territory inspector in panel/dialog, lazy loading |
| 3 | Military actions and turn coordination | Current orders/deployments work safely with validation, upkeep, stale-state and uncertain-outcome handling |
| 4 | Remaining current-game views and onboarding parity | Nation/economy/news/reports and explicit onboarding integration cover the parity matrix |
| 5 | Release candidate and controlled adoption | Full regression, browser/accessibility/performance checks, legacy fallback and asset rollback verified |

Testing and documentation accompany each phase. Phase 5 is not the first time we test. Later phases receive detailed task plans after the preceding slice establishes real constraints.

### Accepted entry/onboarding slice — 2026-09-19

The user approved and authorized the [entry-experience proposal](entry-experience-proposal.md), recorded in [ADR 0005](decisions/0005-entry-experience.md), bringing the onboarding portion of Phase 4 forward as stages E0–E4. Its initial implementation is delivered; see the [entry handoff](entry-experience-handoff.md). This does not authorize Phase 3, the remaining Phase 4 views, or default cutover. The accepted phases 1–2 baseline remains the implemented foundation.

## Phase 0 — Contract and integration inventory

Read-only discovery plus documentation and synthetic fixtures. Do not mutate the active game to discover behavior.

Deliver:

1. Expand [the initial feature matrix](current-game-parity.md) from routes into actual dashboard/player journeys, inputs, response bodies, error cases, permissions, upkeep restrictions, and static/bootstrap data dependencies.
2. Compare real response construction to annotations; preserve endpoint payload meaning. Record missing generated methods and incomplete schema documentation.
3. Specify boot data: current user/game/nation/setup/turn, server-derived URLs, CSRF delivery, and non-secret public definitions. Do not copy embedded private Blade data into public static assets.
4. Verify the proposed `/client` entry, authentication, and legacy login/onboarding return behavior. Do not repurpose the privileged `/dev-panel/spa/{userId}` route as a player entry.
5. Audit map dependencies: geometry/tiles, global definitions, texture readiness, canvas dimensions, listeners, clipping, picking, and teardown. Identify reusable drawing/data code versus behavior to replace.
6. Confirm locked Node/Vite/PHP compatibility, Sass/test dependency choices, exact generated-module workflow, source-control/backup workflow, and isolated test database/environment. Resolve unknowns before implementation touches them.
7. Write concrete contracts and fixtures for first-slice endpoints; list exact generator/bootstrap backend edits with exclusions.

Exit: no guessing about first-slice responses, auth, turn identity, or map data. Scope any needed read-contract additions explicitly. All baseline defaults that fail inspection are revised in a decision record before code starts.

## Phase 1 — Clean boundary and minimal runtime

Build only what Phase 2 needs. Keep legacy outputs/callers working.

Work:

- Add generated module output and reproducible generation checks. Preserve a compatible legacy path. Include explicit route coverage and parameter handling; keep route knowledge generated instead of duplicating URL strings across features.
- Implement the injected transport and service boundary. No components or hosts inside transport/API modules.
- Implement scope/disposal, explicit component updates, feature instance, host, trait installation rules, minimal scoped notifications, and feature loading.
- Establish test scaffolding and lightweight diagnostic counts. Build sample/synthetic feature tests, not a generic component showroom.

Required checks:

- Generated GET/query/path/POST behavior; multiple placeholders; encoding (including the existing special asset URI); untouched caller payloads; native async result; separate options.
- Success body, collection wrapper, empty/204 response, JSON/text errors, validation fields, session expiry/redirected HTML, forbidden, unavailable/upkeep, network error, abort, timeout if provided, and uncertain mutation outcome.
- No automatic command replay; no secrets in generated modules; legacy methods remain compatible.
- Initialize once; close during initialization; partial-init cleanup; repeated destroy; cleanup error collection; subscriptions/timers released; trait dependency/duplicate/prototype collision rejection.
- Two consumers load a definition once but create independent instances; obsolete host operations cannot mount stale content; host errors are recoverable.

Exit: tested contracts sufficient for one real inspector. Do not add suspension caches, generalized form engines, or an event bus merely to fill out the architecture.

## Phase 2 — Adaptive shell and first map-to-inspector slice

Deliver a real read-only feature, not just a shell mockup.

Work:

- Add the scoped Blade/client entry, Vite entry, SCSS compiler integration, semantic tokens, dark theme, navigation region, workspace host, inspector host, and focused dialog host.
- Desktop panel/mobile sheet behavior, visible close/expand controls, sensible keyboard focus, loading/empty/error states, and responsive content.
- Build camera, renderer boundary, initial layers, picking, and one browse/select tool around the current game's map data/assets.
- Load existing game/nation/territory data through services. Show current territory/nation facts in a reusable inspector, including ownership/permission differences.
- Persist harmless map position/selected view preferences with versioned, scoped keys.

Required checks:

- Drag pan, zoom under pointer, recenter, click-versus-drag, picking after transforms/high-DPI resize, texture readiness, no blank-map dead end.
- The same inspector runs in a panel or dialog; two instances have independent state; breakpoint changes preserve inspector state without a new request merely due to reflow.
- Pointer/touch interactions do not conflict with the sheet. Keyboard/list alternative permits territory selection without relying solely on the map.
- A→B→C selections with out-of-order responses end on C; closing during loading cannot resurrect a panel.
- Logout/turn change invalidate stale work. Corrupt saved state falls back safely. Repeated open/close stabilizes at baseline owned-resource counts.
- Production network inspection confirms unopened features remain unloaded. Theme-token changes affect shared controls and map palette as intended.

Exit: user can actually navigate the current world and inspect a territory on desktop/narrow layout. Review this concrete experience before adding command complexity.

## Phase 3 — Military workflows and turn safety

Add current mechanics only: unit selection, destination/path preview using current movement capabilities, move/attack order submission as supported, disband/cancel, deployment/cancellation, budget refresh, ready-for-next-turn, and upkeep/victory restrictions.

Keep mode selection, visible layers, and active interaction tool separate. Command draft state is separate from the territory being inspected. Client previews never replace server validation.

Required checks (isolated game data): valid and rejected commands; nested validation mapping; double-click prevention; late responses; close/leave while pending; loss of permission; turn transition during editing; mixed-turn refresh; network failure after submission with uncertain outcome; no automatic duplicate command; consistent state/budget after success or re-fetch. Back/forward and close guards must not silently discard meaningful draft work.

Exit: complete end-to-end military journeys for current mechanics, with observed server results and no live-game test orders without permission.

## Phase 4 — Current-game views and parity

Implement in thin slices:

1. Nation overview: current public/owner details and supported identity presentation. Do not add post-creation identity editing without an existing or separately approved contract.
2. Economy: current budget/resources/labor/production and bid actions. No historical taxes, welfare, interest, or development indices by assumption.
3. News, battle reports, rankings, and victory state. Audit HTML-rich report handling; use safe structured/text rendering or a deliberately chosen sanitizer/trust contract.
4. Session/setup: preserve current login and the full nation-creation capability. Initially allow an explicit handoff to the existing form. Replace it only after file upload/identity/home-selection/error contracts are deliberately covered.

Diplomacy/forum remains deferred; do not ship pretend alliance/war controls. Keep developer/admin tools outside player navigation and leave them legacy unless separately scoped.

Exit: every current-game action in the matrix is either verified in the new client or an explicitly accepted legacy handoff. A claim of full replacement requires no remaining unapproved gaps.

## Phase 5 — Release candidate

- Run generated-client, runtime, endpoint, and full browser regression checks in the isolated environment. Production smoke checks remain read-only unless authorized.
- Record exact tested browsers/devices. Verify touch/keyboard, focus, contrast, narrow layouts, large text, reduced motion, long lists, and map redraw behavior. Record untested real-device gaps honestly.
- Measure startup bytes/requests, first map readiness, interaction responsiveness, feature latency, and retained resource counts. Set and meet measured budgets; do not invent performance claims from a screenshot.
- Verify reproducible release artifacts, generated-client/backend version compatibility, HTML/chunk caching, old-tab chunk recovery, and unsaved-work safeguards during reload.
- Verify legacy dashboard/new entry coexistence, rollback to prior assets/entry, and secret-free logs/build output.
- Obtain explicit authorization before making the new client default or removing old files/routes. A completed trial client is not permission for cutover.

## Per-phase record

For each phase record scope, changed files, test commands/results, screenshots if relevant, confirmed contracts, unresolved gaps, and the next bounded step in the journal. Reference decision IDs rather than silently overwriting earlier reasoning.

## Immediate next step

Review the implemented `/client/entry` and polish the visible experience. Entry mutations have been verified against an isolated backend; later gameplay contracts still need their own audits. See [entry handoff](entry-experience-handoff.md), [phase 1–2 handoff](phase-1-2-handoff.md) and [verified integration contracts](integration-contracts.md). Real-device and multi-browser acceptance remain open; no default cutover or Phase-3 implementation has been performed.
