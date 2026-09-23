# Game UI foundations — living plan

Date: 2026-09-19

## Identity Lab — implemented Flag Editor — 2026-09-23

The standalone [Identity Lab](../game-design/identity-lab.md) composes Button, Panel, FieldShell, RangeField, native controls and Scope without a new shared component. Visual patterns, three independent randomizers, editable palette swatches and direct dragging are the primary flow; detailed layer controls are collapsed under Advanced. Colour harmony returns hex values rather than introducing a colour-wheel widget. The feature-local symbol picker, six-alternative gallery and eight-study shelf use semantic tokens, EN/FR labels and keyboard alternatives. Canvas renders opaque PNG; DOM selection overlays do not affect exports. Recipe/PNG snapshots save atomically, and unsupported saved recipes retain their images. Emblem/Coat of Arms tabs remain disabled; no game data owner or gameplay asset assignment is introduced. The user approved the initial visual proof and asked for lower editing friction. Focused Chromium, Node, route contracts and production build cover the implementation; [ADR 0019](decisions/0019-experimental-flag-editor.md) and the handoff record the boundary and remaining limitations.

## Compact command and header follow-up — 2026-09-23

The game header now keeps the Novus mark, menu, five icon-only workspace links and turn context in that order. Games moved into the menu; every workspace icon retains a localized accessible name, title and native link. Nation colours are chosen and reviewed only during nation creation, so the post-setup editor and mutation endpoint were retired while confirmed colour assignments remain the source for maps, units and reports.

World groups active divisions by type and current territory into counted stacks using the existing unit artwork. Group checkboxes still emit explicit division IDs; command and server validation are unchanged. The three common selection actions form a labelled icon toolbar. Move previews summarize reachability and identical routes, with details and the list fallback collapsed. On narrow screens the command sheet contracts to a short destination prompt while the map is the required input, then reopens after selection. `WorldCommands` owns this feature composition; no game-aware generic component or new data owner was added.

Focused Chromium covers counted selection, accessible toolbar names, grouped routes, the mobile pick/reopen flow, EN/FR header layout and menu placement. Node contracts, generated endpoints and the production build remain the broader checks.

## Selectable experimental AI scripts — 2026-09-22

The existing AI administration composition reuses `FieldShell`, `Button` and `ConfirmDialog` for script selection and assignment. Script switching captures the selected nation/script/context before confirmation and preserves readiness. Native downloads provide the author kit and deliberately selected private player snapshot. Per-nation reports show selected scripts and any one-turn fallback. No new UI framework or gameplay component is introduced; a real isolated browser journey checks these controls and narrow layout.

## Final interface cutover — 2026-09-22

The shared entry, game and administration compositions are now the sole interface. Root and retired screen bookmarks redirect into these destinations; old Blade screens, their jQuery/map/dashboard scripts and their fallback links are removed. No replacement component was needed: `DestinationNav`, `GameSelector`, the existing entry process and administration features already covered the surviving journeys. The development labs remain linked through Tools & experiments, with their previous development-only boundary. Current Blade shells carry concise no-JavaScript messages rather than links to deleted pages. Route/source contracts, a real isolated redirect/login/setup journey, representative Chromium checks and the production build cover the cutover.

## Accepted gameplay additions — 2026-09-22

The existing territory inspector composes native disclosures for public owner/leader identity and compact productivity details; portrait/flag images remain decorative beside identity text and disappear if unavailable. It preserves mounted nodes and disclosure state during updates. `services/forceSummary.js` supplies pure confirmed-data calculations shared by World and Military; features render localized selected power and owned-territory defense with existing typography/tokens. Defense is explicitly before battles, including incoming orders, queued deployment and still-defending disband orders; it does not estimate opponents or resolve combat. No generic inspector/card framework was introduced. `TurnAttention` belongs to the selected-game lifetime and owns favicon restoration, acknowledgement and reduced-motion behavior; existing SoundService behavior is unchanged. Focused Chromium coverage checks portrait loading, ownership changes, narrow layout, selection updates, persistent inspector identity and favicon cleanup.

## Destination navigation and tools directory — 2026-09-22

`ui/DestinationNav.js` is a small presentation-only composition of native action links with `aria-current`, using supplied link values and translation. Entry, Games, Tools and Administration are its real consumers. Backend `ClientNavigation` mirrors existing middleware boundaries; the control has no authorization or fetching responsibility. `app/ToolsDirectory.js` is feature composition under the existing Instance lifecycle, with no game requests. Map Lab, Portrait Lab and the synthetic gallery provide return links. EN/FR, narrow layout and the actual login/directory round trip are covered in isolated Chromium. New entry adds only a collapsed installation hint using the existing console command; broader onboarding stays deferred.

## Game selector — 2026-09-22

`app/GameSelector.js` composes native action links, Button and LanguageSelector into responsive game cards, with placeholder previews and Play/Join/Continue setup/Spectate actions. It is feature-specific composition, not a new generic card/control framework. Shared semantic tokens preserve the existing visual identity; text is safe DOM content. Loading, empty, retry/session recovery, EN/FR labels, real new-tab links and initial heading focus are explicit. `GameHeader` adds a visible Games button. Instance/service ownership and dirty/pending navigation belong to `GameApplication`/`GameInstance`, not the card controls. Real Chromium checks cover narrow layout, keyboard/native links and game-instance cleanup; see the multi-game plan.

## Report identity badges — 2026-09-21

- `ui/ReportEvent.js` is a focused shared presentation used by the turn briefing and Reports. It renders attacker/defender identity badges from the existing public nation directory and confirmed nation-colour catalogue. Flags are decorative beside an always-visible nation name; the primary colour is an accent rather than the only identifier.
- Structured battle headlines show one battle-time attacker/defender pairing and territory. A null defender is explicitly labelled Neutral and uses a pirate-flag marker. Existing unstructured news remains safe plain text, so historical rows do not acquire guessed ownership.
- Briefing labels are localized in EN/FR. The feature uses existing flag URLs, semantic tokens and responsive wrapping; it adds no image dependency or universal badge framework.

## World ranking charts — 2026-09-21

- `features/gameplay/RankingsView.js` is the first real chart/trend consumer. It is deliberately feature-local: five current-ranking horizontal bar charts and one selected historical index share report identities, units and nation colours, but there is not yet a second consumer that justifies a universal chart API or gallery fixture.
- Current charts retain direct nation/rank/value text. History uses responsive SVG lines with labelled nation filters and varied dash patterns; an exact semantic table supplies every observation and rank. Missing nation-turn observations remain gaps rather than fabricated zeroes. Empty, one-point, flat and approximate-value series are handled without inventing progress.
- The view owns tabs, filters, disclosure/focus/scroll preservation and responsive presentation only. `GameplayService` owns the lazy game/turn-keyed history read. Laravel retains ranking definitions, public army/wealth approximation and the confirmed through-turn boundary. No chart dependency, history persistence, browser storage or game rule was added.
- Focused Chromium coverage checks lazy loading, keyboard tab movement, missing-point gaps, exact data, background-refresh persistence and narrow layout. The active turn-502 read returned 20,080 points in about 436 ms from four grouped queries; this is implementation evidence, not a fixed performance guarantee.

## Experimental AI controls — 2026-09-21

- `experimental-ai/setup.js` composes shared `FieldShell`/`Button` controls for both AdminApp game creation and standalone map generation: count 0–10, profile, seed, protection and six-bot watch preset. `ConfirmDialog` gained one optional arbitrary-content slot; cancellation/focus behavior and existing callers are unchanged.
- `experimental-ai/WatchingControls.js` composes a header `Disclosure`, native delay select and shared buttons. It reads the service-owned snapshot/driver, shows actual per-bot readiness, and owns no game requests. EN/FR text, narrow layout and the existing persistent canvas were checked in Chromium. Auto-ready does not manage the human nation's orders.
- Ready's existing Button pending state now describes only the human's command, not bot work. Healthy bot-result and other-human readiness refreshes leave it enabled; own submission, already-ready, stale data and real turn-transition gates are unchanged. The fix lives in service coordination, with no new control or styling. Browser regression observes disabled-attribute changes during slow AI/human-only refreshes and submits Ready during those reads.
- `experimental-ai/admin.js` composes the existing admin service, panels/buttons, native fields and confirmations for preview, step, bounded same-turn batch/stop, pause/resume, controller release and reversible assignment of any manual nation. Assignment selects a fresh cautious/balanced/aggressive controller, preserves current orders/readiness and retains the 10-bot limit; release returns the nation to Planning. Private bot explanations stay in administration. No new UI framework or visual vocabulary was added.
- See [AI handoff](../../modules/ai-player/README.md) for temporary ownership/removal. The browser checks also exercised ordinary deployment, movement, HUD, briefing, localization and repeated open/close cleanup.

## Responsive controls and identity follow-up — 2026-09-21

- `ui/EdgeDrawer.js` / `edge-drawer.scss` own one focused responsive interaction: a mounted content region, tap/swipe handle, Escape/outside close, focus return and inert closed content. Desktop leaves content in its original layout. Only the handle owns swipe gestures, avoiding map-pan conflicts; reduced motion disables the transition. World composes its existing mode/tool rail inside it. This first consumer justifies extraction through the distinct gesture, focus and lifecycle contract; it owns no game state.
- `ui/compactLabel.js` supplies full accessible names plus full/short visual labels. GameHeader and World's layer disclosure use it; header styles select the short form below 1000px. News/Ready/Layers retain icons and descriptive names, readiness retains its count. The icon catalogue now includes Layers.
- `PaletteField.setError()` links native radios to validation text. Nation creation uses `nationColorChoices()` for availability. There are still 24 exclusive chromatic primaries; four reusable secondary-only neutrals extend the catalogue to 28. Creation reviews and submits both choices; the server checks reservations atomically. Existing identities remain unchanged.
- Move/attack cost rows are feature composition using shared resource icons and current server metadata, not a new generic widget. Ordinary movement has no extra cost; newly attacking non-owned territory uses attack costs, while existing Attack/Raid orders are already reserved. Show required/available/shortage and block invalid drafts; server validation remains final.
- Rejected commands receive danger styling and a distinct two-pulse sound through the existing optional SoundService. Browser-saved global/event mute and volume remain authoritative. Rejection is announced before the reconciliation read completes; uncertain outcomes stay distinct.

Verified with focused Chromium journeys (including mobile EN/FR and creation), Node checks, PHP contracts and isolated database creation/colour constraints. Physical touch-device and audible tuning remain manual checks. Rankings is explicitly deferred.

Status: F1 foundations and the F2 experimental administration replacement are implemented. Entry, gameplay and admin use shared blocks; `/dev-panel/ui-foundations` is the synthetic development gallery. A native range/exact-value field arrived with the real map studio; World rankings now supply the first feature-local chart/trend implementation, while progress/meters remain deferred. APIs remain revisable. See [ADR 0006](decisions/0006-game-ui-foundations.md) and [the admin handoff](admin-experiment.md).

## Objective and boundaries

Build a small, coherent game UI vocabulary shared by entry, gameplay and administration. A change to a shared panel, field or theme should improve its consumers without hand-editing each screen. Preserve Novus Ordo's identity: dark surfaces, restrained brass accents, readable serif headings, compact operational information and meaningful status color.

Prefer generic concepts with narrow responsibilities, then compose them into game-specific features. Reuse does not require a universal widget, a new framework, inheritance for every element or speculative configurability. Plain DOM helpers remain appropriate for simple stateless composition; lifecycle-owning controls use the existing runtime and `Scope`.

UI primitives own presentation and interaction, not API calls, permissions or game rules. A game scope selector emits a selection; a service validates the scope. A rollback confirmation displays the game and affected turn; it does not implement rollback. Server authorization remains mandatory.

## Small staged plan

| Stage | Work | Exit evidence |
| --- | --- | --- |
| F0 — Inventory and vocabulary | Check existing tokens, shared helpers and repeated feature markup. Record candidate names, real consumers and meaningful differences. | Catalog distinguishes existing from planned; no duplicate system or unused scaffolding. This document starts that inventory. |
| F1 — Extract the visible foundations | Consolidate semantic tokens and shared styling; extract Button, Panel, StatusBadge, MetricCard/CardStrip and FieldShell from real consumers. | At least two representative contexts exercise shared blocks; a small development-only fixture gallery shows relevant states. Existing entry/gameplay behavior stays intact. |
| F2 — Compose the admin dashboard | After implementation approval, assemble game scope, navigation, status strip, titled panels, map manager and guarded actions using F1 blocks. Promote new interaction patterns only when justified. | Scope is explicit and server-validated; global accounts stay distinct; destructive actions name their target. No forked “admin-only” design system. |
| F3 — Add richer controls when needed | Introduce a trackbar, meter/progress indicator or mini chart with its first real feature, using the contracts below. | Real game data or settings justify the control; keyboard/text alternatives and lifecycle tests pass. No speculative control bundle. |

F0/F1 and the approved F2 dashboard are delivered incrementally, not as a whole-client rewrite. Richer controls continue to arrive only with real features. The gallery is a lightweight development/test surface, not a new product or dependency.

## Token model

Keep one shared semantic source in `resources/js/client/styles/_tokens.scss`; retain SCSS modules for structure and CSS custom properties for themeable values.

1. **Scales:** existing spacing and font scales; add radius, border, motion or elevation scales only where consumers need them.
2. **Semantic roles:** surface/background/raised/overlay, primary/muted text, subtle/strong border, command accent, selection, focus, ready/warning/danger. Example candidates: `--surface-panel`, `--text-muted`, `--accent-command`, `--status-ready`, `--action-danger`, `--focus-ring`. These illustrate intent, not a mandatory rename list.
3. **Component aliases only where useful:** e.g. a panel border referencing a semantic role. Avoid a custom property for every declaration or every screen.

Inventory and map existing `--surface`, `--muted`, `--accent`, `--success`, etc. before introducing equivalents. Migrate incrementally with temporary aliases where needed; remove aliases only after checking consumers. Entry atmosphere can remain a deliberate presentation variant, not a parallel copy of basic field/button rules.

Separate UI theme roles from gameplay meaning: nation identity colors, terrain palettes and resource symbols are domain assets/data. Ownership and selection overlays may use theme roles, but a theme switch must not silently relabel a nation's identity or change the apparent resource type. Never use color alone for readiness, danger or ownership.

Glow/border emphasis communicates focus, selection or urgency; it is not the default decoration of every card. Prefer subtle effects, readable contrast and reduced-motion alternatives. No invented performance/contrast claims without measurement.

## Component and resource catalog

The [national planner](decisions/0014-national-production-planner.md) supersedes the mounted `ProductionPanel` sidebar/forms below. `features/gameplay/planner.feature.js` composes existing FeatureSurface, RangeField, Button, Tooltip and CompactMessage in a centred, responsive dialog; it is feature-specific, not a new generic widget. Field labels remain accessible when visually compacted. Materials, cutoffs and territory forecasts are disclosures. FeatureSurface now assigns unique heading IDs when multiple dialogs coexist. World/Economy open the same shell-owned surface; the original panel sources remain unmounted historical code. The UI/data skills kept presentation separate from the forecast, service drafts and transactional command.

[Game UI pass 4](game-ui-pass-4.md) adds `ui/PaletteField.js`: a named native-radio swatch group, updated in place, with disabled-owner labels and local change callbacks. Nation creation composes two fields and owns their draft/submission; the generic field does not know nations or APIs. `ui/SoundSettings.js` composes native checkboxes and the existing RangeField for an optional browser-local SoundService. `ui/icons.js` now supplies the authored outline action/resource family; Button accepts a semantic `icon` (or null for an existing glyph), and resourceVisuals retains its lookup API. Typography is controlled by the shared body/small/tiny tokens. The former sidebar palette is retired in favour of confirmed nation colours and menu-local display settings. `features/gameplay/ProductionPanel.js` is shared feature composition for World/Economy, not a generic UI control. Pass notes record actual states, consumers and checks.

The [third game UI pass](game-ui-pass-3.md) extends the shared map interaction boundary with optional rectangle selection and right-drag panning. `ui/map/unitLayout.js` shares visual slots between drawing/picking; `UnitSprites.js` and `unitPalette.js` provide replaceable image presentation and material ramps with a bounded cache. The World-only `DeploymentBrush.js` composes existing catalogue/fields/buttons and consumes a service-owned local draft; it is not a generic game-aware widget. Native list/checkbox alternatives remain. Five transparent miniature masters and complete generation prompts live in `assets/units/miniatures-v1/`; original catalogue artwork and the portrait builder are unchanged. V1 colour-key masks, density thresholds and artwork remain experimental, with an in-game flat-counter alternative.

The [first map-first game UI pass](game-ui-pass-1.md) implements a mode rail and contextual military dock using existing foundations, plus the focused ImageChoice and Minimap controls. Five provisional unit-art masters and optimized delivery variants exist in `resources/js/client/assets/units/v1/`; gameplay and the synthetic gallery use the WebP variants. Labels, prices and selection chrome remain DOM/CSS responsibilities.

Maintain this table when components are introduced, consolidated or retired. “Existing” means code exists, not that extraction/accessibility/visual review is complete.

| Concept | Evidence/status today | Intended boundary / next decision |
| --- | --- | --- |
| Tokens and base styles | F1/F2: `styles/_tokens.scss` semantic aliases + `styles/_foundations.scss`; entry, gameplay, administration, standalone map studio and gallery | One shared state/style source; existing primitive aliases retained for incremental adoption. Domain/map tokens unchanged. |
| Button / action link | F1: `ui/Button.js`; `dom.js` and `localizedDom.js` compatibility helpers; login submit, ready/command/report actions and entry navigation | Primary/secondary/quiet/danger; native links; independent pending/disabled state. Features own listeners and command safety. |
| Panel / panel heading | F1: `ui/Panel.js`; `GlassPanel.js` adapter and gameplay `section()` composition | Solid/glass surface, semantic tone, heading/actions/footer. Content stays direct children; no feature-host responsibilities. |
| Feature surface | Existing `ui/FeatureSurface.js` | Keep its host, focus, dialog/panel lifecycle responsibilities; reuse panel styling without merging these responsibilities. |
| StatusBadge | F1: `ui/StatusBadge.js`; shell readiness, nation readiness and gallery | Text label + neutral/accent/ready/warning/danger tone; dot is decorative. Caller owns announcements. |
| MetricCard + CardStrip | F1: `ui/MetricCard.js`; nation command summary and gallery | Caller-formatted label/value/context in native definition lists; responsive strip. Zero remains zero; missing value is an em dash. No fetching or formulas. |
| FieldShell / FormField | F1: `ui/FieldShell.js`; localized `FormField.js` adapter, gameplay field helper and gallery | Native control slot, associated label/help/error, optional note, stable IDs; preserves external description references. Feature owns validation, units/value formatting and submission. |
| ImageField | Existing `ui/ImageField.js` | Compose shared field chrome with existing file/preview behavior and URL cleanup; do not fold uploads into every FormField. |
| Feedback / empty / loading | Existing `ui/FeedbackMessage.js`, host statuses, feature-local notices | Consistent status/error semantics and recovery action; avoid announcing routine status as an alert. |
| Tabs / scope selector | Existing navigation/select patterns; generic extraction proposed | Native navigation or select first. Define routing vs local selection before choosing tab semantics. Scope selector never activates a game by itself. |
| Confirmation | F2: `ui/ConfirmDialog.js`; turn/rollback, game creation, password and session actions, synthetic gallery | Promise-returning native modal, caller-supplied target/consequence, initial cancel focus, Escape/focus restoration, parent-Scope cancellation. No command logic. Existing player-native confirms remain. |
| Tables / lists | F2: `ui/DataTable.js`; admin nations, users, map library, object inspector and gallery | Caption/headers, text/DOM cells, keyboard-focusable horizontal overflow. Feature owns search/actions. Existing gameplay table remains local; no universal data-grid. |
| Map viewport | Existing `ui/map/` with camera, picking, layers and overlays; experimental World rotation buttons | `Camera.js` owns clockwise-radian orientation, drawing/inverse transforms, screen-relative pan, rotated fit and four-corner bounds. Classic and beta renderers share that transform; labels and unit sprites stay upright. World composes existing Buttons for ±15°/north-up and saves orientation with its camera preference. Other consumers default to zero rotation; no geography/rule changes. |
| Minimap | Game pass 1: `ui/map/Minimap.js`; main world; rotation-aware viewport polygon | Same map coordinates/renderers, fixed north-up overview camera, clipped four-corner main-viewport outline, click/keyboard navigation intent. No API reads or independent game state. |
| Disclosure | Game pass 2: `ui/Disclosure.js`; header menu, resource details, readiness and map layers | Native details/summary, optional exclusive group, Escape/focus return and outside-pointer dismissal. Content supplied by caller; positioning/domain reads stay outside. |
| Help tooltip | `ui/Tooltip.js` + `ui/tooltip.scss`; production fields/panel, deployment/selection/order instructions, nation-colour dialog, dedicated workspace help and gallery | Text-only `?` trigger, hover/focus or click/tap pinning, Escape/outside dismissal, native popover top layer and viewport positioning. Caller owns text/localization and Scope; no game reads. Uses existing theme tokens and explicit icon opt-out. |
| Compact message | `ui/CompactMessage.js`; player command notices, shell footer, production/deployment validation, territory read failures, nation-colour dialog and gallery | Short visible summary with full safe text on hover/focus/tap when longer. Accepts caller summary/detail; fallback keeps the first short sentence. Errors remain visibly labelled; detail is optional. Shares Tooltip lifecycle and does not classify server outcomes. |
| Compact header / turn briefing | Game pass 2: `app/GameHeader.js`, `app/TurnBriefing.js` | Shell compositions of shared buttons/disclosures/panels. Consume service-owned snapshots/read results, preserve view lifetime, keep seen-marker/preferences separate from private data. No new widget framework. |
| Turn transition | `app/TurnTransition.js`, `app/turn-transition.scss`; player shell | Feature-local native modal plus shared Button/tokens. Consumes the service's turn-transition signal, blurs the backdrop and blocks background input without replacing views. Animated N respects reduced motion; EN/FR messages rotate, then give way to honest slow/error recovery. Escape cannot bypass the data gate. No fabricated percentage or minimum display time; scope-owned timers/listeners. |
| ImageChoice | Game pass 1: `ui/ImageChoice.js`; world deployment catalogue and synthetic gallery | Native selectable image button with live label/detail, selected/disabled/pending states and optional caller-supplied artwork badges (`setBadges`, compact text plus accessible labels). Unavailable can remain inspectable and is distinguished by text plus visual treatment. Caller owns costs, selection and actions. |
| World mode/context composition | Game pass 1: `features/world/WorldCommands.js` | Composes existing Buttons/Panel/fields/confirmation and territory inspector; not a generic domain-aware widget. Scope-owned transient controls and explicit command submission. |
| Resource and unit visuals | `ui/icons.js` / `ui/resourceVisuals.js` authored outline symbols; existing flags, unit art, terrain atlas and server metadata | Semantic lookup and decorative masks are separate from accessible labels and domain IDs. Small nation-coloured unit markings use existing ramps plus spatial masks; no costs or visibility rules invented. |
| Trackbar / range field | F2: `ui/RangeField.js`; shared MapStudio tuning, sound volume, production targets/cutoffs and gallery | Native slider paired with exact number field, min/max/step/unit, contextual help, additive label/bounds updates, local change callback and Scope-owned listeners. No server commands. |
| Progress / meter | Deferred | Contract below; distinguish progress from capacity/readiness. |
| Mini chart / trend | Reports: feature-local `features/gameplay/RankingsView.js`; current bars, historical SVG lines and exact table alternative | Keep domain selection/filtering in Reports. Consider a shared chart only after another real consumer proves a smaller presentation contract. Requires actual turn observations and units; missing stays missing. |
| Portrait lab composition | POC / collection 03: `resources/js/portrait-lab/main.js`, `fitting.js`, `collection-03.js`, `lenses.js` at `/dev-panel/portrait-lab` | Reuses Button, Panel, FieldShell, RangeField and Scope; separate pools and comparison cards. 18 faces, 12 hair designs, 18 garments, 21 accessories; native lens finish/color controls with clipped runtime materials. V4 lens settings preserve v1–3 appearances; new garments keep the head in front of rear collars. Portrait browser checks cover batch rendering, lens restore/clear equivalence, collar occlusion, pool filtering, old pixels, exports and narrow layout. No new generic widget or game commands. See [portrait lab](../game-design/portrait-lab.md). |

Existing source root: `resources/js/client/`. New reusable controls belong under `ui/`; feature compositions stay under `features/`; shared UI must not import a feature. Do not relocate existing modules solely to make the catalog look tidy.

The map-lab atlas experiment (`resources/js/map-lab/atlas-controls.js`, `atlas-renderer.js`) is feature-local composition, not another shared widget. Native named-feature/resource/preset selects, buttons, independent checkboxes and readable inspector values accompany Canvas ocean/river names and resource heatmaps. New field chrome reuses semantic tokens; no shared control contracts, API ownership, or game-state services change. Seeded synthetic geography/resource models remain lab-owned. Chromium checks cover selection, keyboard-accessible lookup/presets, diagnostics, rebuilding, and narrow layout; see [map lab](../game-design/map-lab.md). The UI skill guided native controls, text alternatives, and keeping this single-consumer arrangement local.

The optional Terrain v2 comparison also stays entirely under `resources/js/map-lab/` (`terrain-v2-field.js`, `terrain-v2.js`, local renderer subclass and main controls). It composes the existing native checkbox/button/status patterns and keeps the original renderer as an A/B alternative at the same camera. The UI skill guided retaining independent layers and keeping this experimental single-consumer rendering code outside the shared game renderer. No new generic control, palette system, generated bitmap, live-data service or in-game renderer change. Details and checks are in the map-lab document and progress journal.

The geographic naming extension (`map-lab/geographic-features.js`, `cartography.js`, `atlas-controls.js`, `atlas-renderer.js`) uses one overlapping feature registry for oceans, rivers, continents, islands, ranges and lakes. The UI remains feature-local native checkbox/select/button composition with a readable membership/relationship inspector. The continent-area preset changes classification without changing terrain or simulation state. No new shared widget or live-game service. [ADR 0016](decisions/0016-geographic-feature-atlas.md) records identity boundaries and deferred naming consumers.

The Map Lab administration composition (`map-lab/administration-controls.js`, `administration-renderer.js`, `administration.js`) reuses the lab's native labelled selects/forms/buttons and semantic field chrome. It adds no generic widget or game data owner. Native area lookup/list, per-zone colour input with readable hex value, explicit continuous Add/Remove brushes, coordinate-form alternative, Escape, bounded whole-stroke undo and confirmed local reset accompany independent border/zone rendering. Right-drag pans while painting; Inspect preserves left-drag panning. Pointer capture, outside release, cancellation and window-blur handling prevent stuck strokes; interrupted edits remain undoable. Colour fields retain node identity and each zone's value through selection changes. List selection retains focus; entered names are rendered as text. The UI skill guided native controls, feature-local composition, readable equivalents, preserving other demo preferences and separation from the shared renderer. See [Map Lab](../game-design/map-lab.md) for scope and provisional rules.

## F1 usage and migration notes

The gallery is `/dev-panel/ui-foundations`, linked from Tools & experiments. It allows guests **only in the development environment**, imports no game services and uses no real game values or commands. Sample language/accent changes are local to the page and not saved. `resources/js/client/ui-foundations.js` and `styles/ui-foundations.scss` compose the real controls; they do not implement a second UI kit.

```js
const save = new Button({ label: 'Save', variant: 'primary', type: 'submit' });
const field = new FieldShell({ control: nativeInput, label: 'Quantity', help: 'Whole units' });
const surface = panel({ title: 'Orders', tone: 'accent', actions: save.element }, field.element);
scope.listen(form, 'submit', onSubmit); // feature owns lifecycle, validation and API work
save.setDisabled(!allowed);
save.setPending(inFlight); // ending pending does not clear !allowed
field.setError(message); // displays error; does not invent domain validation rules
```

- Stateful wrappers expose `.element`; Button also exposes `setLabel`, `setDisabled` and `setPending`. Use setters consistently; do not mix direct `.element.disabled` writes with wrapper state. Pending disables native activation, but the feature/service must still guard duplicate or stale commands.
- `actionLink(label, href, options)` is navigation, not a disabled command. The old `button(label, className)` API still returns a DOM node for existing callers; it is a passive compatibility helper, not a pending-state controller.
- `panel(options, ...children)` returns a section, with configurable heading level 1–6. Callers provide text titles and DOM/text content/actions/footer. `GlassPanel` retains its entry size/layout adapter; `FeatureSurface` retains dialog/host/focus ownership.
- `FieldShell` takes one native `control`, `label` text/node, optional help text and optional note text/node. Supply a document-unique ID when identity matters; otherwise a per-module generated ID is assigned. `setHelp`/`setError` update associations without replacing inputs. Existing FormField localization/listeners still belong to its caller's Scope.
- `StatusBadge.update({label, tone})` and `MetricCard.update({value, detail})` update in place. Format values/units and translate labels in features. `cardStrip(label, ...cards)` supplies a named responsive group.
- `_foundations.scss` owns shared states and chrome. `_tokens.scss` maps old primitives to semantic roles (`--surface-panel`, `--surface-control`, `--text-primary`, `--text-muted`, `--border-default`, `--accent-command`, `--status-ready`, `--status-warning`, `--action-danger`, `--focus-ring`, control height and motion). Set theme values at the document root; scoped theme inheritance is not a new supported theme engine. Resource/nation/terrain identities remain separate.
- ImageField/file preview, FeatureSurface, feedback notices, gameplay data tables and navigation retain their existing specialised presentation. Full migration is deliberately incomplete. Existing gameplay localization gaps are not fixed by this extraction.

### F2 additions driven by real consumers

The administration replacement reuses the F1 blocks and adds only three small shared contracts: `RangeField` for the existing generator settings, `ConfirmDialog` for repeated target-specific destructive actions, and `dataTable` for the repeated admin lists/inspector. This supplies real interaction/accessibility needs rather than speculative controls. All three are demonstrated in the gallery.

`features/map-generation/MapStudio.js` is a feature composition shared by admin and the standalone generator. It owns local generator settings/preview/presets; hosts own saved-map persistence and game-creation requests. `ui/map/GeographyPreview.js` owns the existing renderer/camera/gesture integration without API or creation logic. In-page draft serialization stores values/snapshots, never DOM nodes or component instances. See [the admin handoff](admin-experiment.md) for endpoint/ownership details and deployment.

`features/gameplay/ProductionPanel.js` now reuses `RangeField` for the national output target and facility-productivity cutoff. Its feature-local preview is explicitly territorial: it reports eligible facilities, currently free local labor, current resource allocation, demand and facility ceilings without publishing confirmed values or submitting on slider movement. The existing Save action remains the only command path. Exact fields, focus and drafts survive same-scope refresh; the server remains authoritative when food, upkeep and competing bids are allocated.

The original admin access checks are retained, per explicit user direction; this UI extraction does not invent permissions. That is distinct from request target validation, CSRF protection and stale-state guards, which remain required for correct commands.

### F1 verification

- `npm run build`, `npm run check:client`, `npm run test:client:php` and Node tests (including `tests/client/foundations.test.js`) cover production assets, route guards and state contracts.
- `npm run test:client:browser -- client.spec.js entry.spec.js foundations.spec.js` exercises existing entry/world behaviour and the gallery: native labels/help/errors, keyboard focus, independent IDs/values, local form validity, duplicate-submit prevention, disabled/pending/selected states, zero/missing metrics, long French labels, root accent propagation, narrow layout and 20 lifecycle mount/unmount cycles. Fixture server refuses writes.
- Real gameplay regression uses the existing isolated database/HTTP helpers documented in [the gameplay handoff](gameplay-experiment.md), never the active game. Browser coverage is Chromium; real-device and other-browser review remain open. The gallery's sample label switch is not a full translation of the gallery.

## Shared-data integration — first World slice delivered

The user approved the first store-backed implementation pass; [the implementation plan](live-data-plan.md) records the actual contract and remaining migration, and [ADR 0010](decisions/0010-shared-game-data.md) records the direction. This is data/lifecycle infrastructure, not another visual component library.

For ongoing work, the [client-data skill](../../skills/novus-client-data/SKILL.md) covers shared state, refresh and command ownership; the [UI skill](../../skills/novus-game-ui/SKILL.md) covers reusable presentation. Use both when a change crosses that boundary, without duplicating their catalogs or treating deferred migration as implemented.

`runtime/Store.js` supplies an owner-only publisher and a read/subscribe facade. `services/GameDataService.js` owns one shared confirmed world/owner bundle, refresh status and requests. World subscribes through its Scope and applies value updates without routine remounting. Shared controls still neither fetch APIs nor write game stores. `ImageChoice.setDetail()` / `setUnavailable()` and persistent deployment form nodes update limits/validation without replacing focused inputs; ordinary resource values update existing nodes. Map pickers and `Minimap.updateData(context)` refresh derived state. `HexMapRenderer.updateData()` refreshes nation colors/political paths while retaining static geometry/landscape caches.

The subsequent player-panel persistence pass extends the original World proof to dedicated Economy/Nation/Military/Reports and territory inspectors. Those instances now subscribe and apply updates without refresh-driven remounts. Existing production fields, military canvas/controls and inspector disclosures persist; World force/order rows update by ID. Healthy polling keeps commands available, while stale recovery and command reconciliation remain gated. No universal update/binding framework or new skill rule. Tests assert node identity, focus/drafts/scroll/disclosures and current values; see the progress journal for completed runs.

The compact military follow-up (#3–#5) uses `ImageChoice` badges for remaining affordable units and local preview quantities. Selected-unit costs/statistics/blockers and draft upkeep use existing `Tooltip`/`CompactMessage`; placements and keyboard/list alternatives use native disclosures. Feature-local `PendingOrders` groups accepted orders by action/destination and command kind, retains individual controls by ID, and shows existing unit artwork/counts. Group cancellation and individual cancellation use the existing command service. Compact header/actions and inline placement fields remove repeated prose and nested list scrolling without a new UI framework or new artwork.

## Reuse, extend or propose a new component

The [second game UI pass](game-ui-pass-2.md) moves resource readouts and map layers into the persistent header. Resources use existing bundled symbols via `ui/resourceVisuals.js`; `Disclosure` supplies native grouped expansion rather than separate bespoke popup systems. World composes a minimap-collapse Button into its Panel and hides the existing canvas; the saved preference and contextual-panel layout belong to World, not to the geographic renderer. Header/briefing labels have EN/FR copy; existing server reports remain their original language and are rendered as safe text. See the pass notes for data semantics, actual tests and remaining browser/device limits.

Before adding a custom control:

1. Look for an existing shared block **and** feature-local equivalents. Check whether styling, composition or an adapter solves the need.
2. Extend a block when the interaction and semantics are the same and the variation is coherent across consumers. Prefer a named variant/slot to screen-specific boolean flags or a growing list of exclusions.
3. Propose a new shared component when there is demonstrated repeated behavior, or a genuinely distinct interaction/lifecycle/accessibility contract worth owning independently. Two real consumers are good evidence, not an absolute rule: a range field can deserve a boundary at its first real use.
4. A one-off arrangement usually remains a feature-local composition of generic blocks. If it later repeats, extract the common contract with evidence. Specific domain workflows can remain specific while their presentation blocks are shared.

**Proposal contents:** the concrete need and consumer(s); what was considered for reuse and why it falls short; smallest reusable concept; inputs/events/ownership; states and accessibility; token/asset usage; migration/testing cost. Keep it a short paragraph or small note in the implementing task, not a ceremony for each helper.

Raise a user decision before introducing a substantial new interaction, dependency, framework, breaking shared API or changed visual language beyond the approved task. Routine extraction within an authorized implementation can proceed with a documented rationale. A planning request is not permission to implement the planned library.

Avoid both extremes: duplicated custom widgets per screen, and an enormous configurable component that needs knowledge of every feature.

## Richer-control contracts — range implemented, others deferred

**All fields:** stable label/help/error IDs, value/default distinction, units, validation, read-only vs disabled, local draft vs committed value, and explicit change/commit behavior. Preserve input/focus during updates and localization. UI events do not directly submit server commands.

**Trackbar / range field:** prefer a styled native range input plus an exact numeric field. Define min/max/step, unit and current value; synchronize both inputs; support keyboard and touch. Distinguish continuous local preview from committed change. Dragging must not issue a game command on each frame. Range constraints come from the feature/domain, not hardcoded balance values in the control. No dual-thumb or nonlinear slider until a real use needs it.

**Progress / meter:** distinguish task completion (`progress`, including an honest indeterminate state) from a bounded measurement (`meter`, e.g. capacity) or readiness ratio. Show readable value/maximum and units where known. Do not invent a percentage for an opaque server operation; use a busy indicator. Meaningful labels/icons supplement color; motion is optional and respects reduced motion.

**Mini chart / trend:** compact game intelligence, such as resource stock by turn, not business-dashboard decoration. Require a real series, time/turn domain and unit. Handle empty/one-point/flat/negative/missing data without treating missing as zero. Provide a readable summary or table; interactive values need keyboard/touch alternatives. Use theme roles for chart chrome and preserve domain series identities. No new historical-data backend just to justify a sparkline without separate scope approval.

## Acceptance and maintenance

- For each shared control, demonstrate relevant normal/hover/focus/selected/disabled/pending/error/empty/read-only states rather than demanding meaningless states on every component.
- Check native semantics, keyboard operation, focus visibility/return, touch targets, narrow screens, long EN/FR labels, zoom and reduced motion. Custom graphics need equivalent readable content.
- Test input/change/commit behavior, disposal of timers/listeners/observers, multiple independent instances, late responses, and feature-level command safety where applicable.
- Test token changes against representative entry, gameplay and future admin consumers. Move screen constants to shared tokens only when they express a shared role.
- Update this catalog with actual source location, consumers, status and verification when a component changes. Record breaking direction changes in an ADR; keep historical implementation notes intact.
- Maintain the [project skill](../../skills/novus-game-ui/SKILL.md) when a reusable rule actually changes. Keep detailed inventory here rather than duplicating it in the skill. The skill cannot maintain itself or authorize future work; apply updates during relevant tasks.

This living catalog records implemented F1/F2 work and deferred contracts. It is not a commitment to freeze the current component APIs or implement the entire remaining catalog.
