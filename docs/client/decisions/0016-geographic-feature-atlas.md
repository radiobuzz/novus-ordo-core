# ADR 0016 — Overlapping geographic-feature atlas

Status: Accepted direction; Map Lab experiment only

Date: 2026-09-21

## Decision

Extend the existing ocean/river cartography into one geographic-feature registry. Geographic identity is separate from physical terrain, political ownership and display preferences. Features have an ID, type, name, cell/edge footprint, label anchor and typed relationships. A reverse cell index supports multiple simultaneous memberships rather than partitioning all geography into one exclusive region system.

The lab recognizes oceans/seas, rivers, continents/islands, mountain ranges and lakes. Independent name checkboxes are filters over this same registry, not separate underlying domain layers. Native lookup and inspector text accompany Canvas labels and the selected footprint.

Continents are connected landmasses above a configurable normalized land-area threshold. Inland lake cells are included in the footprint but not the land-area measurement. Mountain systems include elevated connecting saddles. Lake/river relationships follow drainage topology, and an unambiguous dominant connected river can supply a lake's name without renaming tributaries.

## Boundaries and consequences

- Sources remain under `resources/js/map-lab/`; no shared generator, game renderer, backend, saved-world format or live-data service change.
- IDs and names are reproducible within the same seed, geometry, resolution and implementation. Classification alone retains landmass IDs. Persistence across edited/regenerated geometry is not implemented; a future saved-world feature format needs explicit identity reconciliation.
- Separate name namespaces preserve existing ocean/river names when new feature types are added. Future cities/territories may reference a geographic feature ID as naming provenance; automatic renaming and settlement integration are deferred.
- Large forests, plains, deserts/tundra, archipelagos and individual peaks can use this registry later, but their detection is not implemented here.
- Continent separation at narrow isthmuses, sophisticated range splitting and curved range labels remain future work. Current heuristics are inspectable experiments, not physical-geography truth.

## Administration sandbox follow-up — 2026-09-23

The user approved a bounded Map Lab comparison of fixed microcell countries, editable exclusive provinces and overlapping development zones. These are political/program areas, not new geographic feature types: they have their own lab-owned membership maps and never mutate the geographic atlas or name provenance. Existing military control remains a third independent fixture. Creating/editing a province cannot transfer sovereignty; zones can overlap provinces and each other. None of this establishes production governmental or economic rules. See the Map Lab's administration section for implementation and provisional interaction choices.

## Alternatives

Separate name systems for every terrain category duplicate lookup, display and identity rules. One exclusive feature per cell prevents nesting and overlap. Names embedded directly in political territories couple geography to changing borders. None fits the agreed direction.

See [Map Lab](../../game-design/map-lab.md) for controls, heuristics and verification.
