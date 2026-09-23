# New game client — pre-plan

Status: Original aspect inventory; superseded for current planning by the technical baseline and phased plan

Created: 2026-09-18

Purpose: List the aspects we must account for before planning or building the JavaScript backbone. This is a scope map, not a detailed implementation schedule.

Current entry points: [technical baseline](technical-baseline.md), [implementation plan](implementation-plan.md), and [current-game parity inventory](current-game-parity.md). Keep this document as the original aspect inventory; old unanswered questions below do not override later accepted decisions or baseline defaults.

## 1. Outcome and boundaries

The intended outcome is a maintainable game interface on top of the existing Laravel backend, followed by incremental game evolution. The client should support independently running features, reusable presentation, predictable cleanup, on-demand loading, and future map/diplomacy work.

Confirmed constraints are in [decision 0001](decisions/0001-scope-and-principles.md). Designs below are recommendations until accepted.

Update: [decision 0003](decisions/0003-map-and-adaptive-shell.md) records the subsequently confirmed map/layer/mode/tool distinction, adaptive shell, dark default, SCSS/shared theme tokens, and dedicated non-map views. It takes precedence over earlier tentative desktop/layout/styling suggestions below. Discuss concrete interface journeys before resolving low-level runtime contracts.

Not included in the initial backbone: importing Sproutflix Core; rewriting the game rules; constructing a general enterprise application framework; implementing the forum; choosing and replacing the map renderer; supporting third-party executable plugins; offline order submission; or an elaborate sleeping-instance cache.

## 2. Starting evidence

Read-only inspection on 2026-09-18 found:

- `package.json` already declares ES modules, Vite `^7.0.4`, and the Laravel Vite plugin `^2.0.0`. Declared ranges are not a verification of installed versions.
- `vite.config.js` has CSS and JavaScript entries. Vite is already a project tool; adopting a new client entry need not introduce a new language or frontend framework.
- `resources/js/app.js` imports a bootstrap that exposes Axios globally. The new client should define its own explicit service boundary rather than inherit globals by accident.
- `resources/views/dashboard.blade.php` still uses script tags and substantial inline JavaScript. A configured bundler does not mean the current dashboard is modularized.
- `routes/web.php` exposes routes for users, game status, territories, nations, divisions, deployments, production, news, rankings, and victory. An authenticated endpoint-by-endpoint contract audit remains necessary.
- `app/Services/JavascriptClientServicesGenerator.php` generates a JavaScript client, and the development SPA demonstrates its use. Evaluate whether to adapt that service or use a small new transport adapter before duplicating endpoint knowledge.
- `public/js/component-map-display.js` is already a canvas-based, image-backed map with custom layers and pointer handling. A dynamic map upgrade is an evolution of an existing renderer, not the addition of interactivity to a purely static image.
- The preceding Core assessment identified useful runtime concepts and lifecycle/trait risks. Its local references include Sproutflix's `ui_core/instantiables.js`, `hostables.js`, `interface.js`, `interface_managers/interface_managers.js`, and the ownership/resource/state traits.

## 3. Backbone inventory

Every row needs a deliberate answer. It does not necessarily need a separate class, manager, library, or implementation phase.

### Runtime and structure

| ID | Aspect | What needs to be specified |
| --- | --- | --- |
| R01 | Modules and loading | Entry point, feature registry, lazy boundaries, dependencies, stylesheet/assets loading, load errors, deployment compatibility. See decision 0002. |
| R02 | Composition root | A small GameClient assembles services and the shell; dependencies are passed explicitly. Define startup, session replacement, and shutdown. |
| R03 | Lifecycle and scopes | Constructor versus initialization, mount, readiness, unmount, destruction, and optional suspension. Define legal transitions, one in-flight initialization, cancellation, reentrancy, and failed-start cleanup. |
| R04 | Ownership and disposal | One lifecycle owner per child; distinguish owned objects from borrowed/shared services. Dispose timers, observers, listeners, requests, and children exactly once; await asynchronous cleanup and report failures. |
| R05 | Components and rendering | Small visual units, input/update contract, DOM ownership, safe text rendering, templates, lists/keys, event delegation, and explicit update scheduling. Avoid accidentally inventing an extensive reactive framework. |
| R06 | Instantiables | Running-feature contract, required inputs, service access, local state, actions, close guards, and errors. Separate feature type, subject identity, runtime identity, and persistence identity. |
| R07 | Hosts | Workspace, panel, and dialog containers; replacement and reuse policy, chrome, focus, busy/error states, results, and asynchronous close. One live instance has one active host. |
| R08 | Traits/capabilities | Installation contract, dependencies, private state, explicit exposed methods, collision/duplicate rejection, and disposal. Decide method installation versus namespaced capabilities. |
| R09 | Events and commands | Scoped notifications, unsubscribe ownership, direct commands with results, and asynchronous guards. Define event payloads; do not use one global event bus as the hidden control flow for everything. |
| R10 | Navigation and identity | Routes/deep links, back/forward, selected subject, panel state, missing/deleted subjects, and dirty-work guards. Decide URL path versus query/hash only after shell behavior is clear. |

### Data and state

| ID | Aspect | What needs to be specified |
| --- | --- | --- |
| D01 | API adapter | Existing service-generator evaluation; endpoint contract inventory; same-origin session and CSRF; response parsing; validation/error normalization; cancellation; session expiry; permission failures. |
| D02 | Shared game context | Shared snapshots and subscriptions, reference ownership, per-game/per-user isolation, loading/deduplication, invalidation, and teardown on logout or game switch. Instances retain their own selection, tab, and draft state. |
| D03 | State model and updates | Distinguish server data, live local state, and saved UI preferences. Define how state changes trigger component updates and how child state is aggregated. |
| D04 | Persistence and restore | Versioned serializable state; separate own/child state; child-driven lazy restoration; URL versus local storage; invalid-state fallback; privacy; cleanup between users/games. Draft persistence requires an explicit policy. |
| D05 | Turn synchronization | Detect turn/upkeep/victory changes; reject stale responses; refresh a coherent snapshot; revalidate drafts and commands. Investigate existing revision/status data before requiring new server support. |
| D06 | Mutations and forms | Validation, pending states, confirmation, double-submit prevention, dirty-work protection, authoritative reconciliation, and uncertain outcomes after network failure. Never automatically replay game commands because the UI was restored. |

### User experience and operating quality

| ID | Aspect | What needs to be specified |
| --- | --- | --- |
| U01 | Shell and layout | Persistent regions, workspace/panel/dialog relationships, responsive breakpoints, overflow, resizing, layering, and navigation. Start with a clear workspace; docking windows are not assumed. |
| U02 | Shared visual controls | Buttons/actions, tabs, forms, validation summaries, tables/lists, empty/error/loading views, tooltips, confirmations, notifications, and numeric/time formatting. Build controls as features require them. |
| U03 | Styling and assets | Design tokens, CSS scoping/conventions, feature styles, icon/font/image strategy, themes/contrast, and avoiding legacy-style collisions. Existing Tailwind configuration does not settle our styling choice. |
| U04 | Input and accessibility | Keyboard navigation, focus return/trapping, dialog dismissal, screen-reader labels/status, touch/pointer behavior, reduced motion, and an accessible alternative to map-only information. |
| U05 | Text and localization | Centralize user-facing text and formatting sufficiently for later localization; decide initial language scope. Do not build a translation-management framework now. |
| Q01 | Testing and diagnostics | Lifecycle/host/trait/state unit tests; endpoint contract fixtures; browser journeys; resource counters and ownership inspection; useful error context without secrets. Choose test tools separately. |
| Q02 | Performance | Startup requests/bytes, feature-load latency, map redraws, large lists, subscription counts, and retained instances. Measure first; set budgets after a baseline on agreed target devices. |
| Q03 | Security boundaries | Safe user-content rendering, permission-aware controls, server-authoritative authorization, no secrets in built assets, no arbitrary module URLs, and separate admin/dev surface. Hiding a feature is not authorization. |
| Q04 | Coexistence and release | Separate new-client entry, controlled access, unchanged legacy fallback, feature parity checks, asset versioning, long-running tabs after deployment, rollback, and documentation maintenance. |

## 4. Feature inventory

These are proposed client feature areas, not a claim that all endpoints or interaction designs have been verified.

| Feature area | Existing-game scope to map | Later possibilities |
| --- | --- | --- |
| Session and onboarding | Login/session expiry, nation-setup status, nation creation, home-territory selection | Onboarding improvements |
| Game workspace | Game/turn status, upkeep availability, ready-for-next-turn action, victory state | Richer turn notifications |
| World map | Territory selection, layers, owner/army/order information, links to inspectors | Smooth pan/zoom, animation, richer overlays, alternate renderer |
| Territory and nation inspectors | Public/private detail, resource and ownership information, comparison | Expanded history and diplomacy links |
| Military | Divisions, movement/disband/cancel orders, deployments/cancellation | Richer planning tools |
| Economy | Budget, production, bids, capacities and feedback | Richer economic analysis |
| Reports | Battle logs, news, rankings, victory presentation | Expanded history/search |
| Preferences | UI layout, map preferences, tabs, accessibility preferences | Additional personalization |
| Administration/development | Decide which existing tools remain legacy-only | Separate new admin client if actually needed |
| Diplomacy | No forum implementation in the initial client | Forum/topics/posts, visibility, participation and notifications; treaties/resolutions/voting are separate product decisions |

For each existing-game feature, the later parity matrix should list the current UI action, read/write endpoints, permissions, upkeep rules, loading/error behavior, new-client status, and verification. Do not assume a controller list equals full UI parity.

## 5. Future-facing boundaries

### Map

Separate map data, camera/selection state, layer definitions, interaction modes, and rendering. The game-facing boundary should expose concepts such as territory selection, camera changes, and overlays rather than requiring every feature to know canvas internals.

The first slice should use an adapter around existing map behavior where practical, after auditing teardown and global dependencies. Replacing a container alone is not proof that the existing widget is lifecycle-safe.

Defer Canvas/SVG/WebGL or library selection until we establish geometry, world size, desired zoom/animation, picking needs, mobile expectations, and performance measurements. Existing tile coordinates do not imply polygon geometry is available. Richer geography or live updates may require backend/data work later.

### Diplomatic forum

Reserve a lazy feature boundary and links from nation/territory views. Do not implement empty services or a generic plugin system for a feature whose requirements are not defined.

Later discovery must define public versus private audiences, nation versus user authorship, permissions, topic structure, moderation, safe rich-text rendering, pagination/search, drafts, attachments, unread state, and notification transport. Database/API/authorization work belongs to that future feature plan, not the client runtime.

### Changing server state

The interface must remain usable during upkeep, session expiry, and turn transitions. Polling versus push is undecided. Start by investigating the server's existing status responses. Cancelling a browser request does not prove a submitted game command was cancelled on the server.

## 6. Proposed code organization

Illustrative only; no directories or code below have been implemented.

```text
resources/js/client/
  main.js
  app/                 # bootstrap, shell assembly, navigation, feature registry
  runtime/             # scope, component, instance, host, traits, state contracts
  services/            # API adapter, game context, persistence, turn synchronization
  ui/                  # shared controls, layout primitives, formatting
  features/
    map/               # map instance, adapter, layers, feature styles
    territory/         # details instance and its local components/state
    nation/
    military/
    economy/
    reports/
  styles/              # shared tokens/base styles
```

Add future feature folders when implementing them, not as speculative scaffolding. Keep feature-specific widgets beside their feature until actual reuse justifies promotion.

Dependency direction: runtime does not import game features; shared UI does not import feature implementations; features use runtime/UI/services; the app assembles them through lazy entry points. Features should not reach into another feature's private DOM or instance fields.

## 7. Planning gates, not a full implementation plan

1. **Agree on boundaries.** Review this inventory, loader proposal, exclusions, and open questions.
2. **Audit integration and specify contracts.** Produce a feature/endpoint parity matrix; define lifecycle, ownership, host, trait, state, rendering, and feature-loading contracts with failure cases. Decide the trial-client entry and fallback.
3. **Approve a minimal vertical-slice plan.** Scope only the runtime needed for map selection and a read-only territory inspector, shown in both a panel and a dialog.
4. **Prove the slice.** Verify independent instances, latest-selection-wins, close-during-load, initialization failure cleanup, lazy state restore, keyboard/focus behavior, and stable resource counts after repeated open/close. Inspect production network requests to prove unopened features remain unloaded.
5. **Plan progressive parity.** Expand into existing-game features, exercising mutations only after the read-only architecture works. Keep the legacy client available until replacement criteria are met.
6. **Open separate evolution plans.** Dynamic-map improvements and diplomatic forum requirements are scoped independently, using the tested client contracts.

The runtime is allowed to evolve with real features. We should not complete a universal framework before proving one useful screen.

## 8. Questions to settle before the detailed backbone plan

| Question | Suggested starting position, not a decision |
| --- | --- |
| Initial device/browser scope? | Adaptive desktop/mobile shell is confirmed; exact breakpoints, touch interactions, and tested browsers remain open. Features should not own device-specific shell decisions. |
| Workspace model? | Persistent map, one inspector region, dialogs; no dockable multiwindow desktop initially. |
| Multiple instances? | Allow independent instances by design; start with one primary inspector and dialog comparison. |
| Rendering style? | Small explicit DOM/template helpers with explicit updates; review one representative form/list before standardizing. No TypeScript. |
| Trait composition? | Keep the concept, define collision/dependency/disposal rules before choosing the exact syntax. |
| Data access? | Evaluate the existing generated client against cancellation/error needs; adapt or replace behind one boundary. |
| New-client entry? | A separate authenticated opt-in page; decide route and permissions before any backend integration edit. |
| Saved work? | Save harmless UI preferences initially; separately agree whether drafts persist and how changed turns invalidate them. |
| Update transport? | Use existing status/read APIs for the first slice; choose polling/push from evidence later. |
| Loader? | Adopt proposed decision 0002 after review; verify its production behavior against the locked toolchain. |

No answers are required to create this pre-plan. They are the agenda for the next architecture discussion.
