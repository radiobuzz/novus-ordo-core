---
name: novus-game-ui
description: Plan, build or review Novus Ordo game UI foundations and shared components across entry, gameplay and administration. Use for UI controls, semantic theme tokens, shared game assets and component extraction in this project; not unrelated websites or backend-only game rules.
---

# Novus Ordo game UI

Build a coherent reusable game UI from small generic concepts and feature composition, not screen-specific copies or a universal widget framework. This skill is project-specific. It does not authorize implementation when the user asks only for a plan or visual concept.

## Read the maintained source

Locate the Novus Ordo workspace and read `docs/client/ui-foundations.md` before foundation/component work. For architecture or direction changes, also read `docs/client/decisions/0006-game-ui-foundations.md` and the current section of `docs/client/README.md`. Resolve these from the project root, not the skill installation directory. If the project or docs are unavailable, report that gap rather than inventing its inventory.

The living plan is authoritative for current inventory and staged work; this file holds decision rules. Recheck the relevant existing code because a catalog entry can lag implementation. Current starting points are `resources/js/client/styles/_tokens.scss`, `resources/js/client/ui/`, the existing runtime, and feature-local helpers/styles.

When work also changes shared game data, subscriptions, refresh lifetimes or command reconciliation, use the companion `novus-client-data` skill at `skills/novus-client-data/SKILL.md` in the project. It owns data/service decision rules; this skill owns presentation and reusable controls. Styling-only work does not need the data skill.

## Choose the smallest reusable boundary

- Search shared and feature-local implementations before adding a component. Prefer reuse, composition, then a coherent variant/adapter before a new shared component.
- A shared component owns a focused presentation/interaction contract. It takes values and emits intent; it does not fetch game APIs, calculate authoritative rules or decide permissions. Features/services own game/turn identity and command reconciliation.
- Use existing native DOM helpers for simple composition and existing `Component`/`Scope` ownership for controls with lifetimes. Do not introduce another rendering framework or global event bus as part of extraction.
- Keep screen-specific arrangements in features. Shared UI must not import features. Do not grow screen-named flags on a generic widget to make unrelated interactions fit.

## When to propose a new custom component

Propose one when repeated behavior has real consumers, or a new interaction needs its own lifecycle, state or accessibility contract. A second consumer is useful evidence, not a rigid prerequisite. A new arrangement or color alone generally needs composition or a variant, not a new widget.

Briefly state: real need/consumers; existing options and why they do not fit; smallest generic concept; inputs/events and owner; relevant states/accessibility; token/asset use; migration and test impact. Record accepted implementation in the living catalog.

Ask for direction before substantial new UX, dependencies, breaking shared contracts or visual-language changes outside the approved task. Ordinary extraction within authorized scope can proceed with its rationale. Do not interpret this skill as a requirement to pause for every helper or as permission to build the deferred control catalog.

## Maintain the game vocabulary

- Use the existing central semantic CSS variables. Inventory meanings before adding or renaming tokens; avoid parallel palettes and raw shared theme values scattered through features.
- Separate interface roles from domain identity: resource symbols, nation colors and terrain remain meaningful when the UI theme changes. Status needs labels/icons as well as color.
- Preserve the restrained dark/brass/serif game identity. Emphasis and motion communicate state; decoration must not overwhelm controls. Respect reduced motion and localization.
- Reuse existing resource/unit icons, flags and map assets. Keep semantic lookup and presentation sizing separate from backend resource IDs, costs and mechanics. Do not invent assets/data to fill a dashboard.
- Extend field chrome rather than duplicating label/help/error behavior. Prefer native controls. Range fields need exact-value and keyboard alternatives; local preview is not a server command. Progress is not capacity, and unknown progress is not a fabricated percentage. Mini charts require actual observations plus readable alternatives. Read the detailed deferred-control contracts only when those controls are in scope.

## Verify and leave it maintainable

Check the relevant interactive states, keyboard/focus, narrow layout, long EN/FR text, safe text rendering and owned-resource cleanup. Shared changes need representative consumer regression checks; graphics need readable equivalents. Test commands only with fixtures or isolated game data unless explicitly authorized otherwise.

For implementation, update `docs/client/ui-foundations.md` with real source paths, consumers, status and checks. Update the progress journal after material work. For planning, label candidates/deferred work honestly and do not claim runtime validation. Record changed architectural direction in an ADR; preserve historical evidence.

Update this skill only when actual use reveals a reusable decision rule or a rule has been agreed to change. Keep detailed catalogs in the plan, not duplicated here. Maintaining the skill happens during relevant tasks, not automatically in the background. Keep its discovery scope limited to Novus Ordo UI work.
