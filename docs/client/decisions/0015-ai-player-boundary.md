# ADR 0015 — Isolated, replaceable AI Players

Status: Accepted and implemented as a small disposable experiment (2026-09-21)

Follow-up: [ADR 0018](0018-local-ai-scripts.md) expands the initial single-strategy scope to trusted selectable local scripts and a one-turn V1 fallback. The temporary/removable boundary remains unchanged.

Date: 2026-09-21

## Context

The user endorsed the first viable bot plan and explicitly required that it be the first experimental **AI Player**, kept mostly outside main game code. They clarified that “external” means outside game code, requested minimal infrastructure, and explicitly stated that this implementation will eventually be completely removed. API-based players are the preferred later direction. Experimental economic policy, personalities and campaign logic must be removable without rewriting game mechanics.

The current application is one Laravel/PHP project. Its ordinary models, controllers and turn resolver already supply game rules. Some validation and allocation boundaries need narrow extraction to serve both humans and automated players. Introducing a separate deployed service is unnecessary for the first implementation.

## Decision

- Build three concrete pieces: `V1Experimental`, a sequential runner and a small game adapter. Keep most code under `modules/ai-player/`; the adapter contains knowledge of existing Laravel models/services. Split further only when implementation needs it.
- V1 receives plain player information, memory and settings and returns proposed actions, next memory and a short explanation. It cannot query game tables or mutate state directly. Reuse actual game rules through the adapter; extract shared validation/forecasting only where necessary.
- Core game rules must not depend on V1 classes, personality thresholds or campaign state. Keep experiment-owned settings/memory/results separate from ordinary nation data. Human-only games work with the module absent.
- Start the sequential AI cycle when a turn opens. Apply and publish each AI's orders/readiness separately; resolve normally when everyone is ready. The open client can drive one bounded server step at a time; no new queue or daemon is required for V1.
- Think outside game locks; recheck current context and control before atomically applying actions/memory. Keep only the completion/reset checks needed to avoid duplicate or stale local steps. The broader player-client context redesign is not a prerequisite.
- Protection uses the adapter and one narrow pre-engagement eligibility check. Auto-ready remains an independent player-client feature. Neither puts experimental strategy in combat or turn code.
- V1 is disposable and intended for complete deletion, including unused wiring, settings, storage and experiment-only UI. Keep a concise removal inventory in its implementation handoff. Before retirement, explicitly reassign automated nations; preserve their ordinary game data/history and prevent cascade deletion through module-owned records.
- Future API integration may revise or replace today's boundary. No V1 compatibility promise, provider registry, protocol-version framework, memory migration system, remote transport, LLM SDK or fallback framework is required now. Design a clear local seam and implement future API concerns when that work is actually undertaken.

## Verification and consequences

Use plain-input V1 tests without Laravel, a small fake-decision adapter test, real-engine validation checks, stale/duplicate-step tests and human-only regression with the module disabled. Verify that removal of AI ownership records does not delete nations/history. Review imports and changes outside the module/adapter through ordinary code review; no separate architecture-testing framework is needed.

A small amount of shared validation and lifecycle integration remains necessary. Isolation means a controlled, removable dependency boundary, not zero changes to existing files. The user explicitly prefers less experimental overhead over speculative future compatibility. This clarification replaces the earlier detailed provider/versioning scaffold in the plan while preserving separation from game mechanics.

## Alternatives

- Embed AI decisions in Nation/Game/Battle: fewer initial files but couples experimental behavior to authoritative rules and makes provider replacement difficult.
- Run a separate HTTP AI service immediately: adds deployment, authentication and failure-handling work before the first strategy is proven. Keep the serializable boundary so it remains possible later.
- Build a general plugin/agent framework: exceeds the two concrete needs, V1 rule-based decisions and a future replaceable provider. Start with one strategy interface and a narrow game adapter.

## Implementation reference

[AI Player V1 plan](../../game-design/ai-nations-plan.md) owns scope and the original design targets. [Implementation/removal handoff](../../../modules/ai-player/README.md) records delivered files, verification and limits. The user subsequently explicitly authorized implementation. Only additive module tables were installed in the workspace application; test games and gameplay mutations used an isolated temporary database.
