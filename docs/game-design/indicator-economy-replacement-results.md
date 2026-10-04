# Indicator economy — implemented replacement

2026-10-03. This is the current runtime, implementing [replacement packages A–E](indicator-economy-replacement-plan.md). The earlier civilian cash simulation is retired. The pre-replacement source checkpoint is `d7604c5`, pushed to `origin/main` before implementation. It does not contain a database backup.

## The playable rules

Territories have ten gradual, bounded indicators: economic strength, health, education, infrastructure, dynamism, crime, inequality, environment, unrest and informal activity. National indicators aggregate those territorial conditions. Inequality is a game index; it is not a measured Gini coefficient. Loyalty and recruitment retain their existing mechanisms.

Income is calculated once from population and economic strength. Taxes collect a share after avoidance. It is an activity measurement, not money circulated between simulated households and companies. High taxes suppress dynamism and encourage informal activity immediately; avoidance recovers gradually when pressure falls.

Health, education, public safety, welfare and environmental programmes improve conditions. Public economic development supplies growth momentum. Funding is a fraction of assessed requirements, not a recurring instruction to build an arbitrary number of objects. Infrastructure builds toward a target, then its construction expense tapers; maintenance remains.

Each resource has one installed-capacity pool per territory. Private initiative depends on dynamism and a single shared abstract reinvestment allowance; public construction depends on actual funded expenditure and investment efficiency. Changing ownership changes future stimulus, retaining existing assets. No individual factory records exist.

Civilian needs and recipe inputs receive supply first. Remaining feasible production can satisfy government requests. Each delivered government unit costs its configured price once, under any ownership arrangement. National output does not automatically become owned stock. Unfunded or impossible orders do not consume goods or charge the treasury. New capacity works next season. Lower demand stops expansion without deleting assets.

Treasury is spent before borrowing. Debt, interest, reserve policy and manual repayment remain. Borrowing is financing, not income; there is no lender cash account. Income support is paid government spending that reduces inequality, without manufacturing earned income or extra physical goods. Guard responses debit cash and goods without collecting tax again.

## Foundation and authoring

Fresh defaults use mixed ownership, 25% income tax, 50 opening credits and funded basic programmes. The subsequent [infrastructure commitment pass](infrastructure-commitment-first-pass.md) replaces the infrastructure-only funding choice with named investment ambition and separate funding. Initial core population is unchanged; neutral territories retain their weaker indicators and existing capacity through annexation. These are provisional balancing defaults, not an equilibrium promise for every map or army.

Definitions remain game-owned relational catalogues, never copies per turn. Social funding and additive `indicator.target_shift` effects use the existing validated policy machinery. Target shifts combine before bounding; tax, ownership and other exclusive settings remain exclusive. New mechanisms require code, while supported effects/defaults/parameters are DB-authored.

`database/economy-templates/indicator.json` supplies validated coefficients copied into `games.economy_rules.indicator`. They do not inherit later template changes. Primitive test authoring is available:

```bash
php8.3 artisan app:economy-rules export GAME_ID > /tmp/indicator-rules.json
php8.3 artisan app:policies testing GAME_ID --enabled=1
# Edit the exported document, then:
php8.3 artisan app:economy-rules import GAME_ID --file=/tmp/indicator-rules.json
```

Imports alter future calculations, not completed reports. Policy/resource export/import tools remain; obsolete additive upgrade and calibration commands are removed. There is no arbitrary executable formula editor.

## Runtime, storage and presentation

`EconomyService` calls `IndicatorEconomySeason` for previews and settlement. `TerritorialIndicators` resolves conditions and income; `GoodsAllocation` shares physical inputs, workers and development budgets; `ProductionRecipes` validates recipe references/order. Exact six-decimal cash and stock identities are asserted. Physical recipes cannot reuse consumed inputs; integer workers and construction limits are checked. Fractional allocations cannot overbuild through rounding, and a positive acquisition cannot become free through rounding.

The breaking migration drops `nation_economic_accounts`, stock ownership/cost-basis fields and capacity ownership splits. Stocks now identify nation × turn × resource; capacity identifies territory × turn × resource. Seasonal intent, debt, territorial state and actual reports retain their existing history tables. No new financial-history table or old-save bridge was introduced.

Removed runtime classes: `ProductionAccounts`, `ProductionEconomySeason`, `CivilianProduction`, `PublicIndustrySupply`, `CivilianEconomySeason` and `IndustryHistory`. Account-dependent tests/research executables and obsolete lifecycle runner modes were removed. Historical proposal/result documents remain, explicitly superseded. Earlier migrations remain immutable.

Budget & Policies retains its layout, shared draft/save flow, focus/scroll behavior, click-only help, colours and enlarged charts. It now reports actual programme spending, income/disposable estimates, civilian supply and one shared capacity pool. National history includes earned/disposable income and economic-strength/dynamism trends. Industry history shows supply, development and acquisition quantities/costs; synthetic wages, profits, wallets and public sales are gone. Maps retain geography/display settings and gain truthful layers for the new territorial indicators. EN/FR labels are updated. Resource disclosures in the territory inspector also retain their nodes/open state through identity refreshes. No new polling loop, endpoint or draft owner was added.

Maintenance warnings distinguish policy funding, treasury/credit shortfall and construction workforce. The agreed newly annexed territory explanation remains only where absent workforce and sufficient allocation are verified. Other territorial/acquisition failures remain visible.

## Verification and cutover

- Pure resolver: **50,549 checks**, including 100 fixed-population seasons for mixed/private/public ownership on both saved ordinary and fertile geography; equal founding population, deterministic previews, bounded indicators/capacity/labor and debt-free peaceful growth. Additional cases cover a modest army, a high-tax public country, inputs, damaged infrastructure, renamed nutrition, synthetic goods, fractional rounding and finance. [Worked seasons](data/indicator-season-worked-results.json) are calculations, not proof of every possible game.
- Isolated real database: three passive seasons plus 20 additional seasons; preview/actual equality, pending choices, acquisitions, grants, neutral capture, definition counts, history and rollback/replay. Additional checks cover deployment, Guard, default/desertion, manual repayment, template independence and rules editing.
- Generic resource regressions: 41 catalogue checks, seven exact-accounting checks and grant offer/accept/deletion. Policy regressions: 72 checks for dependencies, template copies, all-nation seasonal boundary, injected transaction failure, editing, retirement and rollback.
- Client regression suite: 284 checks; generated contracts/current definitions, maintenance explanations, nutrition behavior and production build pass. Real Chromium checks cover retained policy/planner inputs and scrolling, combined save, stale context rejection, exact decimals, history ownership, mobile controls, French and the territory inspector; eight additional budget/history/map browser journeys pass.

Run the maintained isolated checks with:

```bash
php8.3 tests/client/indicator-economy.php
bash tests/client/run-production-checks.sh indicator --browser
bash tests/client/run-production-checks.sh policies
bash tests/client/run-production-checks.sh resources
npm run test:client
npm run build
```

The authorized local cutover deleted **game #29** through `AdminGameService::lifecycle`, including generated-file cleanup, then applied `2026_10_03_000000_simplify_indicator_economy`. The application was returned to live mode. Preserved row contents were verified by hash: 33 accounts, one saved map, 268 named geographic features, four resource profiles and one map draft. The local instance is ready for fresh games.

On another instance, delete disposable games through the admin game lifecycle before `php8.3 artisan migrate --force`. Do **not** use `game:reset-worlds`: it removes the saved map library too. Incompatible resource templates and the retired bundled civilian policy template are removed, rather than converted. Old financial reports/saves are not reinterpreted.

## Remaining work and limits

Player balance testing is next: untouched peaceful starts on varied geography, affordable army size, tax/ownership extremes, annexation needs, inequality and infrastructure return. Definitions and coefficients can be tuned without changing mechanisms. Combat replay determinism is not claimed.

Capacity currently persists through idling; no new resource-asset war-damage or neglect system was added. Infrastructure conditions affect productivity gradually through economic strength. Services/private provision are estimates, not simulated transactions. Nutrition shortfalls currently affect conditions and population growth; non-nutrition shortfalls are reported without a new generic penalty mechanism. The unchanged nation in the real-game test reached roughly 140 income and 80 treasury with no debt after 24 seasons, but still lacked household-goods supply on its test geography. That supply balance remains open. Reference prices remain fixed, domestic physical allocation is pooled, and trade/market clearing, migration, cities, provinces and the detailed constitution wizard remain future work. The retained UI is a diagnostic base; there is no additional layout redesign in this package.
