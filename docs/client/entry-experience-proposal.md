# Entry experience — concrete architecture proposal

Status: Accepted and initial implementation delivered; see [entry handoff](entry-experience-handoff.md)

Date: 2026-09-19

Decision: [ADR 0005](decisions/0005-entry-experience.md)

## 1. Outcome and agreed direction

Give the current game a coherent home/login and nation-creation experience using the supplied cityscape. Use the supplied music only during initial loading and login, as clarified by the user. Introduce English/French strings now. Preserve the existing plain-JavaScript, Core-inspired client architecture, with reusable components, explicit running instances, hosts, ownership, and processes.

The user agreed to the conceptual direction and then read and approved this concrete proposal, explicitly authorizing implementation. This document preserves the agreed design; the [handoff](entry-experience-handoff.md) records delivered behavior, verification and remaining polish. Ownership, integration parity, and usable error recovery belong to the first implementation.

This is an additional entry/onboarding slice after completed phases 1–2. It brings the onboarding part of Phase 4 forward without authorizing military actions, the remainder of Phase 4, or a default-interface cutover. Laravel remains the game and authentication authority.

## 2. What exists, and what we will reuse

Paths in this document are relative to the repository root.

| Existing piece | Evidence | Proposed treatment |
| --- | --- | --- |
| Instance / Component / Scope | `resources/js/client/runtime/` | Reuse lifecycle, cancellation, child ownership and safe teardown. A Component is already a DOM-owning Instance. |
| Host / FeatureLoader / registry | `runtime/Host.js`, `runtime/FeatureLoader.js`, `app/registry.js` | Reuse for entry features and step instances. Definitions can be shared; running state cannot. Keep explicit factories and lazy loading. |
| Scoped notifications | `runtime/Signal.js` | Reuse for locale, audio and process-state notifications. No global event bus. |
| SavedState | `services/SavedState.js` | Reuse versioning and storage-failure fallback. Add a device preference namespace alongside existing user/game namespaces. |
| Safe DOM helpers / surfaces | `ui/dom.js`, `ui/FeatureSurface.js` | Reuse helpers. Extract common surface treatment where actually shared; entry/wizard chrome does not inherit inspector-specific text or dismissal behavior. |
| Theme tokens | `styles/_tokens.scss` | Extend the existing dark, gold-accented theme with atmosphere/surface/motion tokens. |
| Generated endpoints and transport | `api/` | Preserve generation and error categories; explicitly support multipart uploads and refreshed CSRF state. |
| Map building blocks | `features/world/Camera.js`, `CanvasRenderer.js`, `MapPicker.js`, `MapInteractions.js` | Share a small map viewport between browsing and home selection; each instance has its own camera, selection and lifetime. Audit coupling before extracting. |
| Login | `routes/web.php`, `UiController::loginUser`, `views/login.blade.php` | Keep existing session authentication and throttling. Add an explicit JSON response path for the new entry experience. |
| Full nation creation | `UiController::storeNation`, `CreateNationUiRequest`, `views/new_nation.blade.php` | Preserve all current inputs, uploads, territory rules and finalization through one shared backend operation. |
| Existing client | `main.js`, `app/GameShell.js`, authenticated `/client` | Keep the working read-only client. Reuse its architecture and add translation coverage; do not claim full gameplay replacement. |

There is no translation service or wizard in the inspected client. The original Sproutflix Core string-table source has not been reviewed in this work; the proposal follows the familiar concept without claiming API compatibility or importing Core.

## 3. Meaning of the building blocks

| Kind | Contract | Concrete example |
| --- | --- | --- |
| Component definition | Reusable DOM behavior, explicit inputs, callbacks and updates; no embedded endpoint decisions | `Wizard`, `FormField`, `MusicControls` |
| Running instance | Owns its state, children, subscriptions and cleanup; follows existing Instance lifecycle | One login feature, one nation-creation feature, one mounted territory step |
| Host | Mounts/replaces instances and coordinates close guards, loading/error state and focus | Entry feature host; wizard step host |
| Process | Owns a workflow's transitions, validation coordination and outcomes; does not render DOM | `NationCreationProcess` |
| Service | Provides data or shared capabilities through explicit methods; app-owned lifetime | `AudioService`, `LocalizationService`, `NationSetupService` |

Processes initially use ordinary classes with an owned Scope and a small explicit state model. We do not add a generic workflow engine or another runtime lifecycle. A process is created and disposed by its owning app/feature instance. Do not overload the existing `Instance.state` lifecycle field with workflow state; use `process.status` and `stepId`.

## 4. Ownership and lifetime

```text
Entry application (one document)
├── device preferences, localization, audio, session services
├── EntryProcess (session/setup decisions and feature transitions)
└── EntryShell
    ├── AtmosphereBackground
    ├── LanguageSelector + MusicControls (loading/login only)
    └── entry Host
        ├── LoginInstance                 [one active feature at a time]
        └── NationCreationInstance
            ├── NationCreationProcess     [owns draft, errors, submission]
            └── Wizard
                ├── progress + navigation
                └── step Host
                    └── active step instance
```

The entry application explicitly registers service/host cleanup with its Scope. The shell borrows services; children do not destroy them. The nation feature owns its process and Wizard; the Wizard owns its step host. One active host per instance remains mandatory.

Changing steps destroys the previous step instance and mounts the next. Draft values, File objects, validation state and optional map view snapshots live above those steps in the process. Going Back reconstructs a step from that draft. Language changes and responsive reflow update existing controls without remounting the feature, losing focus or clearing input.

The background survives login-to-wizard navigation because the same entry application stays mounted. AudioService can remain allocated, but playback is allowed only during initial loading/login. EntryProcess fades/stops it before showing nation creation or the game. Wizard loading, validation, submission and gameplay never start the soundtrack. MusicControls are visible during loading/login; the language selector remains available throughout.

Two independent wizard instances have separate drafts, step hosts and errors, even when sharing the same component definitions and translation service. Only one nation-creation process for the current user/game is opened by the entry application.

## 5. Player journey and route proposal

Introduce an opt-in public `GET /client/entry` on the existing Laravel host. It delivers a minimal, session-aware Blade bootstrap with private/no-store caching. Guests receive only safe entry configuration, CSRF and locale data; authenticated setup reads remain authenticated. Existing `/`, `/login`, `/create-nation`, `/dashboard`, `/client` and administrator behavior remain available.

Use a dedicated entry module, avoiding startup of WorldService or game polling before login. Entry hash routes are explicitly allowlisted: `#/login`, `#/nation/identity`, `#/nation/leader`, `#/nation/homeland`, `#/nation/review`. The existing world-only Router stays separate. Hashes contain no credentials or draft values.

| Observed server state | Entry behavior |
| --- | --- |
| Guest | Show login immediately; language and sound controls are available. |
| Authenticated, `NotCreated` | Start the identity step. |
| Authenticated, `HomeTerritoriesSelection` | Load recoverable pending setup through the proposed setup read contract; explain which details must be re-entered. |
| Authenticated, `FinishedSetup` | Offer entry to the existing `/client` preview and a clear legacy gameplay link. |
| No active/available game, upkeep, insufficient free territory | Show the relevant recoverable state; preserve any current draft and offer an explicit refresh. |
| Unknown setup status or failed status read | Show an error/retry state; do not infer that a new nation should be created. |

The current enum also declares `None`, but the inspected User method returns NotCreated/pending/FinishedSetup. Implementation must map actual no-game/not-joined responses rather than treating an unused enum as a verified journey.

The login process submits once, obtains refreshed session/CSRF/bootstrap information, clears the password, then resolves setup status. The atmosphere remains mounted; leaving login ends playback without changing the remembered mute preference. Existing non-JSON login keeps its current administrator/dashboard redirects. New-entry administrators retain an explicit route to existing administrator tools.

Browser Back/Forward participates in the same guarded transitions as buttons. A future step cannot be unlocked by editing its hash. Revisiting earlier steps preserves the draft; changing an earlier answer invalidates dependent validation. Leaving a dirty wizard asks to discard or remain. Refresh/closing the tab uses a best-effort native unsaved-work warning; it cannot guarantee recovery.

Session expiry suspends authenticated work and allows same-document reauthentication. Keep the draft in memory only while awaiting the same user/game; clear it on explicit logout or a different identity/game. Revalidate setup and territory availability before resuming. A lost session during final submission is an uncertain outcome to reconcile, not a reason to silently repeat submission.

## 6. Shared component inventory and contracts

Names are proposed; keep existing `ui/` as the shared-component home rather than creating a competing top-level components tree.

| Component | Inputs / actions | Boundary |
| --- | --- | --- |
| AtmosphereBackground | Asset reference, overlay treatment, entrance policy | Owns image loading/fallback and visual transition; no authentication or navigation. |
| GlassPanel | Heading/content slots, compact/wide treatment | Shared surface styling and semantics; no form state. |
| FormField | Stable ID, label/help/error, native control | Reused by login and nation identity; links errors to their control. |
| FeedbackMessage | Localized message, severity, optional retry action | Shared presentation; never decides whether a mutation can be retried. |
| Wizard | Ordered step descriptors, current state, navigation callbacks | Presents progress and hosts active steps; no nation rules or HTTP calls. |
| Wizard step instance | Draft slice, read-only context, update callback, validation feedback | Edits only its assigned draft fields; never creates a nation. |
| ImageField | File, constraints, preview, change/remove callbacks | Shared by flag and portrait. Owns/revokes preview URLs, while the process owns File references. |
| MapViewport | Map data, layers, selection, interaction callback | Reuses current camera/render/pick machinery; home-selection policy stays in the nation feature. |
| MusicControls | Playback state, mute/volume actions | Reflects actual playing/blocked/error state separately from saved sound preference. |
| LanguageSelector | Supported locale list, selected locale, change action | Reused in entry and current game shell. |

Use semantic native buttons, inputs and selects with shared SCSS before adding classes for every primitive. ChoiceCard is deferred until a real choice benefits from it. Nation names and uploaded images do not require invented political/government choices.

Step descriptors use stable IDs, a title translation key, and an explicit feature factory/loader. The process exposes `snapshot()`, `updateDraft(patch)`, `back()`, `next()`, `goTo(stepId)`, `submit()` and a scoped `changed` notification. These are indicative signatures, not a second framework. Validation returns field issues; the process selects the owning step and the component focuses its first invalid field.

## 7. Nation wizard: four concrete steps

| Step | Existing inputs | Experience |
| --- | --- | --- |
| Identity | Nation name, optional formal name, optional flag | Name the nation and preview its identity. |
| Leadership | Leader name, optional title, optional portrait | Compose the leader presentation using the same ImageField. |
| Homeland | Required count of suitable, connected home territories | Wider panel with map and keyboard-accessible territory list; show remaining selections and allow correction. |
| Review and found | Summary of all fields and territory choices | Edit links return to the owning step; one explicit final submission. |

The required territory count and constraints come from server configuration/read data, not duplicated magic numbers. Reuse current connected-selection behavior as a client preview; Laravel remains authoritative. If availability changes, return to Homeland with a clear explanation and preserve identity/leader details.

The process keeps a memory-only draft `{identity, leader, homeland}` and workflow status: editing, validating, submitting, reconciling, complete, or blocked. No request creates a nation when the player merely advances a step. Review triggers the full creation operation. Lock duplicate submission and navigation while the result is pending, while retaining the language control. The wizard remains silent.

Files survive step changes through memory references, not saved input elements. Browsers do not permit restoring file input values after a reload: resume shows saved draft metadata only when genuinely available and asks for replacement files when needed. No password, File, nation draft or private report goes into local storage.

## 8. Narrow Laravel integration proposal

The new interface cannot use the current JSON setup endpoints as a full replacement for the legacy form. Inspection found:

- `/nation` accepts only `usual_name`; `/nation:select-home-territories` carries territory IDs.
- `UiController::storeNation` handles the complete identity/leader/upload flow, whereas its final response is a redirect.
- `NationController::selectHomeTerritories` calls `finishSetup` without its required `leaderName` argument. This is a static compatibility finding, not a tested runtime failure.
- The status response does not expose a pending nation's editable identity. A resume screen cannot reconstruct data from it alone.
- `storeNation` can create a pending nation before image processing fails. A submission is not proven atomic. The leader-image failure is currently assigned to the `nation_flag` field.
- The current transport serializes mutation bodies as JSON and captures the bootstrap CSRF value. It needs explicit multipart support and session-token refresh for this journey.

Recommended bridge:

1. Add content-negotiated JSON results to the existing login route while retaining the current HTML redirect branch, authentication logic and throttle. Return minimal authenticated bootstrap with a fresh CSRF token and safe server-derived destinations. Failed credentials produce a structured error, not a followed HTML redirect.
2. Extract the existing full nation operation into one backend application service used by the existing form controller and its new JSON response path. Keep current field names, authorization, upkeep gates and image processing semantics. Submit multipart FormData to the named full-form route. Extend generated route coverage deliberately if necessary; never hand-edit generated output or place literal URLs in components.
3. Add an authenticated setup-options/read contract: current user/game/setup identity, actual recoverable pending nation fields, required selection count, suitable/taken territory IDs and explicit supported upload constraints. Existing map geometry reads remain reusable. Never fabricate unsaved leader/image values during resume.
4. Define JSON results before implementation: success with refreshed setup status/destination; field validation with owning field keys; distinct unavailable/session errors; and a structured conflict when setup was already completed or eligibility changed. Refresh CSRF through SessionService and an injected provider or rebuilt transport before the next mutation.
5. Use server-side locale selection restricted to `en`/`fr` for validation and known entry errors, including the first failed login. Specify how the selected locale reaches the request (an allowlisted locale header is the default proposal). Keep raw exception text out of UI. Correct the leader-photo field mapping as part of the adapter work.
6. Audit finalization for duplicate/concurrent submission, eligibility revalidation under the existing lock, database transaction boundaries and uploaded-file cleanup. Narrow consistency fixes are part of delivering this creation operation, with isolated tests. Do not call it atomic or idempotent until proven. If wider game-rule/schema changes are required, record that dependency explicitly before extending scope.

On an ambiguous network/server failure, NationSetupService first rereads server setup state. E0 must establish a trustworthy completion signal: the current model saves FinishedSetup before its finalization call, so that enum alone is not yet proof that every effect completed. A pending record permits deliberate recovery only after the contract establishes what succeeded. Do not automatically retry a mutation. If partial finalization cannot be distinguished safely, show a blocked recovery state rather than guessing or creating another nation.

The narrower JSON setup flow remains a compatibility boundary; this slice does not depend on it. Document its discovered signature mismatch and decide any repair separately from routing the new wizard through the full operation.

## 9. English/French string tables

Add `LocalizationService` and `strings/en.js`, `strings/fr.js`. English is the fallback; initial selection is saved device preference, then browser language restricted to the supported languages, then English. Expose `t(key, parameters)`, locale-aware number/date formatting and a scoped locale-change signal. Use whole sentences with named placeholders and plural forms instead of concatenated fragments.

Namespaces follow responsibilities: `common.*`, `entry.*`, `auth.*`, `wizard.*`, `nationCreation.*`, `world.*`, `territory.*`, `errors.*`. A missing French key falls back to English and is reported during development. A key absent in both tables gets a safe production fallback and a development diagnostic. Key/placeholder parity is a delivery check.

Translate entry, wizard, shared controls, accessible names, validation, loading/error states, and the already implemented new-client shell/world/territory UI. Updating visible strings must preserve input, selection, active step, camera and focus. Set document language and title. User-created nation/leader names and server game content are not automatically translated; legacy admin/game pages are outside this migration.

Transport errors retain stable categories; the presentation/service boundary maps them to keys. Backend field validation is localized server-side. Existing English server strings cannot all be translated by a frontend table. Unknown messages receive a safe localized summary rather than unreliable text matching. Translation infrastructure is in scope now; a translation management platform and wholesale backend content localization are deferred.

## 10. Audio, background and preferences

Use the supplied `hires.png` (2,740,136 bytes) and `intro.mp3` (5,207,708 bytes). They have been located, not copied, converted or auditioned during planning. Proposed destinations are `public/res/bundled/entry/` with a small app asset manifest. Retain supplied originals when preparing optimized derivatives; assess image crop and music duration/loop seam during implementation.

Start with the existing dark charcoal/gold palette, a full-viewport cityscape, a readable glass panel and persistent language control. Show sound controls only on loading/login. Identity/login use a compact panel; Homeland uses a wider workspace over the same background. Preserve usable scrolling at narrow sizes and large text. Blur has a sufficiently opaque fallback.

The entrance fades from black once per entry-document visit after image readiness, with a bounded wait and a dark fallback if loading fails. Reduced motion removes the entrance animation. Steps do not replay the opening cinematic. Exact fade duration, crop, typography and ornament are polish choices.

AudioService owns one player per entry application. EntryProcess grants playback eligibility only to initial loading/login; eligibility is separate from the remembered mute preference. Proposed first-visit preference: sound enabled at a restrained default volume, with visible controls before any sound. Playback is attempted only through a user gesture and may remain blocked; no fake playing indicator. Store `muted` and `volume` using device SavedState. Playback errors remain non-blocking, and preference-storage failure falls back to in-memory settings. Retain settings across login and later visits without storing the playback position or promising sound before interaction. Pause while hidden and resume only when the active screen, saved preference and browser behavior allow it. Revoke eligibility immediately on leaving login; a fade completion or late play promise cannot restart audio in the wizard/game. Signed-in users going directly to setup/game must not receive a brief soundtrack burst during status resolution.

The first implementation verifies whether repeating the track is pleasant; loop behavior and fade details can be polished without changing ownership. Avoid downloading the entire soundtrack before it is needed. Neither audio nor image loading blocks authentication or error recovery indefinitely.

## 11. Proposed source organization

```text
resources/js/client/
  entry.js                         # public entry composition; main.js remains game composition
  app/
    EntryShell.js
    EntryProcess.js
    EntryRouter.js
    entryRegistry.js
    entryAssets.js
  runtime/                         # reuse existing lifecycle/hosts; no parallel runtime
  ui/
    atmosphere/AtmosphereBackground.js
    GlassPanel.js
    FormField.js
    FeedbackMessage.js
    ImageField.js
    MusicControls.js
    LanguageSelector.js
    wizard/Wizard.js                # child Host plus progress/navigation
    map/MapViewport.js              # bounded extraction for world + homeland consumers
  services/
    LocalizationService.js
    AudioService.js
    SessionService.js
    NationSetupService.js
    SavedState.js                  # reuse, with device and user/game namespaces
  strings/en.js
  strings/fr.js
  features/
    login/login.feature.js
    nation-creation/
      nation-creation.feature.js
      NationCreationProcess.js
      steps/                       # identity, leadership, homeland, review definitions
      nation-creation.scss
  styles/                          # extend shared tokens and entry/component styles
```

Screens are app/feature compositions. Instances are runtime objects. Neither needs another parallel folder hierarchy. Processes stay next to their owning app or feature until real cross-feature reuse warrants extraction. When extracting MapViewport, move genuinely shared rendering/camera helpers with it and update both consumers; shared UI must not import a game feature. Backend additions belong to the current Laravel controllers/services/request/read-model conventions; language resources belong in Laravel's translation location.

## 12. Delivery sequence and acceptance

These are the approved delivery stages. Their initial implementation and verification evidence are recorded in the [handoff](entry-experience-handoff.md).

| Stage | Deliverable | Completion evidence |
| --- | --- | --- |
| E0 — Contracts | Resolve login/session, full nation submission, options/resume, upload/locale and recovery contracts; define isolated mutation fixtures | Exact payload/result/error tables; no unresolved gap hidden by UI assumptions; compatibility findings dispositioned. |
| E1 — Shared entry foundation | Opt-in entry route; shell/background, audio/preferences, localization, login component and fixture journey | Supplied assets render; EN/FR switching preserves input; saved mute survives reload; playback stops on leaving login and cannot restart in wizard/game; reduced-motion/image/audio failure paths work. |
| E2 — Wizard composition | Shared Wizard, four step instances, nation process, image fields and shared map viewport with synthetic data | Back/Forward preserves draft and File references; independent wizard instances stay isolated; dirty guards, field focus and territory corrections work. |
| E3 — Real integration | JSON login/full multipart creation bridge and setup reads; session/CSRF handling; pending/uncertain recovery | Isolated HTTP/browser journeys verify actual backend persistence, error mapping, same-user resume, no duplicate submission and unchanged legacy form contracts. |
| E4 — Coherence and polish | Translate existing new-client UI; entry-to-game handoff; responsive/accessibility/visual pass | Current read-only client regression passes; keyboard/list territory selection, large text, long French strings and lifecycle cleanup checked; real-device gaps documented. |

E0 precedes binding controls to live mutations. E1/E2 use fixtures until E3's contracts are verified. Keep existing runtime/transport/browser checks and add focused coverage for the new boundaries; fixture-only success is not evidence of working authentication/uploads. Do not test creation against the active game. Confirm an isolated Laravel/database/upload environment before mutation tests; if unavailable, report that integration verification remains incomplete.

Planning originally changed documentation only. The subsequent authorized implementation is now built and available through the opt-in entry; default adoption remains a separate release decision under the existing baseline. Existing legacy gameplay remains discoverable because `/client` is still read-only.

## 13. Decisions versus polish

Structural recommendation: retain the runtime; keep one entry application alive through login/setup; keep drafts in the process; keep components independent of endpoint details; use the full nation operation; introduce shared language/audio preferences now. Soundtrack scope is a user requirement: initial loading/login only, never nation creation or gameplay.

Polish can change panel placement, step wording, image crop, fade timing, ornament, spacing and soundtrack looping. It must preserve accessible controls, error recovery, ownership and feature parity.

The accepted structure is implemented for a first visual review. See the [handoff](entry-experience-handoff.md) for concrete usage, verified contracts and remaining limitations.
