# Hex map laboratory

Status: interactive experiment; not a production gameplay contract

The generator and terrain renderer now also support an opt-in [generated-map beta](map-beta.md) in the new interface. Lab simulation stays separate. These experiments do not establish a fixed future design.

## Purpose

The original laboratory tested two simultaneous geographic layers:

- stable large regions expressing political ownership;
- small operational cells expressing military control, terrain, population, and battle damage.

It generates experimental geography with fixture-only politics and army rules. It does not read or mutate the game database. In a development environment, authenticated users can open it at `/dev-panel/map-lab`.

The optional administration experiment below now tests a different political subdivision: microcell country ownership, exclusive provinces, and overlapping development zones. It does not silently replace the original fixtures or establish production sovereignty rules.

## Provinces and development zones — 2026-09-23

**Try provinces & zones** enters a separate, temporary administration view. **Inspect administration** returns to it after looking at other demos. Country borders/tint, provincial borders and development zones are independent filters; the original large-region and microcell grids remain available. Terrain V2 is compatible and still optional. Existing military/economy/ownership/resource graphics are suppressed only while this view is active; their stored preferences and simulation data are retained.

The immediate question is whether administrative subdivisions and overlapping program areas are understandable and editable at microcell scale—not whether the policies behind them are balanced.

- Fixed country ownership lives in its own `administration.countryByCell`, never in the physical model's demo sovereignty or military-control fields. All dry land is assigned. Up to three seeds on the largest land component flood along land adjacency; offshore components attach to their nearest seed. This is illustrative coherent territory, not balanced nation placement, diplomacy or an editable national-border system.
- Each country initially has up to three provinces, using the same connected-land partition. A microcell has zero or one province. Provinces may cross large hexagons. Adding a cell to one province removes it from its previous province; removing it leaves nationally owned but administratively unassigned land.
- Coastal and river-valley development zones expand from actual ocean-adjacent land and visible river-bank cells, bounded by the country. These are illustrative coastal belts and river networks, not a simulation of individual projects. Zones may cross provinces and overlap one another; changing one never removes another. The default world includes overlaps, available through **Find overlapping zones**; seeds/crops without suitable features can have fewer/no prefilled zones.
- Islands/disconnected parts are allowed in both area types. Lakes and ocean are excluded for this first test. Maritime jurisdictions, province connectivity enforcement, political autonomy, budgets, policy inheritance, development effects and custom map dimensions are deferred.

Choose a country, area type and existing area, or enter a name and **Create area**. New areas start empty with the Add tool selected. Names are local, text-safe, at most 64 characters; geography is not renamed. **Rename area** changes the selected area. Each development zone has its own native **Zone overlay colour** picker, immediately updating its fill, dashed outline and label without changing membership or geography. Colours stay with each zone when switching selections, but are temporary like all administration edits.

With Add or Remove selected, hold the left mouse button and drag to paint with a 1/7/19-microcell brush. Painting begins on mouse-down and samples between movement events so fast drags do not skip whole cells. Right/middle-drag pans; Inspect mode also retains left-drag panning. Wheel/buttons zoom; Escape stops the stroke and returns to inspection. Brushes never cross national borders or water. Releasing outside the canvas, pointer cancellation or losing window focus ends the stroke, retaining already-painted cells as one undoable edit. A native coordinates form provides a single-stamp alternative without precise mouse targeting. The province/zone list selects and focuses areas; the inspector reports the selected cell's country, province, all zones, and underlying large hex.

**Undo last boundary edit** retains the last 50 non-empty strokes (or coordinate stamps), including prior province assignments. Revisiting a cell within a stroke does not create extra history entries. Undo is not for creation, renaming or colour changes. **Reset political setup** confirms before discarding these temporary edits and preserves the landscape, camera, names, military orders and economic accounts. Regenerating the landscape, changing resolution, or reloading resets the administration fixture; there is no persistence/export in this test.

Implementation stays in `resources/js/map-lab/administration.js`, `administration-controls.js`, `administration-renderer.js` and local main/renderer hooks. No backend, shared game renderer, live database or new dependency. Native fields/buttons and the existing semantic theme implement the controls. Cached area fills/boundaries rebuild on political revisions, separately from Terrain V2's raster cache. Screen-scaled heavy national lines, thin solid province lines and dashed coloured zones provide non-colour distinctions; selecting a zone fades the others.

Model and Chromium checks cover exclusive/overlapping membership, area creation/renaming, foreign/water rejection, stamp undo, reset cancellation/confirmation, same geography/other simulations, Terrain V2 pan/zoom/editing, layer switching, narrow layout, and the 22,200-cell setting. Final execution evidence is recorded in the client progress journal. Physical-device and non-Chromium behavior remain manual checks.

## Current experiment

- Seven adjoining political regions.
- A full-scale 30 × 20 world mode with 600 regions and 11,400 cells at the 19-cell setting.
- Selectable densities of 7, 19, or 37 cells per region.
- Approximately stable region display size when density changes.
- Terrain, political ownership, military control, micro-grid, and damage layers.
- One movable Sable League army occupying part of politically Aurelian Emberfall.
- Optional named-formation simulation, order arrows, and faction flags; the original single-army test remains available with the formation layer off.
- Optional Food/Oil economic overlay and a recorded naval-landing sandbox, independent of the geography and military display layers.
- Region summaries by controlled cells and controlled population.
- Viewport culling and live visible-cell/render-time measurements for scale testing.

Changing resolution resets the fixture. This is intentional: the control explores a design-time map density, not a proposed live-game mechanic.

## Optional military and flag layers

Use **Try military demo** at the top of the controls to enable formations, order arrows, faction flags, and political tinting, focus the initial front, and queue example ground/air attacks where reachable. Individual checkboxes remain independent. Geography settings, seeds, terrain generation, and all previous display options are unchanged. Switching a layer off does not clear simulation state. Rebuilding the geography or changing resolution resets formations; display preferences are retained.

- Fifteen individually selectable formations, five per fictional faction, use the existing Infantry, Armored, Artillery, Fighter, and Bomber type names and base attack/defense powers from `app/Domain/DivisionType.php`. Infantry/armored groups have mixed ground compositions; air wings are separate. Names are generated deterministically from seed, faction, and formation identity. They do not change while moving or fighting.
- Compact Canvas counters show type silhouettes, faction flags, unit count, strength, and morale. At wider zoom, nearby friendly counters cluster with a ×formation-count label. Clicking cycles cluster members; the accessible roster always selects individual formations, including those sharing a cell. Selected counters show their own composition and bars, not an aggregate of a cluster. Labels and flags are thinned to reduce overlap.
- **Move** (air: **Rebase**) or **Attack** (air: **Air strike**) then a map destination produces a preview. **Confirm order** queues it; **Advance simulation** executes a discrete step. **Hold / cancel order**, **Discard preview**, and Escape permit cancellation. Cyan arrows indicate moves, coral attacks, dotted lines air strikes, and dashed gold a preview. Nonselected orders are subdued. Very short arrows offset around counters for legibility; ground routing still uses the actual micro-cell path.
- Ground routes use terrain-cost A* over adjacent dry cells. Hostile formations block passage; attacks can terminate at an occupied enemy cell. Each simulation step adds movement effort at the speed of the slowest constituent type, advancing at most one cell when its terrain cost is met. A newly blocked movement order stops. Ground entry changes only that cell's military controller, never regional political ownership.
- Aircraft have a demo range of twice their type's move value in micro-cells, may cross water, and require land destinations. Air strikes attack an enemy formation and retain the aircraft's base position; they do not capture land. Rebasing uses a direct route. There is no airfield or interception simulation. The economic experiment records illustrative oil costs for completed movement and attacks, but does not enforce fuel availability.
- Strength is an aggregate percentage, not an individual equipment ledger. Deterministic demo exchanges use composition, remaining strength, morale, and a mountain defense modifier. Losses and morale can leave surviving formations; morale at or below 25 triggers an adjacent retreat if a nonhostile land cell exists, otherwise the formation is pinned. Zero strength removes the counter and prevents new orders. Idle survivors recover three morale points per step. Defenders return fire; there is no autonomous strategic AI. Turns resolve in stable formation order, not a simultaneous live-game combat model.
- Flags use three distinct code-native SVG/Canvas designs (Aurelia: gold sun; Sable: white saltire; Verdant: green diamond). Map flags anchor on dry land within politically owned regions, with national/coastal outlines. They represent ownership, not whichever army is standing there. The separate Military control layer shows local occupation. Diagnostic geography views suppress military markers, orders, and flags without unchecking their preferences.
- **Reset military demo** restores the captured baseline of local control and damage without rebuilding geography or changing options. All factions are controllable and visible. This is explicitly a browser-only fixture: no orders, formations, casualties, flags, or ownership changes are sent to the live game. Node remains a build/test tool, not a game runtime dependency.

Unit and browser tests cover deterministic names/compositions, stacked selection, route validity and costs, previews versus confirmed orders, partial losses, retreat, aircraft range/noncapture, new blockers, reset restoration, layer independence, diagnostic suppression, and preservation of geography across interactions.

## Question under test

Can the interface clearly communicate that a region remains politically owned by one nation while another nation progressively occupies its cells?

### Parked direction: combat replay, contact intelligence, and naval landings

Agreed direction, not implemented by the current formation demo. The bounded naval sandbox described below now explores a first subset; general combat replay and intelligence remain future work:

- Resolve a battle through recorded micro-steps within a normal game turn: approach, contact, exchanges, reactions, and resulting positions/control. Replay the recorded result without rerolling combat or inventing explanatory movements. Provide pause, speed, and step controls with causal explanations for losses, morale changes, and retreats. A hypothetical combat sandbox is separate from replaying an actual battle.
- Enemy intelligence derives from contacts and observations actually reported by participating forces. A probing force does not reveal all defenses in a political region. Distinguish directly observed units/structures from inferred fire sources, retain uncertainty and observation time, and account for reports that never reach command. Player-facing replay must obey the same information restrictions rather than expose omniscient simulation state.
- Amphibious landings require naval transport and attempt to establish a beachhead on a coastal micro-cell, not instant ownership of an entire region. Explore approach, first-wave landing, reinforcement/supply, inland expansion, and evacuation, with roles for escorts and offshore support.
- Failed landings explicitly account for troops still embarked, evacuated survivors, casualties, stranded troops, and prisoners. Do not automatically delete every participant on failure. Total loss remains possible when supported by events such as transports sinking or evacuation becoming impossible.
- Initial bounded test: one transport, one optional escort, two troop groups, and a defended coast (now available below). Geography generation and its agreed options remain settled; these experiments belong in optional simulation/display layers.

No conquest threshold, combat-resolution rule, persistence format, or backend migration is implied by this experiment. The experimental world generator is described below.

## Optional economic experiment

Use **Try economy demo**, then choose faction, Food/Oil, and a view: potential, production, demand, or local balance. Heatmaps show micro-cell values; thinned district badges summarize the selected value. Click land to inspect its district. The inspector separates capacity, actual output, demand, stocks, and unused labor. **Food labor share** previews a change without applying it; **Apply to district** or **Apply to faction** commits it. Economic turns advance manually, separately from military/naval steps.

- Food capacity follows existing moisture, landform, snow, and tundra. Oil uses a separate deterministic clustered deposit field derived from the seed, not new terrain or a claim to realistic geology. Existing generation options, cells, ownership, and hydrology are not modified.
  The atlas experiment below now supplies this shared onshore oil substrate; the former district-anchored patches have been replaced. Offshore reserves are survey-only. Changing resource presets recalculates oil capacity without resetting stocks, labor allocation, queued costs, or military/naval operations.
- Each district has a shared, illustrative workforce split between food and oil; workers cannot be counted twice. Output is capped by accessible productive capacity. A dry cell controlled by another faction contributes no production to the owner's economy; damage reduces accessible capacity. Unused labor remains idle. This does not yet model an occupier extracting captured resources.
- Population and site capacity are normalized by cells per region so changing density does not simply multiply the economy. These are demo quantities, not backend population/resource balances. Demand is 0.8 Food per normalized inhabitant per economic turn; workforce is 42% of normalized population. Each faction starts with two turns of Food demand and 40 Oil.
- Settlement explicitly reports `opening stock + production - consumption = closing stock`, with unmet demand if insufficient stock is available. Food demand is civilian; military/naval oil spending is queued until the next economic settlement and charged once. An armored/air formation pays per eligible constituent unit when it actually moves or attacks. An active landing step costs 3 Oil with a surviving escort, otherwise 2. Estimates for queued orders are displayed separately from incurred costs.
- In Oil demand/balance views, consumer badges locate formations and the fleet: **USED** is accumulated spending pending settlement, **LAST** the last settled spending, and **PLAN** an estimate for queued formation orders. These are operation locations, not simulated delivery routes. Oil balance heatmaps show local production; the national ledger includes operating consumption.

Stocks are pooled per faction. There is no freight routing, refinery chain, trade, reserve depletion, starvation, or enforced fuel shortage. Oil shortage is reported but does not prevent an action. This experiment deliberately models only Food and Oil, not every existing game resource or labor sector. It reads and writes no game database. **Reset economy demo** resets this illustrative ledger and labor allocation; resetting just the naval or formation fixture does not refund spending already recorded in that ledger.

## Optional naval landing experiment

Use **Try naval demo** to focus a suitable coast. It adds one transport, an optional escort, and two named 100-person landing groups without enabling or disabling other overlays. Set **Coastal defense** and **Escort support** before the first step. **Choose landing beach** accepts existing dry coast adjacent to unfrozen ocean; a connected ocean approach is found without carving terrain. Lakes and frozen water are rejected. A map without a suitable beach reports that limitation instead of changing the landscape.

**Advance naval step** moves through approach, offshore staging, first-wave landing, a contested micro-cell foothold, and either success or withdrawal. **Commit second wave** reinforces the landing; **Withdraw / evacuate** requests an evacuation on subsequent steps. Ship counters show hull; the inspector shows troop-group strength counts and morale, events, contact observations, and oil use. **Find operation** returns the camera to the fleet. The existing Order arrows checkbox controls the sea-route display.

- Troops are explicitly accounted for as aboard, ashore, evacuated, killed, captured, or stranded. Their sum always equals the original 200. A failed landing can bring survivors home; a sinking can still cause total loss without escort rescue. Uncommitted troops remain aboard rather than silently landing.
- The defensive fixture reports coastal gunfire and beach contact as they occur; it does not reveal an inland defense network. The defense slider is a scenario-author control, not player intelligence. This is not a full fog-of-war system.
- Every advanced step records an immutable snapshot. **Recorded naval step** scrubs those snapshots; **Return to live operation** resumes the live display. Viewing history cannot reroll losses, execute orders, or spend fuel again. This is a naval-only step replay, not a replay of the entire economy/formation state or an animated general battle resolver.
- Success secures only the fixture's local beachhead. It does not change real military controllers, political ownership, or damage, and it is not connected to the existing land-formation roster. Inland expansion, supply networks, general naval combat, ports, and transport loading remain future experiments.

Both new overlays are independent checkboxes, with separate inspector focus tabs. Hiding them retains their simulation state. Elevation/moisture/temperature/drainage diagnostics suppress their graphics without changing preferences. Regenerating the landscape or changing map size/resolution resets both demo models while preserving geography settings and layer selections. No new dependency or production Node runtime is required.

Verification covers deterministic labor allocation, production caps, stock conservation, one-time operation charges, unchanged geography, ocean-only approaches, escorted success, evacuation, sinking/rescue accounting, and immutable history at 7/19/37-cell densities. Browser checks cover both resource views, labor previews, shortages, independent layers, naval reinforcement and withdrawal, replay without repeated charges, diagnostic suppression, and seed/resolution rebuilds.

## Named oceans, river courses, and natural-resource survey

Use **Try geographic names** at the top of the lab. Ocean names, ocean membership tint, and river names are independent optional layers. Click an ocean cell to inspect/highlight its area. The native **Named feature** list and **Find named feature** button offer a keyboard-accessible way to select/focus every named feature, including small areas whose labels are hidden at world scale. Selecting a river highlights its actual visible course, not a straight line across hidden lake gaps. Elevation/moisture/temperature/drainage views suppress the graphics but preserve layer preferences.

### Extended geographic features — 2026-09-21

**Try geographic names** now enables continents, islands, mountain ranges and lakes alongside existing ocean/river names. These are display filters over one `cartography.features` / `featureById` registry, with a many-to-many `featuresByCell` reverse index. A cell can belong to a continent and a range; inland water can belong to a lake and its containing landmass. Political ownership is not an input. The named-feature list includes even tiny features hidden by zoom/collision rules. Finding a feature prioritizes its label, highlights its footprint and lists relationships and all selected-cell memberships in the inspector.

- Connected non-ocean components form landmasses, including inland lake cells in their footprints. **Minimum continent area** (10/20/40/80 region-areas, default 20) compares dry-land cell count divided by cells-per-region. **Classify landmasses** changes classification only, retaining IDs, geometry, resources and operations. Sampling can still change connectivity/area near a threshold across resolutions; area normalization is not a promise of identical topology. Existing generator summary statistics retain their original thresholds.
- Ranges are connected land above 650 m, including saddles, with at least one summit above 900 m and an area of at least 0.35 region-areas. Low valleys/water separate systems. This deliberately simple heuristic can merge long systems; ridge-axis subdivision and curved labels are deferred.
- Lakes are connected lake-terrain components, independent of the old physical model's placeholder names. Drainage vertices and hidden links relate them to visible named river courses, with inlet/outlet references and inverse river relationships. A dominant connected river (more than 1.25 times the next candidate's contact flow, or the only candidate) supplies the name root. Tributaries keep their own names; ambiguous/disconnected lakes keep independent names. No outlet is invented for terminal drainage. Multiple lakes sharing a river get distinct numbered names.
- Names use separate seeded namespaces; adding these types does not rename oceans/rivers. IDs are stable for the same sampled map and landmass reclassification, not a persistent saved-world identity promise across regeneration. City/territory naming provenance, archipelagos, forests/plains/tundra and peak naming remain deferred. See [ADR 0016](../client/decisions/0016-geographic-feature-atlas.md).

Checks extend `map-atlas.test.js` with overlapping membership, valid anchors/references, deterministic rebuilds, area classification, elevated-saddle separation and synthetic dominant/ambiguous/terminal lake drainage. Browser coverage adds all four feature lookup/toggle cases, unchanged geography/economic accounts, threshold persistence across resolution changes and diagnostic suppression. This remains lab-only; no backend or saved-game schema changes.

### Ocean membership algorithm

`resources/js/map-lab/cartography.js` derives its own immutable overlay data from the settled map:

1. Build a six-neighbor graph of all ocean cells, including frozen ocean, excluding lakes and land. Find connected components so disconnected water cannot accidentally share a disconnected partition.
2. A coastal breadth-first pass measures clearance from land. Normalize it by the square root of cells per region so the strait penalty is comparable across resolutions. Missing off-map cells are not treated as land.
3. Each connected component receives one to five seeds, approximately one per 80 region-areas. Start with maximum coastal clearance, then choose farthest candidates by weighted sea distance, biased toward open water.
4. Multi-source Dijkstra assigns every ocean cell to exactly one seed. Crossing a narrow coastal passage costs more than crossing open water (`1 + 3 / (0.3 + minimum normalized clearance)`). Every resulting area is connected. Borders are an authored cartographic convention, not a physical simulation or political boundary; the method encourages, but cannot guarantee, boundaries at every strait.
5. Compute the area centroid and choose a member cell near it with a penalty for hugging the coast. The label anchor must belong to its named water area, even when the mathematical centroid lies on a continent. Screen labels avoid each other and screen edges; smaller features appear on zoom.

This first pass names partitions under 25 region-areas as seas and larger ones as oceans. It does **not** yet identify nested marginal seas, gulfs, or straits, and the size-based suffix is not a geological classification. The default 19-cell world has four broad ocean partitions plus two small disconnected sea areas.

### River identity

The original rendered river reaches and geography are unchanged. A separate graph groups visible edges into named courses. At each confluence, the incoming branch with greatest accumulated flow continues the downstream name; other branches become named tributaries. Actual downstream links connect identities through unrendered drainage/lake gaps without drawing new river segments. The inspector reports tributary relationships. All courses are available in the list; only sufficiently long visible courses receive map labels at wide zoom.

Names use seeded root/suffix combinations with duplicate protection, not network/AI generation. The same seed, settings, resolution, extent, and implementation reproduce names and membership. Ocean partitioning and river topology are recomputed from the sampled graph: feature identities are **not promised to persist across resolution changes, scenario crops, or geography changes**. This remains a naming prototype, not a persistent saved-world identity format.

### Natural resources: stock is not production

**Try natural resources** enables a separate survey with Oil, Iron, Copper, Coal, and Timber. Its native preset controls apply without rebuilding geography:

- **Abundance:** enables a stable subset of oil/mineral deposit candidates; scales standing timber density within existing forest, without adding/removing trees from the terrain. Zero removes all illustrative resource stock.
- **Concentration:** favors fewer, tighter major oil/mineral fields and reduces minor fields. It does not reposition forests or conserve total world stock; it is a distribution preference, not an exact field-count control.
- **Richness:** multiplies density/quantity without moving the fields.

`natural-resources.js` places jittered candidate centres in fixed continuous world coordinates, independent of countries, regions, and micro-cell IDs. Irregular elliptical fields model oil/coal; elongated belts model iron/copper. They are fictional geology, not a tectonic or sedimentation reconstruction. Mineral fields occur on land. Oil may continue into relatively shallow ocean (illustrative bed elevation above −350 m), never lakes. Forest stock follows the existing forest cover and moisture. Slope, water, and freezing provide a simple terrain extraction-difficulty index; roads, labor, discovery, and infrastructure are not inferred.

Cell quantity is density × 1,200 / cells-per-region for deposits, or density × 800 / cells-per-region for timber. These are illustrative stock units, not tonnes, barrels, or backend balances. Finer grids integrate the same broad fields rather than granting a full deposit to every extra cell; coastline/vegetation rasterization can still change totals. Timber exposes illustrative regrowth potential but no time-stepped regrowth or harvesting. Production does not deplete the stock in this test.

The existing economic model consumes the same **onshore Oil** field and difficulty to calculate available extraction jobs/productivity; actual output remains labor/control/damage limited. Offshore oil, the three mineral types, and timber are survey-only and are not new backend resources. The inspector keeps stock, richness, difficulty, accessible stock, and production concepts distinct. Heatmap intensity is a fixed density scale (clipped above 1.5); exact cell values remain inspectable. No new dependencies, Node runtime, persistence, live-game commands, or shared generator changes.

Verification: `tests/client/map-atlas.test.js` checks disjoint total ocean coverage, connectivity and valid label anchors across seeds and all densities; exact river-edge accounting and a synthetic confluence/lake-gap case; deterministic political-independent deposits, zero abundance, richness scaling, area-normalized quantities, forest/water restrictions, and unchanged stocks/costs on oil reconfiguration. `tests/client/browser/map-atlas.spec.js` covers cell selection, named-feature lookup, diagnostic suppression, all five resources, presets, 22,200-cell rebuilds, seed restoration, and a 430-pixel layout. Screenshots are local test artifacts, not a claim of physical-device or non-Chromium verification.

## Rivers, lakes, and first terrain art

Lake and river counts now emerge from the seed and terrain, rather than a fixed fixture count. Lakes occupy existing cells, so the 19-cell world still has exactly 11,400 cells. Some lakes span political boundaries; small basins can occupy only one cell at coarse resolution. Water cells have no population or land occupation and are excluded from land-control totals; political ownership still applies within regions containing land.

Rivers are stored once per shared pair of adjacent land cells, with exact integer corner identities. Their segments form continuous reaches along cell edges, including across region borders. They follow elevation-conditioned drainage; reaches split at tributary junctions and where visible land-bank edges stop at water. River crossings are identified in the status message but carry no movement/combat penalty yet. Lakes and ocean are impassable to the demo's land army.

The generated atlas provides grassland, forest, hills, mountain, lake, and ocean imagery. The browser prepares reusable clipped hex sprites, showing them at operational zoom while retaining the cached color overview at world scale. The Illustrated terrain and Rivers toggles allow comparison; Find a lake and Find army center and zoom the camera. Artwork failure falls back to terrain colors. Bridges, roads, and new infrastructure remain deferred.

Atlas: `resources/js/map-lab/assets/terrain-atlas-v1.png`. Generation method and exact prompt are recorded in [the asset README](../../resources/js/map-lab/assets/README.md). The atlas is bundled by Vite and served as a static image by PHP's web server; it requires no Node runtime.

The performance readout now explicitly says **draw CPU**: it times JavaScript drawing commands, not completed GPU rasterization, presentation latency, or frames per second. Visible cell count is a viewport count; overview paths are cached across the whole model.

Verification: model tests cover lake connectivity, exact river-edge geometry and continuity, cross-region geography at every density/scale, water movement rejection, and unchanged ownership on river crossings. Browser tests cover image loading and failure fallback, layer controls, lake inspection, full-world zoom, and army movement.

## Terrain transitions

### Optional lab-only Terrain v2 comparison

The top-of-lab **Terrain v2 · layered landscape** checkbox selects an experimental close-up renderer. **Find terrain comparison** enables it and focuses a forest/river scene; switching the checkbox itself does not move the camera, regenerate geography, reset simulations, or change other layer preferences. This is deliberately **only in the Map Lab**, not the live-game/beta map or standalone map studio. The original renderer remains the default. The existing full-world overview and diagnostic colours remain in use.

`resources/js/map-lab/terrain-v2-field.js` samples read-only land/water, elevation, vegetation, moisture, snow/ice, lighting and temperature fields from the existing micro-cells. Smooth normalized barycentric weights blend adjacent centres. Exact cell centres retain their terrain identity; shoreline and biome transitions are cosmetic interpolation between them. The optional grid and inspector still expose the authoritative cells. No new gameplay cells, erosion, coast generation, resource changes, or movement rules are introduced.

`terrain-v2.js` replaces mirrored texture swatches with continuous seeded ground colour/grain, calmer water and a shore/shallow-water band. Forests use independently seeded canopy sprites in clustered patches with gaps; cold woods use a conifer variant. Candidate positions/noise use continuous geographic coordinates, rather than cell IDs or the camera, so panning/zooming cannot reroll them. Density and placement remain decorative, not additional timber inventory. Rocks, snow blending and small-scale rocky colour/light variation follow the existing terrain fields; this is an illustrated procedural treatment, not final photorealistic mountain art or a 3D terrain mesh.

Rivers receive subdued banks and a narrower water core. Small quadratic corners round only 18% of adjacent rendered segments, keeping every reach endpoint/confluence fixed. The original river-edge/drainage graph is unchanged; visual curves are not movement or hydrology geometry. River names, selection and combat orders remain separate overlays. Terrain, Illustrated terrain, Terrain transitions, Relief shading, Rivers, grids, ownership, damage, economic/resource tints and military/naval graphics remain selectable. No replacement image asset, external library, backend change, or Node runtime is required.

V2 prepares only visible world-aligned raster patches, at 128/256/512 pixels according to screen scale and device pixel ratio. Preparation targets roughly seven milliseconds per frame with row-level yielding; final decoration and first-use setup can exceed that target, so it is not a frame-rate guarantee. The inspector reports pending patches. A 96-patch / 8,388,608-pixel budget bounds cached patch pixels to 32 MiB (excluding the working canvas/image buffer, tiny reusable sprites, browser overhead and existing renderer assets). An adaptive resolution cap keeps the visible working set within budget. Wider views use the original overview. Cache keys include model, level, relief and transitions; model replacement releases the old V2 fields/cache on the next active draw. HMR/destruction clears V2 resources through the existing renderer lifecycle.

Verification sources: `tests/client/map-terrain-v2.test.js` checks read-only model data, cell-centre identity, geographic coordinate inversion at 7/19/37 densities, deterministic bounded colours and continuous seeded non-mirrored noise. `tests/client/browser/map-terrain-v2.spec.js` compares V1/V2 pixels at an identical camera, exact V2 restoration, visible effects of existing controls, diagnostics, cache bounds, missing old artwork, close zoom, naval coastline overlays and a 22,200-cell rebuild. Screenshots are local Chromium artifacts; final validation is recorded in the progress journal.

### Original blended-tile renderer

Terrain transitions are enabled by default at operational zoom. The existing atlas is sampled in shared world coordinates so equal terrain continues across cell borders, including political boundaries. Mirrored material repeats avoid an abrupt texture wrap. Each cell blends its actual neighboring materials through six feathered edge masks; lake and ocean edges also receive a shallow-water/ground band. The straight lake-shore stroke is omitted in this view. Political borders, grid lines, rivers, and occupation remain separate overlays.

Use Terrain transitions to compare with the original tiles. Turn off Micro-cell grid to see the continuous landscape more clearly. These are runtime Canvas composites of the existing artwork, not additional generated images; geography and movement rules are unchanged.

Blends are prepared in approximately six-millisecond batches and cached, with a maximum of 1,024 sprites at 96 × 96 pixels (about 36 MiB of raw pixel storage, excluding browser overhead and other assets). The blended detail view is limited to 900 visible cells to avoid cache churn on large displays. Wider views retain the cached color overview until zoomed closer. The live readout shows when blends are being prepared; tile caches are cleared when the model is rebuilt.

Browser verification compares the rendered canvas with transitions on/off, checks deterministic restoration, confirms unchanged movement targets and cell counts, and exercises both map scales and the image failure fallback.

## Seeded geography experiment

The generator takes inspiration from [Red Blob's terrain fields](https://www.redblobgames.com/maps/terrain-from-noise/) and [Mapgen4's layered geography](https://www.redblobgames.com/maps/mapgen4/). This is an original, small implementation for the existing hex lab, not an integration or port of Mapgen4.

Controls: seed, continental cores (2–5), land target (25–80%), mountain strength, landscape scale, wetness, coastal detail (0–100%), small island abundance and lake abundance (relative 0–100 settings), polar extent (0–25° from each pole), and mountain snowline (800–3,200 m). Generate landscape applies changes and resets demo moves. Try another seed generates a new reproducible seed. Resolution and world-size changes retain the applied settings. Failed generation (for example, an entirely submerged scenario crop) leaves the previous model intact and reports an error. Generator version `landscape-v4` separates island abundance from coastal detail and adds lake retention controls; repeatability applies within a generator version. The default landscape is retained from v3. The lab opens on the 11,400-cell full world with political overlays and grid lines hidden.

Island abundance defaults to 50 and activates stable offshore groups rather than specifying an exact island count or changing their size. Above 50 it adds further seeded archipelago candidates; zero removes added groups, but coastal noise can still separate natural fragments. Coastal detail shapes bays and capes independently. Ocean corridors remain protected, and the reference sea level is recalibrated to preserve the land-coverage target, so minor coastline shifts are possible. The summary reports measured small landmasses (below 12 region-areas), not the number of candidates. Some candidates are submerged, connected to land, outside the crop, or too small for the selected resolution.

Lake abundance also defaults to 50. Below 50, a stable seeded selection retains fewer complete basins; zero retains none. Above 50, the minimum basin depth decreases from 12 m toward 3 m, admitting shallower natural lakes. Lake surfaces still follow the drainage solver; connected shallow lakes larger than four region-areas are rejected. Unretained basins become conditioned ground at their spill surface rather than merely hiding water artwork. This is a static generation heuristic, not evaporation or seasonal water balance. Both abundance controls are relative preferences: the seed and resolution determine the resulting counts, which are not guaranteed to increase at every slider increment.

Pipeline:

1. Seeded, well-spaced continental cores replace the single central-island falloff. Warped nearest/second-nearest distance fields leave ocean corridors between them. Regional bays, capes, offshore island chains, and two finer noise scales shape coasts without closing the core ocean corridors. Bent, branching mountain ranges and local plateaus leave room for broad lowland plains. Relief is added only above land: changing mountain strength cannot lift ocean floors into enclosing barrier rings.
2. A fixed reference grid determines sea level for the requested land target. Inverting the region-center lattice gives exactly matching field samples at region centers across 7/19/37 resolutions. The small scenario samples the area around the full world's Emberfall.
3. Below-sea-level cells connected to the map boundary become ocean. Political boundaries do not constrain coasts. Regions can contain both land and water, so the old 317-land/283-water region split is intentionally no longer fixed.
4. [Priority-Flood](https://arxiv.org/abs/1511.04463) on the shared corner graph assigns spill heights and acyclic downstream links, starting at ocean and map-edge outlets. Selective spillway breaching lowers the edge beds of oversized/deep basins, then recomputes drainage. Small basins remain lakes; tiny unresolved pits become conditioned ground. Connected lake cells share a water surface. Original cell bed elevations, carved corner depths, and conditioned drainage elevations are retained.
5. Relative rainfall runoff is distributed to corners by cell area, then accumulated downstream, including through lake basins. A flow threshold selects visible river edges; larger flows receive wider strokes. The complete drainage graph is retained even where no river is drawn.
6. Elevation and approximate slope assign landform. Latitude spans +90° to −90° across the northern/southern map rows, with altitude cooling and small climate variation. Polar extent controls the caps independently of the mountain snowline; zero removes the caps without removing alpine snow. Latitude never creates land: cold land receives snow or tundra, while frozen ocean/lake surfaces remain blue water and stay impassable. Only actual snow-covered land uses white terrain. Rainfall and nearby water assign moisture and vegetation independently: forested hills are represented in data even though the atlas uses the forest illustration for them. Snow, tundra, and ice use small code-drawn Canvas materials with the same transition masks; no additional image dependency is required.
7. The demo city and army are placed on available land, preferring Emberfall. They do not force the generated geography to change. Existing movement, occupation, and ownership rules remain isolated from generation.

Map views: illustrated landscape, elevation, moisture, temperature, and accumulated drainage. Find north/south polar ice focuses the caps in world mode. The grid projects at an angle, so latitude bands follow the map's logical rows, not horizontal screen pixels. Selecting a cell in the drainage view traces its representative corner's downstream route in gold with direction arrows, including through basins. Diagnostic views suppress artwork and ownership tints without changing their checkbox preferences. Region borders can be hidden independently. The inspector exposes elevation, lake depth/surface, landform/cover, latitude, illustrative temperature, ice cover, relative rainfall/moisture, nearby corner flow, and the sampled drainage outlet. The generation summary measures actual connected major landmasses (at least 12 region-areas), dry-land percentage, largest-lake area, and generation CPU time separately from rendering time.

### Limits and future simulation work

Relief shading is a visual layer derived from neighboring elevations and water depth; it does not alter geography or movement. The world overview uses a softly filtered raster to reduce visible cell seams, while diagnostic views retain exact cell colors. At most two overview rasters (relief on/off), each capped at 1,536 pixels on its longest side, are cached per model; rebuilding discards them. Detailed zoom retains the bounded sprite/transition cache.

- This is static, simplified hydrology and latitude-based climate classification, not an erosion, groundwater, tectonics, seasonal, or time-stepped water simulation. Metres and Celsius values are illustrative; rainfall and runoff are relative values, not calibrated physical units.
- Basin conditioning uses an approximately four-region-area / 160 m depth threshold, independent of cell density. Large/deep basins have escape channels cut along their drainage trees; the solver is rerun (at most eight passes). Residual lakes can remain. This is a lightweight, bounded breaching heuristic inspired by the distinction between [depression filling and breaching](https://jblindsay.github.io/ghrg/Whitebox/Help/BreachDepressions.html), not Whitebox's least-cost algorithm or a physical erosion model. It changes actual edge-bed heights rather than just hiding oversized lake tiles.
- Retained basins fill to their conditioned spill levels, irrespective of seasonal rainfall. Wetness changes vegetation and river flow, not lake levels or retention. Polar ice has no thawing, sea-level, or new movement rules yet.
- Continental cores guide landmass structure; extreme land targets and coarse coastline rasterization can alter the actual connected-landmass count. The measured count in the UI is not simply a copy of the requested core count.
- The corner mesh drives flow; cell centers summarize surrounding drainage and can straddle a divide. A displayed cell outlet is a representative corner outlet, not a guarantee that the entire cell belongs to one catchment.
- Broad height fields persist across resolution, but shoreline rasterization, small basins, slope classification, and drainage routes can change. Hydrology is recomputed within the selected extent: the small scenario has open boundary outlets and does not import off-map upstream runoff.
- Land target refers to the full-world reference sample before inland lake filling, not the dry fraction of a seven-region crop or an exact political-region count.
- Dams, pollution transport, extraction, storage, and downstream consequences are not implemented. The directed drainage graph and runoff data make these possible future experiments; changing infrastructure would require updating drainage and water balance.
- Terrain fields and graph generation run once on rebuild; views use cached paths and the existing bounded texture cache. No new package or production Node runtime was introduced.

Verification includes deterministic seeds, resolution-independent field sampling, coherent neighboring heights, control effects, a synthetic basin with a known spill height, downhill acyclic drainage, runoff conservation, lake levels, cross-region river geometry, and army movement. Browser tests cover seed regeneration/restoration, all diagnostic views, 22,200-cell rebuilds, image fallback, and existing transition controls.

The continents regression suite sweeps 100 named seeds at 7 cells per region and checks separate major continents, modest lake area, both polar caps, and runoff conservation. It also covers 19/37-cell worlds and extreme land/wetness/relief/scale settings, mountain-independent coastlines, a synthetic breached basin, and impassable frozen water. Browser tests inspect both caps at illustrated zoom, the temperature view, and the continental-core control.

Landscape regression tests compare coastal complexity and island counts, verify repeatable relief colors, and prove that polar extent changes neither the land/water mask nor coastlines, elevations, or drainage. Browser tests exercise the independent polar/snowline controls, relief toggling, and geography-first default view.

Abundance tests verify stable island groups, unchanged core relief features, land-coverage targets, lake surfaces, ocean-mask independence, downhill drainage, runoff conservation, zero-lake behavior, and wetness-independent lake retention. Browser checks exercise both sliders, the disabled lake locator at zero, and settings persistence across 19/37-cell resolutions.
