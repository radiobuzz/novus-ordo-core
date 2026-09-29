# Game map layer integration — delivery

2026-09-29. Implements the [integration plan](map-layer-integration-plan.md) for World and homeland selection. No live games, saves or database schemas were changed.

## Delivered

- World now has the compact bottom icon dock and a single category panel with a cross close button. Clear analysis is an eraser. The old header disclosure, old analysis selector/legend, unused projection module and obsolete styles/translations were removed.
- Homeland selection uses the same `ui/map/MapLayerMenu.js` with geography/resources/display only. Existing connectivity, territory-count validation, identity/leader drafts and submission remain intact.
- `ui/map/analysis/` owns real geographic/territorial projections, catalogue, shared palettes, formatting and drawing helpers. The UI lab consumes the shared geographic projection, palette and formatting code while retaining its explicit sample economy and experimental workspace. Production imports no lab samples.
- Geographic views use saved microcells/atlas/shore segments. Economic views use real territory state, labor pools and saved production projections. Historical income uses completed report rows and their historical population. Unknown private values are hatched; absent values are not presented as measured zeroes.
- Population density now reads the actual `Land area` export. Current population is not artificially distributed among microcells. Raw drainage diagnostics and future city/pollution/trade systems remain outside the player menu.
- Food is absent from the deposit-distribution selector. Agricultural potential describes suitability; Food production potential describes the saved geographic capacity. Planned output describes the current server allocation projection. Mineral profiles retain mineral-deposit wording.
- Resource choices intersect the game's catalogue with saved map profiles. Public catalogue metadata (identity, kind, localized labels/units and producer flag) is exported through GameInfo and entry setup; private budgets/rules are excluded. Governing views use their current owner catalogue. Currency has no geographic overlay.
- Distinct colour families replace the generic blue/teal treatment. Legend and canvas share interpolation; defense retains its existing palette. Numeric legends stay compact, categories wrap, and adaptive saturation is explained. Income/resource units follow catalogue metadata.
- Independent ocean, landscape/detail, political fill, river geometry, grids/borders/coastlines, name-type and annotation-opacity controls are available. River names never toggle river geometry. The detail threshold uses the existing bounded renderer. Water-depth colours remain over detailed water.
- Guard coverage stays a lazy GameplayService read; late responses are fenced by selection/request generation and world context. Retry is explicit after a failed coverage read. Military order controls remain independent from analysis choices.
- Preferences use the existing saved-state owner with the new `mapLayers` shape. No conversion of retired preferences. Routine refresh reuses the view/camera, static geography projections are cached for the active geographic layer, and private projections update on changed context including rollback. The minimap retains its independent overview presentation.

## Verification

- Production Vite build and generated client-contract check pass.
- Four focused Node test files pass: real layer projections/catalogue filtering, readable units, lab geography/sample separation, and defense scaling. Cases include the current land-area field, unknown population, historical denominators, custom non-geographic products, missing production data, and separate palette families.
- Nine focused Chromium journeys pass: map-first deployment/commands, real defense/population/production/loyalty views, complete entry/homeland submission, national borders and independent rivers, live geography/economic controls, seasons/rollback without canvas replacement, delayed Guard response isolation plus French 390/320px layout, and two lab regression journeys.
- Earlier rotation/selection journeys both passed, including unit picking, rectangular selection, deployment ghosts, camera lifetime and French/narrow orientation controls. The mobile command-drawer regression also passed.
- A fresh isolated MariaDB instance under `/tmp/no7-entry-db-57SZykLu`, with networking disabled, passed **42 seasonal economy checks** (including public catalogue field checks) and **43 passive-player checks** covering three seasons and rollback/replay. It was stopped after the run. No live database was used.
- Three final targeted Chromium follow-ups pass for same-turn context revision, delayed Guard/mobile controls and the retained military analysis breakdown.

## Limits and follow-up

- Browser journeys use current-format fixtures. A manual playtest on the user's running server and non-Chromium/physical-device testing remain useful release checks; no claim of live-server verification.
- The economy still has territorial precision. No city positions, developed farms/mines/factories or new production simulation were added.
- Geography/climate are the saved generator's conditions. Snow and temperature do not acquire seasonal weather behavior merely by being visible.
- Large-world rendering retains the existing terrain-detail budget and visible-cell rendering. This pass does not certify performance for arbitrary 300×200 worlds.
- Palette and label polish can continue through playtesting without changing data ownership or simulation rules. Missing systems acquire layers only when authoritative data exists.
