# Game UI pass 4 — nation identity and feedback

Date: 2026-09-20

Status: Implemented experimental pass. The visual treatment, masks and component APIs remain revisable; this is not a frozen future design. See [ADR 0013](decisions/0013-nation-identity-feedback.md).

The 2026-09-23 follow-up supersedes the post-setup editor described below: colour selection now belongs solely to nation creation. `app/NationIdentity.js`, `chooseNationColors` and `POST /nation/colors` were removed. The catalogue, transactional setup assignment and confirmed rendering remain.

## Try it

- Refresh `/client`. National edges have a stronger primary-colour band with a dark outline; internal territory lines are quieter. Generated-map rivers draw above borders and filled selection/deployment highlights, independently of decorative detail.
- Open **Game menu → Nation colours**. Choose from 24 named swatches, preview locally, then save. Taken primary colours show their owner and are disabled; secondary colours may be shared. Existing/new nations receive defaults automatically. Initial nation-creation colour selection is not a new wizard step in this pass.
- **Game menu → Enable sound** is off by default. Interaction sounds, unit/game events and volume have separate controls. Browser-local preferences survive reload; sound must be enabled/unlocked by user interaction. No autoplay or permission request, and unavailable audio never blocks gameplay.
- **Game menu → Map unit style** retains miniatures/flat counters. The old sidebar palette is removed: map markings now reflect confirmed national identity, not a private override.
- Choose **Economic** mode for national production requests beside the map. Selecting your territory shows its existing facilities. Exact quantity/productivity inputs and an explicit save reuse current bids; quantity zero cancels. Requested output is not promised output. Capital/recruitment remain engine-managed. The dedicated Economy module composes the same editor.

The new client uses a coherent authored outline icon family for resources/actions and slightly larger shared typography (17px root, 15px body, raised small-text tokens). Unit artwork masters, resource IDs/costs and economic rules are unchanged.

## Ownership and reusable boundaries

| Source | Responsibility |
| --- | --- |
| `ui/icons.js`, `ui/resourceVisuals.js`, `ui/Button.js` | Semantic SVG symbols, resource lookup and decorative button icons. Labels remain real accessible text. Image/glyph buttons already carry their visual symbol. |
| `ui/PaletteField.js` | Named native radio swatches with value/change, disabled owner labels, keyboard/focus and in-place updates. No game queries or reservations. |
| `features/nation-creation/steps/identity.js` | Sole colour picker consumer; submits both identity colours with the existing nation-creation transaction. |
| `ui/SoundSettings.js`, `ui/RangeField.js` | Preference controls with exact volume alternative. |
| `services/SoundService.js` | Optional low-volume synthesised cues, master/category/volume preferences, delegated input feedback and owned audio cleanup. No game-state cache. |
| `services/nationColors.js` | Pure lookup of confirmed catalogue assignments for maps/sprites. |
| `features/gameplay/ProductionPanel.js` | Persistent keyed forms composed by World and Economy, service-owned bid drafts, existing command semantics and selected-territory facts. |
| `ui/map/HexMap.js`, `ui/map/layers.js`, `ui/map/Minimap.js` | National boundary rendering and synchronized overview. Geography caches survive ownership/colour changes. |
| `ui/map/UnitSprites.js`, `ui/map/unitPalette.js` | Existing material ramps constrained to small spatial marking zones; base camouflage/skin/neutral material remains. |

The palette field needs its own native-radio/accessibility contract; FieldShell alone does not supply a selectable group. Sound settings compose existing fields rather than inventing a slider. Production remains a feature composition, not a game-aware shared widget. No dependency or general data-binding framework was added.

`GameDataService` carries public `nation_colors` from the existing `/game` marker in its confirmed publication. There is no extra endpoint read or competing colour cache. `chooseNationColors` uses `GameplayService` reconciliation; colour updates refresh ownership, main/overview maps and unit markings without replacing canvases. Economic map inputs retain values/nodes through same-scope refresh and territory selection. The dedicated Economy workspace still has its pre-existing relevant-data remount boundary; this does not complete D3.

Sounds follow accepted command outcomes and actual same-game turn increases, not arbitrary refreshes. Initial load and same-turn refresh do not play a turn cue. Preferences live under device `sound`/`display` SavedState keys; game snapshots remain memory-only. Display preferences are not live-synchronized across browser tabs.

## Backend identity, migration and safety

`App\Domain\NationPalette` seeds 24 stable named colours. Migration `2026_09_20_120000_create_nation_colors.php` creates `nation_colors` and `nation_color_assignments`, then backfills all existing nations, including unfinished setup. Primary uniqueness is **per game**, not across every game in the installation. Secondary reuse is unrestricted.

`NationColorAssignment` serializes reservations/changes on the game row inside a transaction, with a database unique constraint on `(game_id, primary_color_id)` as a second safeguard. NewNation creation reserves a primary in the same transaction, so exhaustion cannot leave a partially created nation. Deleting a nation cascades its assignment. Existing games over 24 nations cause migration preflight to stop before DDL; an exhausted game must expand the catalogue before admitting another nation. Incomplete nations also reserve slots; no automatic expiry was invented.

`POST /nation/colors` validates catalogue IDs and the current owner through the existing authentication, CSRF, upkeep and client-context middleware. The request does not accept a target nation/game outside that context. Public `/game` adds only the catalogue and identity assignments, not private budgets. Colours are persistent nation identity, not turn history; rolling back a turn does not roll back colour preferences.

The additive migration was applied to this installation after isolated validation. No live production/order/turn commands were used for tests. Source recovery archive: `/tmp/no7-ui-identity-xjLtVy/source-before.tar.gz`; it is **not** a full database backup. Deploy elsewhere with the migration before serving the new build; generated routes are checked with the existing generator. No new permissions or economic/combat rules.

## Verification and limits

- Production build, generated endpoint check and PHP no-database contracts; all 22 Node test files passed.
- Chromium fixtures cover colour reservations/local preview/save/canvas identity, French narrow layout, audio opt-in/category/persistence, economic input preservation/rejection/acceptance, national border pixels and independent rivers. Existing entry, HUD, units, foundations, orientation and live-data suites were exercised; see the progress journal for completed final reruns.
- Disposable MariaDB checks cover catalogue/backfill, valid/invalid choices, primary uniqueness, secondary reuse, reuse across games, direct unique-constraint enforcement and capacity rollback. This is not a two-process concurrency stress test.
- Real isolated classic and generated-map gameplay journeys cover bids/cancel, draft navigation, deployments/cancel, readiness/turn activation, movement/cancel/disband, battle reports and mobile layout. API guard checks cover authentication, CSRF, all four context fields and unchanged budgets for colour changes.
- Desktop/narrow screenshots reviewed. Physical devices, other browsers, listening on multiple audio systems and colour-vision review remain open. Synthesised sounds and spatial unit masks are provisional art/feedback, not a finished sound pack or manually authored mask atlas.
- Existing visibility rules still govern units: this pass does not expose enemy units. Classic rivers remain baked into existing map artwork; only the generated map has an independent vector river layer. The 24 colours are named but not claimed to be universally distinguishable by colour alone.
- Durable rollback/reset revision and full dedicated-module/inspector migration remain separate work under [the live-data plan](live-data-plan.md).
