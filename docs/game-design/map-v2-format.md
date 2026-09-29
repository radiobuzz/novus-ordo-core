# Microcell world 2 — first persisted contract

2026-09-28. Implemented codec: `resources/js/map/snapshot.js`; authoritative import: `GeneratedMapData`, `MapGeographyValidator`, `MapResourcePotential`. No previous-format decoder.

## Identity, size and area

`format = microcell-world-2`, `generator = landscape-v5`. `regionColumns` and `regionRows` count regions; `cellCount` is uniformly 7, 19 or 37. `regionArea = 1` is a nominal unit, not square kilometres. Each microcell contributes `1 / cellCount` to its region. Region index is row-major; database territory IDs are joined by region column/row, never embedded in the static document. Axial cell ID is `q,r`.

`settings` records the complete supported generator inputs. `width`, `height`, `offsetX`, `offsetY` describe drawing coordinates, not world size settings or physical distances. The database fingerprint includes the complete canonical document, including names and selected profiles. Maps are immutable through the application; editing and saving creates a new definition or reuses an identical fingerprint.

## Sampled fields

`CELL_FIELDS` in the codec is the ordered 29-field tuple contract. Do not append fields without updating both validators and round-trip checks.

| Group | Values and interpretation |
| --- | --- |
| Membership | Axial `q`, `r`, zero-based region index. Exactly the configured number of unique cells per region. |
| Surface | Terrain, landform, vegetation, snow/frozen flags, biome and normalized desert strength. Desert does not replace relief. |
| Climate | Temperature, moisture and rainfall are normalized generator indices, **not Celsius or millimetres**. Latitude is degrees; polar ice is a flag. |
| Height | Sampled elevation and base elevation in generator metres; slope is the generator's relief measure, **not an angle in degrees**. Terrain/relief colours and shade preserve the sampled appearance. |
| Hydrology | Drainage elevation, outlet and drainage vertex IDs, flow, water level, depth and lake ID. Lake depth is relative to its water surface. Null denotes an inapplicable/unavailable measurement or relationship; it is not a zero-depth or zero-slope assertion. Ocean depth derives from negative base elevation. |
| Agriculture | `agriculturalSuitability`, 0–1; baseline climate/slope/snow suitability, not cultivated area or current food production. |

`vertices` persist the drainage graph: ID, position, elevation, drainage elevation, runoff, flow, terminal flag, outlet, traversal sequence, carved depth, downstream vertex and downstream edge. `edges` persist ID, bordering cell IDs, endpoint vertex IDs, flow and directed flow endpoints. Complete cell-edge incidence and descending drainage sequence are validated. Runoff/flow are simulation indices, not measured cubic metres per second.

`lakes` retain membership and surface elevation. `drainage` retains breaches and aggregate runoff/outlet flow. Reopening a map restores these values and graph links; it does not rerun the seeded landscape generator.

## Geographic annotations

`features` carry stable local identity, type, saved name, anchor, membership/geometry and relationships. Supported initial types: ocean/sea, continent, island, river, lake, bay, mountain range. One river identity can span regions. Features overlap. `coasts` contain individual land/water faces and their geometry, exposure, shore/inland rise, ground measure, access/exposure grades, reasons and boundary-truncation flag. Grades are approximate geographic classifications, not landing permissions.

`naming` identifies the fictional English JSON vocabulary pack and version. Names are persisted; UI language and later pack changes do not rename an existing map. First-pass pack is roots/endings plus supported feature suffixes; multiple packs and cultural influence remain future work.

## Resource fields

`resourceProfiles` is the map-owned snapshot of selected definitions: stable key, labels/unit, method/version, habitats, affinities, exclusions, base quantity/capacity and distribution controls. Current supported methods: agriculture, surface, forest and deposit. Optional maximum water depth restricts eligibility. Abundance, concentration and richness are bounded author controls; concentration is exposed for deposits only.

`resources` has one entry per selected key, including deliberately empty distributions. Each nonempty row is `[cellId, density, quantity, capacity]`. Density is an intensity, not a percentage or worker count; quantity and capacity normalize by cells per region. Capacity is geographic output potential per season in the resource's units. Neither is a national stockpile. Quantity is not depleted by this release.

Map and game resource keys must match directly; required geographic resources must be selected, with compatible unit labels. Ore excludes Iron/Copper; no conversion is inferred. Extra map resources may be ignored by a game. New physical dimensions/unit conversions are not implemented: source profiles currently use abstract `units`.

The server derives territorial land/terrain fractions, land-weighted climate summaries, agricultural potential and per-resource quantity/capacity/terrain weights. Existing production rules combine labour with this capacity; forecast and season use the same calculation. Every territorial resource calculation must use that shared projection instead of inferring deposits from the dominant terrain.

## Storage and history

`map_definitions` owns the geographic payload and fingerprint. `map_features` and `map_resource_profiles` own their respective fields; those arrays are assembled into transport snapshots, not independently duplicated in the stored payload. `map_drafts` and `game_maps` reference the definition. `territories.geographic_potential` is the validated aggregation for current game calculations. Static maps/features/profiles are never copied each turn. Resource stockpiles, production allocations, population and military state remain ordinary game/turn data.

The initial transport is whole-document JSON. Deployment cell limits are configurable, currently 50,000 by default. This is not a promise that every browser or server can process arbitrary large maps; see [measurements and rollout](map-v2-implementation-results.md).
