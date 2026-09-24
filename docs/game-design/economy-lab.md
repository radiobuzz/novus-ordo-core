# Economy Lab — final copper-market experiment

Date: 2026-09-24.

Status: user-authorized browser experiment, extended with delayed private investment as the **final experiment on this exact theme**. Numerical rules remain hypotheses, not accepted V2 game mechanics. This closes the experiment's implementation scope; additional nations, resources or integration are not automatic next steps.

Open `/dev-panel/economy-lab`, also linked from Tools & experiments. The development-only shell permits guests. Simulation and exports run in memory with no game/API calls, database operations, browser storage or automatic saves. Reload discards the experiment.

Basis: [philosophical foundation](economy-and-policies-discussion.md), [simulation foundations](economy-simulation-foundations.md), and the earlier [two-country copper story](two-country-copper-example.md). That story's auction is historical reasoning, not this lab's posted-price algorithm.

## Try the final experiment

**Compare three stories** runs six independent 32-season simulations from the current control settings: stable demand, sustained military buildup and temporary military buildup, each with private investment off/on. The current interactive run is preserved. Each pair differs only in the investment switch; idling and market rules apply to both.

- Seasons 1–4 use the captured starting demand.
- At season 5, the buildup stories set Aurelia's military need to `max(40, 2 × starting need)` and military budget to `max(600, 2 × starting budget)`.
- The temporary story returns to its captured starting demand/budget at season 13. Already funded projects continue.
- The sustained story continues the buildup through season 32.
- Each run begins with the configured starting stocks, zero supplier cash and no projects. Current interactive inventory and funded projects are not copied.

Price charts, an outcome table and exact seasonal values make the pairs comparable. The outcome table's minimum price is measured in seasons 13–32, and its final price is the price actually paid in season 32, not the following quote. Comparisons retain their captured settings until explicitly rerun; later edits do not silently rewrite the evidence.

For a manual journey, advance a balanced season, choose **Military buildup**, advance a few seasons until projects appear, then choose **End military buildup** before they finish. This button sets need/budget to 20/200; unlike the automatic stories, it does not restore a custom pre-buildup value. Follow the completion schedule, inventories, production and price.

**Automatic private investment in Aurelia** stops new commitments when unchecked. Existing projects still finish, completed capacity survives and price-driven idling remains active. Reset to compare identical opening conditions.

Edits apply next season, except starting stock which requires **Reset run**. Base installed capacity is a manual laboratory override; it changes the base component only and does not remove privately built additions. **Restore baseline settings** restores controls while retaining stocks, built capacity, projects, earnings and history. **Reset run** clears all of those and starts with the current settings. Old captured comparisons remain available separately. Runs stop at 200 seasons.

**Export observations** downloads JSON version 2 containing current settings, every interactive report, projects, and any captured comparisons. Version 1 exports used `production` as a fixed supply setting; version 2 uses `capacity`. No import/replay UI or compatibility promise is needed for this in-memory lab.

## Economic boundary

- Two countries, aggregate copper and fractional units. Four seasons per year; deterministic rules. No individual firms or mines. Copper capacity represents extraction/processing together.
- Aurelia's supplier cash and investment belong to private producers. Borealis's receipts stay in a state enterprise account. Borealis retains manually configured full production, including at a loss; it is a controlled comparison, not a general claim about public enterprises.
- Civilian purchases share a budget, with operations funded before optional civilian expansion. Military purchases have a separate budget. Neither can spend the other's money.
- One common posted copper price for domestic and international sales. Domestic funded requests are served before surplus exports in both countries. This strong assumption is visible and provisional, not a chosen universal rule for capitalist trade.
- Export caps limit surplus offers. Unsold inventory carries forward. Imports are consumed, not re-exported. Deposits and transport are not modeled.
- Buyer budgets renew from outside the model each season. Unspent purchasing money returns outside; supplier cash carries forward. Operating finance covers cash shortfalls explicitly but is not earned income.
- Private copper investment is distinct from the existing **Civilian expansion** copper request. That request still represents other development demand and does not automatically build mines. Mine construction is an abstract cash purchase from outside the model; no second set of copper/material inputs is invented.
- No taxes, household income loop, employment, currencies, tariffs, construction materials, debt repayment, permanent closures, maintenance of idle capacity, deterioration, storage cost/capacity or resource depletion.

## Production and private investment

A country's installed capacity consists of its manual base plus completed private additions. Funded projects mature at the start of their scheduled season, before production.

Aurelia produces at installed capacity if the posted price covers its variable unit cost; otherwise its whole homogeneous capacity becomes idle. Inventory remains saleable while idle. Capacity is not destroyed and can restart when price covers cost. This binary response is deliberately simple and can create oscillations. Borealis always produces at its manual capacity.

Production costs equal actual output × unit cost. Opening supplier cash pays these costs first; external finance covers any shortfall. Buyers' payments then become supplier receipts. A season's **operating cash surplus** is receipts minus current production costs. This is not full accrual profit: copper inventory is expensed when produced, and selling older stock later affects this cash measure.

Private investment is evaluated after settlement:

1. Record operating cash surplus / installed capacity (zero if capacity is zero). Keep up to 12 observations.
2. Wait until the configured observation window is complete. Its average must exceed the configured threshold, and current price must exceed variable cost.
3. Keep a working reserve equal to installed capacity × current unit cost × reserve seasons.
4. Eligible investment cash is the lesser of cash above that reserve and positive cumulative operating surplus minus all past construction spending. External financing never increases this earnings ledger. Cumulative losses must be recovered before new positive earnings become eligible. This ledger is a claim on existing cash, not additional money.
5. Spend the configured fraction of eligible cash. Money immediately leaves the model for construction. New capacity equals spending / cost per capacity unit.
6. Record the project's quantity, actual spending, commitment season and completion season. A project funded after season N with delay 4 opens at the start of N+4. Subsequent edits to delay/cost or the investment switch cannot change that funded contract.

Defaults: investment enabled, 3 observed seasons, 4-season delay, cost 25 per unit of seasonal capacity, 35% of eligible cash invested, required recent unit margin 4.5, and a 2-season operating reserve. All are adjustable hypotheses. With baseline price 10 and Aurelia cost 6, its unit margin of 4 does not meet the threshold, so stable baseline demand does not trigger expansion.

Investors do **not** forecast future aggregate supply or subtract other projects under construction from their expectations. This deliberate limitation allows profitable seasons to trigger overlapping commitments. Excess capacity and a price fall may result; a crash is not inserted as an event or guaranteed for every parameter set.

## Seasonal trade and price rules

1. Complete due projects, decide actual production, record its costs and necessary outside financing.
2. Introduce the configured civilian and military purchasing budgets from outside the model.
3. Use the already-posted price (base price for the first season). Civilian operations reserve their budget first. Expansion wanted is `desired expansion × min(1, base / price)`, then limited by the remaining civilian budget. Military requests are limited by their own budget. Reserved but unspent operating funds are not reassigned to expansion this season.
4. Allocate domestic copper proportionally to funded requests, or military-first with remaining civilian requests proportional. Offer only the surplus, subject to export caps, to the other country's remaining requests under the same rule.
5. Settle all delivered units at the common price. Carry unsold stocks, return unused purchasing budgets outside, and evaluate private investment from earned cash.
6. Funded demand and accessible supply determine the next quote. Accessible supply includes unsold export-eligible units and excludes surplus withheld by export caps.

```
pressure = (funded demand − accessible supply) / max(funded demand, accessible supply)
           or 0 if both are zero
price target = base × clamp(1 + sensitivity × pressure, 0.25, 3)
next quote = target limited to current quote ± maximum seasonal percentage change
```

Default sensitivity is 1 and maximum change 20%. These bounds are authored balancing choices. Unaffordable wishes do not push the quote up, so unmet desired activity can coexist with falling prices. Separate desired / price-responsive / funded / delivered columns expose the difference.

## Accounting

Every season checks these identities before committing:

- National copper: opening stock + production + imports = consumption + exports + closing stock.
- World copper: opening stock + production = consumption + closing stock.
- Buyers' payments = suppliers' receipts.
- Money: opening supplier cash + external buyer budgets + external operating finance = closing supplier cash + operating expenses + construction expenditure + unused buyer budgets returned outside.

Supplier balances explicitly deduct investment. Project capacity is not copper inventory and cannot be sold or consumed. Floating-point units are retained internally and rounded for display. Conservation errors above tolerance stop resolution.

Default first season remains 100 copper produced/consumed, 20 exported from Borealis to Aurelia, and price 10. Buyers pay 1,000; private suppliers receive 400 and the state enterprise 600. Production expenses of 240 + 300 initially require 540 outside finance. No investment occurs while the observation window is incomplete.

## Observations from the final default comparison

These are outputs of the current rules, not real-world forecasts or game balance targets. Money and copper reconcile in all six runs.

| Story | Investment | Lowest paid price, seasons 13–32 | Paid price in season 32 | Aurelia capacity added | Construction spending | Idle seasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Stable demand | Off | 10.00 | 10.00 | 0 | 0 | 0 |
| Stable demand | On | 10.00 | 10.00 | 0 | 0 | 0 |
| Sustained buildup | Off | 11.37 | 11.37 | 0 | 0 | 0 |
| Sustained buildup | On | 5.78 | 7.40 | 62.09 | 1,552.36 | 4 |
| Temporary buildup | Off | 9.24 | 10.00 | 0 | 0 | 0 |
| Temporary buildup | On | 4.94 | 7.11 | 62.09 | 1,552.36 | 9 |

What this establishes:

- Funded private investment can add delayed supply and alter trade/prices without simulating individual companies.
- The default stable scenario does not continually build unnecessary capacity. Raising the margin threshold high enough also prevents investment in the buildup stories; collapse is not hardcoded.
- The default buildup response is aggressive: delayed projects overbuild even when military demand remains elevated. This is evidence about these coefficients and expectations, not evidence that all sustained demand booms should crash.
- The temporary story leaves projects running after military demand recedes and produces a deeper oversupply episode with investment enabled.
- Prices also briefly fall in the temporary story without investment, due to inventory/market adjustment. The paired comparison prevents attributing every price movement to construction.
- The later series oscillates because homogeneous private capacity stops/restarts against a lagged quote, while Borealis keeps producing. This lab has not established a realistic stable long-run cycle. Plot behavior must be interpreted alongside that simplification.

Conclusion of this experiment: the investment → delay → supply → price loop is viable at aggregate scale, with visible accounting and explainable decisions. Behavioral calibration, more gradual utilization, public investment, multi-input construction and a closed income loop belong to future design evaluation, not further automatic expansion of this theme's lab.

## Sources, implementation and verification

Research background: [Victoria 3's original national-market design](https://steamcommunity.com/games/529340/announcements/detail/2977428247147753127), [Offworld Trading Company designer notes](https://www.designer-notes.com/otc-designer-notes-2-free-markets/), and [Doran and Parberry's adaptive-trader paper](https://ianparberry.com/pubs/econ.pdf). This lab does not reproduce any of their complete economies.

- Pure seasonal model and controlled comparisons: `resources/js/economy-lab/model.js`.
- Feature composition, native controls, localized reports and SVG/table charts: `resources/js/economy-lab/main.js`, `economy-lab.scss`. Existing Button, Panel, FieldShell, Scope and semantic tokens; no new dependency or shared control contract.
- Development shell: `resources/views/dev/economy-lab.blade.php`; discovery/entry remain in the existing route, Tools and Vite configuration.
- Model verification: `node --test tests/client/economy-lab.test.js`. Reference arithmetic; budget/resource conservation across 200 deterministic shock seasons; priority, stock carry, reverse trade and zero cases; earned-cash-only investment; construction maturity and immutable project terms; off-switch behavior; idling/restart; isolated paired stories; invalid date/cost rejection.
- Browser verification: `npm run test:client:browser -- economy-lab.spec.js`. No fetch/XHR, scenario controls, reports/history, versioned exports, input validation, reset, comparison isolation, funded-project completion after switching off, EN/FR and narrow layout.
- Standard production build and formatting apply. Physical-device/non-Chromium behavior and real macroeconomic calibration remain unverified.
