# ADR 0028 — Hybrid development artwork in the Map Lab

Status: Accepted; implemented for visual evaluation

Date: 2026-09-26

## Context

The user accepted the integrated-landscape mechanics but wanted a dedicated beauty pass on mines/oil, factories and high urbanization. This extends ADR 0027's rendering approach, replacing its first-pass procedural structures without adopting any production game mechanic.

## Decision

- Keep continuous Terrain V2, shared clearing/ground treatment, seeded suitability checks and independent optional layers. Add a lab-local transparent painted structure atlas and quarry illustration, generated with the built-in image tool and persisted under `resources/js/map-lab/assets/`. Runtime generation and Node runtime services are not required.
- Reuse RangeField for **Urban intensity**, with exact/keyboard input and Town / City / Metropolis presets. Enable it only for coastal/inland settlements. Architecture tapers from downtown towers through mid-rise/row houses to lower outskirts, with an illustrative workshop fringe. This changes neither built extent nor current activity, and never asserts a population or production value.
- Keep original residential anchors and parcels. Denser architecture uses denser visual paving/canopy exclusion within their existing clearing envelope. A shared surface key includes built extent and urban intensity, excludes activity, and reuses cached natural-ground pixels when decorated composites change.
- Plan mineral/oil/industrial compounds from suitable terrain and, for extraction, actual surveyed resource cells. Limit mines to one or two validated excavation footprints with supporting equipment, use spaced oil pads/storage and grouped factory/warehouse sites, and sample service paths against land and river clearance. Failed suitability checks omit candidates rather than carve geography. Tracks may remain disconnected; they are not navigation paths or bridges.
- Own two lazy images in the overlay renderer; invalidate on load/error, retain a simplified fallback with visible and text-accessible status, and detach callbacks on renderer destruction. Preserve real alpha; use explicit atlas rectangles and fixed lighting rather than rotating painted shadows. The two decoded source images occupy roughly 12 MiB in addition to the separately bounded terrain cache; neither is duplicated per structure. No new framework, generic widget, backend command or game-data service.

## Limits and verification

These are illustrative samples, not individually simulated or metrically scaled buildings. Sprites are static, including quarry equipment during idling. The small art vocabulary and density gradient are still a visual test, not final urban morphology. Land-validation samples are heuristic, not an exact geometric proof. Further variants, seasonal art, historical eras, physical-device/non-Chromium testing and live-game adoption remain separate.

Model tests cover repeatability, fixed anchors, central height gradient, non-overlapping compound footprints, sampled water/river safety, resource constraints, idle/hide behavior and 7/19/37-cell resolution. Fixture browser checks cover real image loading, missing-image fallback, density/paving/cache behavior, all activity examples, narrow exact/keyboard controls, reset and existing experiments. Execution evidence is recorded in the progress journal. Exact generation prompts are in `assets/development-v2-prompts.md`.
