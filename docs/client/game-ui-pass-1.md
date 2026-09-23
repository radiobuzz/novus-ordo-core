# Game UI pass 1 — map-first command interface

Date: 2026-09-20

Status: first military slice implemented in `/client`. This is an experimental first pass, not a frozen component API or future game specification. [ADR 0009](decisions/0009-map-first-gameplay.md) records the accepted direction.

## Try it

Open `/client#/world`. Choose **Military**, then **Deploy** for the five unit cards, eligible destination and quantity. Click an own-force stack on the map to select a single unit or choose units from a stack; **Forces** also provides a readable roster. **Move / attack** previews the destination before explicit submission. **Pending orders** shows accepted deployments/moves/disband orders with cancellation. Disband remains behind **More actions** and a confirmation.

The minimap supports click navigation, arrow keys and Home. The map retains its existing pan/zoom keyboard controls. **Find territory** opens the searchable directory and layer controls; its own Close button and Escape dismiss it. Geopolitical/Economic modes use the existing territory inspector and detailed module links. The context panel hides when selection/tool is empty; the minimap remains.

## Scope

- New `/client` gameplay interface only; classic SPA remains intact.
- Keep existing unit types, costs, resources, movement, combat and turn rules. Borrow only the unit-card catalogue and top-right minimap ideas from the user's C&C reference, not its visual skin or mechanics.
- Left: compact Geopolitical / Military / Economic mode rail, replacing the permanent territory directory. Preserve search as an on-demand finder and readable selection alternative.
- Centre: one persistent map. Modes change overlays and selectable subjects without resetting the camera. Military mode makes units directly selectable; issuing an order is a separate deliberate action.
- Right: persistent top minimap with viewport indicator and click navigation. Contextual content below it shows selection or the active tool; hide that content when neither exists. Opening Deploy is valid without a selection. Avoid camera jumps when panels open.
- Retain module tabs and existing commands during migration. Detailed stats/configuration stay accessible there; do not remove a workflow before its replacement works.

## Component job list

The boundaries below guided implementation; not every arrangement became a new class.

| Block | Smallest useful boundary | Reuse and ownership |
| --- | --- | --- |
| Mode rail / switcher | Named options, selected state, change intent; keyboard and touch operation | Compose existing Buttons first; gameplay owns mode and cancels incompatible active tools |
| Context dock | Titled selection/tool content, close/back, responsive presentation | Reuse Panel and existing FeatureSurface/host lifecycle; feature owns content and selection |
| Minimap | Map snapshot, viewport rectangle, navigate intent | Share map coordinates/camera conventions with `ui/map/`; no API calls or independent game state; respect existing data visibility |
| Selectable image card + catalogue | Image, label, count, selected/disabled/pending state, explanation and selection intent | New focused reusable interaction for unit choices; existing Button/Panel/token styling; no rules or costs calculated inside cards |
| Unit visuals lookup | Existing division type name to artwork and accessible fallback | Five provisional images only; separate from backend IDs, rules and presentation dimensions |
| Deployment controls | Unit choice, quantity, costs, destination, confirm/cancel | Feature composition using cards, FieldShell, buttons and shared command services, not a second rules implementation |
| Pending orders | Readable pending deployments/moves and existing cancellation actions | Reuse list/panel/status blocks and current commands; share state with map markers |
| Territory finder | On-demand search and selection | Adapt existing world directory instead of deleting useful lookup/accessibility behavior |

Generic components receive values and emit intent. Gameplay owns selection, game/turn scope, eligibility and command reconciliation; Laravel remains authoritative. Keep existing backend programming style if a small read-model addition is needed for affordable maximums.

## Implementation sequence

1. **Layout and state:** introduce the mode rail and contextual right dock around the existing map; move directory to the finder. Preserve resource/turn controls and tabs. Define selection vs active-tool state, Escape/back behavior, and narrow-screen sheets.
2. **Map navigation and selection:** connect the minimap to the same camera; enable military unit/stack selection with an explicit chooser for overlapping units. Reuse current military overlays and selection helpers. No accidental order on selection.
3. **Military vertical slice:** add the five unit cards and Deploy flow. Support territory-first or unit-first selection, eligible-destination highlights, quantity and total costs, authoritative affordability validation, explicit submit and visible pending order/cancel. Existing move/cancel controls must be reachable from unit selection. Preserve existing disband access and confirmation.
4. **Reconcile and verify:** refresh maximums and pending markers after commands/turn changes; protect duplicate submits and stale game/turn/selection. Max per unit type shares the same resource pool and is not a simultaneous independent allowance. Explain unavailable options. New deployments remain inactive until turn advancement, per current rules.
5. **Polish and document:** test keyboard/focus, small screens, long EN/FR labels, card-size artwork readability, minimap alignment and camera stability. Exercise deploy/move/cancel and turn advancement only with fixtures or an isolated database; regress original and beta maps. Update the foundation catalog with actual implementations and tests.

First-pass finish line: the player can navigate, select forces, inspect their available information, deploy existing types, issue existing movement orders and inspect/cancel pending orders from the map. Geopolitical/Economic modes initially expose only existing relevant information/actions; their broader workflows and removal of module duplicates are subsequent increments.

## Artwork delivered now

Five separate full-resolution PNG masters: `resources/js/client/assets/units/v1/{infantry,armored,artillery,fighter,bomber}.png`. See the [asset notes and full prompts](../../resources/js/client/assets/units/v1/README.md). Generated with the built-in image tool; labels, prices, counts, state treatments and frames are deliberately not baked in.

The equipment era and silhouettes are provisional artistic choices. Gameplay and the synthetic foundation gallery import 256px WebP delivery variants (about 36 KB combined); original PNG masters remain unchanged. Labels, availability and selection effects are live DOM/CSS. Thumbnails and desktop/mobile layouts have been visually inspected.

## Source and verification

- `features/world/WorldCommands.js` composes the mode rail, tool/selection state, resource strip, finder and military workflow. Existing `world.feature.js` owns the persistent map/camera and URL territory selection. `app/GameShell.js` lets the world mode decide whether to open the existing territory inspector.
- `ui/ImageChoice.js`, `ui/unitVisuals.js`, `ui/map/Minimap.js` supply narrow shared UI/asset boundaries. Existing Button, Panel, FieldShell, ConfirmDialog and Scope are reused. The image-choice gallery uses synthetic values only.
- `services/militaryCommands.js` provides move-order drafting shared by the main map and dedicated Military module, plus defensive deployment-payload validation. Movement topology still comes from the existing `movementPath` implementation.
- `NationDetail::getMaximumAffordableDeployment` exposes the minimum affordable count across a type's existing deployment costs, using the same available-production source as `canAffordCosts`. `/client/gameplay` includes owner-only `deployment_limits`; commands and permissions are unchanged. Maximums include existing commitments and are not independent per-type allowances. The existing 100-per-request cap remains separate.
- Same-turn command reconciliation refreshes costs, limits and orders, and retains local mode/tool/selection intent without auto-submission. A new game/turn/nation discards that command intent. Mode/camera preferences are saved separately; unsuccessful commands are never automatically retried.
- Checks: production build, PHP syntax/contracts, generated endpoint check, Node suites including new command validation, existing world/entry/foundation browser tests and new command tests. Isolated real HTTP journeys cover both classic and beta maps: deployment/max decrease/cancellation/max recovery, turn activation, real map unit picking, movement/cancellation and disband/cancellation. Authentication, CSRF and context-fence regressions also passed.

Reproduce the real journey only with `tests/client/isolated-app.php` and the `/tmp/no7-entry-db-*` database/socket, using the test PHP server on localhost 8792. Prepare a fresh fixture with `tests/client/gameplay-seed.php classic`, or pipe `tests/client/map-beta-fixture.mjs` into that seed for beta geography, then run `node tests/client/world-commands-browser.mjs`. See [the original gameplay handoff](gameplay-experiment.md) for isolation setup. Do not point integration scripts at live game data.

Limits: Chromium with desktop/emulated-phone coverage, not real-device or cross-browser certification. Dedicated module text retains previous localization gaps; new command copy is EN/FR. No new economic heatmap, drag-box army selection, opponent-private intelligence or full geopolitical/economic command migration. Current accepted order routes show endpoints because the API does not expose full stored paths; draft movement uses existing graph preview rules.

## Explicitly deferred

New unit types, technology trees, production buildings, real-time build queues/timers, new resources or balance, new movement/combat rules, full Economy/Geopolitical redesign, new permissions, and a broad UI framework. No schema changes or live game-data mutations are part of this implementation.
