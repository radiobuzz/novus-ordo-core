# 0001 — Client scope and architectural direction

Follow-up 2026-09-22: the current-game-only / single-active-game replacement constraints are superseded by [ADR 0017](0017-multiple-active-games.md). Other boundaries remain in force unless the accepted multi-game plan explicitly changes them.

Status: Accepted direction

Date: 2026-09-18

Basis: The user accepted the preceding architectural assessment and requested a pre-plan, plain JavaScript, a loading proposal, and a maintained planning/decision folder.

## Context

Novus Ordo has an existing Laravel game backend and a prototype Blade/jQuery interface. Sproutflix Core provides useful JavaScript concepts, but its complete framework and PHP structure are not the intended foundation for this project.

## Confirmed direction

- Build a new client on top of the existing game. Do not redesign the backend as part of the client backbone.
- Use plain JavaScript. Do not introduce TypeScript or a TypeScript compilation/type-checking requirement. Ordinary explanatory comments and optional JSDoc are compatible with this constraint.
- Draw inspiration from instances, hosts, components, lifecycle, traits, ownership, contexts, and state. Do not import all of Core.
- Treat running features as instances and their presentation containers as hosts. Preserve reusable components and composable behaviors.
- Plan for later game evolution, including a diplomatic forum and a more dynamic map.
- Maintain plans and decisions in the repository's documentation folder.
- The current work is pre-planning, not authorization to implement or deploy the new interface.

## Consequences

The next artifacts should define the aspects and boundaries to design. Specific method names, rendering mechanisms, dependencies, map engines, routing schemes, and detailed implementation phases remain open.

Keeping Laravel does not imply every existing endpoint is already sufficient. An endpoint/response inventory must identify gaps; any required backend changes become explicit, separately scoped work. The diplomatic forum will require its own backend design later.

No frontend framework is selected by this record. Nothing in the agreed object model requires React.
