# Generated world

Status: persistent microcell runtime implemented in the workspace; live reset/migration pending deployment limits. See [implementation results and remaining work](map-v2-implementation-results.md), [format contract](map-v2-format.md) and [ADR 0032](../client/decisions/0032-persistent-microcell-world.md).

## Use the workspace

After the new schema is applied, administrators use **Map workspace** in `/client/admin` or `/client/map-generation`. Choose region columns/rows and 7, 19 or 37 cells per region. The deployment limit is shown before generation; defaults are 30 × 20 and 19 cells. The lab remains a separate experimental consumer of shared geography/rendering.

Left-sidebar icon tabs select World, Terrain, Climate, Water & coasts, Resources, Names and Layers. Each panel retains its controls when hidden. The right inspector collapses independently. Generation runs in a worker and can be cancelled while retaining the previous usable preview. Presets live in a new browser namespace; retired presets are not converted.

Resources are explicitly selected by real key with exclusions and supported distribution controls. Names persist with features; selecting a feature highlights its geometry, and name edits preserve geography/resources. Analysis layers and the inspector show sampled climate, fertility, water depth, resource potential and per-face coastal assessments. Proper names remain English when interface language changes.

Generate, save a named library entry, and start a game are separate actions. Saving creates an immutable definition or reuses an identical fingerprint. Starting an ordinary new game does not delete other new-format games. The one-time release reset removes the previous domain explicitly; there is no old-map reader.

## Runtime boundary

One region remains one game territory. All dry cells contribute to its land/resource potential, including disconnected small islands. Military ground connections still use the representative connected land component; microcell military positions and new lake/naval movement are not introduced. Existing homeland validation requires an eligible connected starting group.

Territorial land ratios retain six decimal places. Climate/terrain/resource aggregates derive from saved cells. Resource catalogue production and previews share geographic capacity constraints; static potential is distinct from stocks and current output. Population, policy choices, seasonal resources, ownership and armies remain game/turn data.

Production and lab share geography, terrain/depth/coastal rendering and feature detection. Laboratory demographic, development, industrial and military fixtures do not enter production snapshots. The same restored model serves game/entry/admin/minimap/comparison maps; confirmed game reads remain owned by the existing client service.

## Persistence

The browser submits `microcell-world-2`. PHP validates dimension-dependent cell topology, drainage references, geographic fields and resource profiles/distributions, then derives territorial area, connections and potential. The map does not supply database territory IDs or ownership.

`map_definitions` owns immutable geography; `map_features` and `map_resource_profiles` hold static annotations and definitions. `game_maps` and `map_drafts` reference that map. Turns and rollback do not copy static geography. Deleting a library entry cannot delete a map referenced by a game.

`GET /game/map?game_id=…` remains scoped to the requested game. The client reuses static geography while projecting turn ownership separately. Server and browser limits remain operational constraints; enabling a larger map needs measured memory, payload and rendering support.

## Verification and rollout

The [results report](map-v2-implementation-results.md) records six size/resolution round trips, server integration, custom-map HTTP creation, browser founding, passive seasons/rollback, old-schema upgrade rehearsal and remaining checks. It also records the deployment blocker and commands, rather than implying that building the client applies the migration.

Do not run old maps through the new runtime. Do not apply the new migration while old games or saved maps remain. Use the scoped maintenance/reset sequence after resolving deployment capacity. Accounts and unrelated site/source data are retained.
