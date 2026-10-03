# Production/development Package D — live integration

> Historical implementation, superseded on 2026-10-03 by the [indicator economy replacement](indicator-economy-replacement-results.md). Wallets, wage/profit accounting and split capacity described below are not current runtime contracts.

2026-09-29. The coordinated production economy is now the live runtime for **fresh games**. Packages A–C supplied the accounting, storage and resolver; this package connects them to founding, turns, actions and the existing player workspace. The [fuller presentation is delivered in Package E](production-presentation-contract.md); [Package F retires obsolete source/schema/tests](production-retirement-results.md).

## Runtime and history

`EconomyService` adapts current owned stocks, civilian accounts, territorial capacities/conditions, labor, policies and acquisition intent into `ProductionEconomySeason`. Both previews and settlement call that calculation. `ResourceLedger` now supplies action costs, opening availability, validated acquisition plans and read-only resource projections. It does not run the retired `ResourceSeason`, write production bids or independently settle goods.

Game creation seeds neutral capacities. Nation founding develops the core and seeds civilian cash and private inventory exactly once. Existing government starting goods remain explicit founding assets. Residual civilian activity has explicit territorial ownership/capacity, preserved in territorial economic state; the initial foundation uses privately owned residual activity. It is not converted when an investment permission changes.

Each seasonal transaction prepares policies, copies changing economic state once, resolves each nation, writes closing inventories with cost basis/civilian cash/capacity, then applies demographic and territorial conditions to destination snapshots. Compact national/resource reports are saved; the diagnostic transaction event list is not stored. Definitions are never copied per season.

The external lender is a finite national financing counterparty, seeded once at a provisional 1,000,000 credits. Its remaining cash, outstanding debt and fiscal episode state persist with the national season. The credit ceiling still depends on actual recurring receipts; there is no fabricated founding income history. Production coefficients, treasury reserve and fiscal behavior live in the game's economy-rules JSON. This is an explicit aggregate financing boundary, not a private banking system.

Capture changes who operates territorial assets next season. It does not recreate capacity, transfer another country's pooled inventory/cash, or repeat founding subsidies. Rollback deletes destination state through existing seasonal relationships; replay restores the same economic inputs. Desertion uses a stable game/nation/season/unit-ordinal draw, including recreated deployments. Combat itself remains the existing randomized system.

## Actions and transfers

Immediate deployments/orders are checked against opening **government-owned** goods and cash after accepted commitments. Recruitment remains non-stored capacity. Forecast national production and intended purchases cannot make an immediate action affordable.

Accepted physical commitments consume government inventory with carried cost basis. Deployment/operation cash is modeled as military service wages, reaching households and participating in ordinary wage tax. Recurring military goods and payroll can be underfunded; the worst fulfillment ratio determines desertion risk. Nutrition consequences use actual civilian fulfillment, not stock accumulation.

Grants transfer only government-owned goods/cash after accepted commitments. Goods transfer their proportional carried basis; private inventory and future output are unavailable. Recurring upkeep is a future competing need, not an irrevocable grant hold.

Reactive Guard payments occur after the planned economy: cash uses the same wage/tax accounting primitives, goods consume their carried basis, and saved closing reports are adjusted. A forecast cannot predict future enemy attacks; its planned result is therefore conditional on those events. Extra response receipts remain in treasury until the next ordinary fiscal close.

## Policies and acquisition intent

The new default policy template retains income tax, infrastructure funding/priority and food reserve targets. Agricultural development now uses generic resource-bound development/priority effects through `role:nutrition`. Two explicit supported choices complete the connection:

- Emergency food release authorizes government reserves to cover unmet civilian consumption after ordinary purchases; it does not give every household free goods automatically.
- New productive investment permits public, private or both developing pools. Existing assets and inventory keep their owners. This is deliberately not a nationalization/privatization command.

The generic registry supports other resource development programs; this package does not automatically add a separate policy for every good. Authoring and balancing remain later work.

Acquisitions store requested quantity, spending limit and priority, never a prepaid expense. Food reserve policy can request additional acquisitions with its own assessed funding requirement; the planner explains that policy participation. Deliveries may be partial and become usable after settlement. Public delivery is an internal allocation; private purchases pay producers. Government stock is distinct from national production.

## Shared workspace and client

The workspace derives budget, production and fiscal views from one resolved result. Action availability uses the much cheaper opening-stock check. Projections read only the nation's economic rows and owned territories. Old allocation invalidation hooks and per-season labor-facility creation are disconnected; no second allocation is persisted.

Both existing editing surfaces submit one complete package: policy choices plus acquisitions. The existing policy/production endpoints share the authoritative policy service transaction, required turn/revision/resource and policy counters, and validation. A rejected acquisition cannot leave policy choices partially saved. There is no alternative bid payload.

GameplayService remains draft/command owner and GameDataService remains confirmed-data owner. A shared draft-change signal invalidates both estimates; either save includes both drafts. Responses are fenced against changed economic edits and definitions. Accepted cleanup preserves newer edits, rejected/uncertain commands retain drafts, and mutations are never automatically retried. Conflicting policy drafts block a combined submission before acquiring the client busy gate.

The existing planner uses requested quantity/spending limit; saved priority is preserved in the payload (priority editing is delivered in Package E). The header separates national output from government reserves. Budget rows now show actual wages, sales, operations, purchases and development rather than the old abstract income formula. Forecasts are conditional point estimates; the retired arbitrary ±5% income bands are removed. Income layers without supported territorial earned-income attribution are hidden instead of displaying invented local income.

## Verification

- Pure accounting: 264 checks; coordinated resolver: 349 checks.
- Generic persistence: 3,687 checks, including renamed nutrition, synthetic resources, ownership pools, cost basis, definition isolation, history and rollback.
- Live integration: fresh passive participants, three seasons and replay; exact saved-versus-preview quantities and reports; combined-save rollback, public grants with basis, neutral annexation, and no seasonal definition copies. The final suite has 85 checks, including actual deployment commitments and reactive Guard cash, wages, tax and goods reconciliation.
- Real Chromium journey against a disposable MariaDB game: combined policy/acquisition preview and save, exact decimals, retained inputs across refresh, stale definition rejection, invalid input, French and narrow layout.
- All 274 client regression tests, generated API/route contracts and the production build pass. No application-game reset or live DB migration is performed.

## Remaining work

Package E now delivers acquisitions/budget presentation, source ownership, observed constraints, priority editing and territorial production inspection. Territorial earned-income attribution remains deferred because profits are nationally pooled. Reference prices and provisional coefficients still need playtesting. Do not present this as market clearing, international trade, physical transport, company simulation or ownership conversion.

Package F has removed the unreachable calculators, bid/facility models and placeholder effects, added the retirement migration and moved useful tests to the coordinated runtime. See the [cleanup and operator instructions](production-retirement-results.md). No compatibility layer or old-save conversion is provided.

Use a fresh game. Package D introduces no additional migration beyond Package B's production-state migration. Previously created worlds are not upgraded or reseeded by this code.
