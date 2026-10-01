# Simpler economic baseline: first experiment

2026-09-29. Isolated research only. **The live game is unchanged.**

**Finding:** a NO2-inspired aggregate civilian economy can support ordinary government services over long runs in this experiment. Better conditions improve taxable income; not every policy becomes profitable.

All countries start with five million people and 20 treasury. Policies stay fixed for **80 seasons**. Both real starting geographies were used, with explicit population-demand resources from the resource catalogue. No foreign trade is assumed.

| Scenario | Result |
| --- | --- |
| Original homeland, unchanged population | Fully funded services, adequate food, no debt |
| Fertile homeland, unchanged population | Fully funded services, adequate food, no debt |
| Original homeland, population grows 1%/season before shortages | Government remains solvent; food shortage begins in season 68 |
| Fertile homeland, same growth | Fully funded services, adequate food, no debt |
| Civilian services funded at 30% | More initial savings, but substantially lower eventual income per person |
| Tax reduced to 5% | Borrows in season 3; later cannot fund normal services |
| Heavy military commitment | Borrows immediately; later cannot fund normal services |
| Infrastructure damaged in season 20 | Income falls, then recovers gradually without policy adjustments |

A separate paired test gives income of **23.26 per million people with public infrastructure funding**, versus **19.33 without it** at season 80. Private provision is still modeled in the latter. Development has an economic benefit.

## What was tested—and what was assumed

- Population × economic index generates aggregate civilian income. This **replaces** detailed civilian wage/profit income; those amounts are not added again. Government receives a tax share of that income.
- Health, education, dynamism, crime, infrastructure and unrest influence economic performance. Economic/dynamism/infrastructure targets follow NO2's shape. Target adjustment is deterministic; simplified health/education/crime responses are new lab assumptions.
- Budgets follow population, policies and economic conditions. This first experiment uses **NO2-style recurring service budgets**, not the proposed separate construction-to-maintenance taper.
- Physical essentials have mapped potential, installed capacity and labor constraints. Demand-driven expansion consumes part of after-tax civilian income and becomes usable next season. It does not expand simply because fertile land is available.
- There are no individual household wallets, market prices, trade, public/private resource ownership transitions or purchasing-power shortages. Generic mineral and military-goods demand is not tested; the military stress case is a cash commitment. The model does not prove integration with the existing transaction ledger.
- The income scale and service costs are provisional. Cash accumulates considerably in peaceful cases; this is evidence of viability, **not final gameplay balance**. Equal income in the two food-sufficient homelands is expected here: surplus farmland provides food security but has no export customers.

Verification includes treasury reconciliation, income allocation, bounded indicators and resource capacity, equal founding populations, effects of underfunding, and currency-unit scaling. Across 18 additional cases varying income and service costs independently by ±20%, neither fixed-population homeland borrowed. That tests a limited neighborhood, not every possible map or policy.

**Next discussion:** review this aggregate civilian-income basis before planning changes to the live economy. No additional implementation decision is frozen.

## Reproduce

```sh
python3 scripts/research/economy_baseline_experiment.py --output /tmp/economy-baseline-results.json --include-traces
```

[Source](../../scripts/research/economy_baseline_experiment.py) · [Assumptions](../../scripts/research/economy-baseline-parameters.json) · [Result summary](data/economy-baseline-experiment-results.json) · [NO2 source review](no2-economic-feedback-review.md)
