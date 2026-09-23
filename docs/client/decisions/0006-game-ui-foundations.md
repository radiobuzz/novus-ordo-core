# ADR 0006 — Reuse-first game UI foundations

Status: Accepted direction; F1 implemented, component APIs remain revisable

Date: 2026-09-19

## Context

The new entry/gameplay client and admin visual concept reveal repeated UI vocabulary: semantic colors, titled panels, cards, controls, status feedback and shared game assets. The user explicitly wants generic concepts, reuse and coherent game-wide CSS variables, with documentation and a maintained skill. They also want a path for richer controls without building everything now.

## Decision

- Grow one small game UI foundation across entry, gameplay and administration using the existing plain-JS/SCSS stack and lifecycle runtime.
- Extract real shared presentation/interaction boundaries; compose domain-specific screens from them. Keep domain state, game rules, permissions and network commands outside generic controls.
- Use semantic theme roles and meaningful component states. Preserve resource/nation/terrain meaning separately from theme colors.
- Check reuse/composition before creating a custom component. Propose a new shared boundary for demonstrated reuse or a distinct interaction/lifecycle/accessibility contract; document why existing blocks are insufficient.
- Keep trackbars, progress/meters and mini charts as planned contracts until a real feature needs them. Prefer native controls where they can satisfy the interaction.
- Maintain a living foundation plan/catalog and a concise project-owned skill. Revise from actual use rather than treating the concept image or candidate APIs as a frozen specification.

## Consequences

Shared improvements can reach multiple screens. Components must make ownership, states and accessible behavior explicit. Incremental extraction costs some migration/testing work; unused abstractions and configurable “everything” components are not justified by the reuse principle.

Game-scoped administration and global account tools may share visual blocks but not authority or scope. This decision does not implement the admin dashboard, change the backend, authorize live game mutations or adopt a new UI library.

## Alternatives

- Separate admin/game UI kits: faster locally, but duplicates styling and causes drift.
- A universal configurable widget framework: broad potential reuse, but speculative complexity and feature leakage.
- Styling only: improves appearance, but leaves duplicated validation, focus and interaction behavior.

## Next step

The user approved and F1 implemented a small extraction slice from [the living plan](../ui-foundations.md), proving reuse in entry and gameplay plus a synthetic development gallery. F2 subsequently composed the approved administration dashboard; [ADR 0007](0007-administration-experiment.md) records its scope and existing-access boundary. Richer controls arrive with real needs. The previous runtime/API boundaries remain in force; this extends them rather than replacing them.
