# ADR 0017 — Independent active games and explicit selection

Status: Accepted; backend stage 1 and client stage 2 implemented

Date: 2026-09-22

## Context

The user requires simultaneous games and retirement of the old interface. Game records already own nations, turns, geography and orders, but player contexts selected the first globally active game and game creation disabled it. Administration and AI also relied on that singleton. A selector alone could not safely address separate games.

## Decision

- Active is a per-game lifecycle property. Creating a game preserves existing active games and archived data.
- Every game operation resolves an explicit target. Request selectors must agree; selection is per request/page, never stored as a session-wide active game. A temporary unscoped compatibility path accepts exactly one active game and rejects ambiguity.
- Keep initial access open to active games through one small policy service. Existing authentication, nation ownership and development-tool guards remain. Richer permissions are explicitly deferred by the user.
- Reuse existing `(game, user)` nation ownership and game-specific data. No membership schema is required for this initial policy.
- Keep turn, AI, setup and cache identity specific to each game. Creation may serialize with other creation but does not block existing games.
- Keep the new client's generated endpoint module. Legacy screens and their old service output will be removed at the planned cutover after the accepted parity work.

## Consequences

One account can play a nation in each of several games, or spectate games without a nation. Direct selected-game URLs work before the selector arrives. Old ambiguous unscoped callers now fail rather than choosing an arbitrary world. Command-line turn operations require a game ID. This supersedes earlier current-game-only and game-replacement constraints, while retaining their historical implementation records.

No general same-turn concurrency redesign or durable reset revision is implied. The stages, HTTP contract, delivered checks and remaining UI work are maintained in [the multi-game plan](../multi-game-plan.md).

## Stage 2 — selected-game client instances (2026-09-22)

Delivered under the accepted second stage: `/client` is the active-game directory, and each explicit game URL mounts its own disposable `GameInstance`. `GameApplication` owns selection/history; it never retargets a live transport. Retire the old shell, polling, automation and private data lifetime before creating another. Separate tabs share authentication, not selection. Public spectator views skip owner reads even when the account owns a nation.

Pending commands block switching; local drafts and unresolved outcomes require confirmation. No mutation retry or cancellation guarantee is added. Harmless per-game preferences include route, map presentation and briefing seen state; private snapshots and command drafts remain memory-only. The selector composes existing controls rather than adding a generic directory framework. See the [living plan](../multi-game-plan.md) for tests and remaining stages.
