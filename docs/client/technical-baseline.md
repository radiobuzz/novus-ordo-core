# Client technical baseline — freeze v1

Status: Accepted for phases 1–2; read-only preview implemented 2026-09-19

Date: 2026-09-18

This is the current technical starting point. The user accepted the recommendations and explicitly authorized phases 1–2 on 2026-09-18. The defaults below are accepted for that slice. Later command/gameplay phases and default-interface cutover remain outside that authorization. See [implementation evidence](phase-1-2-handoff.md). This supersedes the pre-plan's open-ended treatment of accepted subjects.

2026-09-19 extension: accepted [ADR 0005](decisions/0005-entry-experience.md) supersedes the original timing of onboarding and practical localization. The user authorized a separate public entry application, full creation bridge, reusable wizard and EN/FR interface tables. See the [entry handoff](entry-experience-handoff.md). The existing runtime/stack and separate-preview/default-cutover constraints still apply; full localization tooling remains deferred.

## 1. Meaning of the freeze

- **Agreed:** established user requirements/accepted directions. Do not reopen them without a concrete reason and a recorded decision.
- **Default:** a specific recommendation made in this plan, not silently attributed to the user. Approving this baseline accepts these defaults for V1, subject to the phase-0 compatibility check.
- **Deferred:** intentionally unnecessary for the first client. It must not block the initial slice or become speculative framework work.

Freeze contracts and dependency boundaries, not every filename, token value, breakpoint, or private helper. When evidence requires a change, record the reason, affected consumers/tests, and replacement decision. No silent architectural drift.

## 2. Scope boundary — agreed

Implement an interface for the **current** Novus Ordo. The historical game is reference only. Do not restore old budgets, laws, social indices, or military systems by implication.

The future can be more complex and differently managed. Adaptability comes from clear responsibilities and replaceable boundaries, not from predicting every future mechanic.

Keep legacy gameplay available during migration. No production turn changes, destructive database tests, or real orders for verification without explicit authorization. Use fixtures and isolated test data for mutations.

## 3. Stack and delivery

| Subject | Position | Status |
| --- | --- | --- |
| Language | Plain modern JavaScript; no TypeScript, JSX, or TypeScript build/type-check requirement; explanatory JSDoc allowed | Agreed |
| Styling | SCSS, dark default, shared semantic design tokens, component-local styles | Agreed |
| Core | Inspiration only; no wholesale import or backend inheritance from Sproutflix | Agreed |
| Backend | Existing Laravel game and server-authoritative rules | Agreed |
| API | Retain generation; separate endpoint knowledge, transport, services/state, and presentation | Agreed; ADR 0004 |
| Modules/build | Existing Vite, ES modules, explicit lazy feature registry as specified in ADR 0002; no toolchain major upgrade as part of adoption | Default |
| Rendering | Native DOM and small explicit render/update helpers; no React/Vue or custom virtual DOM for V1 | Default |
| HTTP | One injected native-fetch transport with AbortSignal support and normalized errors | Default |
| New-client entry | Separate authenticated `/client` entry with a minimal Blade bootstrap; legacy `/dashboard` and login remain | Default; route conflict/access review in phase 0 |
| Navigation | Initially a small hash-based router below `/client`, with an explicit allowlist of views/parameters and normal back/forward | Default; avoids catch-all server routes |
| Stylesheets | SCSS `@use` modules; CSS custom properties for semantic theme values; no Bootstrap or Tailwind requirement in new-client components | Default; leave existing dependencies/configuration intact unless integration requires scoped changes |
| Generated modules | Deterministic build-time JS output, committed or reproducibly generated in the release workflow; never generated from a live player's state | Default; choose one storage workflow in phase 0 |
| Tests | Start with Node's built-in runner for pure runtime/transport tests and existing PHP tests for generator contracts; add browser automation only as needed for actual DOM journeys | Default; exact browser tooling/version checked in phase 0 |

Fetch requires explicit HTTP-status handling; cancellation of a request does not undo server work. These are transport responsibilities, not feature-specific conventions. [Fetch reference](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch).

SCSS organization uses the namespaced module model. The implementation adds pinned Sass 1.93.3. [Sass modules](https://sass-lang.com/documentation/at-rules/use/), [Vite stylesheet preprocessing](https://vite.dev/guide/features.html#css-pre-processors).

## 4. Runtime contract baseline

The concepts are agreed; the concrete V1 mechanics below are defaults to approve. Names are illustrative, not a mandate to create unused abstractions.

### Scope and lifecycle

- One lifecycle owner per child. Shared services are borrowed; subscriptions/resources have owners.
- Constructors capture inputs and allocate only synchronous, owned state. No network requests, global subscriptions, or uncontrolled asynchronous startup in constructors/module top level.
- Lifecycle: `created → mounting → ready → destroying → destroyed`. Initialization failure is a reported error followed by cleanup, not a half-ready object. A closing object invalidates outstanding work immediately.
- One shared in-flight mount/initialization promise. Repeated destroy calls share completion. Cleanup continues after individual failures and reports the aggregate.
- Instance-owned requests use scoped cancellation. Late results must check operation/session/turn identity before committing state.
- V1 hosts replace by destroying the old instance after close guards permit replacement. No general unmount-and-reuse cache. Breakpoint changes reflow the same host/body without invoking a new feature lifecycle.
- Preserve the map camera/view snapshot across top-level navigation. Initially destroy/recreate its running view rather than introduce a generic sleeping-instance manager. Revisit measured loading cost if necessary.

### Component, instance, host

- Component: owns a DOM subtree and explicit updates; never reaches into another feature's DOM.
- Instance: owns a running feature, working state, children, semantic actions, and optional dirty-work guard.
- Host: owns presentation, focus, busy/error chrome, replacement, and result/close flow. It coordinates instance creation via the loader/factory.
- One active host per instance. Independent inspectors share definitions/data services, not mutable local state.
- Define four identities: feature type, subject (such as territory ID), unique runtime instance ID, and stable saved-state key scoped to user/game/location.
- Default request path: `host.open(featureId, inputs)` → load definition → create instance → mount. Loader caches code promises/definitions, never live instances.
- A per-host generation token gives latest-request-wins. Unknown/failed features render a recoverable host error; obsolete instances are cleaned up. Modal result settles exactly once, distinctly resolved or cancelled.

### Traits and communication

- Traits have a name, declared requirements, private per-installation state, explicit exported capabilities, and lifecycle-bound cleanup.
- Reject duplicate installation and collisions, including inherited methods. No overriding existing methods in V1; extension uses named hooks/capabilities instead of installation-order effects.
- Base lifetime/ownership is universal infrastructure, not something every feature must remember to install as a trait.
- Use direct methods/promises for requests and outcomes; scoped subscriptions for notifications. No all-purpose global event bus controlling every action.
- Event notifications and asynchronous permission/close guards are different contracts.

### Rendering and state

- Explicit `render`/`update` responsibilities, safe text insertion by default, stable controls during incremental updates, and batched redraw where needed. No requirement for every component to implement a reactive store.
- Keep server snapshots, working state, and saved UI state distinct. Shared state is written through service methods, not arbitrary component mutation.
- Save own and child state in separate namespaces with a schema version. Children request their restore slice when ready.
- Initially persist harmless preferences/view state, not orders or sensitive private reports. Drafts live in the instance and are guarded on exit. Never replay commands from restored state.
- Logout, user/game change, and turn change invalidate the appropriate request/cache generations. Persistent UI keys include user/game identity where relevant.

## 5. Map and adaptive shell — agreed boundaries

Global views are separate from map modes, and map modes are separate from tools.

| Boundary | Owns | Does not own |
| --- | --- | --- |
| App/shell | Navigation, host regions, responsive layout, global session/turn status | Endpoint URLs or game-rule calculation |
| World workspace | Active mode, selection coordination, surrounding panels/tools | Every drawing or picking algorithm |
| Camera | Pan, zoom, centering, coordinate transforms | Orders or ownership rules |
| Renderer | Drawing and viewport invalidation | Military/economic workflows |
| Layers | Visible information, draw order, legends, zoom-dependent display, pick candidates | Competing interpretations of the same click |
| Interaction controller/tool | Gesture arbitration and the next action's meaning | Authoritative validation of game commands |
| Feature/service | Order intent, data retrieval, submission/reconciliation | Device-specific host chrome |

V1 map implementation default: retain existing tile/image assets and Canvas 2D drawing where useful, behind a renderer boundary. Adapt or extract only what is needed after a teardown/global-dependency audit. Do not wrap an unsafe widget and assume it became lifecycle-safe. No external map engine, new geographic geometry, or vector-world rebuild is required for the first slice.

V1 map experience: drag pan, pointer-anchored wheel zoom, touch navigation where supported, visible zoom/recenter controls, territory selection, a distinction between click and drag, and useful initial layers. Pick tests must work after pan/zoom and at different pixel densities. Borders/names/selection precede military order overlays; unsupported future layers are not invented.

An inspector presents as a desktop side panel or mobile sheet. Hosts/layout own the change; contained instances retain their feature state. Swipe has button/keyboard alternatives. Focus, touch arbitration, virtual-keyboard space, and scrolling are acceptance criteria, not post-launch polish.

Full-workspace Nation, Economy, and News/report views are allowed. Diplomacy is a future destination until current-game data/actions justify it. The mockup is not permission to show fictitious functionality.

## 6. API, requests, and turn consistency

- Preserve existing server request/response meanings. Document endpoint quirks in the adapter, not in widgets.
- Generated calls accept request options separately from payloads (including `signal`) and use an injected request function. Native Promise returns, with an explicit no-content result.
- One structured error contract: category, HTTP status when available, safe message, field errors, and diagnostic context. Distinguish abort, network/uncertain mutation outcome, validation, session expiry, forbidden, upkeep/unavailable, malformed response, and server failure. Do not invent a backend error code where none exists.
- Handle same-origin cookies, CSRF, JSON acceptance, nested payloads, query encoding, parameter encoding, and 204 responses centrally. Upload/form routes require an explicit adapter if brought into the new client.
- No automatic mutation retries. A stale mutation response may be ignored visually, but its possible server effect must be reconciled and not assumed cancelled.
- First synchronization mechanism default: bounded polling of the existing readiness endpoint; avoid overlapping polls, reduce/pause when hidden, refresh on return. Exact interval follows current behavior/server-load review.
- Snapshot loading verifies current turn/readiness before and after multi-request reads where necessary, rejects mixed-turn results, and uses bounded retries. If the existing API cannot support coherent reads, record a narrow integration gap rather than pretending the client can guarantee atomicity alone.
- Safe display of news/battle text needs a trust/format audit: existing generated HTML is not automatically safe to inject. Decide sanitization/structured representation before those views.

## 7. Source organization and conventions

```text
resources/js/client/
  main.js
  app/          # assembly, shell, navigation, lazy registry
  runtime/      # scope, components, instances, hosts, traits
  api/          # generated definitions/client + transport boundary
  services/     # game data, commands, turn coordination, saved UI state
  ui/           # genuinely shared controls
  features/     # world, territory, nation, military, economy, reports
  styles/       # shared SCSS tokens/base; feature SCSS lives beside features
tests/client/   # runtime/transport and browser journeys, separated by purpose
```

Default conventions: `PascalCase` classes, `camelCase` JS methods/variables, named module exports, one primary responsibility per file, explicit imports, and no feature loading through runtime-evaluated class names. Keep server payload field names at the API boundary; avoid renaming all DTO fields just for cosmetic consistency. Match existing formatting configuration where practical; do not reformat unrelated backend files.

Runtime/shared UI cannot import game features. Features consume service contracts and shared UI; the app assembles them. Shared extraction requires real reuse, not anticipated reuse.

## 8. Explicitly deferred

Future economics/politics, historical mechanics, diplomacy backend/forum, LLM news enrichment, cabinet/election systems, WebSocket infrastructure, offline mutation queue, service worker, universal plugin system, generic reactive framework, live-instance docking/cache, final map engine, map art replacement, exact theme palette/spacing values, and complete localization tooling.

Browser baseline default: supported stable desktop Chrome/Edge/Firefox/Safari and mobile Safari/Chrome at verification time; record actual versions and tested devices in phase 0. Emulation alone is not evidence of real mobile gesture behavior. Exact package pins/tool installation belong to implementation after compatibility verification.

## 9. Acceptance of the baseline

The user accepted the architecture directions, API separation, current-game-only scope, and implementation recommendations, then authorized phases 1–2. The initial read-only slice is implemented; see its handoff for verified behavior and remaining real-device/release checks. Each later phase still requires authorization and its acceptance criteria.
