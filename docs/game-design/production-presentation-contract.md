# Production presentation — Package E

> Historical implementation, superseded on 2026-10-03 by the [indicator economy replacement](indicator-economy-replacement-results.md). Wallets, wage/profit accounting and split capacity described below are not current runtime contracts.

2026-09-29. Player presentation of the coordinated production economy. No new economic rules, tables, migrations or game resets.

## Delivered screens

- **Resource bar:** the main stock figure is government-owned inventory. The smaller figure explicitly says estimated output per turn. Disclosure separates last season's actual national output, next-season production, current commitments/availability and estimated closing stock. Currency and recruitment retain their own meanings.
- **Government acquisitions:** definition-driven resource cards edit quantity, spending limit and integer priority (lower first). Resource units come from catalogue metadata. Changes automatically enter the existing shared draft. The comparison shows last actual / saved next season / draft next season for the effective request (including reserve policy), reference price, public/private output, public delivery/private purchase, purchase expense, public delivery cost basis, shortfall, closing reserves and capacity additions.
- **Budget & Policies:** treasury movements, financing and national activity are separate sections. Income and private investment are not presented as treasury receipts/expenses. Infrastructure payments are included in the cash detail. Financing details belong to the displayed totals; they are not extra charges. Food comparisons include civilian fulfillment and unmet demand.
- **Owned territory inspection:** saved-plan output by resource and public/private owner, current installed capacity, new capacity usable after the forecast season, geographic potential, shared workforce and observed production constraints. Foreign territory inspection does not receive another nation's private projection.

Public delivery cost basis is informational inventory cost, not another bill after operating wages. New capacity does not increase the season's current capacity. No independent local profit or tax allocation is invented: realized profit remains nationally pooled, and local income attribution is deferred. A lack of observed production constraints does not imply all potential must be used; demand also matters. Observed production constraints do not explain every acquisition shortfall, which can also involve purchasing funds and civilian needs.

## Data and ownership

`ProductionEconomySeason` exposes its already-calculated opening territorial inputs to the read adapter. `ResourceLedger` groups production attempts once, then supplies territorial source/output/capacity/constraint projections and the nation's stored last resource report. It performs no second simulation and adds no stored allocation. The extra opening inputs are not persisted in seasonal reports.

`GameDataService` still owns confirmed workspace data; `GameplayService` owns the combined policy/acquisition draft. Save, preview, revision fencing and reconciliation remain the Package D contract. Territorial inspection uses confirmed saved-plan projections, not a separate request or unsaved draft preview. Exact input strings are retained; displayed numbers may be rounded for readability. Priority rejects blanks, fractional values and out-of-range integers.

Existing native controls, FieldShell, Button, disclosures, tables, semantic styles and resource metadata are reused. No new generic component framework, cache, API or UI dependency. Labels and help are provided in EN/FR, with stacked controls and scrollable comparison tables on narrow screens.

## Verification

- 349 pure coordinated economy checks.
- 131 isolated lifecycle checks, including opening-versus-developed capacity in inspection, historical report provenance, atomic plans, passive seasons, rollback/replay, grants and military commitments/response settlement.
- Focused acquisition, gameplay and live-data Node suites; client definition/route checks; production build.
- Real-backend Chromium: exact combined policy/quantity/budget/priority save, refresh preserving the input node, stale-counter rejection, invalid precision, comparison labels, EN/FR and narrow layout. Desktop and narrow screenshots inspected. Territory inspection is checked in the same isolated browser fixture.

All mutable verification uses a disposable database under `/tmp`. Application games were untouched. Reference prices/coefficient balance, local earned-income attribution and broader browser/device coverage remain outside this presentation package. [Package F](production-retirement-results.md) completes the retirement/cleanup pass.
