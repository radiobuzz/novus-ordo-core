# Economic workspace — implementation results

2026-10-02. Implements the approved [Budget & Policies layout](budget-policy-tabs-plan.md) and [economic history plan](economic-history-graphs-plan.md). This improves inspection and financial controls around the existing economy; it does not select the indicator-led replacement or rebalance production.

## What players can use

- A permanent financial summary and Review & save / Discard controls. Budget and Policies have independent tabs and scrolling on desktop; a Budget / Policies switch keeps the mobile layout compact. Actual / saved / draft comparisons remain in the detail tabs. Invalid values block saving even when their tab is hidden.
- Click-only help beside policies, seasonal balance, report headings and the automatic repayment reserve. Hover and focus do not open help.
- National history: revenue/spending, seasonal balance, treasury/debt and a spending breakdown. Borrowing and principal repayments stay outside income/spending. The summary includes a small balance trend.
- Generic industry reports: output versus civilian/industrial needs, condition-adjusted capacity, public/private investment and installed capacity, sales/costs and operating results. Open the same report from a resource in the production planner. Three main controls select industry, question and period; embedded reports already know their industry.
- Click or keyboard selection of a season, aligned plots, legend toggles, policy-change markers and exact-value tables. The default history window is 12 completed seasons; 24 and 96 are available. EN/FR labels and narrow layouts are supported.
- Debt & cash shows the current automatic repayment reserve. Fresh default policy catalogues include a Treasury reserve amount, including zero, applied next season through the existing policy draft. A separate confirmed Repay debt now action transfers available treasury to the lender and reduces principal immediately. Accepted command commitments remain protected; deliberate repayment may go below the automatic reserve.

## Data and accounting

`EconomicHistoryService` reads recorded nation/resource reports. A report stored on closing turn N describes completed season N−1; founding is excluded. The authenticated endpoint resolves the player's nation itself and checks turn/revision before and after loading. The compact payload excludes territory snapshots. `GameplayService` shares reads by game, nation, revision, turn and window; rollback invalidates them and late responses cannot replace current data. Opening another report does not create another draft or polling loop.

`IndustryHistory` adds a small per-resource public/private summary to each newly resolved seasonal report. It uses existing events and capacity snapshots; it does not introduce companies, new settlement rules or another ledger. Recognized operating costs are sold inventory cost plus productive maintenance; investment is separate. Unsold inventory costs remain inventory. Results are before tax. Public own-use produces no sale receipt, so the profit chart is not an assessment of the social value of government production. Subsistence remains separate from commercial output. Condition-adjusted capacity is not a guarantee of output: workers, inputs and operating cash can still constrain it. Civilian/industrial needs are not necessarily funded orders or purchases.

History never reruns past seasons under current rules. Missing observations stay gaps; unsupported profitability views are disabled. Existing reports can supply national trends and resource quantities, but complete industry financial/capacity observations begin with the next resolved season. No invented backfill.

Manual repayments change current stockpile/debt/lender state and record a current-turn cash action. They do not rewrite the completed seasonal report. The normal transactional command context, reconciliation and rollback apply. A future seasonal report starts from that updated treasury.

## Rollout

No schema migration, game reset, live conversion or live game mutation is required. Existing game policy sets are not silently edited. They retain their game reserve rule unless a reserve effect is explicitly authored; fresh default games receive the new policy. The reserve label and manual repayment action work with the current economy in existing games.

## Verification

- Coordinated production checks cover reserve protection, zero reserve, repayment counterparties and cash conservation.
- An isolated 20-season, two-nation run covers actual/forecast equality, persistence, rollback/replay, bounded history, industry cost/result reconciliation, current repayment and rollback of its action.
- Client checks cover financing separation, generic resource history, missing observations, shared reads and late rollback responses.
- Chromium checks cover retained edits, independent tabs, fixed top actions, readable mobile controls, national/industry views, keyboard selection, one shared history read, explicit repayment confirmation, invalid hidden policies and French layout. The authenticated save journey also checks recorded history ownership/context and planner reports.

The coordinated resolver suite passed 398 checks; the 20-season run passed 5,423 additional civilian checks plus the existing lifecycle checks and the added history/repayment assertions. Generated contracts, production build, targeted graph/header/help browsers and the authenticated policy/production save journey passed. The broader Node run passed 54 of 55 test files inside the sandbox; the flag file hit a PHP subprocess timeout there and passed all three tests when rerun outside it. No unrelated source changes were needed for that environment issue.

## Remaining work

The follow-up UI polish fixes the Revenue/Recettes heading, a short policy scrolling area and the undersized full-chart miniature. The compact chart is now an axis-free sparkline in the flattened top summary; desktop figures and status/actions use two rows. Focused browser checks cover these reported cases. No reset is required.

All current game charts now support double-click enlargement and a labelled button for keyboard/touch use, including the summary sparkline, national/industry/planner time series and current/historical rankings. The shared native dialog reuses recorded data, exposes units/legend/exact observations, retains time-series selection and legend choices, and closes on Escape/cross or feature disposal. Narrow screens scroll the chart horizontally rather than shrink axis labels. Five focused Chromium tests and the production build pass; enlargement introduces no new server reads, rules or schema changes.

The budget now prioritizes Change in treasury in the fixed summary, with a signed value and positive/negative tone. This is closing minus opening cash, including financing; seasonal balance remains distinct. Debt & cash puts treasury change and opening/closing cash first, with manual repayment underneath the entire report. Both figures reuse authoritative forecast/report values; this is presentation only.

Economic map layers remain deferred until pooled income, consumption and investment have honest territory attribution. Household disposable-income history, causal infrastructure ROI estimates and optional forecast overlays are not delivered. Rebalancing remains a separate playtest task. The current charts provide evidence for that work without adding new simulated indicators, provinces, markets or trade.
