# Production/development Package A — executable accounting contract

2026-09-29. **Implemented as pure domain primitives and executable fixtures. Not connected to live game resolution.** This completes Package A of the [implementation plan](production-development-implementation-plan.md). [Package B storage](production-state-contract.md) and [Package C coordinated calculation](production-resolver-contract.md) are now implemented. Live lifecycle, UI and retirement remain Packages D–F.

## What exists

- `app/Domain/Economy/ProductionAccounts.php`: in-memory exact settlement, owned stocks and cost basis, funding limits, labor/capacity bounds, earned-income/tax transfers, construction, debt and territorial asset transfer. No database, Laravel bootstrap, individual firms, automatic market, UI or production-game imports.
- `tests/client/fixtures/production-accounting/scenarios.php`: explicit small seeds/coefficients. These are fixtures, not new game defaults or a second persisted resource catalogue.
- `tests/client/production-accounting.php`: assertions for worked examples, four successive household seasons, deterministic replay, failure/shortage cases and fractional variations. The caller supplies physical requests and supply order; these tests do not stand in for the future allocator.

Run without an application server or database:

```bash
php8.3 tests/client/production-accounting.php
php8.3 tests/client/production-accounting.php --report
```

The second command prints the actual scenario states and transfer events as JSON. It does not change the game. Reports/events are aggregate per activity/transaction, not per worker. Future persistence should retain compact seasonal reports rather than introduce an individual-sales database.

## Units and state

Cash, goods, costs and capacity are bounded six-decimal strings using the existing `Quantity` arithmetic. Floats never settle transfers. Affordability/worker limits round down; weighted-average inventory cost allocates down and the final withdrawal takes the exact remainder. No cash or inventory dust is discarded.

The fixture production contract uses units per worker-equivalent season, wages per output unit, and output units of installed seasonal capacity. This is **not** the existing engine's integer population/per-million productivity representation. Package B/C adapters must explicitly convert at the boundary, preserving integer worker limits and geographic constraints. Do not pass the fixture workforce unit directly into old labor-pool rows.

Definition input is supplied separately from snapshots. Snapshots contain accounts, owner/resource inventories, territory potential and owner capacities, and debt. They do not carry rule definitions. Opening seeds are supplied once; carrying a closing snapshot into another season does not replenish anyone's funds.

Domestic accounts are government, pooled private producers and pooled households. A finite lender is an explicit outside counterparty for debt examples. There is one treasury per domestic group, no public-enterprise duplicate cash wallet, and no implicit private credit. Resource operations reject currency/capacity kinds. Cross-border goods/wages are deliberately unsupported.

## Seasonal timing selected for this contract

Operations advance through bounded phases and cannot return to an earlier phase:

| Phase | Available operations/funding | Boundary |
| --- | --- | --- |
| 0 — opening funding | Explicit funded loan; debt service; public income support; cash/stock commitments; opening military goods | Plans cannot reserve cash/goods that do not exist. Debt eligibility/rates are decided by the future fiscal caller, not this accounting module. |
| 1 — work | Resource production and bounded residual civilian service work; gross wages with tax withheld | Operating budgets are captured from uncommitted cash on entry. Neither future sales nor newly withheld public taxes enlarge those budgets during work. All activities share territory labor. |
| 2 — exchange/consumption | Funded purchases, service delivery, household consumption, bounded public reserve releases | Workers can spend opening savings/support plus net wages already paid. Actual sales create receipts; they cannot restart production. Unfilled commitments release unspent cash. |
| 3 — distribution/development | Distribution of after-tax realized profit, funded construction using remaining labor | Producer profit-tax provisions cannot be spent. Construction pays real wages and adds next-season capacity; construction income is not recycled into a second same-season goods market. |
| 4 — close | Transfer provisioned business tax, expire remaining holds, reconcile state | Closing again is idempotent. New production, borrowing or consumption after close is rejected. |
| After close | Capture remaps physical territorial capacity to successor domestic pools | Neither national cash nor national inventories are recreated/transferred by capture. Reopen the returned snapshot to run another season. |

This deliberately adopts the plan's conservative military timing: opening commitments use owned opening goods. A new acquisition is usable for military commitments in the following planning season. These primitives do **not** change deployed Guard/deployment/order behavior; that change must be made coherently in Package D.

`reserve` protects an acquisition budget before work and `purchase` can consume that identified commitment atomically. Direct purchases are also supported for already-funded exchange (notably households); they are not a forecast authorization API. The future government planner must reserve the complete accepted plan under one fiscal context. Similarly, `reserveStock` protects strategic/other committed goods from ordinary sales. The caller may explicitly release a stock hold; a release limit alone cannot bypass a hold. Holds are seasonal commitments, not a second owned balance.

No automatic policy cooldown, nationalization or privatization has been added. The contract supports opening private/public/mixed assets; a future live ownership conversion needs an explicit transfer mechanism.

## Money, income and unsold output

Every paid amount debits a real account and credits a real recipient. A reserve/commitment is not an expense. Partial output pays only its actual operating wages; partial purchases pay only delivered quantities. Rejected multi-step operations restore their in-memory state, labor use, phase and event list.

Production pays wages and adds goods with their production cost to the producer's inventory. It creates no sale receipt. A sale removes the actual weighted-average cost of the delivered goods and recognizes revenue minus that cost as realized producer earnings. Wages already paid in an earlier season are not paid or counted again when older inventory sells.

Business tax applies once to net positive realized earnings across that producer's activities, including current residual-service expenses. Losses do not invent refunds; cross-season tax-loss carry-forward is outside this initial contract. Wages are taxed at payment. Profit distributions to households are transfers of already-taxed producer earnings, not another wage or second taxable profit. Opening working capital is not profit. Construction is capital spending, not a second deductible operating expense.

All examples use an illustrative common 20% rate, with additional 0%/100% tests. This selects an accounting basis, **not** final tax incidence/balance. The existing informal-income response is not reimplemented here; Package C must apply it to the supported taxable shares before transferring money rather than restoring the old independent income source.

### Ten units of ore

Each example starts with government cash 200, private cash 84, household cash 0 and an untouched lender account 1000. Private sale price is 10/unit; production wages are 6/unit. Private and public production use the same physical/cost rules.

| Scenario | Government cash closes | Private cash closes | Household cash closes | Government ore |
| --- | ---: | ---: | ---: | ---: |
| Buy 10 privately produced units | 120 | 116 | 48 | 10 |
| Publicly produce 10 units | 152 | 84 | 48 | 10 |
| Publicly produce 5, buy 5 private units | 136 | 100 | 48 | 10 |

Domestic cash totals 284 before and after each scenario. In the private case, 100 of sales splits into 60 wages and 40 profit, not 200 of income. Of those earnings, households retain 48 and producers retain 32 after tax; producer cash 116 includes the original 84 working funds. Public internal delivery has no invented sale receipt. Public sales to households are actual payments into the treasury and are tested separately.

This is not an ownership balance comparison. Overhead, civilian competition, different incentives, productive efficiency and market pricing are not modeled by these fixture coefficients.

### Household circulation over four seasons

The continuing fixture starts with government 200, producers 200 and households 80. In each season:

1. Government pays 24 of income support from its existing cash.
2. Producers fund 60 of food wages and 12 of residual-service wages; households receive 57.6 after 14.4 wage tax.
3. Households buy and consume 10 food units for 100 and two delivered service units for 20.
4. Producer realized profit is 48. Tax is 9.6; an explicit 38.4 distribution returns the after-tax profit to households.
5. Government ends at 200, producers at 200, households at 80. These balances become the next opening balances unchanged.

Four seasons and replay reproduce those accounts exactly without injecting money. Support and distribution are **explicit fixture instructions**, not automatic new welfare/dividend policies or a claim that every game should balance that way.

The opposing three-season fixture omits both transfers. Household savings diminish and nutrition becomes unaffordable despite remaining private food. That is deliberately visible; the code never restores household cash to hide an incomplete demand cycle. Automatic payout/reinvestment/support choices belong to Package C's configured behavioral rules and must be shown in the final game.

Residual civilian activity has installed capacity, shared workers, funded wages, a delivered quantity and a paying customer. It has no storable “services” resource. Unbought service work remains an expense and expires at close. Thus it cannot silently duplicate the same workers' modeled farming/mining income.

## Food and public reserves

`consumeDemand` is resource-generic: it uses owned available household stocks, tries the supplied ordered sellers at the configured reference price, optionally releases a bounded quantity of uncommitted public stocks for unmet need, then reports actual consumption and shortage. Nutrition is a role selected by the future caller, not a literal `food` condition in this module.

The contract's initial support rule is explicit: **public release only covers the remaining actual need, only from available public goods, and only up to the provided limit**. Default limit is zero. It does not confiscate private food or create a free purchase. Reserve acquisition itself is a government purchase; ordinary household purchases debit households. A protected strategic buffer requires an explicit hold release before distribution/sale.

Supply order is an explicit ordered input and is preserved for deterministic settlement, not chosen by hash iteration. This module does not decide market-wide rationing or how to reserve public saleable output versus emergency stocks. Package C must produce the same ordered, capped supply commitments for preview and settlement. Existing population/unrest code will consume the actual fulfillment result in Package D.

## Development, financing and territorial change

- Both public and private investment pay construction wages from the owner's funds, use remaining local worker time, and add only the unfilled geographic capacity. The small contract values construction at its wage cost, without a separate construction-company margin or materials recipe.
- Capacity used for current production is the opening capacity. The phase barrier also prevents selling, building and producing again in one loop.
- Pooled private funds can invest in a second domestic territory. This proves ownership/funding transfer, not an autonomous profitability/risk allocator. Choosing targets, preserving operating reserves, subsidies, asset upkeep/decay and seasonal expansion coefficients are Package C responsibilities.
- Borrowing transfers finite lender cash and increases the matching liability. Paid interest/principal go to the lender. Unpaid interest becomes explicit arrears; write-off reduces the claim but creates no cash. Existing fiscal rules must decide eligibility, episode limits and recovery later; the primitive accepts an explicit authorized relief amount.
- Capture is modeled after economic close. Physical public capacity maps to the successor government pool; physical private capacity stays private and maps to the successor domestic producer pool. Private assets are not nationalized. Both nations' pooled cash, inventories and debt stay where they were. This is an aggregate affiliation convention, not individual foreign shareholders, loot or occupation compensation. Capture-related unrest/damage are outside Package A.

## Validation and implementation boundary

264 checks pass, including 48 fractional/funding/tax combinations with three assertions each. Coverage includes the worked examples, four-season circulation, shrinking household funds, public/private food, protected reserves, zero working capital, shared labor, public/private potential overlap, sale/production phase barriers, tax provisions, delayed development, funded lending/arrears/relief, territorial transfer, current versus future military stock, deterministic replay and exact weighted-average cost exhaustion. Cash, owned goods, inventory cost and debt reconstruct independently from opening state and recorded flows.

All three added PHP files pass syntax checks. No database, server, game mutation, migration, UI or AI behavior was exercised or changed. No live-game, performance, market-equilibrium or gameplay-balance claim is made.

The synthetic additional-resource fixture uses the same code with a different resource identifier and a reduced single-resource definition. This proves generic **accounting** only. Package B/C/E must still demonstrate real catalogue import, policy targeting, persistent state, allocation and UI behavior for that additional resource.

Package A provides settlement primitives and executable contracts, not the final allocation engine. In particular, it does not generate production demand, choose investments, connect the existing policy registry, calculate world market prices, introduce recipes/services catalogue, port gameplay history into the new state, or amend the current database. Those are deliberately not hidden behind the passing test count.

## Handoff to Package B

1. Map explicit owner/cash/inventory/capacity identities into the existing game-owned resource and seasonal schema; keep definitions out of snapshots.
2. Preserve the exact units, cost-basis and phase boundaries above. Add validated reference-price/operating/development parameters through the existing registry; do not import this fixture catalogue into live games.
3. Seed household/producer operating funds and public/private asset shares explicitly once. Defaults require balance testing; no per-turn top-up or silent new cash on annexation.
4. Reuse these domain operations behind the future shared resolver. Replace the original income/reinvestment/ownership-blind stock path at the planned cutover, rather than running both.
5. Keep Package A's tests as regression contracts while extending shared policy/acquisition previews, nutrition allocation and actual persistent rollback in later packages.

Package C extends these primitives with validated local productivity and taxable shares, whole-worker accounting, bounded construction labor reservation, public payroll/works and post-tax debt repayment. Existing Package A fixtures still pass; see its [coordinated calculation contract](production-resolver-contract.md).
