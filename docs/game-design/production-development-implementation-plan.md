# Generic production, ownership and development — implementation plan

Date: 2026-09-29. **Packages A–F implemented.** The user approved the direction, the [UI sketch](production-development-ui-sketch.md), and the next accounting package. [Package A's contract/results](production-accounting-contract.md) document pure domain primitives and executable fixtures. Package B adds definitions and seasonal storage; [its contract and integration boundary](production-state-contract.md) describe the new schema. Package C supplies the pure coordinated resolver; Package D connects the live game and shared workspace. Package E delivers the [player presentation](production-presentation-contract.md). Remaining recommendations are implementation proposals, not a claim that every economic detail was previously frozen.

## 1. Delivery objective

Make existing produced goods participate in one economic pipeline:

**Potential → developed capacity → funded activity and labor → owned output → delivery/consumption → payments and earned income → future development.**

Food, raw materials, ore and oil use this pipeline. Ore is a worked example, not a separate implementation. Money remains currency; recruitment remains non-stored capacity. Generic means shared mechanisms with validated configuration, not pretending that all resource kinds behave alike.

The playable result must let a player see government stocks and national production separately, acquire goods with visible costs, fund public productive development, observe private investment responding to opportunity, and understand local constraints. It must connect activity to income without adding resource earnings on top of an unchanged income formula that already counts that activity.

Build incrementally in ordered packages, then make one coherent fresh-game cutover. Intermediate packages do not justify shipping two competing economic runtimes. Do not convert old saves, add resource-specific compatibility paths, or maintain strategic AI. Passive players must continue to mark Ready.

## 2. Current implementation: reuse and replacement

| Current source | Verified behavior | Planned treatment |
| --- | --- | --- |
| `app/Services/Resources/ResourceCatalogue.php`, `ResourceRuleRegistry.php` | Game-owned definitions; kinds, roles, validated production/demand/capacity handlers and unit costs | Retain catalogue ownership/import/export/validation; extend supported contracts rather than create a second resource catalogue. |
| `app/Domain/Resources/Quantity.php` | Six-decimal quantity and currency arithmetic | Reuse for all settled quantities, balances, prices and costs; explicit deterministic rounding. |
| `app/Domain/Resources/GeographicProduction.php` | Saved geographic potential and terrain yields constrain a facility | Retain as geographic input adapter. Do not regenerate maps or infer reserves from UI labels. |
| `app/Domain/Resources/Agriculture.php` | Nutrition-specific developed share before worker allocation; shortage/growth consequences | Move the capacity/development mechanism into common production code. Keep nutrition consequences as a role-bound consumer. |
| `app/Domain/Resources/ResourceSeason.php` | Shared labor allocation; production merges with national stocks; nutrition automatic planning | Retain useful allocation arithmetic, replace ownership-blind settlement. All produced stocks use common capacities, financing and owned inventory. |
| `app/Domain/EconomicSeason.php` | Abstract civilian income, tax avoidance, public budget, debt/default, infrastructure and reinvestment | Preserve supported fiscal/behavioral rules, replace overlapping income/reinvestment portions and reconcile expenses with counterparties. |
| `app/Services/Resources/ResourceLedger.php`, `app/Services/EconomyService.php` | Separate physical/fiscal forecasts and writes; fiscal inputs request a food preview | Replace separate authoritative resolution with one coordinated calculation. Keep service responsibilities as adapters where useful; do not introduce recursive economic/physical previews. |
| `app/Services/Policies/PolicyEffectRegistry.php` | Fixed infrastructure/agriculture program targets; ownership setting currently targets `secondary_industry` without a full ownership economy | Resolve supported production/development targets from the game catalogue. Remove superseded hardcoded agricultural effect plumbing at cutover. Do not relabel raw materials as secondary industry. |
| `app/Models/Nation.php`, `NationDetail.php`, `Game.php` | Nation resource settlement precedes fiscal settlement, then territorial/division upkeep and combat | Introduce explicit coordinated economic resolution at the existing turn transaction boundary. Preserve destination snapshots and rollback. |
| `app/Services/PlayerWorkspace.php`; client `GameHeader.js`, `planner.feature.js`, `EconomyPanel.js` | Shared catalogue-backed views and server previews | Extend existing workspace and components to the reviewed stock/production/acquisition distinctions. |

Important current behavior to retire: `ResourceSeason` adds output directly to the same stock from which government actions and population consumption draw. `NationDetail::getAvailableQuantity()` uses a forecast that can include next production. A new UI label alone cannot turn either into government-owned goods available now.

## 3. Generic contracts

### Definition data

Keep resource definitions and resource rules as the configuration authority. Proposed supported contracts cover:

| Contract | Configurable data | Engine responsibility |
| --- | --- | --- |
| Physical production | Geographic profile reference, labor productivity parameters | Compute feasible output from opening geography, capacity and shared workers. |
| Operating cost | Wage/cost parameters with explicit units and recipient categories | Reserve funding, pay only supported/fulfilled activity, report costs. No unaccounted cash sink. |
| Exchange | Pricing method and parameters | Quote consistently, settle funded deliveries, distinguish internal public transfer from sale. |
| Development | Capital cost, maximum seasonal expansion, infrastructure response, maintenance/decay parameters | Allocate actual investment to persistent capacity, capped by potential and execution constraints. |
| Demand | Population requirement or other supported demand driver; priority | Produce desired demand, then funded requests and fulfilled/unmet quantities. |
| Inventory | Stock kind and ownership | Preserve goods, commitments and cost basis without per-building or per-item entities. |

Exact rule names are engineering details. Handler code owns formulas and validation; catalogue values select supported behavior and coefficients. No arbitrary database formulas, script engine, generic dependency-graph executor or new framework.

Policy effects target catalogue resources, declared production groups or existing semantic roles. Resolve each target once against the current game's catalogue; reject missing, cross-game or incompatible targets. Do not add `ore_funding`, `oil_funding`, etc. as permanent schema columns or a new hardcoded switch for each good.

Display labels/icons/units remain definition data. A policy can be titled “Agricultural development” while using the same development handler as an extraction program. Nutrition's population effects are legitimate domain rules, not a reason for a second production engine.

### Genericity acceptance rule

An isolated test catalogue must add a synthetic seventh resource using existing handlers, map potential, costs and policies. It must participate in development, production, ownership, purchases, reports, UI and rollback without PHP/JS changes naming that resource. Also test renamed nutrition and a reduced catalogue with fewer optional goods.

Future transformed goods can add a validated input/recipe handler to the same pipeline. Future services may need a non-stock flow contract. Neither mechanism is implemented or advertised as already supported in this pass. Money and recruitment must never acquire mine-like production/stock behavior merely to fit one UI.

## 4. Proposed state and reporting boundaries

Table/field names below are drafts; responsibilities are the important decision.

| State | Scope | Proposed storage |
| --- | --- | --- |
| Productive capacity | Territory × resource × ownership × season | A small seasonal `territory_production_states` table. Store installed capacity/developed share and investment outcomes; no individual factories. Public/private shares must not independently claim the same land/potential. |
| Owned goods | Nation × resource × owner pool × season | Extend/replace `nation_resource_stockpiles` with explicit government/private-producer ownership. Treasury exists only in the government pool. Reconcile unique keys and all consumers at cutover. |
| Civilian cash | Nation × account type × season | Aggregate household and private-producer cash accounts. The existing treasury is its sole public balance, not a duplicated row here. Opening funds and permitted financing are explicit. |
| Acquisition plan | Nation × resource × planning season | Replace old extra-output bid semantics with a funded government request and priority. Keep worker allocations as derived allocation data. No old `minimum_productivity` purchasing adapter. |
| Income/cost/output facts | Nation/territory × resolved season | Compact reports with resource/owner/counterparty breakdowns, derived from settlement. Not an ever-growing record of individual workers or sales. |

Catalogue and policy definitions remain game-owned and are not copied each season. History copies changing state and resolved outcomes. Admin test edits can invalidate/recalculate derived views; they do not require historical definition versioning or old-save conversion.

Government stock is not supply available for sale. Private inventory is not government reserve. Current ownership and stock commitments are not forecasts. Store an aggregate cost basis for unsold private inventory if taxable realized profit depends on prior production costs; selling older stock must not count its entire receipt as new profit or deduct those costs twice. No per-lot inventory system is required.

Shared civilian/producer funds allow domestic investment across territories. Report wages/investment locally without inventing individual firms or international equity ownership. Geography remains immutable and non-seasonal. Territorial productive assets must survive capture as physical state; pooled national cash does not move or get recreated just because a territory changes hands. Exact public/private asset reassignment on capture is a required accounting fixture before cutover.

## 5. One authoritative seasonal calculation

Proposed boundary: a pure coordinated `ProductionEconomySeason` calculation fed by a persistence adapter. Names may change; there must be one result used by preview, turn settlement and reporting. `ResourceSeason` becomes the physical allocator within that calculation; fiscal calculations consume its settled flows rather than manufacturing unrelated earnings.

1. **Opening state:** capture territory ownership/geography, accounts, inventory, productive capacity, workforce, commitments and activated policy settings. Establish prices/assumptions for the season.
2. **Commitments and funding:** derive household demand, government reserve acquisition, military requirements, public operation and investment requests. Apply a documented fiscal order and account funding bounds. Commitments reserve funds/goods; they are not expenses twice.
3. **Feasible activity:** allocate one shared workforce among resource and residual civilian activity, under capacity, input and working-capital constraints. Determine actual quantities before charging final costs. Partial fulfillment releases unused commitments.
4. **Exchange and income:** transfer goods and payments between owners, settle wages and realized earnings, and record actual consumption. Public internal delivery is an inventory transfer with separately funded costs, not sales revenue.
5. **Fiscal close:** calculate taxable income once, transfer taxes, apply explicit loan/interest/default/repayment rules, and close treasury and civilian accounts. Report any financing outside the modeled domestic accounts rather than claiming global cash conservation while silently creating funds.
6. **Development and destination state:** use funded investment and fulfilled construction work to add next-season capacity. New capacity cannot produce again inside the same resolution. Persist next snapshots/reports together, then let demographic/military consumers use resolved fulfillment.

These are phases of one calculation, not nation-by-nation spending races or repeated production/tax loops. Package A must specify which funding/receipts are available in each phase and any bounded within-season settlement. Do not implement a naive phase order that prevents workers buying food every season while simultaneously assuming their wages fund those purchases.

For the first release, a catalogue-configured reference-price handler held constant through a season is the recommended bootstrap. It establishes paid exchange, not a finished supply/demand market. Keep the pricing boundary narrow so the tested aggregate market method can replace the handler later. Do not include international trade, auctions or transport networks in this delivery.

## 6. Income and nutrition are part of the cutover

### Income

Do not retain the current territory-wide earned-income formula unchanged and then add explicit mining/farming income. Account explicitly for the workers assigned to modeled activities. Reinterpret the remaining civilian economy as a bounded aggregate of other activity with identified customers, delivery and funds; it must not be a magic balancing receipt.

Resource sales, wages, profit and tax are different accounting views of related flows. Revenue is not all profit; taxes are transfers, not additional output. Household saving and producer retained earnings persist as funds. Public purchases have counterparties; infrastructure, military expenses and investment cannot remain disappearing cash once the plan claims accounting reconciliation.

The first accounting fixtures must therefore cover a continuing household/producer cycle as well as the one-off government ore purchase. Starting balances are initialization parameters, not funds replenished each turn. Underfunded actors must produce/consume less, use their own reserves, or obtain an explicitly supported transfer/loan. No implicit unlimited private credit.

### Food

Food is a produced/owned stock in the shared engine. The nutrition role generates civilian need and consumes actual fulfilled nutrition for the existing shortage/growth behavior. Preserve this semantic consumer and agricultural-potential map labeling.

Civilian food consumption and government food reserves become separate. The existing reserve policy generates a government reserve acquisition request; it must not quietly make all household purchases government expenses. Public reserve release, household affordability and emergency support require a clear first-pass rule, tested in Package A. Until that rule exists, the ownership cutover is not ready—leaving food on the old free-output path is not an acceptable shortcut.

Similarly, “raw materials” remains a geographically produced raw good, not manufactured engines. Do not invent new civilian demand for ore/oil/material merely to make every resource profitable. Unused goods may legitimately have no current demand; civilian input consumption is a later supported mechanism.

## 7. Development and ownership behavior

- Reuse one capacity-growth calculation for public investment and private reinvestment. Public funding debits treasury; private funding debits producer funds. National/private investment allocation follows configured opportunity, costs, infrastructure and risk; public allocation follows the chosen program priority.
- A public development program funds public assets in this first proposed model. Supporting private assets is a subsidy/grant mechanism with an explicit recipient, not the same expense silently counted again as private investment. Implement subsidies only if needed for the approved initial policy set; do not imply existing agriculture spending grants private ownership automatically.
- Growth is capped by remaining potential and seasonal construction/execution ability. Payment alone is not proof of completed construction. Private/public activity competes for the same workers and geographic potential.
- Separate current operating costs, upkeep and expansion. Zero expansion funding does not immediately delete existing assets. If upkeep/decay is introduced, use the same handler and configurable coefficients for all applicable producers.
- Ownership policy establishes institutional permissions/defaults; current private/public capacity is state. Changing a selector cannot instantly confiscate or duplicate existing capacity, inventory or cash. First implement explicit founding ownership for private/public/mixed fixtures. Live nationalization/privatization requires a transfer rule; do not ship a misleading editable ownership policy before it exists.
- A mixed economy uses both owner pools through the same logic. Allocation between private purchases and public delivery must have a declared deterministic rule and avoid double fulfillment. No special “mixed economy” calculation fork.

## 8. Player and client integration

Use the reviewed sketch as a layout/meaning guide, not a source of simulation formulas or new hardcoded resource rows.

| View | Authoritative fields needed |
| --- | --- |
| Header/resource disclosure | Government stock owned now, commitments, available now; separately dated last national production and optional forecast. Currency/capacity have kind-specific presentations. |
| Planner | Government requested quantity, source breakdown, quoted assumptions, funded/expected delivery, expense, shortfall reasons and closing reserve forecast. |
| Budget & Policies | Purchases, public operations, public development, taxes, external public sales, debt/financing and reconciled cash. Private investment is an economic indicator, not treasury expense. |
| Territory inspection/map layers | Natural potential, shared developed capacity, public/private allocation, workforce, actual output and limiting factors at their real territorial precision. |
| History/comparison | Last resolved actual; saved next-season plan; local draft forecast, all with explicit season/context. |

`GameDataService` remains the owner of confirmed data. `GameplayService` owns editable plans and command reconciliation. Existing policy and production drafts must be jointly included in a proposed forecast, so a budget preview cannot ignore an unsaved acquisition request or the planner ignore a funding change. Extend the current service draft boundary rather than creating a store per panel or calculating cash in JavaScript.

Previews use the backend engine without writes. Combined submission must validate policy and acquisition changes together and commit them under one context, avoiding an intermediate invalid plan between separate saves. Draft edits made during submission survive accepted older drafts. Stale reads, conflicts and unknown write outcomes retain the existing no-auto-retry behavior. Same-scope refresh preserves input/focus/panel identity.

No speculative receipts or undelivered goods are available for immediate orders. Recommended first boundary: government-owned, uncommitted opening stocks fund immediate military commitments; new acquisitions become usable after settlement. This intentionally replaces the current forecast-based stock availability and must be reviewed against Guard, deployment and ordinary orders before wiring it. If same-boundary deliveries are to fund future commands, use explicit conditional reservations/revalidation rather than silently displaying them as owned.

UI implementation should compose existing Panel, FieldShell/RangeField, Button, native controls, semantic tokens and catalogue assets. EN/FR and narrow layouts remain required. The example selector in the sketch is not a production control. No new resource editor, dashboard framework or global event bus.

## 9. Work packages and acceptance checkpoints

### A — Close the accounting contract with executable fixtures

**Completed 2026-09-29:** `ProductionAccounts` and the executable fixtures establish funded accounting, bounded phases, food purchases/reserve releases, delayed capacity, public/private/mixed ownership, four-season household circulation and deterministic replay. 264 checks pass. See the [selected timing, assumptions and limits](production-accounting-contract.md). This does not deliver automatic allocation, persistent game integration or a balanced starting economy.

First implementation task: a small pure engine contract/fixture suite in the repository, intended for the real engine, not another browser lab or discarded prototype. Write exact opening/closing ledgers for private, public and mixed production; household food; residual civilian activity; idle/unsold output; public reserves; investment; debt; and territory capture.

Resolve the recommendations marked in section 10 and record units, funding phase, counterparty and income treatment. Demonstrate at least three consecutive seasons without invented income or automatic cash replenishment. This package is not done with only the UI's ten-unit purchase example.

**Exit:** the flows reconcile; supply/working-capital shortages have explicit behavior; every expense/receipt has an owner; the proposed starting economy can operate. Stop dependent integration for a genuine design conflict, not for arbitrary coefficient tuning.

### B — Extend definitions and seasonal state

**Implemented 2026-09-29:** validated operating/exchange/development/founding rules, explicit owner inventories and cost basis, territorial capacity, civilian accounts, acquisition intent, catalogue-bound policy effects and explicit state seeding/copying. See [Package B storage and verification](production-state-contract.md). Live turn activation remains Package D; no save conversion or mirrored old/new resolution.

Extend registry validation/import/export/cloning; add generic capacities, owner inventory/cost basis, civilian accounts and acquisition state. Resolve policy targets through the catalogue. Define founding seeds, neutral territorial assets, lifecycle cleanup and rollback relationships.

**Exit:** private/public/mixed and synthetic additional-resource fixtures initialize without named-resource schema/code branches; templates remain independent of games. Migrations target fresh worlds and do not convert existing saves.

### C — Build the coordinated resolver and common development

**Implemented 2026-09-29:** `ProductionEconomySeason` coordinates funded physical work, owned exchange, civilian consumption, actual earned income/tax, fiscal closure, infrastructure and common public/private development. `ProductionEconomyInput` reads Package B snapshots without writes. See [Package C contract, provisional behavior and results](production-resolver-contract.md). Live activation remains Package D.

Implement the agreed phases using common allocation/quantity code, priced funded exchange, actual income/tax transfers, and next-season development. Integrate nutrition and all current produced stocks together; retain currency/recruitment handlers. Replace generic reinvestment and agricultural-only expansion where they overlap this mechanism.

**Exit:** input-identical preview and settlement agree; quantities/accounts reconcile; cross-resource labor and public/private funding cannot be spent twice; unfunded/unneeded production does not create revenue; additional-resource tests work unchanged.

### D — Wire turn lifecycle, actions and authoritative workspace

**Implemented 2026-09-29:** one live production/fiscal result, founding and seasonal ownership state, opening-stock commitments, grants and Guard accounting, passive seasons and replay, and atomic policy/acquisition drafts. See [the lifecycle contract and limits](production-lifecycle-contract.md).

Replace separate physical/fiscal writes with one resolved result. Reconcile accepted actions, military recurring cost, food consequences, grants, founding, territory capture, turn rollback and definition-edit invalidation. Update server payloads and shared draft/preview/combined-save contracts.

**Exit:** a fresh two-nation game with a passive participant passes repeated seasons and rollback/replay; owned availability, reports and funding agree; no old direct-to-government production path remains reachable.

### E — Deliver the reviewed player journey

**Delivered:** [presentation contract and verification](production-presentation-contract.md). Territorial income attribution remains deferred because profit is nationally pooled; inspection shows real capacity, output and workforce instead.

Adapt the resource bar, acquisition planner, Budget & Policies, and territory inspection in the current game. Show real engine results, partial fulfillment and constraints. Preserve current/saved/draft separation, routine-refresh editing, accessible controls, EN/FR and narrow layouts.

**Exit:** players can request goods, inspect costs and source ownership, change a development program, compare forecasts, queue choices, advance and inspect actuals. Test private/public/mixed examples without adding product controls that change institutional ownership for free.

### F — Remove superseded paths and release on fresh games

**Delivered:** [retirement results, retained tests and operator rollout](production-retirement-results.md). Live reset/deployment remains an operator action.

Delete old extra-production bid semantics, agriculture-specific growth plumbing, ownership-blind stocks/availability and overlapping income/reinvestment calculations. Update tests that encode retired behavior; keep useful invariants. No legacy switches, mirrored state writes or compatibility APIs. Keep passive AI pass-only.

**Exit:** source search and focused regression checks find no active bypass of the new pipeline. Update implementation results, current client docs and operator reset/migration instructions. Actual live reset/deployment is a separate operational action, not part of this planning request.

Packages are sequential where data/accounting dependencies require it. Shared UI shell work can proceed after its payload contract is fixed. Do not present a partially wired ownership selector as a playable completed feature.

## 10. Recommendations requiring an explicit contract, not a large questionnaire

Package A now selects reference-price settlement, opening working-capital limits with wages before household purchases, explicit limited public food support, opening ownership without live conversion, and opening-owned military commitments. The [accounting contract](production-accounting-contract.md) records exactly what those choices mean. They remain isolated from live gameplay until the later cutover; autonomous behavioral allocation and balancing still belong to Package C.

The developer should implement ordinary engineering details and coefficient defaults. These four semantic boundaries need a written decision in Package A because they change player behavior:

| Boundary | Recommended starting point | Why it cannot be guessed invisibly |
| --- | --- | --- |
| Price mechanism | Configured reference prices for the first integration; one replaceable pricing handler, no market-clearing claim | Determines profitability and acquisition affordability. |
| Household/civilian cycle | Aggregate household/producer accounts, bounded residual activity, explicit household food spending and public reserve support | Otherwise taxes and private investment still rest on money generated by formula. Exact timing/support rule must be worked through. |
| Ownership transition | Support opening public/private/mixed assets; defer live conversion until a transfer rule is defined | A percentage selector must not confiscate cash/assets or conjure a public sector. |
| Military acquisition timing | Commit immediate actions against government-owned stock; next settlement's acquisitions become available afterward | Changes the current planner's ability to make orders affordable from expected production. |

These are proposals, not retroactively frozen user decisions. Return only genuine gameplay conflicts to the user with a recommended answer; do not reopen catalogue storage, seasonal history, no-compatibility direction, or the already agreed ownership distinction.

## 11. Required verification and practical limits

- Conservation: inventory by owner; exact money transfers; explicit financing boundary; realized profit/cost basis; taxable income counted once; no same-season reinvestment recursion.
- Constraints: finite geographic/installed capacity; public/private share totals; one worker pool including other civilian activity; insufficient working capital/treasury/demand; partial delivery releases unpaid commitments; no artificial income from unsold stocks.
- Nutrition: household affordability and actual consumption, reserve targets/releases, production priority, shortages/demography, private/public/mixed sourcing, renamed nutrition key.
- Genericity: existing goods, synthetic additional good, reduced optional catalogue, game/template isolation, unsupported handler/target rejection, money/recruitment exclusions.
- History/lifecycle: full repeated seasons, rollback/replay, passive readiness, founding and capture, game deletion/reset, no per-season definition duplication.
- Client: current versus forecast ownership, consistent combined drafts across views, authoritative preview agreement, refresh persistence, conflicts/unknown outcomes/newer edits, EN/FR desktop and narrow layouts.
- Performance: load definitions/state in batches; no query per resource per territory. Work at territory × configured activity × owner scale, aggregate reports, bounded allocation passes. Use the user's 40×32 map case for a realistic measurement before rollout; it is not a promise of arbitrary-world performance.

No dynamic international market, trade routes, naval logistics, migration/city simulation, detailed firms/banks, recipes/services catalogue, deposit depletion or fine balancing is included. Extension points must be concrete and tested where used, not empty frameworks for all future features.

## 12. Planning verification

Source review covered resource catalogue/rules, geographic allocation, agriculture, fiscal income/reinvestment, physical/fiscal service ordering, policy effect targeting, turn lifecycle, shared workspace and client data/UI contracts. This document and linked planning entries are the only changes in this planning task. No new runtime tests or migration results are claimed.

Subsequent Package A verification is recorded separately in [the accounting contract](production-accounting-contract.md): pure PHP checks and syntax validation, with no DB/server/runtime wiring or migration.

Subsequent Package B verification is recorded in [the state contract](production-state-contract.md): isolated MariaDB schema/founding/policy-binding/snapshot/rollback/lifecycle checks plus existing resource, agriculture, fiscal and passive-player regressions. New production state is not yet wired to the live resolver.
