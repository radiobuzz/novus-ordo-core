# Civilian economy — playable integration

2026-10-01. Authorized after the isolated [civilian milestone](civilian-economy-milestone.md). The objective is now an actual new game, real readiness-driven turns, persistent economic outcomes and a readable player view. This extends the transactional economy; it does not adopt the indicator-led alternative or replace database policy definitions.

## What runs in the game

There is still one live settlement path: `EconomyService` → `ProductionEconomySeason` → `ProductionAccounts`. Previews and real turns call the same resolver. `CivilianProduction` adds civilian requirements, subsistence, input planning and upkeep inside its existing phases. The one-region `CivilianEconomySeason` remains a research harness, not a second live resolver; recipe ordering and condition progression now share `CivilianProduction` with it.

Fresh games use `database/resource-templates/civilian.json`, with a distinct template name so an already-stored older template cannot silently win default selection. The previous foundation remains available as an explicit catalogue, not another engine. Existing games are not reseeded on read or on the next turn.

- Food and household-goods requirements come from population. Food has first priority. Population still follows the game's existing consumption-based demographic rules.
- Subsistence produces household-owned food without cash income. Population need, a configured share of local food potential and actual worker availability bound it. It uses the same territorial workers as paid production, services, maintenance and development.
- Equipment uses ore; household goods use ore and raw materials. Owned inputs and their carried cost basis are consumed by recipes. Newly produced inputs cannot be reused until the following season, including inside the same national private pool.
- Recurring equipment upkeep derives from installed assets, not new construction or military orders. Each territory/resource/owner group retains its productive condition. Missing upkeep reduces later output capacity without deleting installed assets; fully supplied upkeep repairs condition at a bounded rate.
- Opening private inventories form a finite founding pipeline. Production targets replace expected intermediate use and retain one season of inputs plus a 20% safety margin (`input_stock_buffer`). This default also applies to existing saved rules that predate the setting. There are no recurring inventory top-ups.
- Industrial demand propagates upstream without being clipped to current downstream capacity. Private investment includes recipe and maintenance demand, compares it with private supply capacity rather than idle public assets, and does not mistake required input stocks for unsold household goods. Existing cash, profitability, ownership permissions, geographic ceilings and construction limits still apply.
- Government purchases and upkeep use government cash and owned stocks. Private internal deliveries are not fabricated sales. Input cost basis is not reported as a second government cash payment.
- Existing taxes, infrastructure budgets, food releases, acquisitions, military payroll/commitments, finite credit and development permissions remain active. No parallel civilian pass charges them again. New input costs participate in the existing profitability check.

This is a national pooled market, with shared household and private-business accounts and territorial productive assets. It is not a company-per-factory simulation or international trade system.

## Resource and geographic boundary

The playable catalogue has six physical goods: food, raw materials, ore, oil, equipment and household goods, plus treasury and recruitment. It retains the saved map's aggregate **ore** profile as the metal feedstock, including the copper example discussed in the design. There is no invented separate copper deposit layer. Splitting metals and completing the proposed eight-good catalogue remain later work.

Equipment and household-goods factories are non-geographic production activities with explicit population-scaled development ceilings. Labor, cash, inputs, installed capacity and condition still bound output. A falling population does not erase already-installed factories. Raw-resource potential continues to come from the saved map. Manufacturing does not acquire a fictional mineral-potential overlay.

## Persistence, capture and history

No migration or old-save conversion is required. Existing seasonal tables retain government/private goods with cost basis, civilian cash and installed capacity. `productive_condition` is stored in each territorial `economy_state`, then adapted back into the next season. The existing turn transaction and rollback machinery remain authoritative. Capture follows territorial assets; it does not transfer foreign national pooled inventories or repeat founding funds.

National `economy_report.civilian` contains consumption and shortage causes, actual subsistence, shared worker use, equipment upkeep, minimum productive condition, commercial output and closing civilian cash. Reactive Guard payroll adjusts closing household cash as well as the existing fiscal report. Reports are actuals from the completed season, not reconstructed forecasts.

## Player view and ownership

Budget & Policies now starts with **Civilian livelihoods**: one status sentence, needs met, occupied workers and equipment upkeep. An optional disclosure holds unmet needs by cause, subsistence, productive condition, household/business cash and commercial output. Columns distinguish last-season actual, saved next-season estimate and draft estimate; no previous actual is invented at founding.

`CivilianEconomyView` is feature-local composition of the existing `MetricTable` and native disclosure. `GameDataService` still owns confirmed data; `GameplayService` still owns drafts, commands and refresh reconciliation. The view adds no reads, polling loop, cache, browser-persisted private state or client economic formula. It retains table/disclosure nodes during previews and refreshes. `resourceVisuals.productionConstraint` supplies localized, catalogue-named missing-input explanations to both the planner and territory inspector.

The `novus-game-ui` skill guided existing control/token reuse and optional detail. The `novus-client-data` skill guided the existing shared snapshot, draft/actual distinction and refresh lifetime. No new shared control or state framework was introduced.

## Verification

- The isolated laboratory still passes **11,790 checks** across five 80-season scenarios plus sensitivity cases.
- Live-resolver civilian tests pass **23 checks** for opening-input timing, same-owner recipe constraints, equipment damage/recovery, subsistence, cash conservation, deterministic ordering and renamed resources.
- Existing pure accounting (**270**), coordinated production (**367**) and peaceful-opening (**154**) checks pass.
- The disposable database suite passes the existing **159 lifecycle checks**, then **5,423 additional checks** across **20 real readiness-driven turns with two nations**. Forecasts match saved results, money is conserved, condition persists, and rollback/replay restores both financial/physical state and territorial condition. Catalogue validation rejects missing/currency inputs, recipe cycles, invalid condition rates and inconsistent subsistence/manufacturing definitions.
- The lifecycle suite requires food, household goods and equipment maintenance to be fully supplied every season, alongside a positive treasury balance change and zero debt. At season 20 the reported nation delivers **0.108774 / 0.108774** equipment upkeep, with treasury **54.195606**.
- `civilian-homeland.php` retains **7,612 historical-rule checks** using anonymized founding and turn-10 snapshots of the actual game-27 homeland. Thirty growing-population seasons remain fully supplied from founding. From the damaged snapshot, goods recover in the second resolved season, all upkeep in the fourth, and all asset conditions reach 100% in the twelfth. Investment restrictions, absent funding, deterministic forecasts, worker limits and cash conservation are checked. This test deliberately retains the old upkeep-2 / farm-funding-10% settings: its debt output reproduces the old fiscal failure, not the newly calibrated defaults.
- `civilian-balance.php` adds **3,306 fiscal checks**: the old no-army deficit is reproduced first; new source defaults then produce 40 consecutive opening surpluses, followed by an extended 80-season solvency/supply test. The captured turn-21 economy, retaining its 26% tax and switching only the authorized farm program off, passes the corresponding 40-surplus / 60-season test. Every season conserves total cash, pays full infrastructure upkeep and planned improvement, meets food/goods/equipment needs, stays within labor and cash limits, and has zero borrowing/debt. Final treasuries are **76.029904** and **77.158556** respectively. These use actual territorial population caps.
- Real Chromium checks pass for the civilian section, retained table/disclosure identity, policy/acquisition previews and atomic saves, focused inputs and scroll, stale rejection, exact decimals, EN/FR and narrow layout. Desktop and French narrow screenshots were inspected. Other browsers and physical devices remain unverified.
- Focused store, live-data, gameplay and production-plan client suites, generated API checks, PHP client contracts and the production build pass.

Commands from the repository root:

```bash
php8.3 tests/client/civilian-production.php
php8.3 tests/client/civilian-maintenance.php
php8.3 tests/client/civilian-homeland.php
php8.3 tests/client/civilian-balance.php
php8.3 tests/client/civilian-economy.php
bash tests/client/run-production-checks.sh civilian
bash tests/client/run-production-checks.sh lifecycle --browser
```

The shell harness creates its own MariaDB database/socket, HTTP server and public files under a validated temporary directory. It does not use application database credentials or mutate live games.

## Playable handoff

With the user's explicit permission to change the current game, **game #27** was created at **turn 1**, using game #26's saved map. The human nation retains its identity, colors and original five-territory homeland; one passive participant was created. The new default civilian catalogue is active and both national forecasts were checked during creation. **Game #26 remains intact at turn 5, inactive**, and can be reactivated through normal administration. Nothing was deleted. The new game's turns were left for the user's playtest, not advanced to 20 by the verification suite.

Open game #27 → Budget & Policies → Civilian livelihoods. Auto-ready exercises this economy. At turn 1 the panel has forecasts; completed actuals appear after the first resolved turn.

### Peaceful-start correction and live recovery

The first player run exposed household-goods shortages at turn 6 and equipment shortages at turn 9 with no army or policy edits. Industrial stock targets trailed growing demand; private investment omitted industrial demand, counted idle public mines as supply, and treated necessary input inventory as a reason not to expand. The corrections above address those causes without reseeding stocks or changing policies.

With explicit permission to advance the live game without rollback, game #27 was advanced from turn 10 through **turn 14**. Each actual report exactly matched its forecast. Household-goods shortages cleared at turn 12; equipment upkeep reached **0.100382 / 0.100382** at turn 14, with no economic warnings, treasury **25.791856** and no debt. The lowest asset condition rose from **67.8743%** at turn 13 to **71.8743%** at turn 14; repairs remain gradual. The game was left at turn 14, with existing policies and history intact. The separate longer-run default-budget deficit is not fixed by this supply-chain correction.

### Peaceful fiscal calibration, 2026-10-01

The subsequent live inspection at turn 21 confirmed zero divisions and zero military commitments. Forecast income was **12.248992**, spending **13.573639**, and the deficit **1.324647**. Infrastructure alone requested **12.177610**. The player's tax was already 26%; this was not caused by an army or an unfunded tax cut.

Two changes were retained after repeated experiments:

- Infrastructure upkeep coefficient **2 → 1**. This reduces the cost of maintaining a given infrastructure level; it does not reduce the funding policy, leave maintenance unpaid, slow planned improvement, or change asset-maintenance recipes.
- Default discretionary public agricultural expansion **10% → 0%**. Existing farms keep producing and private investment remains active. The existing policy explicitly funds construction even when food needs are met; it remains available for deliberate expansion, but a fresh player no longer automatically buys additional farms and their recurring equipment costs. The policy template is versioned as `Production economy — civilian-balanced opening v2` so an older stored template cannot override new-game defaults.

Profit payout stays 80%, infrastructure improvement stays 0.005, and military costs, starting cash, taxes, reference prices and civilian requirements are unchanged. Saved games retain their own rule values; game #27 was explicitly updated under the game lock. Its two nations received the farm-funding change through ordinary policy submission, preserving other pending choices and their respective 26% / 25% tax rates.

Experiments rejected raising profit payouts alone (later deficits persisted), deeper upkeep cuts and slower infrastructure development (larger early treasury gains drained business operating cash and eventually hurt supply). Upkeep 1 alone fixed the player's immediate deficit but a different lifecycle homeland still went negative at season 14; disabling the optional farm program fixed that opening as well. `scripts/research/civilian-balance.php` reproduces these comparisons without loading the application or touching a database.

For example, `php8.3 scripts/research/civilian-balance.php baseline 60 founding` reproduces the old deficit; `php8.3 scripts/research/civilian-balance.php upkeep-1-no-farm-program 80 founding` runs the retained settings. The optional fourth argument adds that many artillery after ten saving seasons in the pure ledger simulation; it does not deploy any live divisions or simulate battles.

The regression deliberately distinguishes **40 consecutive opening surpluses** from **80/60 seasons of solvency and full supply**. It does not require positive treasury growth forever from a fixed domestic money pool: in the final founding run, season 60 has a small deficit (~0.17) after substantial reserves accumulate, while season 80 is positive again. Population growth on unchanged finite deposits can eventually expose resource limits. No cash or inventory was injected to hide these boundaries.

Military balance is not claimed solved: in the upkeep-only experiment, five artillery built after ten saving turns still caused borrowing at season 25; three began borrowing at season 39. Those were isolated budget simulations, not deployments in the user's game. Army upkeep/conquest economics remain separate follow-up work.

Live verification retained **35 normal turns**, taking game #27 from **turn 21 to turn 56**. The upkeep reduction ran for the first 20 turns; the farm-program change was submitted at turn 41 and exercised for the following 15. All 35 human-nation reports had a positive treasury change, zero debt, no economic warnings, no army and an exact forecast/actual match. Treasury rose **17.481215 → 40.863566**; the final turn's surplus was **0.558308**. Policies other than discretionary farm funding were preserved. There were no grants, inventory top-ups, debt write-offs or live rollbacks. The game is left at turn 56 for further playtesting.

### Maintenance-collapse correction, 2026-10-01

The expanded nine-territory economy exposed a different boundary at turn 85: growing consumer-goods demand had consumed the opening ore needed for equipment production. Equipment shortages degraded mines and farms, and food reserves finally ran out. The player's ore order had a zero spending limit and received no deliveries; removing it did not change the shortage forecast. Civilian food does not require the player to place government food orders.

The resolver now produces the bounded maintenance supply chain before discretionary output, preserving opening-input timing, shared workers, working capital and installed capacity. Government stockpiling can purchase only private surplus above the next-season industrial buffer. A paid, rate-limited replacement path lets permitted private investors restart damaged maintenance suppliers using existing construction rules and investment funds; it does not mint stock or capacity. Replacement expense is reported as private development.

`tests/client/civilian-maintenance.php` uses anonymized, read-only captures from turns 69 and 85, saved policies/rules/army costs, actual territorial population caps, food-sensitive growth and a conservative fixed opening workforce share. Across **three 50-season runs, 34,814 checks** verify maintenance priority, recovery, cash conservation, worker limits, repair-rate bounds, deterministic forecasts, reporting, investment permissions and funded procurement:

- Pre-crisis capture: full food and upkeep throughout all 50 seasons, without ordering food.
- Damaged capture: full upkeep from simulated season **2**, food from **10**, all maintained assets at full condition by **26**. Food/upkeep remain supplied through season 50.
- Additional cold-start stress case, with all productive conditions and private ore/equipment stock set to zero **in the isolated fixture only**: first full upkeep **6**, food **15**, full condition **30**. No same-season output is invented by rebuilding.

Consumer-goods shortages remain when finite ore cannot support the growing population. The earlier fiscal regression's turn-21 continuation reaches this boundary at its 60th simulated season: previously consumer goods drew down the equipment buffer first. The updated check permits only an explicitly ore-constrained consumer-goods shortage after the 40-season opening runway; food, productive upkeep, infrastructure, affordability, fiscal solvency and cash conservation remain strict. The 80-season founding run remains fully supplied. Historical results above describe the earlier allocator, not an unlimited-resource guarantee.

Verification also passes the 279 accounting and 367 resolver checks, 23 focused civilian checks, 7,612 historical-homeland checks, 3,306 fiscal checks, 154 peaceful-opening checks, the isolated lifecycle suite (including 5,423 civilian checks over 20 ready-driven turns), and the real Chromium production-planner suite. PHP syntax and whitespace checks pass. A guarded read-only forecast of the live turn-85 snapshot confirms equipment output resumes at **0.284014**, with **1.989230** paid rebuilding, and verifies the stored snapshot is unchanged.

No live game was advanced, reset, replenished or reconfigured for this correction. Recovery figures are isolated replay results, not a promise under future policy, army or territorial changes. The current economy recovers over normal turns rather than receiving an instant repair.

### Hybrid public-to-private supply and public investment, 2026-10-01

`PublicIndustrySupply` now places funded private replenishment orders against condition-adjusted public capacity, after public civilian allocations and funded government acquisitions. Requests cover the industrial opening-input pipeline and configured buffer, net of private opening stock and viable private capacity. Private cash reserved for goods production and maintenance is protected before purchase funding; residual services use the remaining working capital. Orders, physical output, purchases and money transfers remain inside the one seasonal resolver and account ledger.

Public facilities can therefore produce industrial inputs without a player stockpiling order. Factories pay the catalogue reference price into the treasury. Only newly produced, allocated goods are sold: opening government reserves and military commitments are not released. Bought inputs enter private closing inventory and cannot feed recipes until the following season. Insufficient labor, condition, capacity or public/private operating cash still constrains deliveries. These sales are excluded from reported government acquisition deliveries and included once in actual public receipts.

Fresh games generate missing per-resource public investment policies from developable stock definitions, reusing any existing funding effect such as agricultural funding. New controls default to zero recurring expansion, use the existing development-funding effect and respect investor permissions and geographical/manufacturing ceilings. The additive, counter-checked `app:policies public-investment SET_ID --counter=N` operation upgrades an existing game's catalogue without enabling arbitrary test editing. It preserves existing choices/pending laws and initializes only missing current choices; invalid current/pending choices abort the upgrade transaction. No schema migration or automatic read-time mutation is required.

The **Production & acquisitions** planner exposes funding on each resource tab, explains zero buildable capacity and ownership restrictions, and shows industrial deliveries, receipts and construction budgets in seasonal comparisons. Budget and planner controls share the same draft and save. Civilian shortages display observed constraints such as missing ore, not an invented client-side diagnosis. Funding is a share of feasible seasonal construction, not a direct output slider; 0% stops expansion, not operating production.

Focused coverage adds 27 public/private supply and investment checks: paid counterparty transfers, treasury/stock reconciliation, opening reserves and military protection, delayed consumer-goods benefit, empty cash/workforce, delayed construction, investment permissions and generic catalogue identities. Existing long maintenance-recovery and peaceful-balance suites remain strict on cash, food and upkeep. The isolated database suite additionally exercises fresh defaults and an older catalogue upgrade with pending laws, disabled test editing, unchanged stocks/turn, idempotence and stale-counter rejection. Chromium covers retained investment drafts and atomic submission with acquisition orders.

The upgrade was installed in game #27 at turn **98**, moving policy-set #23's counter from **1 to 2** and adding five controls at zero funding. Transactional assertions confirmed existing current/pending policies, all economic stocks/accounts/capacities, turn and testing permissions remained unchanged. No live turn was advanced. The post-upgrade read-only forecast shows **0.048891** public ore sold for **0.097782** treasury receipts, full food supply and **1.431326** unmet consumer goods. Public ore development headroom is **zero** on the currently owned land; raising funding cannot create another deposit.

### Resource headroom and investable working capital, 2026-10-01

The turn-108 audit confirmed that the apparent ore problem was not just a missing acquisition budget. The nine-territory nation owned the 15th and 29th highest-capacity ore territories among 378 ore-bearing regions. Combined fully developed potential was **0.708895** ore per season against **0.804296** industrial need. Repairs alone could not close that gap. Other ceilings were not exhausted: food potential **11.392476** versus **5.120293** household need (including subsistence supply), raw materials **3.447873** versus **0.731470** industrial need, equipment **5.851761** versus **0.145652** maintenance demand, and consumer goods **8.777644** versus **2.925881** household need. Oil potential was **0.827727**, with no current civilian demand; a funded fuel-order scenario is tested separately below.

Calibration now uses the optional positive `production.territorial_labor.potential_multiplier`, defaulting to 1 and allowed only for geographic production. The v2 civilian template sets **ore to 3**; all other resources remain unchanged. This converts saved geographic potential to developable economic output consistently in founding, development and territorial labor ceilings. It does not regenerate deposits, change their rankings, increase labor productivity, enlarge existing mines or grant inventory. A territory without ore still has no ore. Existing assets must expand through ordinary paid construction. The map's raw deposit/potential layers remain geographic source data, not a claim of installed or current output.

Ceiling-only trials at 2×, 3× and 4× exposed another boundary: private investment could remain zero because the working-capital reserve retained a full season of operating expenses after distribution. Consumer factories then stopped growing with population. Reducing profit payout alone did not promptly resolve this. The calibrated **operating reserve is 0.75**, while the private investment share, profit distribution, prices, recipe inputs and unit costs remain unchanged. Actual cash and workers still constrain every purchase, production and investment action. The 3× ceiling leaves more future room than 2×; neither means instant triple output.

`tests/client/fixtures/production-accounting/resource-capacity.json` is an anonymized read-only capture of turn 108. `scripts/research/resource-capacity.php` runs pure variant comparisons and an all-resource audit without bootstrapping the live database. `tests/client/resource-capacity.php` adds **3,200 checks across 200 simulated seasons**:

- Current-economy continuation (existing army retained, discretionary acquisitions off): **60 seasons**; full consumer goods from season **5**, full food and maintenance throughout. Debt begins late; closing debt **2.786302** means this is a supply-recovery result, not a permanent fiscal-surplus claim.
- Exact saved-order replay (request **1 ore**, spending limit **5**, priority **1**, public ore expansion **20%**, existing army retained): **30 seasons**, food/upkeep full throughout, goods full from season **6**. State ore grows from **0.570403** to **5.717582** by season **10**, and **25.712575** by season **30**; final treasury **35.214943**, zero debt. These are isolated forecasts with unchanged orders, not turns advanced in the user's game.
- Modest buildup: buy **0.25 ore/season**, spending ceiling **0.5**, public ore development **25%**. Three additional artillery deployment costs are paid only when actual opening ore and cash are available; added recurring payroll is charged. Over **30 seasons**, goods are full from season **6**, ore deliveries total **7.178635**, treasury closes at **23.821947**, with zero debt. This is a pure economic deployment-cost simulation, not a combat or territorial-expansion test. Longer continuously funded buildup experiments eventually borrow.
- Diversified funded orders: food/material/ore **0.1** each, oil **0.2**, equipment **0.02**, consumer goods **0.05** per season, with 10% public expansion. Across **30 seasons**, every resource receives state deliveries, food/upkeep remain full, goods recover by season **5**, treasury closes at **45.442914**, zero debt. Oil deliveries total **5.837775** against 6 requested. There is no evidence here for doubling all resource ceilings or guaranteeing unlimited fuel operations.
- The historical damaged homeland still regains food/upkeep in **10/2 seasons**, sustained through **50 seasons** under the new settings. Accounting, labor limits, deterministic output, no free first-season ore and zero-deposit behavior are checked.

Fresh games use the versioned template **Civilian livelihoods — resource headroom v2** and the new saved behavior default. Existing games require explicit `app:resources calibrate-production SET_ID --counter=N`. The narrow upgrade checks revisions, rejects unexpected custom multipliers/reserves, is idempotent and changes only the ore rule and operating reserve. It does not enable arbitrary test editing. The isolated database regression verifies unchanged stocks/cash/capacities/acquisitions, policy choices, map geography, turn and permissions, invalid rule rejection, forecast/settlement equality and rollback/replay.

With user approval, this upgrade was applied to **game #27 at turn 108**, resource counter **1 → 2**. Its ore ceiling is now **2.126685**. Transactional assertions confirmed unchanged stocks, installed assets, orders, policies, geography and permissions; no live turn was advanced. The immediate forecast still produces **0.683949** ore because new mines are not yet built. It now funds **0.041541** new public ore capacity and **2.437140** total private development. The player's existing 20% ore-investment policy and larger acquisition order were preserved, not replaced with the experimental buildup settings.

Commands:

```bash
php8.3 scripts/research/resource-capacity.php audit
php8.3 scripts/research/resource-capacity.php ore-3-reserve-075 30 as-saved
php8.3 tests/client/resource-capacity.php
bash tests/client/run-production-checks.sh capacity
bash tests/client/run-production-checks.sh civilian
```

## Remaining limits

Reference prices, coefficients, stock buffers and allocation priorities are provisional. National pooling means no domestic transport bottlenecks or private company competition. Subsistence is a bounded mixed livelihood, not proof that every tundra homeland is self-sufficient. The laboratory's dedicated public-service budget is not a new health/education system in the live game: existing infrastructure and paid civilian services remain the service mechanisms here.

The initial catalogue founds manufacturing in the private pool. Funded public replenishment now supplements that pool, and government continues buying its own required inputs. Fully public or arbitrary cross-owner industrial supply networks are not covered; government opening reserves do not silently become a private input subsidy. Finite ore can still constrain consumer goods even after public mines participate. Existing mines may recover condition, but an exhausted development ceiling needs access to additional suitable territory, not simply a higher funding percentage.

The existing simple development allocator still operates under existing policies; no new investor AI, mine-location algorithm or infrastructure-placement planner was added in this milestone. Full resource-chain expansion, deeper investment behavior, trade and more interactive economic situations remain later work. The maintenance-chain restart path is bounded by installed assets, investment permissions, cash and workers; arbitrary severe collapses or geographically insufficient resources are not guaranteed to recover without intervention.
