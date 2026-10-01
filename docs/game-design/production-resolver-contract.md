# Production/development Package C — coordinated seasonal resolver

2026-09-29. Implemented as a pure calculation, using the [Package A accounts](production-accounting-contract.md) and [Package B configuration/state](production-state-contract.md). **Package D now connects this calculation to fresh-game turns and the client; see [the lifecycle contract](production-lifecycle-contract.md).** No migration or application-database mutation is needed for this package.

## One calculation and one result

`ProductionEconomySeason::resolve(resources, opening, plan, rules)` returns closing state, resource deliveries/shortages, labor use, financial reports and aggregate accounting events. Preview and settlement use this same function. There are no database calls, independent preview formulas, per-factory entities, resource-name switches, or calls to the old earned-income/reinvestment formula.

`ProductionEconomyInput::fromSnapshots` adapts Package B rows plus territorial facts for one nation. It selects the nation’s public/private inventories, carried cost basis, two civilian accounts, territorial capacity and acquisition requests. It rejects missing founding accounts and foreign resource references. It never fills missing civilian cash with new starting funds. The caller supplies current population, whole available workers, terrain, saved potential and economic conditions. Neutral and foreign territories are excluded.

The resolver uses the actual catalogue's physical production, wage, reference-price, development and population-demand contracts. Currency and recruitment do not enter physical production or acquisition. Resource declarations without a supported production mechanism are rejected; recipes and non-stock services have not been added to the catalogue.

## Selected first-pass sequence

1. **Opening conditions:** update informal activity using the existing asymmetric tax response; derive local productivity, civilian demand, public requests and public-development requirements. Resource priority is demand/acquisition priority, then a stable resource-key tie-break. Territory ties use stable IDs.
2. **Funding:** use declared historical recurring receipts for the credit ceiling, and a finite external lender if one is supplied. Settle interest/default, existing public payroll and explicit income support. Accepted immediate goods commitments require opening owned government stock; recurring military goods can report a shortfall. Production or an expected purchase cannot make an immediate commitment valid.
3. **Reserve budgets:** leave cash for public operation, then reserve acquisition, infrastructure and public-development budgets. An acquisition spending limit includes the attributable cost of its public output **and** private purchases. Zero funding cannot create a public delivery. Saving/holding a request is not payment. Public civilian operation is capped by installed public capacity; a private acquisition envelope is capped by potential surplus after civilian needs. Unavailable requests remain visible as unmet quantities.
4. **Work:** allocate actual workers and opening operating cash to resource production. Existing private supply offsets civilian production need. Public/private civilian assignments initially follow installed capacity, with one bounded spillover pass. Private production requires a positive margin above the configured threshold; public production can run at a subsidized price if funded. Unused raw goods have no invented civilian demand.
5. **Residual civilian activity:** use remaining workers and operating cash to prepare a bounded service flow. Households buy delivered services with actual money after essentials. This flow has no storable “services” good. Unbought activity remains an expense; there is no balancing income injection.
6. **Exchange:** households spend savings and wages, consuming owned goods and buying private supply first, then current public output. Opening government reserves are protected from ordinary sales. Explicit bounded emergency release can cover remaining need. Government acquisitions then use remaining private supply and their reserved budgets; public output retained for the request is an internal delivery, not fictitious sales income.
7. **Development:** distribute the configured fraction of realized after-tax producer earnings. Keep an operating reserve before private investment. Infrastructure maintenance/improvement and resource construction use actual cash and the same remaining workforce. Maintenance allocations are proportional to authorized local maintenance needs, before any improvements. Unused worker-constrained allocations can be redistributed within maintenance targets; improvement priorities apply after maintenance allocation. A local labor shortage remains visible but does not veto feasible improvements elsewhere. Underfunded upkeep has its own warning even when a reduced policy budget is fully paid. Public development follows the selected program priority; private development requires demand, margin and available funds and is blocked by unwanted unsold inventory. New capacity is usable next season.
8. **Close:** collect provisioned business tax, release unused holds, return the unspent portion of this season’s financing (bounded by cash and principal), then automatically repay debt above the treasury reserve, and report exact balances. Infrastructure, informal activity and unrest become next-season conditions. Nutrition fulfillment is returned for Package D's demographic consequences.

The sequence is conservative and bounded. Sales cannot restart production or expand its opening working-capital budget. Newly withheld taxes do not expand work budgets. Construction wages are not recycled into another goods market in the same resolution.

## Units, development and behavioral choices

The October resource calibration adds an optional positive `potential_multiplier` to geographic territorial labor rules (omitted means 1). It scales developable geographic output ceilings, not worker productivity, installed assets or opening stocks. The civilian v2 catalogue uses ore ×3. The operating cash reserve defaults to 0.75 season; existing games retain saved values until explicitly upgraded. [Calibration, experiments and live upgrade](civilian-economy-live-integration.md#resource-headroom-and-investable-working-capital-2026-10-01).

Physical catalogue yields are output per **million workers**, while the accounting engine now receives actual whole worker-seasons. Local productivity also responds to opening infrastructure and unrest. The adapter computes a conservative workers-per-unit rate; activity rounds worker use upward and output limits downward. Production, other civilian work, infrastructure work and resource construction share a single territorial pool.

For each territory/resource, public and private expansion share one seasonal ceiling:

`min(unbuilt potential, potential × max_growth_fraction × (0.5 + 0.5 × infrastructure) × (1 − unrest))`.

Construction is also bounded by money and workers. Zero development funding leaves existing capacity intact. Infrastructure maintenance remains separate from productive-capacity expansion; unfunded infrastructure decays gradually. The old agricultural-only capacity share and independent civilian reinvestment formula are not run inside this resolver.

Public resource development priorities are potential, regional catch-up, or population. Private opportunities rank productivity, infrastructure and unrest. Private expansion targets demand plus a configurable capacity buffer, taking all installed ownership pools into account. It does not expand merely because an administrative request has no funding, or because unsold output was assigned a notional sales value. This is a deterministic first-pass behavioral rule, not an equilibrium market or an optimal allocator.

`defaults()` provides provisional behavior values, all overridable through the `rules` argument. Package D should persist those values in the existing game-owned economy-rules JSON. They include profit distribution, private investment, operating reserve, margin threshold, stock/capacity buffers, construction labor reservation, residual-service costs/demand, compliance and fiscal/infrastructure coefficients. No special policy UI is introduced here. Resource-specific coefficients stay in the resource catalogue.

Residual `background_capacity` is an independently owned opening input, expressed in worker-seasons. An absent field uses the primitive foundation's private residual activity; a fully public scenario must supply public residual capacity explicitly. Package D must establish/preserve that ownership in territorial state rather than infer an instantaneous conversion from a changed resource policy.

`plan.investors` explicitly determines permitted developing owner pools. Its default permits both pools for the mixed foundation. An entirely public/private scenario must set the corresponding permission deliberately. It never transfers existing assets or nationalizes an inventory. Binding institutional permissions to the gameplay policy set remains part of cutover, not an automatic inference from today's stock ownership.

A conservative portion of workers is reserved when development is planned; construction can use other workers left idle too. The allocator does not solve for an optimal allocation or rerun production when some reserved construction opportunity goes unused. Coefficients and priority tradeoffs need playtesting.

## Maintenance supply-chain priority and replacement

Civilian maintenance requirements propagate backwards through the configured recipe DAG, separately from discretionary industrial demand. Before ordinary production priority, private producers replenish this essential pipeline up to the existing two-season-plus-buffer target, **less opening stock**. Production already performed in this pass counts against both the ordinary target and shared installed capacity. This changes allocation when inputs are scarce; it does not increase the stock target or allow freshly produced inputs to be consumed in the same season.

Government procurement buys only private surplus after the next season's industrial requirement plus input buffer. Orders remain funded, constrained and visibly unmet where necessary; privately required inputs do not silently become state stockpiles. Government-owned reserves remain separate.

If ordinary maintenance cannot restore its own upstream supply chain, permitted private investors can replace damaged installed capacity before expansion. Replacement consumes the same construction labor and capital cost as development, from the existing private investment budget after the operating reserve. It adds neither installed/geological capacity nor goods. Condition improvement is capped at the resource's ordinary seasonal recovery rate and becomes productive next season. Rebuilding events reconcile actual payments; their cost is included in private development, and maintenance rows expose replaced capacity. No money, workers, investment permission or installed asset means no free restart.

This is protection against a preventable maintenance spiral, not a guarantee of full consumption on finite deposits. When ore is genuinely scarce, equipment upkeep takes precedence over consumer goods. See the [captured crisis/recovery verification](civilian-economy-live-integration.md#maintenance-collapse-correction-2026-10-01).

## Funded public supply to civilian industry

Public capacity can now receive private replenishment orders for industrial inputs, without a state acquisition order. `PublicIndustrySupply` reserves available private purchase cash after goods/upkeep working capital; actual public output is constrained by the existing worker, input, condition and operating-fund allocator. After production, allocated new goods are sold at the reference price to the private pool. Public civilian allocations and state procurement retain precedence; opening government reserves are never offered. Purchased goods become recipe inputs next season only. Industry deliveries are excluded from government acquisition deliveries, and sales reconcile once through the ordinary public-receipt ledger. See [hybrid supply and investment](civilian-economy-live-integration.md#hybrid-public-to-private-supply-and-public-investment-2026-10-01).

## Money and fiscal continuity

Every payment has a recipient: operating/construction/public-payroll wages reach households; purchases reach the supplying pool; tax reaches treasury; interest/principal reach the lender. Support and profit distributions transfer funds without being counted as new earned income. Output is inventory, not revenue.

Earned income is wages plus realized producer profit, not wages plus sales plus profit. Unsold output carries its wage cost into inventory. Selling old inventory releases its carried cost without paying those historical wages again. Residual activity's actual operating costs and actual sales join the same producer profit calculation. Public delivery cost in a resource report is an attribution of public operating expense, not an extra expense to add to that operating total.

Wages use territorial taxable shares where attributable; pooled producer profit uses the population-weighted formal share. This is an explicit aggregate approximation. Avoidance rises in the same season as a tax increase and recovers slowly after a reduction. It reduces supported taxable earnings, not an unrelated income source.

Fiscal behavior retains a history-based credit ceiling, interest arrears, one restructuring per default episode, credit lock and recovery conditions. Historical recurring receipts include taxes **and actual public sales**. Ordinary acquisition/program shortfalls do not themselves constitute default. End-of-season surplus repays debt after keeping the configured treasury reserve.

An external lender is an explicit account/debt ledger supplied to the calculation and carried in its closing state. The snapshot adapter does not invent this lender or translate an old scalar debt value silently; nonzero duplicate scalar debt is rejected. Package D must persist and restore this external financing boundary with national fiscal state. There is no private bank/credit simulation.

## Reports and limits

Resource results distinguish national production by owner, opening/closing stocks, civilian purchases/releases/shortages, government public/private deliveries, purchase and attributable public costs, acquisition shortfall, development and production constraints. Financial results reconcile opening treasury + actual inflows − actual outflows = closing treasury. Unrest uses actual nutrition shortage rather than stockpile-based growth bonuses.

Events are aggregate by territory/activity, never by worker or individual sale. Package D should store compact reports and required state, not create an unbounded transaction-history table from this diagnostic event list. Government/private inventories remain separate in the result, including cost basis. Derived fields such as local productivity should be rebuilt from current territorial facts, not persisted as immutable geography.

No UI, live seasonal ordering, affordability endpoint, grants integration, combat resolution or population-growth write has been changed. International trade, dynamic prices, transport, recipes, individual firms and ownership conversion remain outside this package.

## Verification

- `php8.3 tests/client/production-economy.php`: **367 checks** covering public/private/mixed supply, exact cash conservation, full/partial acquisition, zero budget, missing working capital, protected reserves, old-inventory cost, renamed nutrition, additional/reduced catalogues, delayed shared development, infrastructure, asymmetric compliance, finite financing/default/repayment, repeated seasons and replay. A matrix of fractional/exhausted cash, ownership and tax extremes verifies shared workers and total acquisition limits.
- `php8.3 tests/client/production-accounting.php`: **264 existing accounting checks** pass after extending the primitives with local productivity/tax shares, whole workers, public works and fiscal-close repayments.
- `tests/client/production-state.php` through the guarded disposable MariaDB bootstrap: **3,687 checks** pass, including the prior persistence/lifecycle suite and actual stored-data forecasts for renamed/additional resources. Forecasts are deterministic and leave the stored snapshot unchanged. This is not a live-turn cutover test.
- Synthetic performance check: 1,280 territories (40×32), mixed resource ownership and funded accounts completed in **8.980 seconds**, with **28 MiB** process peak memory and 15,906 aggregate events on this machine. This includes neither database/rendering/combat work nor a performance promise for live previews/turns.
- PHP syntax and whitespace checks pass. No application-database changes, migration or client build is part of this backend-only package.

## Package D integration (now delivered)

Wire one resolver result into fresh-game founding, the seasonal transaction, actions and the shared workspace. Persist its closing state and external fiscal boundary; bind institution/development/food-support choices; apply real nutrition fulfillment to demographics and funded military consequences. Reconcile grants, immediate commitments, capture, rollback and definition-edit invalidation. Replace the live old physical/fiscal writes rather than running both. Then Package E presents the reviewed player journey and F removes the superseded paths.

## Peaceful-opening calibration, 2026-09-29

The playtest fixes and provisional numerical tuning are recorded in [the live playtest report](economy-live-playtest-2026-09-29.md). Founding population stays five million across five equal-population territories, and opening money is unchanged. Default consumption is 0.35 nutrition units per million people; residual civilian service demand is 0.4 per person; infrastructure upkeep is 2 and maximum seasonal improvement is 0.005. These remain game-owned/resource-catalogue parameters, not resource-name exceptions.

`php8.3 tests/client/peaceful-economy.php` compiles the actual source policy defaults and exercises two anonymized founding geographies: 24 seasons for modest potential and 12 for fertile land, using the source resource catalogue and normal resolver defaults. It checks food, maintenance, cash conservation and zero debt while population grows. It is a bounded resolver scenario, not proof of balance for every map or unlimited unattended growth. Existing saved catalogue/rule values do not automatically change when source defaults change; the local authorized test game and default template were explicitly retuned.


The subsequent fertile-homeland test identified overly aggressive default public agricultural expansion. Its starting policy parameter is now **10%**, down from 50%; no extra resolver mechanism was introduced. More fertile land still permits greater deliberate spending, but does not automatically start with such a large program. The test reads template defaults directly so captured settings cannot hide regressions. A 24-season fertile continuation starts borrowing in season 22; the supported claim is a viable opening, not permanent unattended balance.

The later [civilian fiscal calibration](civilian-economy-live-integration.md#peaceful-fiscal-calibration-2026-10-01) supersedes those provisional defaults: infrastructure upkeep is **1**, and discretionary public farm expansion defaults to **0%**. Maintenance and infrastructure improvement remain fully funded; farm expansion is opt-in. Fresh policy templates are versioned, while existing-game rule values and choices require an explicit update. Regression coverage now includes long civilian supply/solvency runs and positive peaceful opening budgets.
