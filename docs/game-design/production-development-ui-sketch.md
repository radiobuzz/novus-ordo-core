# Production, ownership and development — UI planning sketch

2026-09-29. **Proposal for review, not implemented gameplay.** The conversation sketch uses explicitly illustrative data and no game APIs. Existing games, catalogue definitions and simulation behavior are unchanged.

Follow-up: the user endorsed the presentation and emphasized that it must be the blueprint for all supported resources. The [implementation plan](production-development-implementation-plan.md) defines genericity requirements, ordered packages and outstanding accounting contracts; the sketch remains illustrative.

## Purpose and agreed direction

Show the journey from geographic opportunity to productive capacity, national production, government acquisition and reserves. The player remains the national government. Private output is not automatically government property; public output still incurs costs. Development persists and adds usable capacity in a later season. A higher production request cannot instantly create workers, capacity or resources.

The user explicitly wants both national production and government-owned goods visible in the resource bar. Government stock, committed stock and stock available for new actions are distinct. National production is a seasonal flow, not a second inventory or an automatic addition to government reserves.

The conversation supports domestic private investment following opportunities and public development following government priorities. Using the national budget directly for public enterprises is a proposed initial simplification. This sketch does not freeze ownership transitions, private reinvestment allocation, pricing or settlement algorithms.

## Screen contract

| Surface | What it answers | Proposed interaction |
| --- | --- | --- |
| Resource bar | What do we own now, and what did our country produce? | Main figure: owned stock. Separate explicitly dated national production. Select resource to disclose commitments, available stock and next-season forecasts. |
| Resource planner | What additional goods should government acquire, at what cost, and can they be delivered? | Quantity creates a draft automatically. Show source, purchase/operating cost estimate, expected fulfillment, constraints and reserve reconciliation. |
| Budget & Policies | What changes in public finances and what policies govern activity? | Existing desktop columns: policy context and budget. Separate purchases, public operating expense, development expense, tax receipts and public sales receipts. |
| Territory inspection | Why is output this high or low, and what could development change? | Comparable potential, developed capacity, workforce ceiling and expected output; explicit limiting factor and ownership context. Income breakdown is a disclosure candidate, not mandatory map clutter. |

Keep last season's actuals, next season under the saved plan and next season under the local draft distinct. Never call the saved-plan forecast an actual result. Editing a request changes forecasts, not current treasury or owned inventory. Queueing applies at the seasonal boundary and remains editable until lock, consistent with existing policy planning.

Private and public examples are selected in the **study controls**, not via a new instant ownership switch in the player UI. Mixed activity should ultimately show a source breakdown; it is omitted here to avoid inventing an allocation rule. Currency and recruitment retain their own meanings rather than inheriting stock-resource fields.

## Illustrative one-sector scenario

This is an intentionally closed example for UI arithmetic, not a proposed national balance or live-game data. No other civilian buyers, industries, inputs, borrowing or imports are included.

- Opening government cash: 200 credits; ore owned: 8 units; already committed military use: 4 units; available for new actions: 4 units.
- Last season's example production and government acquisition: 8 units. Last closing government stock: 8 units (opening 4 + delivery 8 - use 4).
- Saved next-season request: 6 units. Initial unsaved draft: 10 units. Quantity control permits 0–20.
- Potential output under reference conditions: 30 units/season; developed capacity: 14; available workforce limits production to 12. Potential output is not remaining underground reserves.
- Actual delivery in this demonstration: smaller of request and workforce ceiling. No initial producer inventory. National production equals government delivery only because the example has one supplier activity and one buyer.
- Private example: indicative purchase price 10 credits/unit, wages 6/unit, producer profit 4/unit, illustrative tax 20% on wages and profit. Price is fixed solely to make the sketch readable; no pricing algorithm is selected.
- Public example: operating wages 6/unit funded through the treasury; illustrative wage tax 20%; internal delivery produces no sales revenue or profit. No external public sales in this example.
- Default private draft: expense 100, wage income 60, producer profit 40, tax 20, closing government cash 120, government ore 14. The producer must have operating funds; the UI's private example assumes at least 84 opening credits, enough to fund the illustrated developed capacity. It does not create working capital from an unpaid order.
- Default public draft: expense 60, wage income 60, wage tax 12, closing government cash 152, government ore 14.
- Neither forecast assumes new investment or same-season capacity growth. Private after-tax profit is shown as a possible source of future investment, not an automatic completed project or government receipt.

These examples are **not a competitiveness comparison**: identical costs, no civilian buyers, no public-enterprise overhead and different treatment of surplus are simplifying assumptions. The apparently cheaper public acquisition is not evidence that one ownership arrangement should dominate gameplay.

## Constraints and unresolved rules exposed by the sketch

1. **Acquisition timing:** the sketch settles new delivery at the boundary and uses only already-owned goods for existing military commitments. The implementation must say which future deployments/operations can consume which deliveries. Never make forecast stock immediately spendable.
2. **Affordability and payment:** forecasts need funded requests, not unlimited bids against hypothetical taxes. The initial example is affordable from opening treasury and assumes funded private operating wages. Payment on delivery, production finance, partial delivery and unsettled commitments still need a precise seasonal rule.
3. **Supply versus output:** a real economy can have opening private inventory, civilian demand and other purchases. National production is neither supply available to the government nor total sales. The real resource breakdown must preserve those differences.
4. **Public expenses:** charge operating expense once. Do not additionally charge an internal acquisition price for the same public goods. Wages remain income to their recipients. Unsold private output is inventory, not sales revenue.
5. **Civilian income:** the current general territorial income formula must be reconciled with explicitly modeled resource wages/profit. Adding both without defining their coverage would double-count activity.
6. **Development controls:** who funds each project, private investment response, public priorities, subsidy treatment, capacity costs/timing and upkeep remain to be designed. The sketch deliberately shows no funded development instead of hiding invented rules behind a slider.
7. **Forecasts:** all estimates are visibly forecasts. Fixed demonstration prices do not justify precise live market predictions. Ranges and reasons for uncertainty need an actual forecasting method.
8. **Shortages:** show requested versus delivered, paid amount and the binding constraint. A workforce shortage should not imply that expanding extraction alone solves it. Funds and shared labor allocation must reconcile across all sectors in the actual simulation.

## Integration sequence proposed for the next implementation plan

1. Close the single-season accounting example, including working capital, household demand, source ownership, affordability, partial delivery and the existing income abstraction. Decide a bounded sequence rather than repeated within-season income loops.
2. Define authoritative current-stock, production-actual, acquisition-plan, forecast and settlement-report meanings. Keep seasonal state/history separate from policy/resource definitions; do not copy definitions each turn.
3. Implement the smallest productive-capacity and funded-acquisition slice through existing catalogue and policy machinery. No individually persisted companies or factories; no compatibility bridges, new resources, live migration or world reset in this planning task.
4. Adapt existing resource header, planner, EconomyPanel and territory inspector. Reuse existing controls, formatting, EN/FR labels and responsive columns. Shared data ownership remains with existing services; presentation components do not calculate the economy. Review the client-data skill before changing these contracts.
5. Verify conservation/transfer accounting, no double taxation/counting, labor/capacity limits, unaffordable and partial requests, public internal transfer, same-season growth prevention, saved/draft preview parity, repeated seasons and rollback. Then verify current/saved/draft/history labeling in desktop and narrow UI.

## Sketch validation

Chromium inspection and interaction checks passed for private/public forecast arithmetic, partial fulfillment at the workforce ceiling, stock disclosure, queue/discard and screen navigation. All three screens were checked for horizontal overflow at 1024, 736, 390 and 320px. Desktop and narrow screenshots were visually inspected; no script errors were observed. The check used only the local fragment and illustrative data, not a server or database. Host-specific state persistence/design controls, localization, other browsers and live-engine behavior are not covered by these checks.
