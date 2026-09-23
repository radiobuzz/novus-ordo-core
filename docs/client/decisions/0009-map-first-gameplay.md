# ADR 0009 — Map-first game commands

Date: 2026-09-20

Status: Accepted direction; first military slice implemented, ergonomics and component APIs remain experimental.

## Context

The user wants the main map to host routine gameplay, with module tabs retained for detailed statistics/configuration. The permanent territory directory consumed space without offering sufficient control. Only the unit-card catalogue and minimap ideas are borrowed from the C&C reference, not mechanics or visual skin.

## Decision

- Use a compact left mode rail, one map/camera, a persistent top-right minimap and contextual information/tools below it. Nothing selected and no active tool means no contextual panel. Opening Deploy does not require a prior selection.
- Military mode makes own units/stacks directly selectable. Selection, tool activation, destination and command submission are distinct. Mode changes discard incompatible tools without moving the camera.
- Preserve territory search as an on-demand, keyboard-usable finder and reuse the existing territory inspector. Keep existing module routes/commands available.
- Reuse shared panels, buttons, fields, lifecycle ownership and map infrastructure. ImageChoice owns presentation/selection state; Minimap owns overview navigation. WorldCommands composes domain workflows using GameplayService and shared movement drafting.
- Show server-calculated deployment maximums from existing available-production calculations. Existing command context validation and server rules remain authoritative. No resource, combat, movement or unit-type changes.
- Keep artwork mapping separate from definitions, costs and live labels. Five current unit types have replaceable, provisional artwork.

## Consequences and limits

This refines the map/adaptive-shell direction in ADR 0003 without replacing its dedicated-workspace option. Military commands now have a map-first path; broader geopolitical/economic workflow migration remains incremental. Side panels overlay the map to keep its bounds stable. On narrow screens contextual content becomes a lower sheet.

Own-force markers show only information already available to the owner API. There is no added enemy-force intelligence, real-time production queue, new permission model or framework. Same-turn tool/selection intent survives command reconciliation in memory; new game/turn/nation identity clears it. No command is restored or submitted automatically.

See [implementation and verification](../game-ui-pass-1.md). This decision does not freeze future unit systems, map mechanics, artwork era or component APIs.
