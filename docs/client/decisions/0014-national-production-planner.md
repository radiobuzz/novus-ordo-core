# ADR 0014 — Centred national production planner

Status: Accepted; implemented experimentally

Date: 2026-09-20

## Context

The tall economic sidebar prevented comparison and obscured how national targets compete for territorial workers. The user accepted a centred, game-style national planner, asked to keep explanations in `?` help, and explicitly selected this implementation next. The economic map/territorial editing view remains a separate discussion.

## Decision

- World’s Economic button and the dedicated Economy page open one lazy, shell-owned `FeatureSurface` dialog. Reuse native RangeField/exact inputs, Button, Tooltip, CompactMessage, Scope and existing stores. No new modal framework or styling system.
- Show total labour, automatic/reserved labour, labour available for targets, joint demand and forecast Capital net. Food/Ore/Oil appear together. Materials remain secondary, explicitly unused by current mechanics, without silently zeroing saved bids. Cutoffs and territorial allocations are disclosures.
- Targets are **extra production after automatic upkeep**, not total production or worker percentages. Other sliders are not silently rewritten; their forecasted outputs and shortfalls change as competition changes. Capital remains automatic. No equal-share or priority-changing mechanic is introduced.
- The owner bundle exposes raw costs, stocks, facility order and bid order needed for a local forecast. The pure client simulator follows existing territorial pools, capacity, priorities, inverse cutoffs, rounding and reserve fallback. Display estimates separately from confirmed output; Laravel remains authoritative, including concurrent commands and existing ordering limitations.
- `POST /nation/production-plan` validates exactly one bid for each controllable resource, writes all in one database transaction and allocates once. Authentication, CSRF, upkeep guard and existing optional client-context fence apply. A nation-detail row lock serializes this endpoint’s submissions, **not all legacy commands or turn transitions**. No schema or allocation-rule changes.
- Drafts remain in GameplayService, scoped to game/turn/nation. Refreshes retain dialog/input instances. Close/reopen retains drafts. Only accepted, unchanged submitted drafts are cleared after successful reconciliation; newer, rejected, uncertain and accepted-but-unrefreshed drafts remain. No automatic mutation retry. Scope loss closes the planner; new turns clear obsolete drafts with a notice.

## Alternatives and limits

Keeping the sidebar preserves its cramped layout. Four sequential saves allow partial plans; the narrow batch transaction avoids that. A purely national labour percentage would imply workers can move between territories and is therefore misleading. An authoritative preview endpoint or shared allocator refactor is larger backend work; this first version uses an explicitly labelled local forecast with real-engine parity tests.

The durable rollback-context revision, global command concurrency, WebSockets, new resource uses and economic map design remain deferred. Existing isolated per-resource preview sources are no longer mounted by World/Economy; the legacy API remains compatible.

## Verification

See the [progress journal](../progress.md) for actual checks. New contracts: `production-plan.test.js`, planner command cases in `live-data.test.js`, `browser/production-planner.spec.js`, isolated `production-plan-engine.mjs` / `.php`, and `production-plan-http.mjs`. The isolated engine tests inject failures during bid saving and allocation, and compare forecast facilities/production with the real engine. No live-game mutation is required.
