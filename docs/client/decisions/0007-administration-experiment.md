# ADR 0007 — Administration replacement and independent map preparation

Follow-up 2026-09-22: the current-game-only / single-active-game replacement constraints are superseded by [ADR 0017](0017-multiple-active-games.md). Other boundaries remain in force unless the accepted multi-game plan explicitly changes them.

Status: Accepted; experimental implementation

Date: 2026-09-19

## Context

The user approved a replacement covering all current development/admin capabilities, composed from the new game UI foundation and the admin mockup direction, with integrated map preparation. They explicitly requested **no new permissions system**, retaining checks that already exist. The visual concept and APIs remain revisable.

## Decision

- Add `/client/admin` alongside the original `/dev-panel`. Keep the original available during review; do not switch default gameplay routes or remove legacy developer tools.
- Place working-game selection above modules. Selection never activates a game. Read archived games explicitly; restrict turn changes to the active game and validate expected turn identity.
- Distinguish global account/map preparation operations from selected-game inspection. A create-game confirmation identifies the active game being replaced, independently of inspected game.
- Preserve original authenticated/development-only access and the generated-map feature's existing administrator check. No role editor, grants, new permission framework or blanket administrator requirement is introduced.
- Reuse the existing engine for turn resolution/rollback and preserve resource/movement/combat rules. Add narrowly scoped expected-state checks and lock coordination in the existing PHP style, not a new game engine.
- Save validated map snapshots independently in a map library. Each save is immutable; game creation copies the selected snapshot. Browser presets remain local settings, not server maps. Hand-painted cells, editing a live map and archived-game reactivation remain outside this slice.
- Share the MapStudio between standalone generation and administration. Extract native RangeField, confirmation dialog and semantic table only for the concrete repeated contracts encountered.

## Consequences and limits

The dashboard gains operational clarity and feature parity without turning game selection into an engine activation control. Existing development access is intentionally broad; production authorization remains future work and must not be implied by the new dashboard appearance.

The saved-map table is an additive migration, not a game reset. Destructive tests use an isolated database. Existing rollback cascades and engine partial-upkeep recovery limits remain; this decision does not introduce audit logging, arbitrary undo, world editing or simultaneous active games.

See [the implementation handoff](../admin-experiment.md) for the capability checklist, concrete source map and test reproduction.
