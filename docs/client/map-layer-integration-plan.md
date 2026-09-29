# Game map layers — integration plan

Date: 2026-09-28

Status: implemented 2026-09-29; see [delivery evidence and limits](map-layer-integration-results.md). The inventory and work packages below record the approved plan.

## Agreed scope

Replace the current World layer disclosure with the compact bottom-map dock developed in the [UI experiment](map-layer-menu-experiment.md), and make geographic information available while choosing a homeland. Integrate only layers backed by existing game data. A layer that needs a future simulation is absent, not a disabled promise or an invented sample.

Keep the current generated map format and real game simulation. Existing games/save compatibility is not a requirement. This integration does not itself require a database reset, new geographic generation, economic balancing or a new simulation. No compatibility bridges, synthetic economic values or lab-generated replacement worlds enter the game.

## What the source audit establishes

- `resources/js/map/snapshot.js` already preserves microcell elevation, climate, vegetation, drainage, snow/ice, agricultural suitability, resource profiles/potential and geographic atlas information. The live map restores this data through `ui/map/GeneratedMap.js`; it does not need to regenerate geography.
- `ui/map/HexMap.js` already extends the shared `GeographicRenderer`. The gap is production controls and analysis rendering, not a separate map engine.
- `features/world/world.feature.js` owns the existing header disclosure, analysis state, legend and subscriptions. It currently supports defense, population density, planned resource production and loyalty through `ui/map/mapAnalysis.js` and `defenseHeatmap.js`.
- `PlayerWorkspace::export()` supplies `snapshot.nation.economy`. `EconomyService::overview()` includes territory states, last-season results and a forecast. Infrastructure, capacity, unrest and informal activity are real territorial state, even though their equivalents in the UI lab are synthetic.
- `snapshot.nation.budget` includes resource facility projections and territorial labor pools. They support planned production and unallocated-worker layers now.
- Homeland selection uses `NationSetupService` and `MapViewport`, with static geography and base territory information. It does not receive the private national economy or the same resource definitions as a governing nation.

The lab is evidence for interaction design. Its `makeSamples()`, fixed 55% production assumption, mock ownership and mock military values must never become game data adapters.

## Data-backed layer inventory

“Include” means backed by current data and planned for integration, not already delivered. Availability is evaluated for the selected game and player; a supported layer with temporarily failed data shows a loading/error state, rather than silently disappearing or showing zero.

### Geography and resources

| Layer | Existing source / precision | Plan and meaning |
| --- | --- | --- |
| Natural landscape | Restored map and terrain renderer | Include as the baseline; eraser clears analysis back to it without resetting display preferences. |
| Elevation | Microcell `elevation` | Include, metres under the generator's existing convention. |
| Relief / slope | Microcell `slope` | Include as relative relief, not invented degrees. |
| Biomes | Microcell `biome` | Include categorical colours and a complete legend. |
| Temperature | Microcell `temperature` | Include using the existing Map Lab °C conversion; this is generated climate, not seasonal weather. |
| Rainfall and moisture | Microcell `rainfall`, `moisture` | Include separately; explicit relative scores, not fabricated millimetres. |
| Snow and ice | `snowCover`, `frozen`, `polarIce` | Include static generated conditions, not a new winter simulation. |
| Water depth | Ocean `baseElevation`, lake `waterDepth` | Include both types; keep bathymetry legible when zooming into detailed terrain. |
| Shore accessibility | Saved atlas shore records | Include on individual shore segments, preserving different conditions on different sides of one cell. This is geographic suitability, not combat success probability. |
| Coastal exposure | Saved shore `exposure` and truncation flags | Include separately from accessibility; preserve the lab's bounded-estimate explanation. |
| Bays | Atlas features with type `bay` | Include detected geometry and existing names, not new port capacity. |
| Agricultural potential | Microcell `agriculturalSuitability` | Include. Land suitability for farming, not food in storage or developed farms. |
| Forest cover | Microcell `vegetation` | Include actual vegetation; no timber stock or logging activity implied. |
| Mineral deposit distribution | Saved resource profile method `deposit` and per-cell density | Include for matching resources used by the game; relative richness, not an inventory of finished goods. |
| Other natural resource distribution | Saved `forest` / `surface` profiles and densities | Include with method-appropriate labels. Do not call every profile a deposit. |
| Geographic production potential | Saved resource `capacity` and profile units | Include as modelled potential per season, explicitly before workforce/allocation. Do not imply actual farms/mines or guaranteed output. |
| Drainage basins and flow | `outletId`, `flow` | Data exists, but retain these raw diagnostic views in the lab/editor for now. Hundreds of unnamed outlets are not useful player-facing regions. This does not remove their underlying data. |

Resource selector rules:

- Use the intersection of resources represented in the saved map and enabled by the game's resource catalogue. Do not infer availability from a hard-coded list or expose unused map profiles as economic options.
- Currency and transformed goods without geographic profiles do not acquire deposit layers.
- Keep **Food** as the economic resource name. In geography, display **Agricultural potential** or **Food production potential**, depending on whether the value is suitability or modelled output capacity. Neither is an underground quantity of food.
- The agricultural distribution is already derived from suitability and tuning multipliers. Avoid presenting a second near-identical “Food distribution” layer alongside agricultural potential; food can still have the distinct capacity view.
- A missing geographic profile means no geographic resource overlay; a resource can still have a legitimate production overlay if the current simulation produces it.
- Homeland selection needs public catalogue keys/labels to filter saved profiles consistently. Plan a minimal extension of its existing setup response using existing catalogue data; do not fetch private nation data or add a separate catalogue store. This is an integration plumbing requirement, not a new economic rule.

### Population, economy, politics and military

| Layer | Existing source / precision | Plan and meaning |
| --- | --- | --- |
| Population | Public territory `stats` | Include only known values; currently unowned population is exported as Unknown. Territory total, not individual settlement positions. |
| Population density | Known population / exported `Land area` | Include people per game-defined land km². Zero land area is not applicable. Correct the existing projection's lookup of `Area`, which no longer matches the current `Land area` export. |
| Infrastructure | Owned `economy.territories[].state.infrastructure` | Include current territorial percentage when economy is enabled. |
| Productive capacity | Owned `state.capacity` | Include a labelled capacity index; not a factory count or a percentage capped at 100. |
| Unrest | Owned `state.unrest` | Include current percentage. |
| Informal activity | Owned `state.informal` | Include current percentage; do not relabel it as a measured crime rate. |
| Civilian income | `economy.last_season.territories[].income` | Include as **Last-season civilian income**, when a completed report exists. Current territory conditions are not a separately exported current income measurement. |
| After-tax income | Same report's `income`, `tax`, `population` | Include last-season net income per resident with an explicit unit. Derive `(income - tax) / population`; missing/zero population is not applicable. Never divide historical income by today's population. |
| Planned resource output | `budget.labor_facility_allocations` grouped by territory/resource | Include, preserving the server's saved-plan projection. Label **Planned output**, not completed production. Unsaved planner edits do not recolour the confirmed map. |
| Unallocated workers | `budget.labor_pools[].free_labor`, by territory | Include as unallocated labor-pool workers, not general unemployment. |
| Ownership | Public `owner_nation_id`, nation colours | Include as independently selectable political fill/borders. Distinguish unowned territory from unavailable data. |
| Loyalty | Exported territory `loyalties` | Retain the existing own-nation view and its current information boundary; no new foreign loyalty intelligence. |
| Defense strength | `projectDefenseHeatmap()` and `GameplayService.defenseCoverage()` | Retain existing total/base/Guard recipe and colours. A separate one-attack scenario for each territory, not a simultaneous defense guarantee. |
| Guard contribution | Same coverage response's `guard_defense` | Include when Guard is enabled; reuse the same coalesced read. No new route computation in the client. |
| Division concentration | Confirmed own active divisions grouped by present `territory_id` | Include owned divisions only. Do not count planned deployments as units already stationed there or pretend to know enemy formations. |

Income views are historical flows; state views are current conditions; resource output is a plan. Legends must name the time basis and resource units. Filter private historical rows against currently owned territories for this first pass; no overlay of former holdings or inaccessible foreign information. A nation with no completed report has no historical-income view yet, rather than fabricated starting income.

Unavailable spatial systems remain future work: city locations/urban density, migration flows, developed farm/factory/mine footprints, pollution, ports, trade routes/blockades, resource prices by place and provincial/development-zone boundaries. National totals alone do not justify colouring each microcell.

## Presentation and interaction contract

- Bottom dock beside zoom/fit/orientation: Land & climate, Water & coasts, Resources, Population & economy, Politics, Military, Display. Hide empty categories for contexts without those capabilities. One small category panel open at a time; close with a cross, Escape returns focus to its opener.
- One active quantitative/categorical analysis. Category browsing does not change it. Political fill and other annotations remain independent display choices. Existing World command modes still control military/economic interactions; they are not duplicated analysis selectors and switching modes must not erase analysis choices.
- Compact eraser restores natural landscape. No duplicate header Layers disclosure or second analysis selector remains after cutover.
- Keep base landscape, ocean, rivers and detail independently selectable. Ocean off does not remove lakes, valid targets or game geography. River names are independent of river geometry.
- Individual opacity controls for analysis, political fill, borders, grids, river lines, names and military decorations as applicable. Essential homeland eligibility/selection and command feedback remain visible; annotations cannot make an invalid target look valid.
- Names by actual feature type: oceans/seas, continents/islands, rivers/lakes/bays, mountain ranges and other types present in the saved atlas; territory names separate. Reuse size/spacing controls from the experiment.
- Adjustable detail zoom threshold with actual render status and the existing bounded terrain-detail budget; no new density setting. Test at both overview and close zoom.
- Legend always explains active colours without requiring a cell click. Numeric gradients and small categories remain compact; larger lists expand only as needed and wrap within the viewport. Do not bring the huge basin category list into the player UI.
- Actual scale labels and units, distinguish zero / unknown / excluded, show saturation for adaptive scales. Reuse readable formatting from the lab after removing sample terminology and sample-only unit assumptions.
- Population/economic values colour territory land consistently. Do not divide or distribute them across microcells to manufacture city positions. Geographic analysis can colour individual microcells. Inspection reports the correct scope, while map clicks continue selecting territories for commands/homeland choice.
- Keep land/water visually distinct in every palette, with visible shore outlines and water excluded from land-only analyses. Do not rely on blue alone to mean water.
- EN/FR tooltips, accessible icon labels, keyboard controls, narrow-screen wrapping and safe panel placement around command controls/inspector/minimap are part of the integration, not a later rewrite.

Accepted palette direction to implement during integration (not yet delivered in the lab): population plum/pink; productive economy green; infrastructure amber; unrest/informal activity orange/red; agriculture/forest greens; resource-specific mineral hues and violet oil; blues for water; cold-to-warm temperature; brown/amber/cream fallback. Preserve the current defense palette. Categorical biome colours represent actual types. Centralize multi-stop interpolation so legend and canvas match; verify lightness contrast over the actual map rather than only choosing attractive swatches.

## Smallest implementation structure

1. Extract a shared map-layer control component and compact legend from the lab into `ui/map/`. Real consumers are World and Homeland; the experiment can use the same presentation where useful. Inputs: available descriptors, selected layer/resource, display preferences and formatted legend data. Outputs: selection/display intents. Controls perform no game reads or simulation.
2. Keep a small explicit layer catalogue and pure projections close to map analysis. Each supported layer declares source, spatial scope, time basis, units, palette, water applicability and availability. This is a finite UI catalogue, not a new database or general formula engine.
3. Extend the existing `HexMapRenderer`/`GeographicRenderer` path to render microcell, territory and shore-segment analyses in a consistent order. Terrain, analysis, rivers/borders, selection/command feedback and labels/markers must retain their intended visibility. Consolidate the useful lab drawing helpers; do not import `LabRenderer` or samples into production.
4. World composes confirmed geography and player data through `GameDataService`; Homeland composes its existing setup payload through `NationSetupService`. Keep lifecycle-owned subscriptions, camera/selection persistence and renderer caches. No per-layer HTTP requests for fields already loaded.
5. `GameplayService` remains owner of the existing lazy Guard/battle reads. Preserve request coalescing, generation/turn-context checks and access-loss cleanup. Changing layers must fence late results so an old Guard response cannot overwrite the newly selected layer.
6. Save only harmless view preferences through the existing saved-state owner. Use a new preference shape if needed; no conversion of retired layer settings. Never persist private analysis values in browser preferences. Recompute projections on relevant confirmed publications, including same-turn commands and rollback context changes.

Existing `Button`, `RangeField`, `FieldShell`, native radios/checkboxes/selects, outline icons and `Scope` cover the control primitives. The shared boundary above is justified by two actual map consumers; no new UI framework or data store is required. These choices follow ADRs 0006 and 0010.

## Ordered work packages

### A. Data contracts and reusable presentation

- Implement catalogue/availability and real-data projections for the inventory above; repair the density stat mismatch.
- Define resource method labels and enabled-profile intersection; expose minimal public catalogue metadata for homeland setup.
- Extract dock/panels/legend and palette/formatting helpers. Verify them with current-format fixtures and real payload shapes, including absent economy and empty resources.
- Exit: no production module depends on lab samples; unsupported layers do not appear.

### B. World integration

- Mount the dock in the live map controls, connect projections and rendering, and transfer all existing relevant display/military controls.
- Add independent river/name/ocean/opacity/detail controls and honest units/time labels. Preserve existing command modes, destination picking, orders, selection and minimap operation.
- Remove the old header disclosure, duplicate legend/analysis controls and obsolete state handling in the same cutover. Do not keep a legacy-menu toggle.
- Exit: all included layers work against a fresh game's actual map/player payload and remain coherent through refresh.

### C. Homeland selection

- Mount the shared controls with geography/resources/display only; do not reuse the lab's pretend Founding/Governing switch.
- Preserve required territory count, connected-selection eligibility, selection contrast, search, camera and server validation.
- Clearly explain agricultural suitability, geographic output potential and inaccessible coastlines without implying new farming, trade or invasion mechanics.
- Exit: the player can assess a starting location with the same geographic presentation used after founding.

### D. Verification and retirement

- Update obsolete layer/header tests to the new dock and remove dead production menu code/styles/strings. Keep useful independent lab experiments; eliminate duplicated adopted presentation where practical.
- Run focused projection/unit checks and fixture-browser journeys for World and Homeland. Then verify fresh-game founding, saved production/policy changes, season advance and rollback on disposable test data.
- Document actual results and unresolved findings; do not call source inspection a runtime pass. No migration, reset, deployment or live-game writes are part of this planning action.

## Acceptance checks

- Every offered layer traces to a current-format field or a transparent derivation of existing fields. No random/synthetic values or fabricated zero for failed/missing data.
- Test the density fix with the actual `Land area` export; explicitly cover unknown population and zero land area.
- Economic state uses owned territory rows. Historical income uses its report's income/tax/population; production matches the server's saved allocation projection. A zero-output territory is distinct from unavailable projection data.
- Resource lists cover matching/missing profiles, disabled resources, custom resource keys/units, Food versus minerals, and water-capable oil. Generic ore and specific mineral identities are never silently merged.
- Shore layers retain per-edge distinctions; all geography layers survive save/restore of the current map format and don't rerun the generator.
- Detail threshold, ocean visibility, river geometry/name controls, opacity, shore contrast and palettes remain correct across zoom/orientation. Selection and order overlays stay actionable.
- Routine refresh retains canvas/camera/focus/preferences. Turn advance, same-turn command reconciliation, rollback, nation/game change and access loss cannot expose stale private layers. Late Guard/battle reads cannot overwrite another active layer.
- Homeland still enforces connectivity/count and does not reveal private economic/military data. Minimap and ownership comparison remain functional shared-renderer consumers without acquiring unwanted menu controls.
- EN/FR, keyboard-only interaction, desktop and 320/390px layouts; bounded legends, no overlap with essential commands, cleanup after closing/reopening and no new polling loops.
- Measure representative supported map sizes/resolutions against the current renderer. Cache static projection work and avoid recalculating full geography on unrelated refreshes; no invented performance guarantee for arbitrarily large maps.

## Findings to review before or during implementation

No new simulation decision blocks this plan. Recommended bounded choices are recorded above:

1. Keep raw drainage diagnostics in the lab despite their data being available.
2. Start income layers with completed-season reports; defer current-income maps rather than duplicating PHP economic formulas in JavaScript.
3. Treat Food geography as agricultural potential, and retain modelled output potential as a distinct explicitly labelled quantity.
4. Add only public resource metadata to homeland setup so it can obey the same game-enabled-resource filter.
5. Correct density to the current exported land-area field. This is a present integration defect, not justification for a new demographic model.

Future features can add descriptors when their authoritative data exists. This integration establishes the presentation and lifecycle path without building those features in advance.
