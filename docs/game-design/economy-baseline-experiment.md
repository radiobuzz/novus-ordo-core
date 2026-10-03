# Indicator economy: ownership efficiency and tax tradeoffs

2026-10-03, revised after the ownership-efficiency discussion. **Research only; the live game and database are unchanged.** Earlier results are preserved below and in their own JSON summary.

## What changed

Three explicit, configurable assumptions now work together:

1. Private dynamism changes **attainable productivity**, as well as development speed. Productive conditions are multiplied by `0.55 + 0.65 × dynamism`, capped at 1. This retains a basic economy even when dynamism is weak.
2. Public productive efficiency defaults to **80%** of the same underlying conditions. Public investment turns spending into progress at **75% efficiency**. Spending is still charged in full; reaching the same infrastructure target takes more money and time. Health and education programmes do not receive an extra blanket penalty.
3. Tax avoidance retains NO2's tax/crime/unrest relationship, with the tax coefficient provisionally increased from **0.15 to 0.45**. This is a balance proposal, not NO2's original setting. Informal activity escapes tax; it is not erased from national income.

Ownership blends public and private productive efficiency in one economic calculation. These are authored gameplay differences, not claims that real public institutions always operate at these percentages.

## Revised results after 300 seasons

Population stays at five million. Every scenario starts with income of 100. Values below are provisional national-income and government-money units; they are not resource quantities.

| Fixed policy | Final national income | Final seasonal government balance |
| --- | ---: | ---: |
| Private, 10% tax | 164.89 | +3.67 |
| Private, 20% tax | 147.93 | +15.00 |
| Mixed, 25% tax | 134.62 | +7.21 |
| Public, 45% tax | 128.67 | +11.88 |
| Public, 90% tax | 123.67 | +18.15 |
| Private, 80% tax | 90.12 | +13.45 |

All six fund their requested programmes throughout the 300 seasons. Low-tax private policy now has a meaningful productive advantage; heavy private taxation can reduce prosperity below its starting level. Public high taxation remains playable without relying on private dynamism.

The public 90%-tax surplus was +77.63 in the preceding trial and is now +18.15. Isolating the changes shows +57.68 after productivity/investment changes alone; stronger avoidance supplies the remaining reduction. This does not demonstrate final military or market balance.

Tax sweeps from 10% to 90% show that higher taxes **do not always improve the government budget**. Among sampled rates, the private final surplus peaks at 50% and the public final surplus at 70%. These are narrow fixed-programme fiscal comparisons, not recommended rates or universal gameplay optima. Production and prosperity can favor quite different rates.

## Recovery and limits

- Removing private welfare reduces final income to 131.10. Restoring it in season 101 recovers to 147.91. Reducing private tax from 80% to 20% in season 101 recovers to 147.87; consequences are gradual, not permanent punishments.
- Infrastructure construction still tapers while maintenance settles. Lower public investment efficiency raises total construction cost without stopping funded development.
- The 25%-tax mixed founding recipe is less robust now: **three of nine** ±20% income/cost sensitivity cases underfund programmes. Individually, income −20% underfunds 61 seasons and costs +20% underfunds 30; the combined case underfunds 294. A paired 30%-tax starting probe survives either individual variation, but still underfunds 171 seasons in the combined case. The 35% probe reduces that to 11. No new founding policy is selected by these probes.
- The rejected avoidance coefficient **0.60** makes the public 90%-tax country collapse and underfund 286 seasons. The complete comparison includes rejected settings, not only successful cases.
- The low-tax private country retains higher inequality than the public country despite welfare. Later balancing must consider prosperity, government funds and social conditions together.

These changes provide clearer tradeoffs, **not a completed balance**. Physical supply remains assumed adequate. Goods purchases, resource shortages, military, growth, geography differences and the live transaction ledger are still outside this trial. A robust starting recipe remains necessary before live integration.

## Policy database versus economic rules

Source inspection confirms that policy definitions, options, effects and parameters reside in `policy_sets`, `policies`, `policy_options`, `policy_effects` and `policy_parameters`. Each game owns its definitions; editing a template does not rewrite existing games. The existing catalogue supports validated export/import and test-game edits.

However, **DB configuration does not create a mechanism by itself**: `PolicyEffectRegistry` validates supported handlers, and economic code interprets their values. The new dynamism and efficiency mechanisms are not registered live handlers. Existing tax-avoidance constants also appear in the production resolver, rather than all being editable policy effects.

For a future implementation, preserve this distinction: policy options/strengths remain DB-authored; model coefficients should be adjustable game-rule settings, not new player sliders for every formula. A new effect mechanism requires code once, after which multiple policies can reuse it. This test stores all its proposed coefficients in JSON and makes no live schema or catalogue changes.

**Verification:** 49/49 checks. Fifteen seasonal scenarios, 18 sampled tax cases, 20 avoidance-coefficient comparisons, 12 starting-budget probes and nine mixed-budget sensitivity cases are recorded. Checks include direct dynamism effects, public investment cost/progress, recovery, same-season avoidance, reconciled spending and currency/territory invariance. Passing validates the authored relationships and arithmetic, not economic realism.

```sh
python3 -B scripts/research/economy_indicator_trial.py --output /tmp/economy-indicator-trial.json --include-traces
```

[Trial source](../../scripts/research/economy_indicator_trial.py) · [Editable assumptions](../../scripts/research/economy-indicator-trial.json) · [Current results](data/economy-indicator-trial-results.json) · [Previous trial results](data/economy-indicator-tax-pressure-results.json)

---

# Earlier indicator economy: development and tax-pressure trial

2026-10-03. **Isolated hypothesis only; no live game, schema or policy changes.** The earlier experiment is preserved below.

**Finding:** a shared aggregate economy can develop under unchanged policy and then settle, with private dynamism or funded public development supplying the stimulus. This establishes a candidate method, not a balanced replacement economy.

## Rules being tried

- Five million people, held constant, in five identical territories. Seasonal income is population × reference income × economic strength; income is a measurement, not a second cash wallet added to wages/profits.
- Health, education, infrastructure and security determine productive conditions. Inequality, welfare, environment and unrest influence those conditions over time.
- Private dynamism and funded public development blend according to ownership. Ownership does not create two separate economic engines.
- Infrastructure construction moves toward a target and tapers off. Maintenance continues; costs also respond to development. Private provision is included without government payment for every activity.
- Tax receipts come from the taxable portion of income. Treasury pays public programmes; unaffordable requests are prorated. Borrowing is deliberately absent in this trial.
- Goods supply is assumed adequate. No production quantities, goods purchases, trade, military, population growth or real starting geography are simulated here.

## NO2 lesson: tolerated taxes still produce avoidance

The source separates **political tax tolerance** from **black-market activity**. For domestic income, its black-market fraction has this shape:

```text
0.15 × tax rate × (1 + crime) + unrest × (0.5 + crime)
tax receipts = (national income − black-market income) × tax rate
```

Verified in the legacy archive: `no/Calculator.php:198–201`, with `money_def_heavyFoot = 0.15` in `no/modules/common/common.params.php:52`. The full original also treats foreign population separately and rounds money; those details are not included here. Its crime target also includes `0.25 × max(0, 2 × tax − tax tolerance)` in `no/modules/demography/demography.params.php:397`.

The trial adopts those relationships. A public country can tolerate a high tax politically while losing taxable income to informal activity. Avoidance rises immediately when its target rises, so a tax hike cannot collect against the previous lower avoidance rate. Recovery after reductions is gradual. That asymmetry and an 85% avoidance cap are **new trial assumptions**, not NO2 rules. Informal income stays within national income; it is excluded from taxation, not subtracted twice from economic output.

This replaces the first trial's mistaken link between avoidance and only taxes *above* the ownership-dependent tolerance. Political tolerance remains relevant to unrest.

## Results after 300 seasons

Every case starts with national income of 100 in provisional money units.

| Fixed policy | Final national income | Final seasonal government balance | Seasons with unfunded requests |
| --- | ---: | ---: | ---: |
| Mixed ownership, 25% tax | 163.40 | +15.36 | 0 |
| Private ownership, 20% tax | 165.49 | +19.79 | 0 |
| Public ownership, 45% tax | 160.39 | +31.28 | 0 |
| Public ownership, 90% tax | 154.15 | +77.63 | 0 |
| Private ownership, 80% tax | 137.49 | +61.82 | 0 |
| Private ownership, welfare removed | 153.36 | +18.82 | 0 |
| Mixed ownership, unchanged programmes but 5% tax | 83.23 | approximately 0 | 297 |

- Public 45% tax produces an untaxed share of **8.65%**, versus **19.39%** at 90% tax. Effective receipts are 41.11% and 72.55% of income respectively. High taxes have a cost without making public development depend on private dynamism.
- Removing welfare initially saves money but eventually reduces private prosperity by about 7.3%. Restoring welfare in season 101 recovers to within 0.02% of the maintained-welfare path by season 300. Infrastructure damage also recovers under unchanged policy.
- Mixed infrastructure construction falls from 1.00 to zero; government maintenance rises from 1.46 to 1.80 and settles. Funding does not require repeated manual adjustment. The private share of maintenance is accounted for separately.
- Underfunding health/education reduces final mixed income to 131.38. Removing public development leaves the fully public economy at its initial income: better conditions alone do not grant unfunded growth.

## What is still unresolved

**The model is too generous fiscally to call balanced.** In particular, high-tax public and private countries still accumulate large surpluses despite weaker prosperity. The private/public income difference is small; this does not yet demonstrate the desired exceptional private economy under excellent conditions.

Eight of nine mixed-budget sensitivity cases (income and costs varied independently by ±20%) fund all requested spending. The harshest case, income −20% and costs +20%, exhausts treasury and underfunds **35 seasons** before recovering. That founding recipe is not robust across all tested assumptions.

No claim is made about military affordability, markets, resource shortages, diverse territories, the current transaction ledger or gameplay enjoyment. All coefficients are editable research assumptions. Passing checks confirms the coded relationships and arithmetic, not economic realism. No earlier alternative schema or implementation package is approved by this experiment.

**Verification:** 37/37 checks, including government reconciliation, after-tax allocations, bounded indicators, fixed population, tax-hike timing, welfare recovery, territorial partitioning and currency scaling. Recorded results include the failed sensitivity case.

```sh
python3 -B scripts/research/economy_indicator_trial.py --output /tmp/economy-indicator-trial.json --include-traces
```

The trial source and assumptions above have since evolved; the command now runs the revised model. [Archived results and original inputs](data/economy-indicator-tax-pressure-results.json) · [Earlier NO2 review](no2-economic-feedback-review.md)

---

# Earlier baseline experiment (2026-09-29)

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
