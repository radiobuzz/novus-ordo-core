# Map layer menu — UI lab experiment

2026-09-28. **Implemented in the UI lab only.** The experiment established the interaction direction. The user has now requested a [production integration plan](map-layer-integration-plan.md), limited to layers supported by actual game data. The [runtime integration is now delivered](map-layer-integration-results.md); this experiment remains available with explicitly illustrative economic data.

Open `/dev-panel/ui-foundations#map-layers`, or use **Open map layers experiment** near the top of the existing UI gallery. Closing the experiment disposes its worker, renderer, observers and listeners. Reopening creates a fresh independent sample. No game service, database or API commands are used.

The experiment now fills the browser viewport in a native dialog, with its own language selector and exit button. The map takes the remaining height below a compact header; it is no longer a 620px gallery card. Escape first closes the layer picker, then exits the workspace. Closing restores launcher focus.

## Proposed interaction

Clear analysis uses an icon-only eraser with a localized accessible name and tooltip at every viewport width.

Legend width follows need: numeric gradients and up to four categories keep a compact 360px maximum panel. Larger category lists use their intrinsic content width, capped by the map viewport, and wrap left-to-right across rows. This supersedes the first full-width-for-every-layer experiment. Only the bounded entry list scrolls; heading/help remain visible and the list is keyboard-focusable. The picker reserves the measured legend height, including French/mobile wrapping.

Drainage-basin clarification: this view groups land by `cell.outletId`, inherited from its sampled drainage vertex. Terminal vertices are ocean-contact or map-edge points, so a map can have hundreds of small outlet catchments; these are not hundreds of named major rivers. Water can drain through land without crossing the threshold for a visible river. Labels now say `Outlet (id)` / `Exutoire (id)` instead of presenting coordinate-like IDs as named basins. A persistent explanation states that colours identify common outlets and do not measure water quantity. No hydrology or grouping data changed; coarser named-river basin views remain a future design question.

Player-value discussion: raw outlet identities and runoff scores are useful diagnostics for the lab/editor, not automatically candidates for the default player menu. Names improve orientation but do not alone create a gameplay reason to inspect basins; downstream pollution or water-related decisions would supply that reason when implemented. Agricultural suitability can already communicate useful land-selection potential through clear qualitative descriptions without requiring players to interpret its raw score. This is guidance for future production selection, not removal of lab diagnostics or a new simulation feature.

Move layer browsing from the global header into the map's bottom control dock, beside zoom/fit. Seven icon categories open one small panel upward: Land & climate, Water & coasts, Resources, Population & economy, Politics, Military, Display. Tooltips/focus labels identify desktop icons; the open panel always names its category. Arrow keys, Home/End and Escape support keyboard navigation. Small screens wrap the dock and keep the picker above it.

The **active colour analysis is independent of the category being browsed**. Opening Display does not remove Defense. Selecting a different analysis replaces the previous colour analysis. Borders, rivers, names, grid and unit/battle markers remain separate switches. Clear analysis restores natural terrain without resetting decorations. The legend remains visible after closing the menu and includes source, scale and selected resource. Opacity is under Display, rather than consuming space in every category.

Inspecting the map closes the picker and reports the selected cell's value below the preview. Geographic values belong to microcells; national economic/military samples belong to regions and are repeated consistently across each region's land cells. This does not imply that the real economy already runs at microcell resolution.

**Choosing a homeland** exposes physical geography and resources. National fixture layers are disabled with an explanation until **Governing — sample nation** is selected. This is a test of contextual availability, not a final information-disclosure policy: the real game's existing public population information can remain public. Real eligibility/selection must continue using the authoritative connected-homeland rules.

## Data and colour rules

### Readable measurements

`ui/map/analysis/display.js` supplies the same value formatting for legend ticks and cell inspection. Temperature uses the established Map Lab convention (`round(value × 50 − 20)` °C); elevation/depth use metres. Rainfall, moisture, agricultural suitability and coastal exposure display labelled 0–100 scores, not physical rainfall totals or probability percentages. Actual percentage indicators remain percentages. Flow and relief explicitly remain relative scores, without invented m³/s or degrees. Population/workers use people, density uses nominal land-region area rather than km², and seasonal resource output uses the selected profile's unit. The sample after-tax income label now correctly says per million residents, matching its existing unit; sample values are unchanged.

Adaptive ticks use compact large numbers with explicit units in the ticks or adjacent scale description. `+` marks saturation of the colour scale, not a change in measurement units. EN/FR formatting, negative elevations, custom resource units and null values share the formatter. Heatmap calculations, model values and production gameplay are unchanged.

### Readability and appearance follow-up

Display is always reachable without changing the analysis. Its small disclosures group Base map, Lines & markers and Names. Ocean off hides ocean artwork, ocean analysis, ocean names and ocean grid/border strokes while retaining a subdued empty background and optional coastline; lakes remain visible. Land-oriented analyses exclude water by default. Include water is offered for mixed geography/climate analyses; depth, bays and resource potential retain their appropriate water applicability. Ocean off takes precedence over Include water.

Analysis, coastlines, national/region borders, microcell grid, rivers, names and sample unit/battle markers have separate opacity controls with native sliders and exact numeric inputs. National borders use sample ownership and are disabled before founding. Natural terrain and landscape detail have independent switches. The single detail zoom threshold changes when Terrain V2 becomes eligible; its pixel budget remains, with adaptive chunk handling described below. There is **no landscape density setting**.

Threshold correction: the original 48–192px control was defeated by a separate 96-chunk cutoff. It now spans 8–192px, and both eligibility and rasterization use `terrain-detail-plan.js`. The plan counts only chunks intersecting the map, reduces distant raster resolution to 64/32px, retains the 8-megapixel two-surface budget, and caps bookkeeping at 1,024 chunks. Try 8–16 for the sample whole world. The control reports disabled/zoom-limited/budget-limited, loading progress or active detail. Initial generation is progressive; this is not a promise that arbitrary large worlds render at full detail. This supersedes the first experiment’s fixed 96-chunk cap.

The detailed renderer also exposed a missing restore step: directed river edges were restored but presentation courses were not. Generation and restore now share `riverCourses` to reconstruct identical stroke geometry from the saved graph. No geography regeneration, format conversion or new saved field is involved.

Geographic name categories follow the actual registry: oceans/seas, continents, islands, lakes, bays, rivers and mountain ranges. Territory names are separate. Geographic label size and spacing retain collision avoidance. **River names only controls text; it never hides river geometry.** Rivers stay above analysis fills, with their own optional geometry switch/opacity in Lines & markers. Forest/plain/settlement names need actual named feature records before adding categories.

Categorical legends list matching swatches and labels, including basin identities and ownership; long lists scroll within the legend. Numeric scales show endpoints and a correctly positioned midpoint, units/scale notes and saturation where applicable. Shore classes have four labelled swatches; exposure uses a 0–1 legend with the boundary-estimate explanation. Unknown and excluded values are explained separately. Cell inspection supplies additional precision, not the key to the colour scheme.

The drawer is narrower, has a cross-only close button with a localized accessible name/tooltip, and icon-only buttons remove the shared text-spacing margin. The narrow dock reserves one row for navigation and one for categories; legends remain keyboard-scrollable. Geography remains shared: only optional `detailThreshold` and `labelStyle` renderer inputs were added, preserving production defaults. All new appearance state is owned by the lab instance.

- Geography is a generated, restored 22 × 16 / 7-cell world using the actual shared generator, profiles, snapshot and Terrain V2 renderer.
- National ownership, population, economics, divisions and military strengths are **deliberately fictional fixtures**, identified in the context selector, persistent legend and selected-value text. Production samples are illustrative fractions of geographic potential, not forecasts from the economic engine.
- Unknown foreign economic/military values are grey/hatched and inspect as unavailable; they are not zero. Water/non-applicable geography does not get misleading economic values.
- Reuse the military heatmap's adaptive scale machinery for unbounded quantities. Its upper reference is the 90th percentile of positive displayed values; values above it saturate, labelled with `+`. Absolute percentages and 0–1 indices keep fixed scales. Relative colours are not comparable between differently scaled views.
- Defense retains its existing palette. Unrest uses increasing risk intensity, not a green-is-good defence gradient. Categorical geography uses distinct colours with a matching labelled legend; it has no numerical ranking. Coastal accessibility remains per-shore-edge colouring, not a whole-territory landing permission.
- Resource distribution, geographic output ceiling and planned output are separate measurements. A map with a deposit does not imply a working mine. Population density is per nominal land-region area in the experiment, not invented square kilometres.
- The source catalogue is fixed to the four initial geographic resources for the sample; the selector itself is populated from the generated map's profiles. Production integration must use the real selected game's resource catalogue and visibility rules.

## Layer catalogue for production planning

This is the complete initial inventory proposed for discussion. “Data available” means there is an existing field, rule or record to project; it does **not** mean every layer is wired into the live game UI.

| Category | Proposed layers | Current basis / lab status |
| --- | --- | --- |
| Land & climate | Natural landscape; elevation; relief/slope; biomes; temperature; rainfall; moisture; snow/ice | Sampled geography exists. All eight selectable in this lab. Climate remains generator indices; slope is not degrees. |
| Water & coasts | Water depth; drainage basins; drainage flow; shore accessibility; coastal exposure; detected bays | Sampled graph/depth/coastal data exists. All six selectable; shore measures stay edge-based. Boundary-limited estimates remain approximate. |
| Natural resources | Agricultural suitability; forest cover; per-resource distribution; per-resource geographic output ceiling | Geographic fields exist. All four selectable with a resource selector where applicable. Selected-value inspection shows the actual sampled figure. |
| Population | Total population; population density | Existing regional data and a live density overlay. Both demonstrated with sample regional values here. Migration and settlement patterns are not inferred from these numbers. |
| Economic conditions | Infrastructure; productive capacity; civilian income; income after tax per person; unrest; informal activity | Current seasonal model stores/calculates these. Six sample layers demonstrate their presentation. A production adapter must respect ownership and aggregate units. |
| Production and labour | Planned output by resource; unallocated workers | Current planner/allocation data exists. Two sample layers in the lab. Real production/allocated workers remain territorial. |
| Politics | Ownership; loyalty | Existing ownership/loyalty data and layers. Both demonstrated using fixtures; no new diplomatic rules. |
| Military | Defense strength; Guard contribution; division concentration | Existing force/coverage data can supply projections. Three sample layers; the original defense colouring/scaling is reused. Guard strength is conditional support, not simultaneous guaranteed defence everywhere. |
| Visibility and annotation | Region borders; microcell grid; rivers; geographic names; units; recent battles | Six independent switches in the lab. Units/battles are clearly sample markers. |
| Additional production candidates | Territory names separately from geographic names; national borders separately from region borders; army detail labels; order arrows; movement/attack reach; muted foreign colours | Reorganize existing annotations or context-specific military tools; not all reproduced in this focused pilot. Reach/order previews should remain tied to the selected action, not silently alter orders when changing an analysis layer. |
| Founding assistance | Eligible territories; currently selected connected homeland; per-selection geographic/resource summary | Existing homeland legality is authoritative. Useful next extension of the experiment; not replaced with a fabricated universal “best location” score. |
| Fiscal/regional changes | Tax receipts by territory; infrastructure spending; seasonal change in population/infrastructure/unrest/output | Potential projections of existing seasonal reports/history. Need to confirm field availability, turn matching and privacy before adding controls. The lab does not simulate these. |
| Historical politics | Ownership changes since previous turn | Existing ownership-comparison feature. Consider an entry from the dock; keep the comparison's explicit historical context. |

The pilot contains **33 selectable analysis views** (including natural terrain), plus six decoration switches. Each needs a deliberate meaning, units, visibility and scope; this catalogue is not a commitment to display every option at once.

## Future systems — do not manufacture these layers yet

| Future group | Candidates | Missing foundation |
| --- | --- | --- |
| Settlement/demographics | Urbanization, population centres, migration inflow/outflow, growth drivers, ethnic/cultural distribution | Real settlement/migration/demographic simulation and disclosure rules. |
| Environment | Pollution load, river contamination, environmental quality, recovery | Persistent environmental state and transport/recovery rules. Current moisture/drainage is not pollution. |
| Economic development | Industrial concentration by sector, public/private ownership, services, education, health, inequality, employment | Actual sector/social/institutional systems. Productive capacity alone must not be presented as factory counts or GDP. |
| Administration | Provinces, development zones, regional budgets, policy jurisdictions | Agreed administrative geography and policies, not experimental lab boundaries copied into gameplay. |
| Resource evolution | Depletion, remaining exploitable reserves over time, logging/regrowth, transformed-goods chains | Dynamic extraction/renewal/processing rules; current geographic quantity is static. |
| Trade/naval | Ports, shipping access, trade routes, blockades, market access, international price differences | Deferred trade/naval systems. A favourable coast does not imply a functioning port. |
| Warfare consequences | Infrastructure damage, displaced population, supply disruption, war exhaustion, readiness | Their actual state and rules. Existing battle records are usable now; these consequences cannot be inferred from decorative scars. |

## Implementation boundary and reuse

`resources/js/client/experiments/map-layers/MapLayersLab.js` is a feature-local `Component` mounted by the existing gallery, not a new shared layer framework. It reuses Button, FieldShell, Scope, Camera, MapInteractions, the shared worker/codec/GeographicRenderer and military heatmap scale helpers. `catalogue.js` owns experimental display metadata; `data.js` keeps synthetic national values separate from sampled geography. Styling is scoped and uses existing semantic tokens and icon assets. Domain heatmap colours are independent of the UI accent.

The gallery lazy-loads the experiment only when opened; normal foundation tests stay lightweight. The game, homeland wizard and editor have not adopted the new menu. No stored player preferences or active map state are migrated. Deciding whether the left Geopolitical/Military/Economic buttons remain interaction modes is separate: layer selection should not unexpectedly change the player's command tool.

## Verification

Focused checks cover contextual availability, unknown versus zero, real resource potential versus sample output, fixed percentage scales, one active analysis, decorations surviving view changes, menu dismissal/focus, persistent legend, EN/FR narrow layouts and instance cleanup. Screenshots are under `test-results/client/layer-menu-*.png`. Runtime/browser results are recorded in the progress journal after the final run.

Next review: use the lab to judge category names, panel height/width, icon discoverability, legend placement and whether this is compact enough over the map. Then select the initial production subset and wire it through the existing confirmed-data owner; do not ship synthetic values or an alternative game-data store.
