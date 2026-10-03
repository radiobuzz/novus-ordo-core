# Budget & Policies — compact summary and independent tabs

2026-10-01 design, implemented 2026-10-02: **[results and remaining work](economic-workspace-results.md).** Requested after playtesting the old screen; this does not select the indicator-led economy alternative or revive its earlier UI sketch. The evaluation below describes the pre-change screen. Finance is also a policy tab when the catalogue includes reserve controls; unmatched policies stay in Other.

## Finding

`EconomyPanel` currently stacks the civilian report, a two-column budget/policy area, food security, national indicators, territory details and the review/save panel. The budget column alone contains 15 cash-flow rows, six financing rows and four national-activity rows, each with actual/saved/draft columns. Every policy is rendered into one list despite existing category metadata. The top summary does not contain the seasonal balance.

Retained inputs/tables already protect refresh behavior, but do not solve the navigation burden. The change should reorganize existing information and keep the important financial result visible while editing.

## Proposed layout

One **permanent compact top panel** above the two columns—not another selectable tab. It contains the overview and the shared Review / Apply / Save / Discard controls, with action labels matching the existing command flow. These controls stay visible while either column scrolls; do not duplicate submission controls in individual tabs. Budget stays on the left and policies on the right. Each column gets its own independent tab selection and retained content. Choosing a policy tab never unexpectedly switches the budget tab.

The overview makes **seasonal surplus/deficit** the most prominent number. Alongside it show receipts, spending including interest, available treasury now / forecast closing treasury, and debt now / forecast closing debt. Values use the saved plan until editing produces a valid draft preview; distinguish that draft and its change from the saved forecast. Do not put three complete comparison tables in the overview.

A small seasonal-balance trend may join the overview once the history read is delivered; it must not crowd out the balance or top actions.

The balance excludes new borrowing and principal repayments, consistently with the minibar. Repayment is still a cash outflow; the closing-treasury estimate includes it. Keep the distinction visible in labels/help. Use the existing projection's fields; no economic calculation in a tab component.

A compact warning line remains visible regardless of tabs. Show the highest-priority issue and an issue count; selecting it opens the corresponding detail. All blocking errors remain discoverable and prevent saving, even in hidden tabs. Do not fill the summary with every warning paragraph.

## Budget tabs

| Tab | Existing content to place here |
| --- | --- |
| **Spending** — default | Military commands/upkeep, public operations, acquisitions, infrastructure, public expansion and support. Clear subtotal; recurring commitments distinguished from one-time actions. |
| **Revenue** | Taxes and public sales; distinguish actual receipts from national income. |
| **Debt & cash** | Borrowing, interest, principal repayment, arrears/default relief, credit and opening/closing cash reconciliation. Avoid counting financing twice. |
| **Civilian economy** | Needs met, food security/reserves, productive upkeep, worker use and national activity. Cash-account and production details remain optional disclosures. |
| **History / Trends** | Predefined national and industry graphs from the [economic history plan](economic-history-graphs-plan.md); recorded results, exact tables and minimal controls. |
| **Territories** | Existing local infrastructure/unrest/informal data and supported national indicators. Do not fabricate local earnings from national pooled accounts. |

Keep Last actual / Saved forecast / Draft forecast comparisons inside the selected detail tab. Reuse `MetricTable` and `CivilianEconomyView`; there should be no second copy of the same full report below the columns. Food security moves here rather than remaining a separate page-length panel.

## Policy tabs

| Tab | Current policy content |
| --- | --- |
| **Taxation** — default | Income tax and its parameters. |
| **Infrastructure** | Infrastructure funding and investment priority. |
| **Production** | Public productive-capacity funding and allocation choices, grouped by configured resource where present. |
| **Food security** | Agricultural development/priority, reserve target and emergency release. |
| **Institutions** | Existing public/private investment permissions. Explain that these permissions do not transfer ownership of existing assets. |

These are presentation groups, not new policy systems. Use catalogue categories and semantic effect/target metadata; the current `economy` category combines tax, emergency food release and investment permissions, so raw category grouping alone is insufficient. Implement a small explicit grouping helper, tested with custom resources and unfamiliar categories. Every available policy must appear exactly once; unmatched policies remain accessible in a labelled additional group. Show only groups with content; future health/education policies can add groups when they exist.

Retain short purpose/current-choice text and controls. Put long explanations behind optional details rather than repeating them at full length. Unsaved-change counts and invalid markers on tabs reveal hidden work. Do not put a separate Save button in each tab.

## Contextual explanations

Use the shared help icon/popover for short text blocks beside summary figures, policy headings and budget groups. Explain what the number means, what affects it, and when a choice takes effect. Useful topics include balance versus treasury movement, borrowing versus revenue, interest versus principal, policy purpose/tradeoffs and the contents of spending groups.

Help opens only after an explicit click/tap or keyboard activation (Enter/Space). Hovering, tabbing to a control or restoring focus must never open it. The same trigger closes it; Escape and clicking outside dismiss it. Reuse `Tooltip`, including its viewport positioning and Scope cleanup, rather than adding screen-specific behavior.

Keep essential warnings, invalid choices and immediate consequences visible. The help text provides explanation; it must not be the only place that reveals a problem. Author localized EN/FR text and keep each block focused.

## Scrolling, drafts and actions

- Desktop: keep the overview, both tab bars and the shared action controls in the top panel outside the scrolling content bodies. Each column gets at most one vertical scroller; no nested vertical table scrollers. Bound them to the available workspace, not a guessed full browser height. Preserve each tab's scroll position.
- Narrow layouts: retain the compact overview and offer a Budget / Policies switch, with the selected column's own tabs underneath. Keep one content scroller and the shared actions pinned at the top. Allow the compact top panel to wrap on narrow screens without pushing its buttons off-screen. Review shows changes across both sides, including hidden acquisition drafts from the planner.
- Use the existing `Tabs` component for keyboard navigation and selected-panel semantics, with text labels. Show a concise badge for hidden invalid or changed content. Long EN/FR labels must remain usable.
- Switching tabs does not rebuild controls, discard edits, refetch game data or start an independent preview. Confirmed data stays in GameDataService; GameplayService remains owner of the combined policy/acquisition draft and atomic save.
- A routine refresh preserves selection, input identity, focus, open details and scroll. Definition/context changes rebuild only as required and follow existing stale/conflict checks. Unknown/unavailable values remain unknown.
- While a preview is pending, keep the previous estimate explicitly labelled. It cannot enable saving. The permanent overview and selected reports must describe the same preview generation.

## Implementation steps if approved

1. **Group and project:** small feature-local policy/report grouping helpers; shared presentation calculation for the before-financing balance used by both overview and minibar. Preserve the existing server contracts and full report content.
2. **Recompose:** wrap retained policy groups and report tables in independent `Tabs`; replace the stacked page with the permanent overview, two content areas and shared top action controls. Reuse existing Panel, FieldShell, Disclosure, Tabs and semantic colours. No new UI framework or universal dashboard engine.
3. **Verify interaction:** edit policies in several tabs, switch either side, refresh, review and save one complete seasonal package. Verify hidden invalid inputs, cross-tab dependencies, planner drafts, delayed/failed previews, context changes and rejected/uncertain commands. Confirm no extra reads from tab selection and no repeated economic settlement.
4. **Check layout:** desktop and short-height windows, 390px EN/FR, keyboard-only use and long/custom catalogue labels. Verify that balance and actions remain visible at the top while scrolling, tabs do not reset scroll, all existing fields are discoverable, and the default view no longer presents the full accounting report.

Relevant files: `features/gameplay/EconomyPanel.js`, `economy.scss`, `MetricTable.js`, `CivilianEconomyView.js`, shared `ui/Tabs.js`, `app/headerFinance.js`, translations and focused browser tests. The financial projection should live at a shared presentation boundary if reused, rather than importing an app-shell component into a feature.

## Separate backlog

The subsequent implementation authorization also covered the treasury reserve control and confirmed manual repayment; they now live in Debt & cash, with a next-season reserve policy in fresh catalogues. See [results](economic-workspace-results.md). New economic map layers and economic rebalancing remain outside this delivery.
