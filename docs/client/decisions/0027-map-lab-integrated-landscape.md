# ADR 0027 — Integrated development landscape in the Map Lab

Status: Accepted; first focused visual study implemented

Date: 2026-09-26

## Context

The first development study demonstrated built extent versus activity, but its opaque parcels obscured pre-rendered vegetation and looked detached from the land. The user approved a focused forested riverside settlement/farmland pass and requested Terrain V2 as the permanent lab renderer.

## Decision

- Make Terrain V2 the Map Lab's close-up baseline, removing the old-art comparison toggle. Retain simplified world overview, diagnostic colours, existing generator options and independent layers. This does not replace the live game's renderer or the standalone map studio.
- Derive one lab-local, read-only development surface from built footprints and decorative streets. Use it for ground drawing before vegetation and for spatially indexed canopy/rock exclusion. Buildings are then drawn over that integrated landscape. The natural geographic model and resource survey remain unchanged.
- Keep clearing tied to built extent, not current activity. Idle districts retain their cleared ground and streets. Hiding the demo restores the natural preview; this is not simulated reforestation.
- Refine one riverside inland example first: terrain-constrained lanes, individually shaded roofs, adjacent cultivated fields and retained woodland. Keep the other five examples available with their first-pass structures and shared clearing/ground integration. Missing suitable terrain must not cause generator changes.
- Reuse existing native/shared controls and the procedural Canvas style. No new framework, image asset pipeline, building simulation, transport graph or economic integration.

## Consequences and limits

Decorated terrain chunks are invalidated when visible built footprints change, while cached natural-ground pixels are reused; activity-only changes reuse the entire ground/canopy composite. Spatial buckets bound clearing queries. Natural ground and decorated images share the existing total raster pixel budget and are evicted together. Clearing removes decorative vegetation only, not timber stock or physical biome data. Individual illustrations are not authoritative buildings.

The streets and field layout remain a seeded visual heuristic, not historical urban morphology, connected navigation or a surveyed terrain-development model. No bridges are fabricated where the river interrupts a lane. Other activity artwork, additional settlement forms and any live-game adoption are future work.

## Verification

Model tests cover dry terrain, river clearance, stable growth, clearing/idle equivalence, hide/reset behaviour and unchanged geography. Fixture Chromium exercises natural/developed comparisons, idle persistence, layer/zoom changes, permanent V2, diagnostic views and existing experiments. Actual execution results belong in the progress journal.
