# ADR 0031 — Budget and policies with an aggregate seasonal economy

Date: 2026-09-28

Status: Accepted; first playable implementation delivered

## Decision

Replace Economy & production with Budget & Policies. Budget and Policies are simultaneously visible on desktop, with national indicators and a shared pending-package review below. Narrow layouts stack the same content. No permanent commitment to keeping the two areas in one tab is implied.

Use the existing shared owner snapshot for confirmed policy/economy data. GameplayService owns context-scoped unsaved choices and command outcomes. Policy preview is read-only, debounced and fenced against stale edit responses; saving uses the existing serialized command/reconciliation lifecycle. UI controls never authoritatively change cash or enact policies locally.

The server uses one pure economic calculation for forecasts and turn settlement. New games initialize the small starter catalogue and their economic coefficients automatically. Old saves are not a compatibility requirement. Existing non-money resource controls remain accessible separately while their future economic replacement remains deferred.

## Consequences

Financial decisions and their national consequences can be assessed together without duplicating policy settings. Saving queues one package for the next seasonal boundary. Budget shortfalls are warnings, not a prohibition on deliberate risky play. The old money-production descriptions must disappear wherever they would contradict treasury semantics.

The UI continues to use native inputs, FieldShell, Button, Panel and feature-local layout. No rendering framework, generic form-builder framework or new confirmed-data cache is introduced. The existing generated HTTP client now supports the policy package's PUT endpoint.

See [the first playable economy](../../game-design/seasonal-economy-first-playable.md) for rules, approximations, data scope and test entry points.
