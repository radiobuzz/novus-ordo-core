# Primitive diplomacy, messages and resource grants — implementation plan

Follow-up, 2026-09-26: custom AI scripts may now read a bounded history of their nation's private text conversations and send bounded replies during the normal decision turn. This supersedes the original no-reply limitation below; AI alliances and grants remain deferred. See [ADR 0020](../client/decisions/0020-primitive-diplomacy.md).

Date: 2026-09-25

Status: Implemented in source for newly created games, 2026-09-25. The user approved implementation and the two alliance choices below. The additive migration was exercised only in a guarded temporary database; the running game database and Leon hosting have not been migrated or changed. Engine, authenticated HTTP, Chromium, concurrent-process and regression evidence is recorded below. A longer multiplayer balance playtest remains a release activity.

## Objective and boundaries

Extend the current game into a small playable release, preserving its Laravel models, request contexts, per-turn details, shared player operations, plain-JavaScript client and temporary AI adapter. Develop and verify in isolated games before deciding which games receive the mechanics.

This plan covers private nation conversations, bilateral diplomacy, money/resource gifts and limited AI peace diplomacy. Division and territory grants are deferred. There is no exchange market, conditional bargain, coalition organization, shared victory, chat presence, read receipts, WebSocket dependency or conversational AI in this release.

The embedded Flag Editor remains a separate item on the stable-release checklist, described below. Publishing a fixed release on Leon follows playtesting and a separate hosting plan; this document does not deploy anything.

## Agreed gameplay contract

| Area | First-release behavior |
| --- | --- |
| Relationships | No relations, War, Peace treaty, Allied. Relationships are bilateral, never automatically transitive. |
| No relations | No peaceful passage. A deliberate attack needs no formal declaration and starts war. |
| War | Combat allowed; peace requires both nations to accept. |
| Peace treaty | No attacks; no allied passage or shared defence. Either nation can give five turns' cancellation notice. |
| Alliance | Mutual consent, peaceful movement through each other's land, shared defence. Either nation can give five turns' cancellation notice. |
| Cancellation | Protection remains active throughout the notice period. Expiry returns to No relations, not automatically War. |
| Third parties | A nation can be allied with both sides of a war. It does not fight a treaty partner or shield another nation merely by being present. |
| Participation | Eligible allied forces actually joining combat enter war with the opposing nation. Mere alliance or presence is insufficient. |
| Accidental battles | Two nations ordered to attack the same third-party/neutral territory can fight after its ownership changes during resolution without automatically becoming enemies. Preserve original attack intent. |
| New protection | A newly effective alliance/peace treaty prevents outstanding attacks against that partner from executing. |
| Conversations | One private conversation per pair, text messages, structured offers and automatic notices. Sender may cancel a pending offer; recipient may accept/decline. |
| Delivery | Stored immediately, independent of turn advancement. Poll every 15–30 seconds while the client is running; no promise during browser/OS suspension. |
| Grants | One resource type and amount per offer. Capital, Food, Material, Ore, Oil; RecruitmentPool excluded. Immediate all-or-nothing transfer on acceptance; insufficient availability invalidates the offer without a transfer. No escrow. |
| AI | Initial policy may propose and answer peace offers on its normal decision turn. No alliances or free-text interpretation/replies. Same treaty protections as humans. |

An alliance ending returns visiting forces to their nearest suitable owned territory. When none exists, the division is disbanded with a private notice. The user confirmed this fallback and separate allied assaults during implementation.

## Verified existing integration points

These are source observations, not new runtime verification.

| Existing source | Consequence for implementation |
| --- | --- |
| `app/Services/NationContext.php`, `SelectedGame.php` | Acting nation remains derived from authenticated user and selected game. Validate the other nation within that same game. |
| `app/Services/NationCommands.php`; player controllers | Humans and AI already share selected operations. Add narrow diplomacy/grant operations rather than implementing separate human and AI rules. |
| `app/Models/Game.php` | Advance/rollback use a per-game cache lock. Resolution copies state, moves troops, then shuffles nation/target attack groups. Preserve that structure where possible. |
| `app/Models/NationDetail.php` | Safe passage currently means owned territory; hostility currently means not owned. These are insufficient once peace and alliance differ. |
| `app/Models/Division.php`, `DivisionDetail.php`, `Order.php` | Movement, rebase destinations, Attack/Raid classification, costs and stored intent all need diplomatic checks. Checking only the HTTP route is insufficient. |
| `app/Models/Battle.php`, `TerritoryDetail.php` | Attacking divisions must share one owner; defenders are currently the territory owner's troops. Allied defence needs eligibility and per-nation formation context. |
| `nation_resource_stockpiles`, `NationDetail::exportProductionPlanning()` | Capital is an existing stockpiled resource. Ordinary affordability includes future production; it is not a safe synonym for immediately giftable stock. |
| `app/Facades/Metacache.php` | Changed stocks/allocations and diplomatic movement permissions require scoped invalidation and fresh model reads. |
| `division_details.nation_id`, `divisions.nation_id` | Both ownership representations already exist. No ownership migration is required in this release because unit grants are deferred. |
| `modules/ai-player/Plan.php`, `Runner.php`, `app/Integrations/AIPlayers/GameAdapter.php` | Plans are strict arrays, decisions run outside locks, then revalidate and apply transactionally under the game lock. Extend that contract compatibly. |
| `GameInstance.js`, `GameplayService.js`, `GameDataService.js` | Services belong to one selected-game lifetime. Human commands have a single-flight/uncertainty gate; refresh does not remount views. |

The maintained [client data plan](../client/live-data-plan.md) explicitly says a durable human-command rollback revision and comprehensive same-turn concurrency are unfinished. Static turn-status revisions are notification hints, not database versions. The new design must address the specific gaps it relies on, rather than claiming existing guarantees.

## Proposed minimal persistence

Use existing ID, timestamp, foreign-key and PHP backed-enum conventions. All participating nations, turns and assets must belong to the same game; ordinary foreign keys alone do not establish that invariant.

| Table/change | Essential fields and constraints |
| --- | --- |
| `nation_relations` | `id`, `game_id`, ordered `nation_a_id`, `nation_b_id`, private last-read message positions. Unique game/pair; no self-pair. Also identifies the conversation. |
| `nation_relation_details` | `relation_id`, `game_id`, `turn_id`, `state`, `revision`, nullable `agreement_offer_id`, `cancellation_by_nation_id`, `ends_on_turn_number`. Unique relation/turn. Copy active state through the existing turn lifecycle; absent state means No relations. |
| `nation_messages` | `id`, `relation_id`, nullable sender, `kind`, nullable plain `body`, nullable `offer_id`, structured notice type/data, original turn number, nullable origin turn reference, timestamps, nullable `reverted_at`. Index relation/id for bounded history. |
| `nation_offers` | `id`, `relation_id`, sender, creation turn, `kind` (Peace, Alliance, ResourceGrant), nullable diplomatic basis revision, nullable `resource_type` and `quantity`, request key. Immutable submitted terms; fields constrained to the selected kind. Capital uses ResourceGrant too. |
| `nation_offer_details` | `offer_id`, `game_id`, `turn_id`, `status` (Pending, Accepted, Declined, Cancelled, Invalid), resolution actor/time and optional invalidation reason. Unique offer/turn. |
| `battle_participants` | `battle_id`, `nation_id`, `side`; unique battle/nation. Records actual coalition participation while preserving existing primary attacker/defender fields. |
| `orders` addition | Nullable intended target-owner ID plus an explicit captured-intent marker for Attack/Raid. A captured neutral target must be distinguishable from a legacy order with no captured intent. Existing order nation/turn remain authoritative. |
| `games` addition | Proposed durable `turn_context_revision`, rotated on activation/reset and exposed in confirmed context reads. Distinct from relationship revisions and ordinary same-turn changes. |

All grants now execute immediately, so remove the earlier speculative grant-item table, scheduled execution fields, asset-transfer statuses and division/territory references from this release's schema.

Store quantities as bounded decimal values with at most four fractional places; validate and transfer with scaled integer arithmetic at the boundary to the existing stockpile representation. Do not migrate the entire economy's numeric storage. Test conservation at the supported precision.

No generic workflow/event-sourcing framework or separate AI diplomacy database is needed. A stable request key on offer/text creation prevents duplicate creation after deliberate retry; repeated acceptance of one offer can never debit twice. A conflicting reuse of a request key is rejected.

## Implementation defaults

These defaults were included in the approved implementation plan.

- **Grant availability:** only already-stockpiled units left after current queued expenses and upkeep, never unproduced output. Start conservatively with `max(0, stock - expenses - upkeep)` per resource. Recompute from authoritative current data at acceptance. Reallocate/recheck both nations after stock changes using the existing economy routines, with the original bids retained. Export this grantable quantity explicitly instead of relabelling the normal spending budget.
- **Visibility:** relationship states and cancellation deadlines are public within the accessible game; messages, grant amounts and pending offers are private to the pair. No opponent budgets, armies or messages enter AI observations.
- **Peace:** accepting a peace offer creates the protective Peace treaty, including when proposed between nations currently at No relations. Mutual upgrade from Peace to Allied is allowed; cancellation ends in No relations. Competing obsolete diplomatic offers become invalid.
- **AI grant support:** initially unavailable in either direction; the AI supports peace only. Sending human text to it remains possible with an explicit no-reply label. Do not leave unsupported gift offers appearing actionable forever.
- **Polling:** one selected-game service polls inbox summaries every 20 seconds and loads only the open conversation's bounded page. Focus/reconnection refresh promptly. Browser background throttling remains possible.
- **Initial rollout:** start with newly created test/playtest games. Existing games keep their current behavior until explicit activation/migration is planned; do not infer historical wars from battle logs.

The user settled both alliance choices before combat implementation:

1. **Concurrent allied attacks:** retain shuffled per-nation assaults. The first conqueror owns the territory; later eligible ground forces reinforce it without a second allied battle. Aircraft retain their normal base rather than occupying it.
2. **Returning foreign troops:** find the nearest suitable owned land using map connectivity, ignoring ordinary movement range, with the destination ID breaking distance ties. Disconnected owned territory uses the same ID tie-break. Disband only if there is no suitable owned land, and notify both nations. The same return rule covers protected bystanders when their host loses territory.

## Command, turn and rollback boundaries

### Shared commands and concurrency

- Keep `NationContext`, request validation, CSRF, selected-game and command-context checks. Resolve fresh current turn/nation state again inside the mutation lock, not from a model captured before waiting.
- Proposed focused services: `DiplomacyService` for permissions/state transitions, `NationCommunicationService` for private messages/offers, and `NationGrantService` for stock transfers. Names may change; responsibilities should not merge into a generic action engine.
- New game-changing actions acquire the existing game lock and execute their dependent writes in one database transaction. Offer status, two stockpiles, recalculated allocations and result notice commit together.
- Audit and bring competing existing resource writers—production, deployment/order changes, readiness/advance, and AI application—under compatible locking. A grant-only lock does not protect against an unlocked deployment. Existing AI and upkeep callers already inside that lock must use internal operations without reacquiring the non-reentrant lock.
- Extend the concrete turn-context proposal for these paths: rotate the durable revision on creation/activation/reset, include it in reads and mutation payloads, and reject stale contexts under the lock. Test compatibility of existing human/AI callers. This is a scoped implementation prerequisite, not a declaration that every old endpoint becomes transactional.
- Avoid marking ordinary command-lock contention as turn processing; `Game::isUpkeeping()` currently probes the same lock. Preserve the dedicated turn-status presentation and distinguish conflict/busy responses from actual upkeep in the integration tests.

### Combat and deadlines

- Centralize distinct checks for peaceful passage, intentional attack and defensive participation. Peace is not passage; alliance is not ownership. Preserve unit movement range/type, attack costs, deployment ownership rules, AI human-protection settings and existing victory conditions.
- Capture target-owner intent when accepting an attack order. Recheck treaty permissions during resolution. Accidental occupation changes do not create war merely because a battle record exists; eligible deliberate attacks and actual allied participation do.
- Treat cancellation at planning turn N as protection through N+4, ending when planning turn N+5 opens. To avoid the existing resolve-into-next-snapshot convention ending protection early, battles resolving orders from N+4 still respect protection; finalize expiry and repatriation after those battles, before activating N+5. No visitor attacks are allowed through the expiring pact. Test this exact boundary rather than relying on which snapshot table happens to be read.
- Accepting a protective agreement cancels/revalidates incompatible outstanding Attack/Raid orders on both sides and reconciles costs/allocations atomically. Never delete historical orders from earlier turns. Recheck movement/rebase paths if permission changes before execution.
- Allied defenders use their own nation bonuses/identity and are selected from eligible forces present at the battle. Nations protected from fighting the attacker sit out; their troops do not count as a defending shield. Record the participants and war transitions only for forces that actually participate.

### History and rollback

- Copy relation/offer detail state with each turn. Rollback removes the rolled-back snapshots alongside stockpiles and battles, restoring earlier pending offers and relationships rather than replaying money transfers.
- A grant accepted during a retained planning turn remains accepted when only its following resolution is rolled back. A grant accepted in the removed turn is undone with that turn's stocks and offer state. Cover both cases explicitly.
- Proposed chat policy: human text survives rollback. Action notices from the removed turn are marked reverted; offers created there cease to be actionable. Keep an original turn number for display and null the origin FK when required. Mark affected messages before deleting the turn; an FK cascade alone is not enough.
- Reset unread pointers safely and refresh both offer cards and relationship state after rollback. A new-message cursor alone cannot refresh an already-rendered offer's status.
- Rotate the durable game context even when rollback recreates an already-seen turn number. Ensure cached relationship permissions and resource summaries cannot survive incompatible rollback state.
- Audit existing partial-upkeep failure/recovery before adding hooks. New snapshots/notices must not advertise a successful transition after a failed operation; prove recovery under injected failures in the isolated engine.

## Player UI and client ownership

- Add a Diplomacy workspace using `app/Router.js`, `app/registry.js`, `GameShell.js` and `GameHeader.js`: nation/conversation list, selected conversation, relationship badge/countdown, text composer, and typed offer actions. Desktop can show a list beside the conversation; narrow layouts use list/detail navigation.
- Compose existing Button, Panel, FieldShell, StatusBadge, ConfirmDialog, resource visuals, flags and Scope. Keep offer cards feature-local until another consumer warrants a shared component. EN/FR labels, keyboard focus and safe text rendering are required.
- Add one `DiplomacyService.js` per `GameInstance` for inbox/conversation reads and its read-only store. Pair threads require their own scope and paging, justifying a separate owner; they do not duplicate `GameDataService` budgets, identities or map state. Fetch the existing shared nation directory through its current owner.
- Add confirmed diplomatic permissions/relations needed by the map to the coordinated game read. The inbox consumes those same confirmed values instead of publishing competing relationship truth. Private texts/offers stay in the communication store.
- Extend `GameplayService`'s existing human command path for offer actions, cancellation and sending text; do not introduce a second concurrent human mutation lane. A focused reconciliation hook can refresh communication reads as well as affected world/budget state. Read markers are monotonic metadata updates, not gameplay commands.
- Preserve one-at-a-time mutation, accepted-but-unrefreshed, rejected and uncertain outcomes. Never automatically resend mutations. An uncertain grant outcome is reviewed using the offer and confirmed balances. Refresh can recover state even after the originating panel closes.
- Same-scope polling preserves conversation selection, scroll position, focus, text drafts and grant drafts. Append without forcing a reader away from older messages. Refresh affected offer cards even if no new text was sent.
- Dispose timers/listeners/requests and discard incompatible private state on game/nation/session change. Include unsent message/grant drafts in `GameInstance`'s leave checks. Suspend unsafe submissions when stale; text transport is independent of turn advancement but still needs current authorized scope.
- Keep unread status private; don't expose last-read markers to the other nation. Polling performs reads, never automatic offer acceptance.

## Implementation sequence and acceptance gates

| Phase | Deliverable | Must pass before continuing |
| --- | --- | --- |
| P0 — Contracts and fixtures | Freeze the narrowed schema/API shapes; identify every competing writer, turn hook and cache; establish two-game/four-nation isolated fixtures; resolve the grant-availability default. Record a short ADR for accepted architectural additions when agreed. | Baseline existing commands/advance/rollback pass in isolation; explicit no-live-data test setup; migration and concurrency design reviewed. |
| P1 — Foundation and inbox | Additive pair/message/offer/detail schema; context revision and necessary writer coordination; private read/send routes; generated client definitions; service-owned inbox and text conversation UI. Diplomatic/grant actions stay unavailable until implemented. | Cross-game/third-party/spectator access tests, simultaneous pair creation, duplicate text keys, turn/reset fencing, polling disposal, persistent draft/focus and EN/FR narrow layout. |
| P2 — Resource grants | One-resource offer UI; Capital/Food/Material/Ore/Oil validation; accept/decline/cancel; immediate atomic transfer; both parties' confirmed budget reconciliation. | Conservation, no forecast-only gifts, queued-spending protection, insufficient funds, double accept, accept/cancel race, grant/deploy/turn races, injected failures, rollback and two-browser result visibility. |
| P3 — War and peace | Relationship state reads, intentional attack tracking, peace offers, five-turn cancellation, protection at submission and resolution, notices and countdown. | Existing neutral combat preserved, explicit war starts, accidental battle exemption, Attack/Raid cancellation/cost reconciliation, stale offers, exact expiry boundary and rollback. |
| P4 — Alliances | Mutual alliances, safe passage, compatible allied occupation, shared defence/participation reports, expiry/repatriation, agreed handling of allied attacks. | Both alliance choices are confirmed. Test A allied to B and C, bilateral treaty precedence, no transitive access, mixed-nation defender bonuses, air/ground orders, casualties/ownership, stranded troops and expiry across advance/rollback. |
| P5 — AI peace | Optional diplomacy plan actions, private peace observations, V1 peace decisions and treaty-aware target filtering; updated author kit. | Existing scripts still normalize without new fields; no privileged reads, no alliances/text interpretation/grants; peace actions use shared validation; decisions delayed to the normal bot step; retry/fallback and stale-plan cases cannot duplicate actions or bypass protection. |
| P6 — Stable playtest | Integrated multi-human/multi-AI practice game and regression pass; operational migration/release notes and recorded limitations. | Complete game through victory, browser journeys, API contracts, client tests/build, advance/rollback/concurrency checks and reviewed migration/backup rehearsal. No claim of physical-device or cross-browser validation without actually doing it. |

P2 proves useful social interaction without waiting for the combat changes. P3/P4/P5 are required to deliver the agreed diplomacy release; the phase boundaries are not silent scope reductions. AI peace depends on P3 and can be tested before P4 is complete, but no parallel-agent delegation is implied.

Use the existing guarded `tests/client/isolated-app.php` and temporary MariaDB/public-root patterns for engine/HTTP tests. Real concurrency checks need a shared isolated lock backend; array-cache tests cannot prove cross-process exclusion. Add focused tests under `tests/client/` and browser journeys under `tests/client/browser/`. Generate/check endpoints through the existing `client:generate` workflow. Run targeted tests per phase, then the appropriate combined suite/build at integration.

## AI-specific integration details

- Add optional `diplomacy` actions defaulting to an empty list in `modules/ai-player/Plan.php`; preserve old required fields and strict bounded validation. Update standalone kit normalization, examples and fixtures together.
- `GameAdapter::observe()` exposes current bilateral states, deadlines and the AI nation's own pending peace offers. Free text is not a strategy input; it is never interpreted as an authoritative game action.
- `GameAdapter::apply()` invokes shared diplomatic operations under the existing runner transaction before validating the resulting military plan. Revalidate after thinking outside locks; no submitted plan is exempt from a treaty accepted meanwhile.
- V1 filters protected targets and uses a small deterministic peace heuristic based on existing own-conflict history, duration and pressure. Put tunable thresholds in the policy, not the engine. Avoid duplicate proposals while one is pending and immediate repetitive reproposals after rejection.
- A bot already committed for this turn considers a later offer at its next normal decision; receiving an offer does not run it again. Automatic result notices provide the response, without generated chat text.
- Other custom scripts can ignore diplomacy decisions but remain bound by backend treaty permissions. Exercise V1 fallback, full rollback of partially applied plans, readiness and notebook behavior. Preserve the temporary/removable module boundary.

## Separate stable-release item: embedded Flag Editor

Implemented 2026-09-25 using the identity-screen dialog selected by the user. See [ADR 0021](../client/decisions/0021-nation-flag-editor.md) and the client progress journal. The new flag-design migration still requires operator application; isolated creation and rollback checks pass.

The existing [Identity Lab](identity-lab.md) already has strict versioned recipes, a canvas renderer and PNG export. Reuse that engine in `resources/js/client/features/nation-creation/steps/identity.js` through a focused editor surface; keep the local study shelf independent from authoritative nation identity.

Extend the existing `NationCreationProcess` draft and `NationCreationService` full-form submission with a matched immutable recipe/PNG pair, bounded server validation and nullable `nation_details.flag_design`. Continue displaying the existing `flag_src`. Preserve ordinary uploaded flags and the current nation-colour selection; do not add post-creation identity editing implicitly. Respect existing failed-upload cleanup and transaction boundaries. Verify recovery after validation failure, stale editor completion, reopen/back navigation, matching image/recipe, narrow layout and old nations without recipes.

This is an independent implementation slice before the stable release. Its final editor extraction/upload contract should be reviewed separately from combat; it does not block P1/P2.

## Release handoff and current evidence

Delivered P0–P5: additive pair/message/offer/snapshot tables, authenticated API and generated endpoint definitions, durable turn context, common game transaction/lock, private inbox with unread counts and bounded paging, money/resource grants, War/Peace/Allied permissions, five-turn expiry, returning troops, participant battle access, and limited AI peace. See [ADR 0020](../client/decisions/0020-primitive-diplomacy.md).

P6 automated evidence (temporary MariaDB only):

- `tests/client/diplomacy-engine.php`: private access, request keys, all five resources, conservation, invalid/failed transfer atomicity, cancellation, turn changes and rollback semantics.
- `diplomacy-combat.php`: treaty movement, protected-order cancellation, eligible allied defence, protected bystanders, actual participant wars/reports, accidental collisions, reinforcement ownership, exact five-turn expiry/rollback, return/disband notices, queued spending and no projected-output gifts, nested turn failure recovery and an ordinary final-turn battle/victory transition.
- `diplomacy-race.php`: independent PHP processes, exactly-once acceptance, competing grants, and accept/cancel conflicts under shared game locks.
- `diplomacy-ai.php`, the existing `ai-policy.php` and `ai-script-checks.php`: delayed normal-step peace handling, acceptance/decline/proposals/cooldown, target protection, unsupported AI actions, old script compatibility, worker fallback and script memory rollback.
- `diplomacy-http.mjs`: real authenticated HTTP, stale/missing context, forged nation, cross-game and third-party rejection, no-store private reads.
- `diplomacy-browser.mjs`: three separate authenticated Chromium sessions, private text and safe rendering, grant offer/accept, alliance acceptance/cancellation notice, refreshed cards, draft preservation and a 390px viewport.
- `diplomacy.test.js`: late conversation reads, rollback revisions, command reconciliation, scope cleanup and allied/peace movement previews.
- `diplomacy-migration.php`: down/up on the temporary database, existing-game opt-out, new-game opt-in, SQL backup restoration with matching game/diplomacy/resource hashes.
- Existing client Node suite, generated-route/PHP contracts, PHP syntax checks and Vite production build passed. Browser coverage is Chromium/emulation, not physical devices or other engines.

Run the isolated checks using the existing `tests/client/isolated-app.php` setup and `NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-…`. Engine seeding resets only that guarded test database. The HTTP/browser scripts require the loopback `entry-server.php` fixture on port 8792. See the progress journal for the concrete verification run.

For a new playtest deployment, back up its database/storage, then apply `database/migrations/2026_09_25_000000_create_primitive_diplomacy.php` using the project's PHP 8.3 Laravel migration workflow, regenerate route caches as appropriate, and deploy the built assets with the source. Existing games remain opted out; newly created games opt in automatically. Do not enable existing games by editing the flag without a separate activation plan. A schema downgrade deletes new diplomacy data, so restore the matched backup when reverting a deployment.

Before freezing the stable release: run a sustained multi-human/multi-AI campaign, judge balance and long-history performance, and playtest the now-integrated Flag Editor after applying its migration. Leon provisioning, credentials, scheduled upkeep/AI operation and publication remain the later hosting task requested by the user. No claim of a completed long campaign, live migration, or Leon deployment is made here.
