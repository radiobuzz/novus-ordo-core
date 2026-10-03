# Economic history and reusable industry reports

2026-10-02. **Implemented foundation; [results and limits](economic-workspace-results.md).** National reads/graphs, generic industry reports, settlement summaries and policy markers are delivered. Optional forecast overlays, household disposable-income history and local attribution remain deferred. The design below records the agreed direction; it extends the [Budget & Policies layout plan](budget-policy-tabs-plan.md), not the economic rules. Infrastructure ROI remains a [deferred balance question](../game-design/civilian-economy-live-integration.md#deferred-playtest-follow-ups).

## Player experience

Add **History / Trends** to the budget side, with a compact seasonal-balance trend in the permanent top summary. Apply / Save / Discard remain visible at the top while graph details scroll. Start with 12 completed seasons; offer 24 and longer history without loading every industry and territory at startup.

An industry report opens from the production planner or a resource detail. Its resource is already selected. The same report can be embedded in a larger economy view; it does not create another editor, policy draft or save action.

Only three primary controls: **industry, question/view, period**. National budget views omit industry. Use named presets, not user-built formulas, arbitrary axes, dashboard layout controls or long parameter forms. Legend buttons temporarily hide individual series. Report instances keep their own selection, while sharing confirmed history reads.

## Predefined views

| Report | View | Presentation |
| --- | --- | --- |
| National | Revenue and spending | Two currency-per-season lines; an aligned surplus/deficit strip with a clear zero baseline. Borrowing is not revenue; principal repayment is financing. |
| National | Treasury and debt | Two aligned charts, separating cash on hand from outstanding debt. Neither is seasonal income. |
| National | Where money goes | Stacked seasonal spending bars using reconciled, non-overlapping categories; exact amounts available below. |
| National, later | Civilian income | Recorded income, taxes and a correctly defined after-tax measure. Do not label household cash balances as income or assume aggregate earned income equals disposable household income. |
| Industry | Are we producing enough? | Output and explicitly defined needs as lines, with a dashed capacity reference only when it represents the same output units per season. Distinguish needs, funded purchases and deliveries. |
| Industry, later | Is it profitable? | Sales revenue and matched costs, with realized profit/loss below. Enable only after consistent per-industry accounting summaries exist. |
| Industry | Is it developing? | Public/private capacity additions initially. Once actual investment expenditure is recorded by industry, show stacked investment bars and aligned capacity evolution below. Never label capacity units as money invested. |

Ownership breakdowns and input constraints are optional report details, not another wall of charts. Infrastructure spending and infrastructure level may later share an aligned view, without claiming that correlation proves a return on investment.

Overlay comparable series with the same units and seasonal basis. Different units use aligned plots with a shared time axis, never a default dual axis. Keep each plot to a few meaningful series. Installed capacity is not necessarily usable capacity: condition, inputs, workers and cash can constrain output. Label the reference accurately. Production can exceed current needs for stock replenishment; deliveries can exceed current production by drawing stocks. Subsistence and market production must have compatible coverage before comparison.

## Existing data and gaps

Source inspection, not a live-database audit:

- `EconomyService::settle()` saves `nation_details.economy_report` and `resource_report` on the next turn's nation detail. Reports include treasury flows, fiscal/debt results, national income/taxes, infrastructure payments and per-resource output, needs, deliveries, constraints and development quantities.
- `territory_production_states` saves installed capacity by turn, territory, resource and owner. `nation_resource_stockpiles` and `nation_economic_accounts` preserve stocks/cash separately. Aggregate capacity using ownership in the corresponding historical season; conquest must not silently look like investment.
- The national report has realized profit and development totals. The resource report is not yet a complete per-industry sales/cost/profit ledger. Resolver events contain additional detail but `settle()` does not persist the full event stream. Do not promise a profitability chart from national allocations or today's price multiplied by old production.
- `RankingsView.js` already has feature-local SVG history rendering and a table alternative. `RankingHistoryService` and `GameplayService.rankingHistory()` provide a history-read precedent, not an authorized source of private economic accounts or a complete rollback-safe cache design.

First implementation work must map each series to a saved field and its unit, owner, time boundary and coverage. Confirm which reports are finalized at season completion: Guard response costs can amend a report, while between-turn commands can change current cash. Founding state is not a completed economic season. Keep completed results, live balances and forecasts distinct.

## History contract

- Laravel exports bounded, authorized history for the player's nation, including game/nation identity, actual season boundaries, turn IDs/context revision, metric units and missing-data status. No public ranking route exposing private finances.
- Read recorded outcomes; never rerun past seasons through current policies or rules. Retain decimal precision in transport and exact tables; plotting may use numeric projections.
- Missing observations remain gaps, not zeroes. A new country gets an honest empty/one-season state. No old-save conversion, fabricated backfill or compatibility machinery.
- Define spending categories against the existing treasury reconciliation. Interest stays in spending; borrowing and principal repayments remain separate. Internal input transfers and inventory costs must not become duplicate cash expenses.
- Opening capacity explains that season's production; newly built closing capacity belongs to subsequent production. Record or derive these boundaries explicitly rather than shifting labels until curves appear plausible.
- Policy markers represent changes that actually became effective, not unsaved edits. Derive from recorded seasonal choices where possible. Mark rule edits only if recorded; do not invent an audit trail. A marker shows timing, not proof of causation.
- Forecasts are optional and limited initially to the existing next-season projection, visually dashed and labelled saved/draft. They never enter recorded history or imply a multi-season economic forecast.

## Reusable components and data ownership

Propose a small shared **time-series chart** for lines and stacked bars: series, units, season domain, display styles, optional markers, selected season and selection callback. It owns rendering/accessibility and Scope cleanup only. Existing RankingsView proves SVG feasibility; it lacks a reusable interface for these new reports. Extract useful primitives without forcing a ranking redesign or introducing a chart dependency by default.

A feature-level **industry report** chooses applicable presets from the game catalogue and available history fields. No hardcoded Food/Ore/Equipment branches. Abstract services appear only where their recorded activity has a valid identity and unit; do not manufacture a resource or a stock series to fit a chart.

Extend `GameplayService` with lazy, deduplicated economic-history reads coordinated with `GameDataService` context. No fetches or independent caches inside charts. Scope cached requests by game, nation, requested window and server context revision; invalidate on rollback/reset and discard late responses. Replayed turn numbers are not sufficient identity. Clear private data on access/scope loss, retain visibly stale data on recoverable failure, and do not let a history failure erase policy drafts or block unrelated actions. Bound cached windows; closing one report must not cancel a shared read needed elsewhere.

Use existing Panel, Tabs, Disclosure and help controls. Help opens only on explicit click/tap or Enter/Space. Graph values use an inline season readout selected by click/tap or keyboard; no automatic floating help popup. Aligned plots share that selected season. Supply an exact table alternative, readable labels, dash patterns as well as semantic colours, EN/FR, narrow layouts and reduced-motion behavior. Refresh preserves view, period, hidden series, focus and scroll.

## Delivery packages

1. **H1 — Historical data contract and national read.** Prove season alignment and financial reconciliation from persisted reports. Add the smallest typed, owner-authorized read and shared client read lifecycle. No new table unless the field audit demonstrates a need.
2. **H2 — National graphs and shared chart.** Deliver revenue/spending, treasury/debt and spending breakdown, with exact tables and a summary trend. Integrate into the budget tab redesign; if that layout is not yet delivered, mount one retained Trends view without duplicating the old full report stack.
3. **H3 — Generic industry report.** Deliver production/needs, correctly labelled capacity and public/private capacity additions. Reuse the report from planner/resource details. Explicitly hide unsupported presets rather than showing invented or empty financial charts.
4. **H4 — Financial detail and annotations.** Persist minimal per-industry seasonal summaries at settlement where needed, with defined revenue/cost/profit attribution and actual investment spending. Reconcile them to existing accounting; include rollback/deletion lifecycle. Add reliable policy markers and optional next-season forecast overlays. This records outcomes; it does not change economic mechanics or require storing every ledger event.

Verification gates: saved-result equality, no double counting, season timing, custom/renamed resources, private-data access, rollback/replay invalidation, shared-read counts and late responses; then empty/single/flat/negative/missing series, legend toggles, keyboard/touch, EN/FR, narrow layout and retained drafts/focus. Use isolated fixtures and disposable test games. Measure longer-history query/payload/render cost before expanding the default window.

Deferred: territory-level financial reports without attribution, international markets not yet simulated, causal ROI estimates, arbitrary chart builders, new economic indicators or rebalancing. H1–H3 and H4's recorded summaries/markers are delivered; optional forecast overlays remain open. See the results document before starting follow-up work.
