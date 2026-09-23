# AI Player V1 — viable experimental bots

Date: 2026-09-21

2026-09-22 follow-up: [ADR 0018](../client/decisions/0018-local-ai-scripts.md) records selectable trusted local scripts, per-script notes, generic one-turn V1 fallback and the standalone author kit. The original single-strategy scope below is historical; the experiment remains temporary and removable.

Status: V1 implemented on 2026-09-21 following explicit implementation approval. The temporary/removal requirement below remains mandatory. [Implementation and removal handoff](../../modules/ai-player/README.md) records the actual controls, files, test evidence and remaining limits; detailed design targets below are retained as the planning record, not claims that every future calibration scenario is complete. [ADR 0015](../client/decisions/0015-ai-player-boundary.md) records the accepted boundary.

## Implemented V1.1 follow-up — regional growth and conflict memory

Long-game evidence from the active turn-439 experiment showed the economy surviving while target selection fragmented nations across many landmasses. Six of seven stored targets were outside each bot's largest current land component, and repeated rival pairs had accumulated dozens of battles. The cause was the original turn-number war bonus plus global coast-to-coast reach: by a late turn even cautious war scores exceeded neutral scores.

V1.1 removes turn-based automatic belligerence. The plain observation now distinguishes land connections from general movement/sea reach and includes only battles involving the observing nation. Policy memory lazily gains a home-landmass anchor, stable seeded land focus, doctrine and bounded decaying per-opponent conflicts. Local neutrals remain first by default; strong land focus or conflict can make local unification supersede an overseas neutral. Cautious/regional nations can stop initiating expansion once they control their home landmass, balanced nations vary between continental and frontier priorities, and aggressive/conqueror nations can initiate wider wars. Human protection remains authoritative.

No schema, engine, resolver or existing-game rewrite is required. Old JSON memory remains valid, existing games infer home from their largest current component, and already submitted orders remain untouched. The next uncommitted decision adopts the new policy. This is still disposable V1Experimental behavior, not a permanent strategic framework.

## Implementation checkpoint

- `V1Experimental`, `Runner`, `Setup` and one Laravel adapter are implemented. No LLM/API integration, worker, provider registry or alternative mechanics were introduced.
- Classic/generated game creation accepts 0–10 bots, aggression preset, decision seed and human protection. The watch-test preset chooses six mixed bots with protection; Auto-ready remains a separate player opt-in.
- The open player client drives one AI step per confirmed refresh. Admin provides preview, single-step, remaining-AIs-in-this-turn batch, stop, pause/resume and release to manual control. Bounded multi-turn execution is the `app:ai-play` console command; an admin N-turn UI was not added.
- Opening calibration: the initial six-bot classic run began grouped neutral attacks on turn 24, with successful conquest visible on turn 25. Later policy tuning ensures aggressive bots seek an initial neutral foothold before nation wars. At turn 63 the isolated game had 40 neutral battles and 9 nation battles. These observations are not a universal turn guarantee or a measured win-rate estimate.
- Food reserve target is three turns. Recruitment checks current cost, capacity and three future upkeep turns without assuming future conquest/production growth. Recent attacks trigger a two-Infantry defensive reserve; opponent garrisons remain public-ranking estimates, not hidden unit reads.
- Preview, atomic rollback after Ready, duplicate/stale requests, actual two-process locking, human protection including same-turn ownership change, rollback restoration, controller deletion, disabled-module human games and ten-bot generated-map turns have isolated checks. The watcher has browser, EN/FR/mobile and service-level checks.
- Existing turn numbering begins at 1 (the conceptual opening “Turn 0”). Browser closure stops future AI requests; expiry never silently skips unready AI participants. An accepted/in-flight action cannot be undone by Pause.
- A compact two-bot fixture reached ordinary victory at turn 48, after fixing a turn-43 pre-command Ore affordability issue and explicitly resuming. Final-policy uninterrupted full-match balance remains further playtesting, not a universal guarantee.

## Outcome and scope

Create ordinary nations controlled by a small PHP decision engine. Configure **0–10 bots when starting the game**, with five or six as the normal use case. They should grow, fund their forces, assemble attacks, replace losses and eventually fight neighboring nations. Their purpose is to produce sustained, varied real games for interface and mechanics testing. Success includes explaining why a bot is waiting, not merely generating orders every turn.

V1 uses Infantry and Artillery, one offensive campaign per nation, a bounded economic forecast and three presets of one aggressiveness parameter. Existing nation creation, production, recruitment, deployment, movement, combat, loyalty, readiness and victory rules remain authoritative. Armor/aircraft, diplomacy, learned strategies and external AI services are deferred. A bot may use the existing legal coastal movement mechanism when land expansion is unavailable; this does not introduce a naval mechanic.

The product concept is **AI Player**. This release provides one local implementation, `V1Experimental`. “External” means outside core game code. Nations belong to the game; their automated decision maker is replaceable. Keep the first release small: a dedicated source folder, a thin game adapter and a sequential runner in the existing PHP application. API-based integration is the preferred later direction; no API transport is built for V1.

## Explicit lifespan: temporary and intended for complete removal

**User requirement: this experimental AI Player is not permanent. At some point `V1Experimental` will be completely removed.** Its purpose is to support current playtesting and mechanics experiments. It is not a permanent subsystem that future AI implementations must inherit, extend or remain compatible with.

- Optimize for useful behavior now and straightforward deletion later. Keep its decision logic, tuning, personality, campaign state, diagnostics and experiment-specific UI together and clearly identified. Avoid speculative infrastructure intended to preserve V1 indefinitely.
- Keep dependencies directed through the small adapter. Core game rules must never depend on V1 classes, configuration keys, memory formats or decisions. Any shared game change must have an independent reason to remain useful after the experiment is removed.
- A future API-driven player may replace the implementation and revise the boundary. There is no promise to retain V1's internal interfaces, settings, stored memory or strategy behavior, and no automatic requirement for backward-compatibility layers or memory migrations.
- The implementation handoff must list every V1-owned file, registration/route, setting, table/column and integration hook, identifying what is deleted at retirement and what is independently useful game functionality. Keep this as a short removal checklist, not a new management framework.
- Retirement means deleting the experimental code and its unused wiring, not leaving dormant branches or an indefinitely disabled feature flag. First explicitly reassign remaining AI-controlled nations to human control or a replacement player implementation. Remove V1-only storage through a scoped migration after deciding whether any experimental logs need exporting.
- Preserve ordinary nations, accounts, territories, submitted game orders and game history. Removing a controller must not cascade-delete the nation it once played. Tests must cover this ownership boundary.
- Ordinary command validation, game rules and independently useful player features such as Auto-ready may remain. Keep shared functionality separate from experiment-only controls so removing V1 does not require rewriting the game.

This is a design/removal requirement for future implementation and retirement, not an instruction to delete current project data or files now.

## What the current engine actually permits

| Finding from source | Consequence for this feature |
| --- | --- |
| A nation starts with five connected home territories; each is assigned 1,000,000 population, capped by the territory maximum. Starting Capital is 20 and Ore is 10. | Some terrain gives less than five million total population. Choose useful legal homelands; never create extra people, stocks or free units for bots. |
| Recruitment capacity is loyal population / 1,000,000, with active and pending divisions consuming capacity. RecruitmentPool cannot be stocked. | A normal opening cannot immediately field seven divisions. Population growth is a real prerequisite, even if Capital is saved. |
| Infantry costs 3 Capital; Artillery costs 4 Capital + 1 Ore. Each also requires 1 recruitment capacity and ongoing upkeep of 1 Capital + 1 RecruitmentPool. | Five Artillery + two Infantry costs 26 Capital + 5 Ore, needs seven recruitment capacity, and incurs seven Capital upkeep per turn once active. Building it and sustaining it are different checks. |
| Food consumption is population / 1,000,000. Food reserves affect population growth. Production competes for territorial labor; Capital receives remaining labor after the allocation rules. | Early Food investment can unlock the required army sooner. Excess Ore/Food bids can simultaneously undermine Capital income. National worker percentages alone do not model this economy. |
| Command bids are extra production after automatic upkeep. Capital is automatic. Materials have no current spending use. | Submit complete Food/Material/Ore/Oil plans with correct raw units; normally request no extra Materials or Oil for an Infantry/Artillery force. Do not double-count Food upkeep. |
| Infantry attack power is 15; Artillery attack power is 30. Each battle resolves one simultaneous exchange: floor(power / 100) kills, plus one probabilistic kill from the remainder. | Evaluate force size and survival as well as attack power. Do not use only an attack/defense power ratio. |
| Neutral defenders are 1–3 militia of power 30, sampled afresh for each battle. Neutral militia losses are not persistent units. | Several small attacks need not wear a neutral down. Group divisions against one target in the same turn. |
| Five Artillery + two Infantry gives 180 power: one certain kill and an 80% chance of a second. | With all seven participating, no partisan help and an ordinary neutral, first-attempt conquest probability is 60%: `(1 + 0.8 + 0) / 3`. This is a code-derived calculation, not an empirical playtest. |
| 300 attack power kills all three possible neutral militia; nine Artillery + two Infantry is one such force. | This is a conservative neutral target when economically feasible, not a universal mandatory opening or a guarantee against nation defenders. |
| Newly conquered neutral land starts at 50% loyalty; deployment requires strictly more than 50%. Conquest from another nation starts at 0% loyalty unless an existing loyalty record applies. | Plan reinforcement routes from eligible territory and discount the immediate economic/recruitment benefit of conquest. |
| Enemy unit locations/compositions are not exposed by the inspected public reads. Public rankings expose approximate national army size; participant battle logs expose encountered forces. | Bots must reason with estimates and their own battle observations, not inspect enemy private divisions, stocks or submitted orders. |
| Nation colors reserve one of 24 exclusive primary colors. | The requested ten-bot maximum fits this identity limit, leaving color capacity for humans. Legal connected homelands may impose a lower limit on a particular map. |
| Combat uses `random_int()` and attack groups are shuffled. | Seeded bot decisions reproduce a plan from the same observation and policy version, not an entire game's combat outcomes. Preserve logs and snapshots for diagnosis. |

Evidence: [NewNation](../../app/Models/NewNation.php), [NationDetail](../../app/Models/NationDetail.php), [DivisionType](../../app/Domain/DivisionType.php), [ResourceType](../../app/Domain/ResourceType.php), [Battle](../../app/Models/Battle.php), [Deployment](../../app/Models/Deployment.php), [TerritoryDetail](../../app/Models/TerritoryDetail.php), [Ranking](../../app/Domain/Ranking.php), [NationColorAssignment](../../app/Models/NationColorAssignment.php).

## Decision loop

Each nation retains a small campaign state: objective, target, rally location, assigned division IDs, recent outcomes and cooldown. Revalidate it every turn; retain a valid objective so units do not oscillate between targets.

1. Observe own economy, forces, pending orders and eligible territory; public geography, ownership and rankings; and information from this nation's previous battles.
2. Identify immediate economic shortfalls and credible threats from recent attacks/territory losses.
3. Choose a sustainable economic plan and an affordable recruitment schedule for the current objective.
4. Assign existing units between a mobile defensive reserve and the offensive group. Prioritize exposed productive home territory rather than requiring a division on every border.
5. Rally the attack group, execute an adequately prepared attack, or reinforce after losses. Pending deployments are not active attackers.
6. Validate and commit through shared human/bot command services, persist the decision report, and mark ready once the plan is complete.

Campaign states: **Develop → Muster → Rally → Attack → Replenish**, with **Recover economy** or **Defend** taking priority when needed. Elimination/loss of all territory produces an explicit inactive result and cannot stall readiness indefinitely.

### Economy: growth first, then a sustainable army

The economic objective is to pay civilian needs and military upkeep while building the force required for the chosen campaign. A bot may temporarily spend reserves on growth or recruitment, but it must have a bounded recovery plan.

- Evaluate a small fixed set of candidate extra-production bids and recruitment choices over a rolling three-turn forecast. Account for existing/pending forces, deployment cost now, upkeep when deployments become active, population-driven Food demand, current territorial labor/capacity and existing reservations. Recalculate each turn; do not assume a conquest succeeds to make a budget balance.
- Target roughly two turns of Food consumption in reserve as an initial tuning value. Below that, favor efficient Food surplus when Capital permits. Stop additional accumulation at the chosen target rather than committing all workers indefinitely.
- Protect a Capital reserve based on projected upkeep and replacement needs. Preserve nonnegative recurring Capital balance for the planned standing army once temporary build costs end. A temporary deficit must fit the forecast runway; depletion itself is not a sustainable policy.
- Produce Ore for the next planned Artillery and likely replacements, accounting for the initial stock. Avoid stockpiling unused Oil/Materials. Choose production cutoffs from actual available facility productivity.
- Check recruitment independently from cash. Do not repeatedly submit unaffordable builds or count a stock of RecruitmentPool that cannot exist.
- Build in stages toward the campaign composition. Maintain a limited useful defense during population growth, but avoid filling all recruitment capacity with Infantry and permanently delaying Artillery.
- On losses or economic deterioration: stop new recruitment, reduce optional surplus bids, use reserves deliberately, and relocate/concentrate forces. If an army remains structurally unaffordable, selectively disband through the ordinary command, honoring its real timing; do not invent immediate savings.
- Log a concrete wait reason: e.g. “Recruitment capacity 5; first attack group needs 7” or “Another Artillery would leave insufficient Capital for next-turn upkeep.”

The first implementation milestone must measure the opening with normal starts. Five fully populated Plain/River home territories initially have five units of labor: feeding five million people at productivity four consumes about 1.25, leaving at most 3.75 Capital production before extra bids. Seven divisions therefore require substantial growth, not just saving 26 Capital. Low-capacity starts may need much longer or be unable to support the desired army. Do not solve that by secretly changing bot economics; report it as a mechanics finding.

### Expansion and combat

Score reachable neutral targets using distance/rally cost, useful terrain and public land capacity, future frontier shape and reinforcement access. Neutral population is not public, so do not query it privately for target scoring. Reuse current map topology and authoritative movement validation for both classic and generated maps.

Keep the user's **five Artillery + two Infantry** as the practical first offensive template. A bot can wait for more power according to personality and economic feasibility. Preserve Infantry replacements because current casualty selection removes lower-Capital-value formations first. These are bot preferences, not a new combined-arms bonus or a requirement that only Infantry can capture.

Commit all assigned attackers to the same target on the same turn when they can legally reach it. Units may assemble on one rally territory or attack from several valid origins. Preserve a route/home defense allowance. Count neither pending units nor unavailable divisions toward readiness.

After defeat, use actual participant information and surviving units to revise the estimate. Strengthen or select another objective after repeated repulses; do not repeat an unchanged losing attack indefinitely. After victory, reassess the larger Food bill, loyalty, front and replacement needs before expanding again.

For nation opponents, include estimated garrison and loyalty/population-dependent militia. Approximate national army size is not a local garrison count; record uncertainty explicitly. Use a conservative estimate from public facts and age previous battle observations. Permit a bounded, properly supported first attack when uncertainty prevents a confident prediction; use the result to learn. No access to hidden enemy orders or exact unit rosters.

### Aggressiveness

One persisted `aggressiveness` value supplies three understandable presets. Personality changes willingness to spend reserves, defense allocation and target preference; all profiles obey costs, recruitment and command legality.

| Preset | Neutral expansion | Attacking another nation | Economic behavior |
| --- | --- | --- | --- |
| Cautious | Prefers a force approaching 300 power; tolerates a long development opening. | Retaliates or chooses a well-supported opportunity, especially when neutral routes close. | Larger reserve and defensive allowance. |
| Balanced | Starts from 5 Artillery + 2 Infantry; adds strength when practical or after repulse. | Opens one frontier when its force and replacement budget are ready; favors neutrals while similarly attractive. | Moderate reserves and replacement allowance. |
| Aggressive | Uses the baseline earlier when it can fund the attempt and replacements. | Gives neighboring nations more target weight and accepts greater uncertainty. | Smaller reserve, but still rejects a structurally unaffordable army. |

Exact thresholds are versioned policy settings to calibrate against real-engine fixtures. Aggressiveness does not require a fixed “declare war on turn 10” trigger. Even cautious bots may initiate combat; an expanding world must not remain peaceful solely because every bot waits for someone else.

## Watching a game: Auto-ready and human protection

These are two independent options. A player can watch an unprotected game, or actively play a protected nation.

### Auto-ready — player-owned option

- Add an explicit **Auto-ready** toggle beside the player's normal Ready control. It submits that player's ordinary Ready command for each newly confirmed turn; it does not choose production, recruit troops or issue military orders. Existing standing production bids continue under normal rules.
- Show **Auto-ready on**, a countdown and **Pause**. Propose a configurable viewing delay, initially ten seconds after the new turn has been fully loaded. The delay belongs to the player's readiness, not the engine's combat calculation. Turn processing time is additional.
- Keep map inspection, reports and camera movement available. Beginning a gameplay edit or command pauses Auto-ready before the next submission so the player can intervene; ordinary viewing does not pause it. Resume is explicit. Unsaved gameplay drafts block automatic submission.
- The existing player command service owns submissions and reconciliation. Wait for a complete current snapshot and no pending/uncertain command. Submit at most once per confirmed turn context; a stale snapshot, lost response or failed refresh pauses the loop and offers recovery. Never retry a Ready mutation automatically.
- Enablement is explicit for the current player/nation session. Closing/navigating away from the game ends this browser-driven loop; re-entry offers resume rather than silently enabling it. Multiple tabs must not create competing countdown drivers. Initial implementation should assign one driver for the player/game and still validate context server-side.
- Pause stops future automatic submissions; it cannot undo a Ready already accepted or stop turn resolution already running. Victory, elimination, logout, changed game/nation and unreconciled rollback stop the loop.
- Other human players keep their own readiness choice. Auto-ready never grants one player permission to ready somebody else. With all participating humans opted in and bots prepared, the normal readiness lifecycle can continuously advance the game at the chosen viewing pace.

This is a way to watch through a normal player nation, with its normal economy and information visibility. A neutral observer account, omniscient military display, autonomous management of the human nation and continued unattended execution after browser closure remain separate features.

### Protect human nations — game-start option

- Add **AI avoids human nations** to bot configuration at game creation. Proposed default is off for normal competitive games; a **Watch game** setup preset selects it and offers the joining player Auto-ready. Auto-ready still requires that player's own opt-in.
- While enabled, bots may conquer neutrals and attack other bots, but may not initiate attacks/raids against territories owned by human-controlled nations. Personality and retaliation do not override this rule. Apply it to all human nations, not only the game creator.
- This is an AI targeting restriction. If a human attacks a bot, the bot's defending units and militia resolve normally and can inflict losses. Human-versus-human attacks also keep normal rules. No extra resources, defense bonus, hidden-information access or human invulnerability is introduced.
- Check protection in target selection and immediately before committing a bot plan. Also guard queued bot engagements immediately before their battle executes: a previously neutral target can become human-owned earlier in the same shuffled attack phase. Skip such an engagement with a recorded reason rather than attacking the newly protected owner. Use existing cost/timing semantics; do not invent a refund rule.
- Base protection on current control/ownership, including explicit takeover of a bot nation. Abandon or retarget affected campaigns. A paused bot remains bot-controlled until an explicit human takeover; merely inspecting its account does not change protection.
- Keep this setting fixed for a game in V1 to make tests interpretable. Include its state in the game overview and simulation report; changing it mid-game can be added later with explicit queued-order handling.

Required behavior checks: Auto-ready across several turns without duplicate advancement; pause during countdown; pending drafts/commands; response uncertainty; close/reopen and multiple tabs; another human still unready; protected human targets rejected for every aggression profile; bot-versus-bot combat still occurs; human attacks still meet normal defense; and a contested neutral becoming human-owned before a queued bot attack executes.

## Shared mechanics and implementation boundaries

### Module ownership and dependency direction

Start with three concrete pieces (paths are proposed, not created):

| Location | Responsibility |
| --- | --- |
| `modules/ai-player/V1Experimental.php` | Chooses economic and military actions from player information; owns personality, campaign memory and tuning. Split helpers only when the actual implementation needs them. |
| `modules/ai-player/Runner.php` | Processes one AI nation at a time, records its result and makes it ready after successful command application. |
| `app/Integrations/AIPlayers/GameAdapter.php` | Reads permitted game information and applies proposed actions through existing validated mechanics. Contains the knowledge of Laravel models/services. |

Use a small namespace mapping/registration as needed by the existing application. Pass ordinary arrays or small data objects into and out of the AI. Its decision code does not import game models, query the database or invoke controllers. Core Nation/Game/Battle code does not know aggression thresholds or campaign logic. Keep module settings, small campaign memory and a short per-turn result beside the module's integration, without building a provider management system.

The only core integration needs are starting/continuing the AI sequence, shared validated commands, reset/control changes and the optional protection check before engagement. Reuse existing services/model operations and extract only validation or forecasting that actually needs sharing. No general engine cleanup is a prerequisite.

### Small local call boundary

The decision call is conceptually `decide(playerView, memory, settings) -> {actions, memory, explanation}`. Input contains only that player's permitted information and current context; output is a bounded list of ordinary game actions. The adapter supplies authoritative rule data and, where necessary, a narrow read-only economic forecast. Actor identity is supplied by the runner, not trusted from returned actions.

The adapter checks current context, ownership, action shape, affordability, paths and protection before committing. New memory is saved with successful actions. Keep a simple implementation label for diagnostics; formal protocol versioning, a provider registry, memory migration machinery and pluggable tool discovery are deferred until there is an actual second implementation.

`V1Experimental` makes repeatable decisions for the same inputs and seed. A later API client can replace this local call and return equivalent actions. That future work will define transport, authentication, serialization/versioning, timeouts and costs when needed. This local boundary should make that change straightforward, without claiming it will require no adaptation.

Prove separation with ordinary tests that feed saved player views to V1 without Laravel, and a small fake decision function exercised through the adapter. A fake returning an invalid plan must receive the same rejection as an invalid human command. Do not build a second production strategy just to demonstrate extensibility.

### Game access, forecasting and execution

- The adapter constructs the allowed player view from existing reads/rules and reuses normal game commands. If validation is trapped in a controller, extract only that operation into a shared service. Preserve player authorization, CSRF and legacy payload compatibility; bots never impersonate browser sessions.
- The runner calls V1 outside game locks, then asks the adapter to apply its actions and mark the nation ready. All turn-advance paths respect the same completed/incomplete AI participation state. The resolver contains no economic or target-selection code.

For economic candidate evaluation, first reuse existing budget/allocation capabilities. If a read-only forecast requires extracting the allocation calculation, keep it game-owned, narrow and behavior-preserving: retain priorities, raw units, rounding, facility order and reserve fallback, and compare against real-engine cases. The AI chooses the candidates; it does not own a duplicate authoritative economy. No general forecast/tool framework or broad allocator redesign belongs in this experiment.

Apply a nation's production/deployment/order plan as one transaction with its execution record and campaign update. Validate the full plan against current state, including combined costs and post-deployment labor allocation. Roll back the complete plan on failure, clear affected cached calculations, record the failure separately and leave the bot unready. A rejected plan cannot leave half a recruitment batch behind.

Protection is a game-session participation restriction, enforced in the trusted adapter and a narrow pre-engagement eligibility hook. The hook handles ownership changes during resolution for any automated provider; it does not know how V1 chooses targets. Record this as an explicit game integration cost rather than hiding bot strategy branches throughout combat code. Auto-ready remains a normal player-client feature, independently usable without the AI module.

### Minimal lifecycle safeguards

Read the player view, run the local AI outside locks, then acquire the game lock to recheck turn/control context and apply the result. Reject stale decisions. Record once-per-nation/per-context completion so a repeated request cannot build duplicate units. A failed step stays visibly unready with a short error and can be retried deliberately after reconciliation.

These checks serve today's duplicate requests, rollback and manual takeover. They do not require a job platform, provider fallback policies or remote execution infrastructure. Keep the run bounded; any later API call must also occur outside the game lock.

Disabling the module prevents further AI work and hides its setup options. Human-only games still work; existing AI nations need explicit resume/takeover. Keep experimental settings/memory/results out of ordinary nation-turn records. Shared game command helpers continue to work if V1 is removed.

## Storage, execution and administration

Proposed additive storage:

- A small module-owned nation record identifies AI control and stores enabled state, aggressiveness, seed and current campaign memory. All such nations use `V1Experimental`; no selectable provider registry. Retain a normal backing user to satisfy current ownership/inspection; generate an undisclosed random password and do not promote it to admin. Avoid V1 strategy fields on `Nation` or `NationDetail` and redundant control flags where the adapter can derive control from this record.
- Module-owned game setup configuration includes the requested count/preset/seed and `protect_human_nations`, exposed to the bridge as a participation policy. Auto-ready remains owned by the player's active session and normal command service, not an administrator-controlled substitute for human readiness.
- Small turn-scoped results retain accepted memory, action IDs, explanation and completion/error status; retain fuller snapshots only where they help tests/debugging. Keep private plans out of public reports/status files.
- Use current turn identity plus a module-owned run generation incremented under the same lock on reset/rollback/control invalidation. This fences bot requests and completion records against reused turns. Reuse a durable game revision if one exists by implementation time; the broader player-client [context project](../client/live-data-plan.md) is not a prerequisite for this experiment. A turn number or notification file ID alone remains insufficient.

A committed bot plan may run only once per nation/context. Repeated clicks or requests return its recorded outcome. Failed transactions may be retried deliberately against fresh state. Rollback restores campaign memory for the restored turn and invalidates later observations. Existing restored-turn orders must be reconciled explicitly before replanning, not duplicated. Human takeover disables bot control before editing; entering a bot account for inspection must not silently allow concurrent automatic control. Explicitly test player/legacy command guards on controlled nations.

The user-confirmed sequence is **new turn → AI A plays and becomes ready → AI B plays and becomes ready → remaining AIs → everyone ready → resolve → next turn**. Start AI work when the turn opens, independently of human readiness. Commit and expose each AI's orders/readiness separately so the player sees the checkmarks appear. Human play and Auto-ready can proceed alongside it. Resolve only once all required participants are ready; Auto-ready finishing early simply leaves the game waiting for the remaining AIs.

For V1, let the open game/watching client request one bounded next-AI step at a time, using a server-owned sequence and context checks to handle multiple tabs. Refresh readiness between completed steps, then continue; reuse the same runner for the console/admin batch. No new queue worker or background daemon is needed. Publish turn activation before scheduling its first AI, and start the first cycle when the created game is opened. Closing the browser stops further browser-driven steps; an in-flight step can finish, and existing server turn-expiry behavior remains explicit rather than being claimed as paused.

Coordinate plan application and normal turn changes under the existing game lock with consistent lock order, while planning stays outside it. Readiness/expiry/development/simulation entry points must honor the same bot completion/context checks; they must not recursively start another all-bot turn within resolution. Administrative force-advance, if retained, remains an explicit override rather than normal watching behavior.

The bot runner must not claim to solve the existing server-wide concurrent human-command gap. It must fence its own execution against advance/rollback/control changes and reject stale bot/admin requests. Preserve existing player validation and test overlap through legacy routes as well as the new interface.

Configure bots in the existing **Start game** flow, for both classic and saved/generated maps:

- Number of bots: 0–10. Zero preserves human-only games. When the user enables bots, propose six as the initial value; explicit saved choices remain authoritative. Existing callers that omit the setting retain zero bots.
- Behavior: Mixed (proposed default), Cautious, Balanced or Aggressive. A mixed game assigns stable individual aggressiveness values from its seed. Show assigned profiles in the resulting nation list. Fine-grained economic tuning stays out of game creation.
- Protection: **AI avoids human nations**, independent of personality. Offer a **Watch game** preset with protection enabled and an Auto-ready opt-in when the player enters; display the actual settings in the confirmation.
- Keep a repeatable decision seed in the game setup, with an optional advanced override. Preview the chosen count/behavior in the existing start-game confirmation.
- Validate enough disjoint legal five-territory homelands for the requested bots **and at least one human start**. Prefer economical starting regions and leave accessible neutral expansion space. This is a constrained placement check, not simply free-territory count divided by five. Reject an impossible setup with the supported count/reason before replacing the current game; never silently create fewer bots or consume every human start.
- Extend the existing game-creation transaction to populate all requested bot nations using normal setup before the new game is exposed as ready. Any bot-creation failure rolls back the new game and preserves the previous active game. Publish status only after commit. This needs a shared game-creation service so classic, saved-map and generated-map entry paths apply the same settings.
- Bots start on turn one with the same resources/rules as human nations. Creation itself does not run their plans or advance the game before the human joins. Adding bots mid-game is deferred.

Compose a small Bots area in development administration for inspecting and running the configured players:

- Show each nation's controller, personality, economic state, offensive force versus target, campaign target, last action and waiting/failure reason.
- Preview a plan without writes; run bot plans; run one full simulation turn; run a bounded N-turn batch; stop between turns; inspect a nation through the existing interface after pausing/taking control as appropriate.
- Use the existing admin command service, Button/FieldShell/DataTable/StatusBadge/ConfirmDialog and scoped request lifetimes. Keep descriptions in concise help, preserve focus and selected game, and render logs as text.

Start with a bounded PHP console runner and admin single-turn commands. The admin N-turn control sequences explicit server steps, checking confirmed progress between steps. Navigating away/closing it stops scheduling further steps; an in-flight step may finish. A lost response causes read-only reconciliation, not an automatic mutation resend. This avoids requiring a new always-running worker. Add durable background execution only if measured runtime justifies it.

Batch simulation advances automatically in games wholly controlled by enabled bots, or in mixed games after every human has submitted ordinary readiness for that turn (manually or through their own Auto-ready loop). Prepare bots and wait for humans who are not ready; never mark humans ready through an admin simulation command. Reconcile whether the last Ready already advanced the turn before requesting another step. Stop on requested limit, victory, disabled/control-changed nation, inactive/replaced game, context mismatch or execution error. Paused bots have a visible readiness policy: resume them or explicitly hand them to manual control; do not silently skip their turns.

Gameplay sees bots through normal confirmed reads and existing static turn notifications. Retain World/map instances and camera during refresh. No bot-private cache, fake client-side ownership updates or new push transport. Record step durations, unit counts, command counts and economic health so large fixtures diagnose engine load as well as interface behavior. Backend bots alone do not test many concurrent browser sessions; that remains a separate load test.

## Delivery sequence and acceptance

| Stage | Deliverable | Evidence required before moving on |
| --- | --- | --- |
| 0. Rules and opening calibration | Isolated fixtures for normal/poor starts, real allocation, 5A+2I attacks, stronger attacks and growth-to-army timelines. | Confirm population/recruitment/upkeep limits and actual conquest rates; publish a plausible opening timeline and profile thresholds. Identify impossible starts without changing mechanics. |
| 1. Small AI module and adapter | `V1Experimental`, game adapter and sequential runner; minimal memory/completion records and only necessary shared-command extraction. | Fake decision replacement without engine edits; no model/DB imports in decision code; thinking outside locks; normal validation; duplicate/stale steps rejected; individual readiness visible; human-only play works with the module disabled. |
| 2. Economically viable neutral expansion | Growth opening, three-turn budget, Infantry/Artillery muster, grouped attacks, replacements, rally paths and recovery. | From unmodified normal starts, bots build a sustainable baseline force and conquer neutrals within the calibrated window. Log resource shortfalls rather than hiding them behind stock clamping. |
| 3. Personality and nation conflict | Aggression presets, opponent estimates, one-front campaigns, defense/retaliation and anti-stall behavior. | No private enemy data access; capable neighbors eventually attack in a bounded fixture; cautious/aggressive policies differ on the same observation; failed attacks alter the next plan. |
| 4. Game setup, watching and sustained games | Start-game bot/protection configuration, Auto-ready/pause, inspection, preview, step/batch/stop, takeover and metrics. | Classic/generated browser journeys for 0/6/10 bots and invalid counts; multi-turn real-engine runs with six and ten bots plus a human slot; Auto-ready and protection scenarios above. Record timings, shortages, conquest and nation-conflict counts. |

Stage 0 establishes numeric behavioral deadlines before Stage 2 is accepted; do not call “survived 50 turns” sufficient if every bot is still idle. The complete release includes nation-versus-nation combat; neutral expansion alone is an intermediate milestone.

Architecture acceptance uses V1 tests over saved player views without Laravel, a small fake-decision adapter test, real-engine command checks and stale-result tests for advance/rollback/takeover. Inspect imports and changes outside the module/adapter: each must support a shared game command/read, a necessary lifecycle hook or the requested watching UI. Use normal tests/code review rather than introducing a separate architecture-testing framework.

The end-to-end goal includes autonomous progression to an ordinary legal victory in at least one viable fixture. Track stalemates separately: protected human land or an unchanged economic/military balance can prevent victory. Do not invent an AI-only win condition to make the test pass.

Focused regression scenarios must cover: scarce labor/Food/Ore; insufficient recruitment despite money; growth reserve versus military upkeep; low-loyalty deployment; a coastal-only route; units arriving on different turns; enemy militia beyond the neutral maximum; lost targets; repeated repulse; elimination; 0/6/10-bot configuration and rejection above ten; creation failure preserving the old game; reserved human starting space; color exhaustion; manual takeover; bot/turn overlap; rollback/reused turn numbers; simulation stop and uncertain responses. Long-run tests record seed, policy, observations and battle results because production combat remains random. Use multiple runs for stochastic behavior rather than a single flaky victory assertion.

All game mutations for development verification use the existing explicitly isolated database/public-root helpers. Concurrency tests need a process-shared isolated lock backend; the existing isolated helper defaults to an array cache and alone cannot prove cross-process locking. No live game is populated or advanced by this planning task.

## Review defaults and remaining measurements

User-specified setup: bots configured at game creation, normally five or six and at most ten; player Auto-ready and optional protection from AI attacks. Recommended defaults: optional bots (zero for existing callers), six when enabled, mixed personalities, one reserved human start, legal starting resources, Infantry/Artillery only, public-information parity, one offensive campaign, three-turn economic forecast and manual/explicit batch controls. Auto-ready is opt-in with a ten-second viewing delay; protection is off normally and on in the proposed Watch game preset. Larger bot counts, mid-game additions, additional unit types, true spectator accounts and a permanent background simulation worker are follow-ups.

Measurements still needed: time to sustainable seven-division force across terrain; Food reserve/capital tradeoff; attainable army sizes under current recruitment; conquest and replacement rates; credible opponent-estimate thresholds; per-turn execution cost with six and ten bots. Source analysis identifies the constraints; it does not establish that these tuning values already produce a viable bot.
