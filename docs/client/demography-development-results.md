# Demography & Development — first pass

Implemented 2026-10-03 under **Nation → Demography & Development**. The Overview tab retains identity, command summary, territories and a compact income outlook. Budget remains the place for money, forecasts and policy editing.

## What the player sees

- Population and the existing modelled seasonal natural growth rate. Growth excludes changes in territory ownership.
- **Economy & development:** economic strength, dynamism and infrastructure.
- **Living conditions:** health, education and environmental quality.
- **Social pressures:** inequality, crime, unrest and informal activity.

Each indicator has its current value, change since the preceding recorded season, an explicit higher/lower-is-better label and click-only help. A decrease in crime, for example, is favourable. Changes use percentage points: 60% to 65% is +5 pp. These are game indices; inequality is not presented as a measured Gini coefficient.

Three overlaid charts share a fixed 0–100% scale and season selection. Their legends toggle individual series; exact observations remain available in tables. Existing double-click/button enlargement and keyboard selection work. The period selector offers 12, 24 or 96 seasons. National averages can move when territory ownership changes; policy markers indicate timing, not causation.

## Reusable boundaries and data

`ui/IndicatorTrends.js` composes MetricCard, Tooltip and TimeSeriesChart. It accepts group metadata, current/previous percentage values, recorded points and markers. It owns presentation, legend/selection state and resource cleanup; it neither reads APIs nor calculates game rules. `TimeSeriesChart` adds an optional validated fixed domain, also used in enlargement; its existing consumers retain automatic ranges.

`features/gameplay/DemographyView.js` supplies translated EN/FR labels and projections from `demographySeries.js`. It consumes GameplayService’s existing game/nation/turn/revision-scoped history read, shared with Budget and the planner. History loads on opening the tab. Ordinary publications retain chart nodes, focus and compatible choices. Changed context clears history; request sequencing rejects late window responses. Read failures expose retry, preserve current conditions and clearly label retained history as stale.

PlayerWorkspace adds machine-readable population and growth fields using the same cached model methods as the existing demographic stats. Charts read indicators already recorded in economic reports. At turn N, the current state reflects season N−1; seasonal change compares it with season N−2. Missing or invalid observations remain unknown, and missing preceding seasons never become fabricated changes.

No schema, migration, history table, backfill, economic rule or live nation change. Health/education policy commitments, ethnicity and migration remain separate future work.

## Verification

- Projection checks: ten distinct indicators, correct social-pressure directions, real zero, missing/invalid values, consecutive-season comparison and source immutability.
- Four demography Chromium journeys: lazy reads, seasonal changes, retained tabs/chart nodes/legend/focus on refresh, fixed scale in enlargement, failed-read retry/empty history, French 390px layout, click-only help and late window response rejection.
- Six existing budget Chromium journeys passed with the shared chart extension.
- All 287 client tests passed. The suite was rerun outside the sandbox because its existing flag-validator PHP stdin subprocess times out within the sandbox. The final stricter missing-value projection also passed its focused checks.
- Generated-client and PHP contract checks, PHP syntax, build and diff whitespace checks passed.
- Read-only local game #30 at turn 5: both nations expose population/growth, all ten current indicators and four recorded seasonal observations. No seasons were advanced by these checks.

Physical devices and other browsers remain untested.
