# ADR 0012 — Zoom-aware unit presentation and deployment previews

Status: Accepted experimental direction; first pass implemented

Date: 2026-09-20

## Decision

Show counts at overview scale and individual existing-unit tokens when space permits. Keep visual slots independent of authoritative territory-based positions. Painted dimensional sprites and flat counters are replaceable presentation choices, not a 3D-engine commitment. Preserve unit IDs across zoom and refresh.

Military left-drag selects units; right-drag pans, per the user's explicit preference. Keep touch panning/pinch and native selection alternatives. Rectangle interaction is a focused shared map contract; its game meaning stays feature-owned.

Deployment clicks create a local mixed-type/mixed-territory draft, with ghosts, shared-budget preview and one explicit confirmation. The existing batch endpoint and command service remain authoritative. Keep accepted, pending, rejected and uncertain states distinct; never retry a mutation automatically. Draft cleanup belongs to the service so navigation cannot resurrect accepted placements.

Units support a replaceable material palette following the portrait builder's light/shadow-preserving approach. V1 uses provisional keyed material masks and local visual preferences; it does not introduce persisted national colour rules.

## Consequences and alternatives

More direct map control without new engine rules. Dense groups need a readable fallback and controls need accessible alternatives. Art/masks/zoom thresholds need playtesting. A full 3D engine, individual soldier simulation, immediate deployment requests on every click and a new client-state framework are unnecessary for this slice.

See [the pass handoff](../game-ui-pass-3.md) for actual contracts, assets, checks and remaining limits. The shared-data rollback/concurrency gaps remain open; one HTTP batch is not a new database atomicity guarantee.
