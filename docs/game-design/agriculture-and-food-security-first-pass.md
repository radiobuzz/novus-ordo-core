# Agriculture and food security — first playable pass

**Historical first-pass record.** The coordinated production economy now replaces the old allocation/income calculation. Retired calculators, bids/facilities and placeholder effects have been removed; use the [current runtime](production-lifecycle-contract.md) and [Package F cleanup/results](production-retirement-results.md). Earlier file names and verification counts below describe that earlier checkpoint.

2026-09-29. Implements the agreed small policy family using existing policy definitions, territorial seasonal state, resource allocation and Budget & Policies. Balance coefficients are provisional. New games receive the updated default catalogue; existing games are not converted. No new tables or migrations.

## Policies

| Policy | Choices | Default |
| --- | --- | --- |
| Agricultural development funding | 0–100% of feasible development cost | 50% |
| Agricultural investment priority | Productive potential / Regional development / Population needs | Productive potential |
| Food reserve target | Current needs / half a season / one season / two seasons of civilian consumption | Half a season |

Definitions are copied once into each game's ruleset. Pending national choices activate at the seasonal boundary. The updated default template has a distinct name so new games do not reuse the earlier three-policy template. Explicitly chosen templates retain their own content.

## Potential, development, production

- Map resource profiles and microcell aggregates provide natural agricultural output potential. No food deposits are introduced.
- Territorial `economy_state.agriculture` records the developed share, bounded from zero to one. Homeland starts at 65%; neutral land at 25%. These are initialization coefficients, not historical simulation.
- Developed potential limits the existing food-producing facility. Actual output still requires workers and shares the territorial labor pool with other goods. A low population does not artificially reduce geographic potential before the developed share is applied.
- Public development increases that share. Zero funding makes no new public contribution and does not erase existing farms. This first pass does not add agricultural depreciation, private farm investment, material inputs, individual farms or changing land cover.
- Food identity follows the resource catalogue's `nutrition` role. Renaming the resource does not change behavior. A catalogue without a nutrition producer can consume stocks but cannot develop domestic output.

## Seasonal development

Feasible share increase is `min(remaining potential, 0.02 × (0.5 + 0.5 × opening infrastructure))`. Cost is population in millions × feasible share increase × 100 credits. Unsuitable or unpopulated territory has no eligible development request. These parameters live in game economic rules.

Funding chooses a share of the summed feasible cost. Payment follows interest, military and infrastructure, and precedes reserve retention/debt repayment. Agricultural expenditure participates in borrowing, fiscal balance, credit recovery and shortfall warnings.

Paid funds use capped proportional allocation. Productive potential weights by natural output potential; regional development by population × undeveloped share; population needs by population. Overflow is redistributed to other eligible territories. At full funding, priorities can produce identical outcomes because all feasible improvements are funded. This is expected.

Improvements enter the destination territorial snapshot and support the following season's production. They cannot produce food or collect extra taxes recursively in the season that pays for them.

## Automatic food planning

The nutrition resource no longer accepts manual extra-output bids. The production planner shows its automatically calculated result and points to Budget & Policies for the reserve target. Other goods retain their existing manual production controls.

1. Add civilian consumption and military food upkeep; include committed command requirements.
2. Use opening stocks when calculating the required production request.
3. Ask for additional production to reach the selected closing reserve target.
4. Allocate current needs before reserve accumulation. Reserves use the existing extra-output priority and compete for remaining labor.
5. Settle accepted command costs, then civilian consumption, then military upkeep, retaining remaining food as closing stock.

A target is a request, not guaranteed production. Lowering it does not destroy stored food. No imports, prices, purchases, storage limit or spoilage are introduced here. National food availability is pooled; there are no local transport bottlenecks.

## Shortages

Civilian shortage is the unmet fraction of normal civilian demand. It adds up to 0.4 to the unrest target, under the existing gradual unrest response. Food supply modifies normal population growth with `1 − 3 × shortage`: full consumption gives ordinary 1% seasonal growth; one-third unmet halts growth; total shortage gives 2% decline. These coefficients are experimental. Existing population ceilings still apply.

Stockpiles do not grant extra population growth. They protect consumption when production falls short. Military food upkeep is counted separately; further military consequences for unmet non-cash upkeep remain future work.

## Forecast, history and interface

Policy previews run the same physical allocation and fiscal calculation as settlement with the proposed settings. Saved pending choices drive the production planner and action-affordability checks. Population resolution reads the settled food report, avoiding a second changed-context harvest calculation.

Budget & Policies adds agricultural requested/paid expenditure, a food-security comparison (last actual / saved estimate / draft estimate), shortage warnings and a developed-agriculture column in territorial conditions. Food estimates hold opening population, workforce, geography and ownership constant; fiscal sensitivity ranges retain the existing ±5% income assumption. Food is not assigned invented statistical confidence intervals.

Ordinary snapshots carry agricultural shares, food reports, stocks and population. Rollback restores them and reopens pending choices. Definition edits remain game-level test edits, not per-season copies.

## Verification

Executed against an isolated temporary MariaDB database; no live games were changed:

- 38 agriculture checks: geographic/developed/workforce bounds, automatic reserves, stock buffering, civilian plus military demand, renamed nutrition role, investment priorities, zero/full capacity funding, exact cash accounting, matching previews, three resolved seasons and rollback/replay.
- 42 seasonal economy, 41 resource foundation and 43 passive-player checks passed.
- Real PHP/Chromium journey passed agricultural funding/priority/reserve editing, preview, retained drafts through refresh, save versus current choices, automatic food planner display, EN/FR and desktop/narrow layouts. Three fixture-browser regression journeys passed retained panel/input identity, production refresh and turn changes.
- Production build, client PHP contracts, focused production/gameplay Node files, geographic production check and PHP syntax checks passed.

Starting food sufficiency, reserve competition, development costs and shortage severity still need player balance testing. No claims of large-world performance or real-device certification are made.
