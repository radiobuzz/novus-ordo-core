# Shared game data — implementation plan

## Local AI script selection — 2026-09-22

Script selection stays in the existing administration service and rotates the server's AI generation fence without resetting player readiness. Private author snapshots are explicit admin reads, not additions to the gameplay store. The sequential AI lane now also runs when the signed-in account's nation is automated; this allows giving one's own nation to a bot without losing the browser driver. Human Auto-ready still skips automated nations, and ordinary human mutation guards remain. Strategy notes and decisions stay server-side.

## Stage 4 shared public identity and derived summaries — 2026-09-22

`GameplayService.identities()` now coalesces the public nation/leader directory for territory inspectors, briefing and Reports. Its in-flight/result cache belongs to the selected game service and is keyed by the world's local generation. The service scope owns the request; consumer abort only prevents that consumer receiving the result. Marker checks and completion fences reject changed game/turn/generation, including cached-result delivery. Refresh starts a new generation and access loss clears cached state. This is not a new server revision or an atomic same-turn read guarantee.

Selected force power and projected owned-territory defense derive from the existing confirmed owner bundle. Public territory exports add terrain productivity rates and the population scaling constant without a separate read. The persistent inspector retains interaction state as those values change. Background favicon attention observes the same ready publications and owns no polling or independent game read; instance disposal restores the original favicon.

## Multi-game backend foundation — 2026-09-22

[Stage 1](multi-game-plan.md) now resolves game identity per request through `SelectedGame` and pins the current page's `gameId` in the transport header. Existing read/command services and their refresh ownership remain unchanged; each direct selected-game page has its own service instances. Backend creation, turns, AI and caches support simultaneous active games, with real two-tab and HTTP isolation checks. Stage 2 now adds the selector and in-page switching through `GameApplication`/`GameInstance`: retire each fixed-context service lifetime before mounting another, guard pending commands/drafts, and keep harmless preferences per game. Owner spectator views skip private reads. See the multi-game plan for delivered navigation and validation details. This does not complete the durable human-command rollback revision or same-turn concurrency checkpoint below.

Date: 2026-09-20

## World ranking history — 2026-09-21

The Reports workspace now has Current and History ranking views. `GameplayService.rankingHistory()` owns one lazy in-flight/result cache keyed by game and confirmed turn; concurrent callers share it, a scope/turn change invalidates it, and the feature never publishes ranking history into the mutable owner bundle. Current report refresh remains independent. The mounted `RankingsView` preserves tab, selected metric/nations, open exact-data disclosure, focus and table scroll across same-context report updates.

`GET /game/ranking-history` requires the client's game/turn context, returns `game_id` and `through_turn`, and rejects a changed context before or after reading. `RankingHistoryService` uses a consistent read transaction and four grouped queries over existing nation, territory, division and capital snapshots. It does not call the per-turn exporter repeatedly or add a schema/cache table. Rollback cascades remain authoritative. Nations absent in an earlier turn have no observation; the client renders a gap. The existing public approximation for army size and capital reserves is reused, preventing the history view from exposing more intelligence than Current rankings.

New combat news stores nullable structured context beside its safe fallback text: battle ID, attacker, battle-time defender (null for neutral), territory and outcome. Resolution creates one headline per battle instead of aggregating unlike defenders. The briefing and Reports use the existing current-turn public identity read and confirmed colour catalogue to render flags/badges; old news without context stays plain text. Post-battle territory ownership is never used to infer the defender. This is additive news identity metadata, not another client store or private military read.

On the active turn-502 game, the guarded read-only check returned five metrics / 20,080 points, about 846 KB before HTTP compression, in roughly 436 ms. Final history points matched the ordinary current rankings for every metric. This supports the present lazy full-history response; future evidence may justify range/downsampling without changing view ownership. No game data was written.

## Experimental AI integration — 2026-09-21

`experimental-ai/TurnAutomation.js` owns the browser timer and sequential scheduling and consumes only confirmed `GameDataService` snapshots. AI steps use the disposable `experimental-ai/AICommands.js` lane, with their own busy/outcome state; Auto-ready still uses the human's ordinary `GameplayService` Ready command. Each AI step reconciles before the next. There is no independent game-data store or optimistic bot readiness. The persistent World/camera remains mounted. Lost/failed mutations and failed reconciliation stop automation without resending; drafts/manual commands pause Auto-ready, including manual commands during a bot step. Turn briefings remain manually available but do not interrupt active Auto-ready watching.

The user-approved Ready-flashing fix separates another participant's activity from the human's pending submission. `GameDataService.refreshAfterActivity()` invalidates older reads after that activity settles and starts a healthy background refresh without publishing `pending`. It waits for any overlapping human command's preflight/submission/reconciliation; if the human supersedes the background read, it rereads afterward. Concurrent activity notifications coalesce and request a read after the latest completion. Own-command single-flight, uncertain-outcome review, stale/access/context gates and real turn-transition blocking remain. Existing other-human polling already uses this healthy-refresh availability policy and now has explicit Ready-button regression coverage. Bot submission uses the existing transport, identity/generation payload and authoritative server checks; no engine, locking or game-rule change. A local batch still does not claim atomic same-turn database reads.

Game/turn IDs plus an experiment-owned generation fence AI steps, takeover and rollback; bot application shares game locks and commits actions, memory, completion and readiness atomically. Human commands from AI games carry the generation fence in addition to their existing identity context. Web Locks coordinate bot submissions and, where supported, one Auto-ready countdown owner per nation across tabs; server completion keys protect cross-process bot races. This narrow fence does not complete the broader human-command backend checkpoint or introduce a general provider framework. See [handoff/removal inventory](../../modules/ai-player/README.md).

Status: D0 audit, D1 shared-data foundation, D2 persistent World workflow and the subsequent player-panel persistence pass are delivered. Economy, Nation, Military, Reports and territory inspectors now update within their existing instances. Comprehensive backend context protection and remaining D4 work are not complete. Names, grouping and sequence remain revisable. See [ADR 0010](decisions/0010-shared-game-data.md).

The [client-data skill](../../skills/novus-client-data/SKILL.md) preserves ownership, command safety, lifecycle and evolution rules for relevant work. This document remains the maintained source for actual APIs, migration status and open guarantees; the skill is not another frozen specification.

## Delivered first pass — 2026-09-20

### Follow-up: responsive UI and command feedback — 2026-09-21

Move cost previews derive from the existing confirmed gameplay definitions, divisions and available-production budget; they do not fetch independently or debit balances. `moveOrderPreview()` mirrors the current additional attack-cost rule, including existing Attack/Raid reservations. World refreshes the existing destination control and preview as snapshots change. The server remains authoritative.

GameplayService emits rejected/uncertain outcomes immediately before its existing reconciliation read, so visual/audio feedback does not wait for that read. Busy/current-snapshot guards, draft retention and no automatic mutation retry remain unchanged. Sound reacts once to sending→rejected; uncertainty uses the separate existing error cue.

Entry setup adds the colour catalogue and pending nation ID. The creation process owns colour drafts, reloads availability after colour validation errors, and submits both IDs through the existing full-form command. Assignment and completed setup share the backend transaction. Generic palette and drawer controls remain API-free; the mobile rail never replaces the World instance.

### Follow-up: Apache-served turn notifications — 2026-09-21

The user approved server-written static status files and a **three-second** check. `GameTurnStatus` atomically replaces `public/var/turn-status/game-{id}.json` under the existing game turn lock: processing before end/upkeep, ready after activation/readiness reset, failed on exceptions. Rollback uses the same wrapper. New game creation publishes only after commit. Existing readiness reads initialize/repair missing or interrupted files while holding the same lock; notification I/O errors are logged without failing game work. Public data is limited to format version, game ID, turn number, state, an operation identifier and timestamp. That identifier is a notification hint, not the deferred durable database context fence.

`api/createTurnStatusReader.js` reads the static file without credentials or PHP, with `cache: no-store` and a cache-busting query, validating its shape/game scope. `GameDataService` owns this reader and polls about every three seconds **during commands and full PHP reads too**. This replaces the production two-second `/game` hint. Healthy unchanged hints do not fetch owner data; same-turn full refresh remains around thirty seconds. Processing gates the existing overlay/commands, not publication of partial data. Only a confirmed full read unlocks. A ready notification already covered by command reconciliation does not replay the overlay; changed same-number notification revisions trigger a refresh without claiming durable rollback protection.

Fresh processing hints wait for completion. Failed or sixty-second-old processing hints request authoritative recovery; a successfully reconciled interrupted hint is not allowed to relock indefinitely. Missing/malformed/unreachable files use a bounded, single-flight PHP fallback, with static checks continuing independently. Initial read failure still retries. Scope/access loss, late request generations, hidden-tab scheduling, command outcomes and read-only Retry keep their existing safeguards. The old PHP hint remains only as a fallback / unconfigured-consumer compatibility path, not a second regular production poll. Browser/OS suspension and PHP work before processing begins can still delay feedback.

Deployment: `public/.htaccess` bypasses Laravel rewrites for the status directory, including static 404s. Its local `.htaccess` disables indexing/temporary-file reads and requests no-store headers when `mod_headers` is enabled. The current Apache host served JSON directly and returned a static missing-file 404; its response did **not** supply Cache-Control, so client no-store plus unique query parameters are essential here. The directory needs web-worker write access. On this host, a narrowly scoped `www-data:rwx` ACL was applied; no broader public-directory permissions changed. Status JSON files are runtime artifacts, excluded from source control. Existing games initialize their file on the next ordinary readiness read. No live game mutation is needed to deploy.

### Follow-up: turn-transition presentation — 2026-09-21

The store now includes `turnTransition`, separate from ordinary refresh/command status. Same-scope markers that report a different turn or explicitly report the world not ready, and changed-turn polling hints, set it. It gates `current` until a complete confirmed batch succeeds. Read failures retain it; access/scope loss and disposal clear it. Marker observations check cancellation and generation before publishing. Initial entry, ordinary same-turn refresh and Ready submission alone do not set it.

The shell-owned `app/TurnTransition.js` consumes that signal with a modal, blurred backdrop, rotating EN/FR messages and blocked game input. It retains the map and existing dialogs; normal briefing opening follows its closure. After fifteen seconds it shows an honest waiting message and manual recovery. `retryTurnTransition()` may replace a stalled **read** with a fresh generation, never cancel or resend a mutation. Late replaced reads cannot publish. No percentages, artificial minimum duration, new endpoint or WebSocket. Detection still waits for an HTTP observation; the readiness endpoint can itself wait on the server's turn lock, so this does not promise notification at processing start. A server-written public status-file signal was discussed, not implemented.

### Follow-up: quicker turn detection without inactive-tab suspension — 2026-09-21

The user accepted the UI pass after playtesting and deferred command/backend performance reorganization to the broader core discussion. This follow-up changes only the client polling policy. `GameDataService.startPolling` checks the existing public `/game` response approximately every **2 seconds**, even while the document is hidden. It compares game ID and turn number (including decreases), then uses the normal full refresh when they differ. An unchanged hint neither publishes a snapshot nor resets its confirmed timestamp. Full same-turn refresh remains approximately **30 seconds**; command reconciliation is unchanged. Readiness-only, identity and budget changes within the same turn still use that normal full-refresh cadence.

The service owns the hint request, aborts it when a full refresh/command supersedes it, ignores late generations and never uses its partial payload as confirmed private data. A changed game clears private state; a changed turn gates commands while refreshing. Failures retain stale state or clear lost access through the existing rules, with bounded 4/8/16-second retry delays at the default cadence. A hint has a 10-second timeout. Timers do not overlap; return-to-visible/focus/online/pageshow triggers are coalesced into a prompt full refresh. Scope disposal cancels owned work.

This removes the application's hidden-tab pause, not browser/OS timer throttling, page freezing or device sleep. No keep-awake/audio workaround, permission, WebSocket, backend endpoint/schema change or stronger rollback-revision guarantee. See [browser visibility limitations](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). A missed reset that returns to the same game/turn number remains undetectable by this hint, as before. Earlier hidden-polling statements are superseded by this explicit user-approved policy.

### Follow-up: compact military planning (#3–#5)

World's deployment catalogue projects existing confirmed limits and the service-owned ghost draft into separate affordable/preview badges. Tooltip content and budget shortages update within the same mounted controls. No additional read, cache or game rule. `services/pendingOrders.js` is a pure projection; `features/world/PendingOrders.js` owns keyed action/destination groups and individual ID rows. Disclosures survive ordinary refresh and accepted cancellations; moved surviving rows retain focus. Delegated cancellation resolves the latest confirmed IDs into existing `cancelOrders` or `cancelDeployments` batches, never mixing their ID namespaces. Removed controls leave the busy-control collection, and all subscriptions/listeners remain view-scoped. Cancelling from the Orders panel no longer remounts that same panel after acceptance. Existing freshness, single-flight, reconciliation and uncertain-outcome safeguards are unchanged. Economic map work (#2), whole-economy forecast additions and WebSockets remain outside this follow-up.

### Follow-up: national production planner

[ADR 0014](decisions/0014-national-production-planner.md) adds a lazy shell-owned production dialog without changing refresh lifetimes. The same owner bundle now includes `production_planning` raw allocation inputs; `services/production.js` computes a joint territorial estimate without publishing confirmed values. Existing bid drafts remain service-owned across close/reopen. `applyProductionPlan` uses normal context/freshness gates, single-flight submission and reconciliation; accepted unchanged draft cleanup waits for successful reconciliation, retaining newer edits and accepted-but-unrefreshed drafts. Scope changes cannot clear a newer scope’s drafts. A new narrowly transactional batch endpoint saves all resource bids and reallocates once. Its row lock serializes planner batches only; this does not resolve the durable context or global concurrency proposals below. Map-side territorial planning and WebSockets remain deferred.

### Follow-up: persistent player panels and unobtrusive polling

The later user-requested persistence pass removes the shell's `page !== 'world' && changed` reopen path and its territory/eligibility-driven inspector closures. `GameplayWorkspace` subscribes to the existing confirmed store, updates budget/labor/facility tables and nation metrics, and retains `ProductionPanel`, military forms/canvas/selection and the report turn selector. Military roster/deployment rows retain controls by ID. Reports reread through the existing service after a confirmed publication, retain unchanged sections and keyed disclosures, and cancel superseded requests. Territory inspectors apply public/owner values directly from that bundle, clear lost owner information immediately and use the existing guarded on-demand read for additional nation identity. World force and pending-order panels also update rows by ID. Navigation, incompatible scope/geography and session/access loss still retire instances.

Healthy background polling now retains command availability. `GameDataService.current` is true while refreshing a previously current snapshot; recovery from stale data and post-command reconciliation remain gated. Starting a command cancels the earlier read and retains the existing pre-write context check, server validation and no-retry rule. This changes the first pass's conservative blanket refresh gate; it does not add a concurrency or rollback guarantee. New-turn production drafts reset through their existing service key; military selections are cleared with an explanation.

The UI/data skills guided this completion of the existing subscription contract. No new store owner, backend endpoint, websocket transport or game mechanic was needed. `persistent-panels.spec.js` asserts actual element identity, updated values, focus/drafts/scroll/disclosures, lost ownership, turn transitions and tooltip interactions; service tests cover late-poll exclusion and stale-recovery gating. Earlier first-pass limitations below are historical where superseded by this section.

[Game UI pass 4](game-ui-pass-4.md) added public `snapshot.nation_colors` from the existing `/game` marker. The later 2026-09-23 follow-up retired post-setup `chooseNationColors`; nation creation now owns the only colour draft and transactional assignment. Confirmed colours still update World, sprite markings and minimap in place without a separate read/cache. The approved additive catalogue/assignment migration is identity storage, not implementation of the durable turn-context revision below. `ProductionPanel` shares existing owner reads/bid drafts between World and Economy and preserves map-side inputs through same-scope refresh/selection. Dedicated Economy's remaining remount boundary at that pass was removed by the follow-up above. Sound/display preferences are browser-local, never confirmed game data; turn cues follow real increases, not refresh publications. Earlier statements of no backend/schema additions describe the original foundation pass, not this later approved identity feature.

Production guidance now derives a local territorial preview from that same confirmed owner bundle: per-territory pools/facilities, eligible capacity and current allocations. Slider edits remain service-owned bid drafts and never publish or submit until Save. Corrected read calculations keep national and summed territorial reassignable-labor values in the same raw unit; no allocation rule, command endpoint or store owner changed. The preview is deliberately labelled non-authoritative because food, upkeep and equal-priority saved bids can affect final server allocation.

[Game UI pass 3](game-ui-pass-3.md) adds `GameplayService.deploymentDraft(snapshot)` for an in-memory, context-scoped placement draft, separate from confirmed snapshots and saved preferences. `command(..., {deploymentDraftIds})` removes only accepted submitted IDs, even after navigation; IDs are local metadata and never transmitted. World uses existing service events to repaint the draft and budget preview without remounting. Newer placements survive, failures preserve the draft and existing uncertain/stale gates remain. No new store framework, transport or backend guarantee.

Subsequent [game UI pass 2](game-ui-pass-2.md) adds header consumers, a read-only `turn_summary` section inside the existing owner response, and on-demand generation-checked briefing/directory reads. It preserves the first-pass refresh contract; it does not complete D3 or the durable backend revision proposal.

Open `/client` and use World → Military. Deployment/cancellation now refresh resources, limits, pending orders and overlays without replacing the World feature, main canvas or minimap. World movement/disband/cancellation and turn advancement use the same reconciliation path. A same-turn refresh preserves deployment inputs, focus and camera; successful submission moves to pending orders only if the player has not started a newer draft. A disband confirmation retains the context in which it was opened.

### Implemented contracts

- `runtime/Store.js` exports `createStore(initial, {onError})`: owner receives `{store, publish}`, consumers receive only the frozen facade with `.value` and `.subscribe(scope, callback)`. Publications are immutable plain-value bundles; callbacks are synchronous, immediately receive the current value, cannot publish recursively, and stop on scope closure. Subscriber errors are reported independently. Asynchronous work still owns its own cancellation/error handling.
- `services/GameDataService.js` owns one store, shared HTTP batches, cancellation/generations, scope checks, map cache and polling. `.refresh()` shares an in-flight read and resolves to success/failure. `.beginCommand(snapshot)` gates commands and invalidates old reads; `.reconcile()` starts a post-command batch. `.current` is the conservative submission gate. `WorldService.js` is an export alias, not a second implementation/cache.
- Store value: `{status, snapshot, error, revision, confirmedAt}`. Status is `empty`, `loading`, `refreshing`, `pending`, `ready`, `stale` or `error`. Snapshot retains flat world fields for migration compatibility, plus `.nation` containing the confirmed owner payload. Related world/owner values publish together; unchanged territory/owner sections retain references. The local revision orders publications; it is not a server version.
- `GameplayService.load()` now reads the shared owner payload. Commands expose `{state, reconciled}` separately from confirmed data, distinguish accepted-but-unrefreshed results, and never retry a mutation. An uncertain response requires explicit review of orders/budget before another submission; World supplies that action, including narrow layout. Manual refresh updates an accepted-but-unrefreshed notice when recovery succeeds.
- Turn hints run about every 2 seconds and full same-turn reads about every 30 seconds, with bounded failure backoff; hidden pages remain scheduled. Visibility-return/focus/online/pageshow triggers are combined. One panel closing does not cancel a shared read. Session/owner-access errors clear the shared private snapshot; recoverable failures retain a visibly stale display and gate commands.
- World updates its pickers, map context, resource nodes and deployment form in place. `ImageChoice` gained detail/availability setters. The generated-map renderer rebuilds political paths without discarding static terrain/landscape caches; the minimap updates its own context/cache too. No new UI framework, backend endpoint, schema, dependency, resource rule or permission change.

The existing flat world fields are a compatibility choice, not a commitment against future named sections. Full mutable reads remain deliberately simple. Source-count baseline: the old initial World + owner loading path used 21 game API reads (12 world + 9 owner checks/read); the new batch uses 13, then 12 with cached geography. These counts describe those paths, excluding assets/inspectors and independent triggers; they are not a latency or server-load benchmark. Browser checks verify one owner read per batch.

### Explicit remaining work

- The player-panel persistence migration is delivered. Administration stores and persistent administration updates remain outside this player task.
- Reports are on-demand reads refreshed while their workspace is open; they do not implement a historical cache. Comprehensive rollback/reset detection, server-wide concurrent-write guarantees and push notifications remain unfinished/deferred. The current player APIs still identify turns by game/nation/turn number.
- Newly added refresh/selection/review labels have EN/FR text. Existing command-service/module messages remain English-first. Chromium and emulated narrow-layout coverage does not imply physical-device or other-browser verification.

### D0 backend checkpoint — proposal, not applied

The reviewed advance/reset paths are `Game::tryNextTurn()` → `Turn::activate()`, `Game::rollbackLastTurn()` → `Turn::reset()`, and initial game creation/activation. No existing persisted, guaranteed-unique reset revision is exported to players. A turn ID or second-resolution activation time cannot identify every missed rollback/reset cycle safely.

Recommend one durable turn-context revision on the game, updated by every activation/reset path with the existing turn-change lock, and included in public/owner context reads and the new-client command fence. This requires a small additive migration/read-model/middleware change and explicit tests of legacy callers and missed reset cycles; review that concrete backend/storage scope before applying it. It must be named/documented as a turn-context revision, not a revision of every order or a same-turn transaction guarantee. The frontend first pass does not pretend this protection exists.

The original staged design below remains the path for the remaining work, not a statement that every item is now implemented.

## Outcome

Refresh the information without restarting the screen. After deploying, the resource strip, affordable maximums, pending-deployment list and map overlays should agree while the map, camera and relevant controls stay in place.

Build the foundation now, then prove and refine it through current gameplay. Do not build a general-purpose data framework or predict all future diplomacy/economy systems. Laravel remains authoritative; the classic SPA, resource rules and game mechanics are unchanged.

## Original problem (before the first pass)

Source review, not a new runtime test:

- `GameplayService.command()` calls `world.refresh()` in `finally`, including after rejected or uncertain commands.
- `WorldService.refresh()` clears its snapshot before loading. `GameShell` responds by closing the workspace, inspector and dialog. On success it opens a fresh feature. Its route handler also compares snapshot object references to decide whether to reopen.
- World and gameplay features capture their initial snapshot. The military dock fetches a separate owner payload; dedicated modules also fetch it. They do not share one continuously updated owner view.
- Existing polling runs every 30 seconds while visible and checks on visibility return. An unchanged game/turn/nation only emits readiness: another tab's same-turn deployment or bid is not generally discovered.
- `Signal`, `Scope`, immutable snapshots, cancellable reads and explicit command-context checks already supply useful foundations. Preserve their safety intent.

Therefore adding a store alone is insufficient. Services must publish updates, and features must apply those updates without treating them as navigation.

## 1. Responsibilities

| Piece | Owns | Does not own |
| --- | --- | --- |
| Observable store | Latest confirmed values, freshness/error information, scoped subscriptions | HTTP, DOM, game rules or arbitrary component writes |
| Game data service | Reads, validation, shared refresh scheduling, publication and scope changes | Rendering, selection, deployment drafts |
| Gameplay command service | Explicit submissions, pending/outcome state, reconciliation requests | Pretending an unconfirmed command succeeded or directly editing balances |
| Feature / shared control | Reading values, preserving local interaction, applying visible updates | Independent competing copies of confirmed game data |
| Laravel | Authoritative rules, access and mutation validation | Client camera, focus or local tool selection |

Proposed initial implementation:

- One small generic `Store` using the existing lifecycle conventions. Consumers can read its current value and subscribe with a `Scope`; only its owning service has publication/reset access.
- One game-scoped coordinator, provisionally `GameDataService`, owning the current-game store and shared requests. Extract the useful reading/validation logic from existing services; do not layer another permanent cache over them.
- Keep `GameplayService` as the explicit command entry point. Its freshness checks and post-command reads use the coordinator.
- No automatic DOM binding, proxy observation, query language, generic event bus, new state-management dependency or new rendering framework.

### Data grouping

Start with **one confirmed current-game bundle with named sections**, not a store per widget or API endpoint:

| Section | Contents / source | Refresh policy |
| --- | --- | --- |
| Context | Verified player/game/nation, current turn and readiness | Startup, refresh checks and scope transitions |
| Geography | Saved map/base topology and map identity | Load per game/map version; reuse while unchanged |
| World | Current territory ownership/public state | Current-game refresh; publish with related owner state |
| Own nation | Budget, bids, units/orders, pending deployments, limits and own-territory eligibility | Existing owner reads, coordinated into one publication |

Features consume the sections they need. Budget, deployments and affordable maximums must never be published as three independent visible updates. In V1, refresh the complete mutable bundle after commands; narrower reads can follow measured need. Reusing geography does not mean caching ownership inside it forever.

Reports and extra inspector details remain on-demand, service-owned reads with explicit keys and freshness. Do not eagerly load every report into this bundle. Later independent domains may justify separate stores; shared scope rules and publication contracts are reusable, not the assumption that everything belongs in one object.

## 2. Store and refresh contract

The first contract needs only:

- A read-only current value, or an explicit empty state before the first successful read.
- A clear distinction between first loading, refreshing an existing value, current, stale/error, and unavailable because of a scope/session transition. Preserve the last-confirmed time; starting a request does not make data current.
- Scoped subscription with immediate delivery of the current state. Unsubscribe on disposal; closing a feature must immediately prevent later delivery to it.
- A local publication number for diagnostics and update ordering. This is **not** a server revision or proof of freshness.
- No notifications for unchanged content unless relevant freshness/status changes. Use explicit section comparison/update checks first, not a general deep-diff engine.
- One complete replacement of related confirmed data before notifying consumers. A failed read must not publish half a bundle.

Define and test notification behavior: one subscriber failing must be reported without stopping other views from receiving the committed value; no writes from subscribers; no notifications to closed scopes. Reuse `Signal` where appropriate without silently changing its behavior for unrelated consumers.

The data service owns the request, not whichever panel asked first. Concurrent requests for the same scope share the work. Closing one panel removes its subscription; it must not cancel a refresh still needed by the shell or another panel.

Use request generations to discard obsolete results even when network cancellation arrives too late. A command starting invalidates pre-command reads; reconciliation must perform a read started after the command settles, not reuse a poll already in flight. Refresh requests arriving during reconciliation are combined or scheduled once afterward, without an abort/restart loop.

### Refresh triggers

- Initial entry and explicit Refresh.
- After every submitted command outcome, including a lost response; reconciliation reads do not resend the command.
- Periodic two-second game/turn hints and thirty-second full mutable reads, including hidden pages under the 2026-09-21 policy.
- Visibility return and window focus, combined to avoid duplicate requests. Reconnection can also request a refresh; an online indicator is not proof the server is reachable.
- Detected scope/turn change. Later WebSocket notifications call the same refresh entry point.

Continue periodic work while hidden and refresh promptly on return. Failed automatic reads use bounded backoff rather than tight retries, with manual Retry available. Browser/OS suspension can still delay execution. Polling provides eventual freshness, not instantaneous cross-tab synchronization or a guarantee that another client cannot act immediately after a read.

## 3. Identity, turn changes and backend limits

Do not confuse these different identities:

- **Scope:** signed-in player, game and own nation. Private data never crosses this boundary.
- **Turn context:** which actual turn state commands and drafts refer to.
- **Map identity:** which geography can reuse its canvas/model/camera.
- **Request generation / publication number:** local ordering only.

Replace `world.snapshot === capturedSnapshot` checks with explicit scope/turn checks and validation against the latest confirmed data. An ordinary same-turn refresh should not invalidate a command simply because JavaScript created a new object. However, a changed unit, balance or eligibility can invalidate the draft: recheck those dependencies before submission and leave final validation to the server.

### Important gap: rollback can reuse a turn number

Current player reads expose game ID and turn number, not a reliable context revision. `rollbackLastTurn()` deletes the latest turn and resets the previous one; a later advance can reuse a number. A browser can miss the intermediate transition. A request generation, increasing-turn-number comparison, or turn database ID alone cannot cover every reset case.

**Recommended prerequisite for declaring the migration complete:** define a narrow server-issued turn-context token that changes reliably on advance/reset/rollback, expose it to client reads, and include it in new-client command checks. Step D0 scopes the smallest additive change, including all existing transition paths and compatibility with legacy callers. If persistent storage/schema work is required, document and review that addition before implementation. Do not use a possibly repeated timestamp as an unproven substitute. The frontend proof can begin with existing contracts, but must not claim this gap is solved.

A turn-context token is also **not** a revision of every bid/order. Current reads make multiple database queries and do not promise an atomic view of concurrent same-turn mutations. Before/after context checks detect context changes; they do not prove all fields were read at one instant. Start with coordinated client publication and existing server validation. In D0, test/read-audit the owner payload's coherence requirements; if stronger transactional reads or command serialization are necessary, propose that bounded backend work explicitly. Do not advertise client batching as database transaction safety.

Retain existing authentication, CSRF, ownership checks and optional legacy-compatible command fencing. Any approved backend additions follow the current typed PHP/read-model/service style; no new permissions system or engine rewrite.

## 4. Commands and honest outcomes

Deployment is the reference workflow:

1. Player edits a local draft; the confirmed store is unchanged.
2. On explicit submission, check current scope, freshness and draft validity; mark the command pending. Preserve the existing one-at-a-time command rule within this client.
3. Send exactly one request with its context. Cancel obsolete reads so they cannot later overwrite the reconciled display.
4. Record the response outcome separately from refresh progress.
5. Read and publish the confirmed mutable bundle. Update resources, limits, pending orders and overlays from that publication.

Distinguish:

- **Accepted and refreshed:** show the confirmed result. A pending deployment/order is not an already executed unit/movement.
- **Accepted, refresh failed:** say the command was accepted but the display is not yet confirmed. Offer Retry refresh, not another submission.
- **Rejected:** preserve the editable draft and useful validation feedback; reconcile where state may have changed.
- **Outcome unknown:** a lost response may have hidden a successful command. Never automatically resend or label it rejected. Reconcile and show the resulting orders/budget. Without server operation IDs, a read may not prove which command caused a result; retain that uncertainty and require deliberate review before another attempt.

Keep command status outside confirmed server values. Disable affected submissions while sending/reconciling or when their data is known stale, unavailable or incompatible. The first pass conservatively gated gameplay writes during every shared refresh; the later persistence pass retains availability during healthy polling and still gates stale recovery/reconciliation. Navigation, map inspection and draft editing remain usable. A rejection or refresh must not erase user input. Clear only the successfully submitted draft, and do not clear newer edits made while it was pending.

A submitted command belongs to the game service, not the panel lifetime: navigating away must not suppress its eventual reconciliation. Logout/scope change still prevents its old result from entering a new store. Aborting a request never means server work was undone. No offline command queue, implicit replay or cross-tab exactly-once guarantee.

## 5. Persistent views and local state

`Host.open()` remains for navigation/subject replacement, not routine data updates. `GameShell` mounts by route and compatible scope, rather than snapshot reference. Keep first-load/error presentation distinct from background refresh.

| Situation | Display | Local interaction |
| --- | --- | --- |
| Same-scope refresh | Keep confirmed display; subtle updating status; update affected values on success | Preserve camera, mode, selection, focused input, scroll and drafts |
| Read failure / connection loss | Keep last-confirmed display, visibly stale; Retry refresh | Keep drafts; disable unsafe submissions |
| Upkeep / new turn / rollback detected | Mark old display unavailable for commands; publish new context together when ready | Keep map/camera if geography matches; clear obsolete turn-bound drafts and revalidate selected IDs with explanation |
| Game/nation change | Clear incompatible private data immediately; load the new scope | Reset scope-bound drafts/selection; restore only compatible harmless preferences |
| Session expired/changed or access revoked | Clear affected private data and outstanding work; sign-in/access recovery | Never present retained private values as an offline view for a different session |
| Different geography | Deliberately replace/rebuild geographic resources | Do not reuse invalid coordinates or camera bounds |

Implementation must go beyond removing `snapshot = null`:

- World feature closures, territory finder, pickers and overlays currently retain initial data. Update them explicitly from the confirmed publication.
- Generated-map restoration copies ownership into regions/cells; `HexMapRenderer` constructs a nation lookup once. The minimap copies its initial context. Introduce a focused data-update path for these derived lookups, main map and minimap together, preserving unchanged geometry/path caches and image resources.
- The military dock currently rebuilds its contents in `renderDock()`. Routine value updates need setters/keyed row updates so typing, focus and scroll survive. Tool/mode changes may legitimately replace a section. Do not build a virtual DOM to achieve this.
- Inspector panel and independent dialog observe the same confirmed data, but keep independent expansion/focus state. Extra details are keyed by scope, turn context and territory, invalidated when their dependencies change, and protected against late pre-command reads. An isolated detail failure should not tear down the entire game. Clear revoked private details immediately.
- Dedicated Nation/Economy/Military modules use the same confirmed values as World. Preserve bid drafts separately; reports have explicit game/turn keys and are invalidated on rollback, not treated as eternally immutable history.

Private server snapshots stay in memory. Existing saved camera/layer/mode preferences remain separate. Do not start storing budgets, private reports or executable orders in localStorage as part of this change.

## 6. Delivery sequence and checkpoints

Each stage has a demonstrable exit; no all-at-once cutover.

### D0 — Contract and risk closure

Inventory reads, commands, consumers and identity checks. Capture the current remount behavior with a regression test. Specify the store contract and command outcome states. Resolve the rollback-token proposal and document the server's actual read/concurrency guarantees, not desired ones. Record payload/request baselines on fixtures or isolated data.

**Exit:** concrete API contract and tests to implement; any backend additions have an explicit scope/review gate. No speculative library or new game mechanic.

### D1 — Small store and coordinated reads

Implement the generic store and game data coordinator, including immutable publication, scope cleanup, request sharing/ordering, status and periodic same-turn refresh. Keep existing consumers working through a temporary read-only adapter where needed; the adapter must use the same source, not maintain a second authoritative cache.

**Exit:** unit tests prove ordering, disposal, grouped publication and failure behavior. Existing UI remains functional; this stage alone does not claim the flash is fixed.

### D2 — First complete vertical slice: World deployment

Change shell refresh lifetime; connect World, minimap, resource strip, unit cards and pending-deployment list. Integrate deployment and cancellation through command reconciliation. Provide explicit current-data update methods; preserve camera, valid selection, focus and drafts. Nonmigrated routes may temporarily retain deliberate refresh/remount behavior, clearly tracked.

**Exit / review checkpoint:** real isolated classic and beta deployment/cancellation update all related values without replacing the map canvas or world feature. Show this working before expanding abstractions.

### D3 — Complete existing player workflows

Migrate movement, disband/cancel, production bids, readiness/turn transitions, dedicated modules, inspectors and reports. Shared refresh/status behavior applies consistently. Remove temporary duplicate read paths and snapshot-reference lifetime checks; route navigation still owns normal feature replacement.

**Exit:** an explicit consumer/action checklist shows no existing player workflow left on the old refresh-as-navigation mechanism. No lost capability in either map format.

### D4 — Adversarial checks and rollout

Complete context-token/backend work agreed in D0 if required; verify legacy compatibility. Exercise slow/out-of-order responses, rejected and uncertain commands, accepted-but-unrefreshed outcomes, another tab, hidden/focused page, offline recovery, session changes, upkeep, rollback and disposal. Run full relevant regression suites and inspect desktop/narrow EN/FR presentation.

**Exit:** acceptance checks below pass. Deliver only to the experimental new client; no default-route cutover. Keep a source/build recovery point and record delivered versus deferred behavior. Do not retain two permanent state systems behind an elaborate feature flag.

### Later — Push updates and additional domains

WebSockets can tell the service that a scoped domain changed, initially triggering its existing HTTP refresh. Authorization, missed-event recovery/reconnect and event ordering will need their own tests. Only adopt pushed patches after a server revision contract makes them safe.

Administration may reuse the generic store mechanism later, with separate game/global scopes and existing access checks; it is not automatically included in the player migration. Diplomacy, new unit types, resource changes, offline play and broad backend concurrency redesign are separate work.

## 7. Acceptance and source map

Required evidence, not implementation claims:

- Same world feature **and same canvas element** before/after deployment, cancellation, movement and manual/background refresh; camera/mode and valid selection unchanged. Check identity directly, not only screenshots.
- Resource strip, build limits, orders and module values agree after each confirmed publication. No transient new-budget/old-deployments bundle.
- Late reads never replace newer data or resurrect a previous player/game/turn. Disposed consumers receive nothing; repeated navigation does not grow subscription/timer counts.
- Duplicate clicks issue one mutation. Unknown outcomes are never automatically retried; accepted responses followed by read failures remain distinguishable from rejection.
- Draft typing/focus/scroll survives same-turn refresh; invalid quantity/selection is explained rather than silently submitted or clamped. Turn/rollback changes invalidate the right drafts.
- Same-turn changes from another tab appear after full refresh/poll/focus; turn changes trigger that refresh through the faster hint. Hidden pages remain scheduled; overlapping triggers do not produce duplicate refresh batches.
- Auth loss/revoked owner access clears private state; no owner details leak into public/no-nation views. A public read may remain available when an unrelated detail fails.
- Both classic and generated maps update ownership, picking and minimap correctly across turns without rebuilding unchanged geography.
- Backend transition token, if added, covers missed rollback/reset cycles and stale commands; tests distinguish this from unresolved same-turn concurrency limits.

Main existing integration points (grouped by source directory):

- `resources/js/client/runtime/`: `Signal.js`, `Scope.js`, `Host.js` for subscription/lifetime conventions; proposed `Store.js` is not yet present.
- `resources/js/client/services/`: `WorldService.js`, `GameplayService.js` for reads, polling and commands; proposed coordinator belongs here. `resources/js/client/main.js` owns service composition.
- `resources/js/client/app/GameShell.js`: route/refresh lifetime and header status.
- `resources/js/client/features/`: `world/world.feature.js`, `world/WorldCommands.js`, `gameplay/gameplay.feature.js`, `territory/territory.feature.js` for live consumers/drafts.
- `resources/js/client/ui/map/`: `HexMap.js`, `MapPicker.js`, `Minimap.js`, alongside `resources/js/map/snapshot.js`, for derived map state and stable rendering.
- `app/Http/Controllers/ClientGameplayController.php`, `app/Http/Middleware/EnsureClientCommandContext.php`, `app/Models/Game.php`, `app/Models/Turn.php` and relevant read models: review boundary for any approved additive server contract.

Extend `tests/client/services.test.js`, `gameplay.test.js`, runtime tests and browser `commands.spec.js` / `client.spec.js`; add focused store/coordinator tests. Use `npm run test:client`, relevant Chromium suites, build/generated-client checks, PHP contracts if affected, and the existing isolated gameplay/guard helpers described in [the gameplay handoff](gameplay-experiment.md). Never test mutations on the live game. Other-browser/physical-device checks remain separately reported, not implied by Chromium.

Maintain this plan, [the foundation catalog](ui-foundations.md) and [progress journal](progress.md) as implementation proceeds. Keep enduring boundaries in the ADR; update the project skill only if implementation reveals or agrees a reusable rule change.

## Review checkpoint after the first pass

The user approved D0–D2 and subsequently requested and received the player-panel persistence migration. Review the concrete backend/storage proposal above and the remaining D4 checks. This establishes the foundation early without treating today's internal design as the game's permanent final architecture.
