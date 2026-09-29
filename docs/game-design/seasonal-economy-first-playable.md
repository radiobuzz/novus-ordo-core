# Seasonal economy — first playable foundation

**Historical first-pass record.** The coordinated production economy now replaces the old allocation/income calculation. Retired calculators, bids/facilities and placeholder effects have been removed; use the [current runtime](production-lifecycle-contract.md) and [Package F cleanup/results](production-retirement-results.md). Earlier file names and verification counts below describe that earlier checkpoint.

**2026-09-29 extension:** [Agriculture and food security](agriculture-and-food-security-first-pass.md) adds three active policies, agricultural spending, developed capacity and physical consumption consequences. The original three-policy scope below is historical.

2026-09-28. Implementation of the agreed first economic loop. New games use it by default. Old saves are not an acceptance target and should be replaced with a fresh game for playtesting. This supersedes the earlier proposal to attach the experiment to game 9.

## Scope and model

The player governs through national policies. The starter catalogue contains income tax, infrastructure funding and infrastructure investment priority. Definitions remain game-owned copies of a template; seasons copy national selections, not definitions. The catalogue is data-driven, and supported effects are registered in code. The existing industrial-ownership configuration examples do not acquire fictional economic effects.

Money comes from taxing aggregate civilian income. It is no longer produced by assigning labor to Capital. Food, recruitment, materials, ore and oil retain their existing mechanics during this first economic pass. Government treasury is the only spendable cash balance. Civilian income, consumption, investment and retained income are aggregate seasonal flows, with ordinary domestic settlement assumed. This is not a simulation of banking, private cash accounts, resource markets or trade.

Each land territory stores productive capacity, infrastructure, unrest and informal activity in its existing seasonal detail. The first income formula uses population, usable land, capacity, infrastructure and unrest. Home territories start more developed than neutral territory. Water does not generate civilian income. Informal income supports consumption and investment but is untaxed. Evasion rises within the season of a tax increase; recovery of compliance after reductions is deliberately slower.

National figures are derived from local conditions: total civilian income, income after tax per person, infrastructure, unrest and the informal share. Infrastructure and unrest use population weighting (infrastructure's first proxy for the footprint served); informal activity uses income weighting. The UI scales per-person income to credits per million people to avoid rounding tiny values to zero. This is presentation scaling, not an additional indicator.

## Resolution and history

1. Activate every nation's saved pending package.
2. Use opening territory conditions to compute income and same-season avoidance, then collect tax.
3. Deduct already-committed cash costs for deployments/orders. These commitments cannot draw future taxes or loans when submitted.
4. Assess infrastructure maintenance and bounded feasible improvements. The funding percentage is a fraction of that requirement, not a fraction of tax revenue.
5. Borrow only to cover the remaining seasonal request, within credit based on the previous four realized receipts. Founding initializes the history from the founding policy's estimated receipt level.
6. Pay interest, military and infrastructure, in that order. Pay infrastructure maintenance before distributing improvements. Regional development, population and economic concentration provide three allocation weights; capped allocations redistribute unused shares.
7. Capitalize unpaid interest. A new default episode grants one partial restructuring and restricts credit. Further missed payments in the same episode do not grant repeated debt relief. Recovery needs an expired restriction, fully funded obligations, a sustainable seasonal budget and debt within the credit limit.
8. Retain affordable treasury reserve, then repay principal. Underfunded military divisions face proportional desertion risk; inactive deserters cannot move, attack or renew guard orders. Source orders remain in history for rollback.
9. Apply local reinvestment, infrastructure improvement/decay and unrest evolution. New capacity benefits later income, not a second recursive tax pass this season.

Nation state and the resolved ledger live in `nation_details`; territorial state lives in `territory_details`. Ordinary snapshot rollback restores these along with other gameplay state and reopens prior pending choices. Definition edits remain game-level test edits and are not rolled back. Stochastic desertion is not promised to replay identically.

## Balance assumptions

`EconomicSeason::defaults()` supplies initial experimental coefficients; each new game stores its own copy in `games.economy_rules`. These are starting points for playtesting, not settled balance. Initial examples include 1.5% seasonal interest, credit equal to three times recent receipts, a 20-credit target reserve, and up to two infrastructure percentage points of improvements per season. Native existing military costs remain the scale reference. There is no detailed employment system, migration, pollution, inequality, secession or ownership-specific industrial investment yet.

## Player interface

Budget and Policies share one desktop workspace; narrow screens stack them. Policy controls automatically update an unsaved draft. One review/save operation replaces the pending package for next season, independently of Ready. Routine same-context refreshes retain inputs/drafts; a changed turn or definition counter establishes a new editing context. A conflicting external change requires discarding/reviewing the draft rather than silently overwriting the new saved choices.

The budget retains last season's actual ledger and compares the next season under saved choices with the draft estimate. The five national indicators show current conditions, next-season estimates and the draft's difference from the saved forecast. Territorial conditions remain inspectable. Effects that lack an implemented economic consumer are explicitly identified.

Previews and resolution call the same pure model. The displayed ranges run a ±5% civilian-income sensitivity scenario; they are not statistical confidence intervals. Ownership, geography and planned military commitments are held constant, so unexpected conquest, losses and other players' actions are outside the forecast.

The money header shows currently available treasury and seasonal balance, with early financial warnings and a Budget & Policies link. Production planning remains separately accessible for the retained resources; its automatic labor-produced-money forecast is removed.

## Resource follow-up audit — 2026-09-28

The [resource-system audit](resource-system-audit.md) records the accepted replacement direction: game-owned definitions used throughout the game, current resources first, and removal of the old resource/money paths without old-save compatibility. It also identifies incomplete cleanup in this first pass: the PHP forecast used by AI still applies the legacy Capital fallback, general resource budget fields retain old money semantics, and planner help still describes labor-produced money. The audit includes a pure calculation reproducing the forecast issue. These findings are not fixes; the earlier verification remains scoped to its tested paths.

## Code and verification entry points

- `app/Domain/EconomicSeason.php`: pure local/national season calculation and accounting.
- `app/Services/EconomyService.php`: new-game initialization, model inputs, read-only forecast, persistence and desertion.
- `database/policy-templates/economy.json`: starter DB catalogue.
- `resources/js/client/features/gameplay/EconomyPanel.js`: persistent native controls and budget/outlook composition.
- `tests/client/economy-season.php`: guarded disposable-database resolution/rollback checks and pure accounting cases.
- `tests/client/economy-browser.mjs`: real browser editing, preview, save, refresh and layout journey.

Use the existing `NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-...` guarded database/bootstrap for verification. Never point mutation checks at a running player's game. Apply only the additive seasonal-economy migration to the development application; start a new game after deployment.

Verification on 2026-09-28: 40 guarded disposable-database checks passed, including the pure ledgers, new-game defaults, preview purity, pending activation, rollback/retry, default and desertion. Twelve GameplayService tests and targeted client regressions passed. Real Chromium verified editing, approximate previews, pending saves, current-policy separation, input identity through refresh, invalid input/discard retained production-planner access, and EN/FR desktop/narrow layouts. The generated client, PHP contracts/syntax and production build passed. The development migration is applied; create a new game for player testing. No live player's game was mutated by tests.
