# ADR 0011 — Compact in-game status and turn briefing

Status: Accepted; experimental implementation delivered

Date: 2026-09-20

## Context

The user wants a game instrument bar rather than website navigation: turn/readiness, compact money/resource information, optional identity, contextual map layers and turn news. Module navigation and settings belong in a hamburger menu. They confirmed balance means net change per turn and reserve means held stock, with full figures available on click.

## Decision

- Compose a persistent status header from existing controls plus a small native disclosure contract shared by menu, resources, readiness and layers. Keep domain reads/commands in services and update values from the existing shared bundle.
- Show actual engine balances and stockpiles, distinguishing non-stockable resources and command availability. Keep game rules and resource semantics unchanged.
- Ready submits directly without confirmation, retaining existing safety gates. Remove legacy-interface links from in-game chrome/errors; keep unrelated entry/admin navigation outside this pass.
- Provide one automatically opened, dismissible briefing per encountered turn, deferred behind existing dialogs and manually reopenable. Use actual population/territory comparisons, completed deployments, current deployment limits and existing participant battle logs/public news. Read failures are separate from game availability.
- Collapse the existing minimap without recreating geographic resources. Keep layer selection separate from interaction modes and mount the header layer control only with its World owner.

## Consequences and limits

The persistent header can support future indicators without reserving empty controls now. Compact economic figures need an accessible exact breakdown. A narrow additive private read model supplies turn comparisons; no schema or command changes are needed. The seen marker contains identity only and does not establish exactly-once delivery across devices or protection against a missed same-number rollback/reset. Newspaper artwork, diplomacy and new overlays remain deferred.

## Alternatives

- All numbers and navigation permanently visible: consumes map space and becomes hard to scan on narrow screens.
- Move all gameplay controls into the menu: hides frequent actions such as Ready and News.
- Infer completed growth/production from browser snapshots: incomplete after reload or missed turns; use persisted engine records instead.

See [game UI pass 2](../game-ui-pass-2.md) for sources, contracts and verification. This extends the reusable UI and shared-data decisions without freezing their internal APIs or completing the remaining whole-client migration.
