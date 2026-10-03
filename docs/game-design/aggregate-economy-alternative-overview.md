# Aggregate economy — alternative overview

**2026-10-03 follow-up:** the [replacement implementation plan](indicator-economy-replacement-plan.md) records the user's subsequent direction after the indicator tests and shared-capacity/allocation discussion. The overview below is historical; its public/private accounting boundary is not the current proposal. Preparing the plan does not execute a live cutover.

Drafted 2026-09-29; status revised 2026-09-30. **Possibility only: the user has not selected a replacement.** Improving the current economy remains under consideration. No live calculations, database or game UI changed.

**Follow-up:** the [indicator-led alternative](indicator-economy-alternative.md) details the foundational indicators, public/private development paths, possible database changes, seasonal timing and conditional delivery gates. Its details refine this overview within the alternative only. Neither document authorizes replacement, cleanup or migration. UI design remains open for the user's later brief.

The objective is a country that develops through policies, with an understandable budget. Ordinary peaceful starting conditions should offer a sustainable path without adjusting infrastructure spending every season. Bad choices, shortages and war must still have consequences.

The [80-season experiment](economy-baseline-experiment.md) supports trying this direction. It does not prove live integration or final balance; peaceful countries accumulated generous reserves.

## What would change if selected

| Keep | Replace |
| --- | --- |
| Game-owned policy and resource catalogues, effects and conditions | Civilian household/producer cash accounts as the foundation of economic activity |
| Geography, territorial indicators and productive capacity | Taxable income calculated by adding detailed wages and realized profits |
| Physical goods, ownership, acquisition plans and military costs | Private affordability, inventory-profit accounting and UI explanations that depend on those accounts |
| Seasonal choices, forecasts, history and rollback | Superseded definitions, reports and tests at cutover; no parallel legacy engine |

Resource identity stays generic. Some resource **behavior parameters** will change or disappear; keeping the catalogue does not mean keeping every current formula.

## The proposed economic foundation

1. **Territories generate aggregate civilian income:** population × income per person, influenced by development and supported local conditions. National income is their sum. It is an economic measurement, not spendable government money.
2. **Taxes take a share of that income**, with avoidance and unrest affecting the result. Do not add a second wage/profit income stream on top.
3. **Goods remain physical and limited.** Configured demand, geography, capacity and available workers determine supply and shortages. Shortages feed back into conditions and development. Prices initially remain configured; international markets are outside this replacement.
4. **Private development uses an allocated share of after-tax income**, subject to opportunity and physical constraints. It does not require a persistent private wallet. Investment is not counted again as additional income.
5. **Government spending stays a real budget constraint.** Policies fund assessed needs; actual spending cannot exceed available funding. Infrastructure should move toward an assessed target, with repair/expansion demand falling as the target is reached and maintenance continuing. This taper is a new proposal, not something the experiment already proved.

Include the eight NO2 indicators plus unrest and informal activity in the foundation, with loyalty kept separately. Each gets a defined meaning and consumer; mechanisms are implemented progressively. Basic health, education, policing and welfare provision belong in the public/private development proof. Unemployment remains deferred.

## One accounting boundary to settle first

Before connecting this model to the game, write and test one small worked season covering **private production, public production and government purchases**.

Proposed boundary: private purchases cost the treasury and transfer existing goods; publicly owned output enters public inventory only after funded operating costs. Civilian consumption of public goods must have an explicit paid-sale or subsidy rule. Public receipts are separate from taxes; neither purchases nor public sales create a second national-income entry. Treasury transfers reconcile, while aggregate civilian income is not constrained by a simulated national stock of money.

This boundary needs an executable example before implementation proceeds. Public/private systems must not silently become identical, and public goods must not become free revenue or free stock. Preserve ownership behavior where consistent; replace its accounting dependency deliberately.

## Earlier player presentation study — not a settled design

The user has deferred layout decisions to a later UI brief. The following distinctions remain useful data requirements; the sketch and arrangement below are exploratory only.

Keep **Budget & Policies**, with policy choices beside the government budget on desktop and stacked on small screens. Three clearly labelled areas:

- **Country economy:** population, income, development and shortages. Show the cause of trouble, not household accounting tables.
- **Government budget:** taxes and other receipts, spending, seasonal balance, treasury and debt. Last actual / saved forecast / draft forecast remain distinct. Green receipts, red deficits and unmet needs; labels carry the same meaning.
- **Resources:** national production, civilian need and government-owned stock. Acquisition plans remain separate from national output.

Edits automatically create a draft; saving applies at the next season. Preserve focus and scroll. The UI reads server forecasts and never reimplements economic formulas. The conversation sketch uses illustrative values, not a live forecast. Its controls only explore presentation.

## Conditional implementation order and acceptance

1. **Prove the replacement calculation in isolation.** Settle the accounting boundary above, generic demand/development and infrastructure target/maintenance behavior. Reuse the geography fixtures; test equal founding populations, poor/rich land, growing population, taxes, underfunding, damage and military pressure over at least 80 seasons. Record limitations, not just passing checks.
2. **Make one fresh-game cutover.** Adapt `ProductionEconomySeason`, `EconomyService`, production persistence and action settlement together. Remove obsolete private accounts, account-dependent rules and dead code. Keep one authoritative resolver for forecasts and turns. No old-save conversion or compatibility bridge. Inspect reset scope before executing it.
3. **Adapt the existing UI.** Reuse `EconomyPanel`, the resource header, acquisition planner and retained comparison tables. Remove obsolete wage/profit/cash-account rows. Check saved/draft/actual distinctions, warnings, EN/FR, narrow layouts and input stability.
4. **Verify the playable loop.** Repeated passive seasons, acquisitions, deployment, capture and rollback/replay must reconcile. A configured extra resource must work without resource-name branches. Check both a viable peaceful start and explainable failure cases; do not guarantee solvency for every policy or map.

Implementation details would belong in those packages if this alternative were selected. The [production plan](production-development-implementation-plan.md) describes the currently implemented system, which remains the working baseline. Comparing ways to improve that system with this alternative comes before any replacement decision.
