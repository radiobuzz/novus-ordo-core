# ADR 0019 — Standalone Flag Editor and resolved image recipes

Status: Accepted; experimental implementation

Date: 2026-09-23

## Context

The game currently displays a flag, and the user wants to prove a richer alternative to a single colour. They approved the visual flag proof, full Lab editor, independent randomizers and generated matching colours. Coat of arms/emblem research should remain useful without delaying the flag experiment. Nation creation is a likely later consumer, not part of this delivery.

## Decision

Implement a standalone, development-only Identity Lab with Flag Editor active and two future tabs disabled. Use original plain-JavaScript geometry and a small bundled vector catalog, shared UI primitives and a Canvas renderer. Colour harmony is a generator function that returns editable hex values; it does not introduce a shared colour-wheel control.

Keep resolved, validated JSON as editable intent and compile opaque PNG output from the same snapshot. Save both atomically in a bounded IndexedDB study record. Display the stored PNG without rerendering on reload; incompatible recipes remain viewable through that image. Preserve proof v1 rendering, and make v2 changes into an editable copy when upgrading a saved design.

Import only a constrained, normalized SVG subset. Never mount imported markup or fetch remote artwork. No Armoria/.NET runtime, font collection, framework, server endpoint or game-state dependency enters the renderer.

## Consequences

Independent randomizers and direct manipulation make experimentation quicker while Advanced retains precise layer controls. The isolated engine can be reviewed for future nation creation without importing the Lab shell or local shelf. Production persistence, ownership, compatibility policy and live flag presentation remain separate integration work. The limited artwork/import subset and heuristic layout require visual judgement.

The [implementation handoff](../../game-design/identity-lab.md) records sources, constraints and verification; the [original plan](../../game-design/identity-lab-plan.md) retains acceptance scope and [heraldry notes](../../game-design/identity-lab-heraldry-research.md) preserve deferred research.
