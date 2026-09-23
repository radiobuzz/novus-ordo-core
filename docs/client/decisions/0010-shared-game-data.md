# ADR 0010 — Shared confirmed data and persistent views

Status: Accepted; D0 audit, D1–D2 World slice and later player-panel persistence implemented; backend checkpoint remains open

Date: 2026-09-20

## Context

The user reported black flashing after game commands. Source inspection shows command reconciliation clears the world snapshot and closes/recreates feature instances. Existing code already separates snapshots from some local state, but features capture snapshots and the shell treats a new snapshot as a new workspace lifetime.

The user accepted a small store-based approach using the current stack, with future WebSocket support, and requested a careful implementation plan before proceeding. They value generic reuse while keeping the experiment revisable.

## Decision — accepted direction

- Share latest confirmed data through small observable stores, published by game data services and consumed through lifecycle-owned subscriptions.
- Keep data refresh separate from view lifetime. Routine same-scope updates should change displayed values, not recreate the workspace/map.
- Separate confirmed server data, command outcomes, editable drafts and harmless saved UI preferences. Components express intent; Laravel remains authoritative.
- Start with the existing plain JavaScript, native DOM, `Scope` and `Signal` conventions. No new frontend framework, wholesale Core import or dataset/query framework.
- Coordinate related values, preserve safe stale display during recoverable read failures, and reject late/incompatible data. Session/access changes clear affected private state rather than retaining it as an offline view.
- Use HTTP refresh/polling first. Future push notifications use the same service/publication path; views do not depend on the transport.

## First implementation and remaining defaults

[The implementation plan](../live-data-plan.md) records the approved first pass: a narrow generic store, one coordinated current-game bundle and persistent World views. Flat world fields plus a named owner payload preserve existing consumers during migration. Deployment/cancellation, World commands and map ownership updates exercise the new path; dedicated-module and inspector incremental rendering were completed by the subsequent persistence pass. Grouping, names and polling cadence can change with evidence.

The plan also identifies a backend gap: game ID plus turn number cannot reliably distinguish all rollback/reset cycles. A narrow server-issued context token and the actual same-turn read/concurrency guarantees need explicit review. No backend change, storage migration or runtime implementation is authorized merely by this record.

## Consequences

Follow-up 2026-09-21 (participant activity): the user approved separating bot work from the human's pending command. The temporary AI module owns its command busy/outcome state; only human submissions use GameplayService's single-flight/review gate. GameDataService remains the sole confirmed-data owner and coordinates a post-activity background read with overlapping human submissions. Healthy activity/readiness refreshes do not disable Ready; own submission/reconciliation, stale data, access loss and actual turn resolution retain their gates. AI failures pause the driver without overwriting the human's outcome; nothing retries a mutation. This is client coordination, not an engine or backend concurrency redesign. The bot-specific lane remains removable with the experiment.

Follow-up 2026-09-21 (static notification transport): the user explicitly approved public server-written status files served by Apache and three-second polling. This supersedes the regular two-second PHP hint below. A small typed PHP publisher wraps advance/rollback under existing locks and publishes creation after commit. The client observes processing even during its own pending Ready command or a blocked full read; static observations only gate presentation or trigger the existing reconciliation. HTTP fallback/repair covers missing files and interrupted publishers. Public contents, atomic replacement, freshness, permissions, tests and limitations are recorded in the living plan. The file operation ID is not a database revision or a new command-concurrency guarantee. No WebSocket, permissions model, resource-rule or core-performance redesign.

Follow-up 2026-09-21: the user accepted the usable UI and deferred the broader command/backend performance redesign. They approved faster turn detection and removal of the application's inactive-tab pause. The existing data service now uses a two-second public game/turn hint and retains thirty-second full same-turn refresh, including hidden tabs. Hints only trigger the existing guarded refresh; they never publish partial private state. Focus/visibility return/reconnection/page restoration refresh promptly. Browser/OS throttling remains outside the application's control. No new backend/storage/transport or durable revision guarantee; see the living plan for cancellation, backoff and tests.

Follow-up 2026-09-20: the user explicitly requested completion of refresh-in-place behavior for Economy and remaining player panels. The shell now retains compatible instances and those panels subscribe to the existing store. Healthy polling preserves command availability; a command supersedes the poll and still checks context before writing. Stale recovery and post-command reconciliation stay gated. This replaces the first pass's conservative blanket refresh gate without adding a backend concurrency guarantee. See the living plan for current consumers and verification.

The migration affects both service ownership and existing feature update methods; a store by itself cannot fix remounting or focus loss. The map's derived ownership/picking/minimap data must update without replacing unchanged geographic resources. Tests must cover command uncertainty, scope transitions, cleanup and actual DOM/canvas identity.

Client publication batches provide coherent client state, not server transactions. Existing command validation, access checks and no-automatic-mutation-retry behavior remain essential. Polling implies a freshness delay; it is not real-time cross-tab synchronization.

This extends [ADR 0004](0004-ui-api-separation.md) and [ADR 0006](0006-game-ui-foundations.md), replacing the current implementation's refresh-as-remount coupling, not the host's normal navigation replacement contract. Earlier handoffs remain historical implementation evidence. Classic SPA behavior, game rules, new permissions, admin migration and default-client cutover are outside this change.

## Alternatives considered

- Continue remounting and mask the flash: preserves reset/focus/draft problems and redundant reads.
- Give each panel its own cache: simpler locally, but invites contradictory values and repeated requests.
- Add a state-management framework or reproduce Core datasets: not justified by the current stack or narrow needs.
- Begin with WebSockets: changes delivery timing without solving ownership, update lifetime or consistency.
- Split every domain/endpoint into separate stores immediately: adds coordination work before evidence warrants it. Keep sections explicit and split independent domains when needed.

## Next step

Review the delivered D0–D2 World slice and the concrete durable turn-context revision proposal before backend/storage implementation. Player-panel persistence is now delivered; complete the remaining backend/D4 work after this checkpoint. Administration remains a separate scope.
