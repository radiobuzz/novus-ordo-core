# ADR 0032 — Persistent microcell geography and map workspace

Date: 2026-09-28

Status: Accepted; first implementation verified in isolation, live rollout pending

## Decision

Replace the fixed-size partial generated-map contract with immutable geography supporting configurable region columns/rows and 7/19/37 microcells per region. Nominal region area is independent of resolution. Preserve sampled climate, hydrology, depth, coastal measurements, named features and explicitly selected natural resources. Regions aggregate geography; game ownership and seasonal simulation remain territorial.

Resources keep their actual identity. Map profiles declare eligibility, distribution and exclusions; generic Ore is an alternative to Iron/Copper, never an alias or conversion. Save profiles/results and generated names with the map. Future generator, template or name-pack edits do not change a saved world.

Extend the existing MapStudio workspace and shared map modules. Reuse native controls and the existing client service lifecycle. GameDataService owns confirmed reads; static maps are cached by identity/fingerprint while turn snapshots supply ownership and economic overlays. Lab fixtures are not production data. Use the same geographic model in preview, game, entry, minimap and comparison views.

Previous game and saved-map data will be discarded during a deliberate release reset, with forward schema cleanup and no compatibility reader. Keep account/admin access and unrelated site/source data. No reset is performed by accepting this document.

Map workspace settings use small independent category panel instances, selected through a left sidebar of icon tabs. A single workspace draft and preview serve all panels. The right inspector is independently collapsible. Switching category tabs preserves their values; changes do not remount unrelated panels. Reuse the existing instance/host lifecycle rather than constructing one large settings panel or a new window-management framework.

## Consequences

World size becomes data rather than a 600-territory assumption. Deployment limits and renderer memory budgets remain necessary and measurable. Static geography is not copied each season or mutated during rollback. Geographic resource potential connects to the existing catalogue without introducing cities, a market system or microcell military positions.

The [implementation plan](../../game-design/map-v2-implementation-plan.md) defines persistence proposals, the editor, ordered packages, reset scope and acceptance checks. It supersedes the old map format and prior saved-map preservation plan once implemented; the [implementation results](../../game-design/map-v2-implementation-results.md) record delivered behavior, verification and the pending deployment boundary.
