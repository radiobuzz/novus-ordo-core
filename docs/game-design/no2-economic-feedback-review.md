# NO2 economic feedback — review prompted by NO7 peaceful deficits

2026-09-29. Research only; no gameplay/rule changes. Read the extracted historical PHP as text, without executing it. Provenance: the archive documented in [the NO2 extraction](no2-policy-extraction.md), inspected locally under `/tmp/no2-policy-review/no`. References below are original archive member paths beneath `no/`.

## What the source establishes

1. **An aggregate civilian economy existed independently of individual sales.** `modules/base/Ethnic.php:449` computes income per capita as economic index × configured maximum income (30,000 in `modules/common/common.params.php:58`). Region income is population-weighted (`Region.php:377`); national/foreign-origin GNP is aggregated from regional population and income with the money-unit conversion (`Nation.php:1629–1655`). `Calculator.php:199–204` computes underground output from taxation, crime and unrest, then revenue as `(GNP − underground output) × tax rate`. This revenue path does not require matching purchases from finite simulated household wallets.

2. **Local conditions feed economic strength.** The active economic-index target (`modules/demography/demography.params.php:331`) combines health/education, a tax-tolerance factor, dynamism, inverse crime, infrastructure, policy/ownership contributions, terrain and unrest. Infrastructure contributes `ii × 0.25` inside a bounded expression; health/education also limit the attainable economic target. Environment and inequality feed other indices, creating indirect economic effects. These are authored game formulas, not empirical causal estimates.

3. **Indicators have moving targets.** `Ethnic.php:247–287` combines local indices with national policy/funding inputs to calculate each target. `:291–416` adjusts the lower/upper seasonal variation bounds according to distance from that target; `:418–445` samples the variation and clamps the result to the index limits. This is stochastic movement biased toward a target, not an exact deterministic convergence formula. Targets are not universally 100% and the coupled system is not proven stable under every policy.

4. **Infrastructure includes abstract private provision.** Its target (`demography.params.php:431`) adds a funded public-policy contribution to a private-provision term depending on ownership orientation, economic strength, dynamism and tax tolerance. Public policies offer none/minimal/moderate/high/very-high investment (`modules/legal/legal.params.php:1300–1328`), with corresponding cost and target coefficients. Therefore low public spending need not mean no infrastructure in an economy whose conditions support private provision. No individual private construction purchases were traced in this target path.

5. **Budget percentages follow assessed requirements.** `Calculator.php:116–143` calculates program base costs from population and enacted policy coefficients, then multiplies by `(0.5 + economic index)`, leader cost and a foreign-population/unrest adjustment. `:161–164` converts a saved percentage into a current amount and a funding ratio. `Nation.php:1434–1445` defaults unspecified allocations to 100% of requirements; validation at `:1461` onward limits funding to assessed requirements. A stable percentage can follow demographic and economic changes without editing a fixed amount every season.

6. **There is no explicit capital-to-maintenance taper in this path.** The recurring infrastructure program requirement is calculated like the other civilian programs. It does not use the gap between current infrastructure and its target to shrink an investment bill. Index growth tends to level out near its target, but the recurring policy service cost remains. Our proposed maintenance-plus-gap investment formula is a possible new design, not a recovered NO2 implementation.

7. **The financial model still allowed trouble.** Higher taxes affect the economic and dynamism targets, underground output and unrest. Welfare underfunding contributes to unrest. Public costs grow with population and economic strength. Debt limits, interest and spending-plan validation constrain government finances. Source review establishes feedback mechanisms, not a guarantee that every peaceful nation remains solvent.

## Why this matters for the current deficit

Holding policies, tax effectiveness, population, leadership and unrest adjustments fixed, an economic index increase from 0.5 to 0.8 raises modeled income per person from 15,000 to 24,000: **60%**. The civilian-service cost multiplier rises from 1.0 to 1.3: **30%**, ignoring rounding. That creates room for development to improve fiscal capacity even as public services become more expensive. Population growth also scales both the aggregate income base and basic policy costs.

NO7 currently models explicit producer/household cash, funded wages, sales, inventories and investment. Its residual civilian service flow uses per-person demand and configured wages/prices (`ProductionEconomySeason.php:195–200`). Infrastructure affects resource productivity, but does not drive a comparable increase in broad civilian income per person. Background activity has carried capacity, and household purchasing power can constrain realized service sales. The old condition-driven income engine has not been replaced with an equivalent complete mechanism.

This explains why lowering food demand, upkeep or starting construction funding can repair an opening without repairing the long-term feedback. The missing distinction is between **a correct ledger for the transactions implemented** and **a complete model of how a developed civilian economy earns income**.

## Implications for the next design discussion

- Preserve policy-driven local conditions and a meaningful response of civilian productive performance to them.
- Reuse the idea of funded service targets and persistent percentage allocations; distinguish it from the new proposal to taper capital spending at a local target.
- Keep demographics, income generation and public-service requirements coherent across long runs and differing homelands.
- Decide the abstraction of the broad civilian economy explicitly. NO2's index-derived income could support an aggregate model; retaining NO7's funded transaction model requires the corresponding productivity, capacity, demand and circulation mechanisms. Do not simply add NO2's GNP-derived tax revenue on top of current wage/profit taxes: that could double-count income and bypass the ledger.
- NO2's Gini was itself an evolving simulated index, not calculated from individual household income records. Whether to retain that abstraction is a separate decision.

No additional indicator set, formula, spending behavior or implementation is approved by this review. The recommended next step is to agree how local economic conditions become broad civilian income, before further isolated numerical rebalancing.
