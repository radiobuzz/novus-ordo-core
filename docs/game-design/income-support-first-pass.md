# Income support — first playable policy

2026-10-02. Small extension of the existing production economy, policy catalogue and seasonal transfer engine. It does not select the alternative indicator-led economy or change production balance.

## Player choices

- **Income support:** Disabled / Enabled. Disabled is the default.
- **Seasonal funding:** a nonnegative amount in credits, in steps of 0.01. This is a national total each season, not a per-person amount or a percentage.
- Save through the existing seasonal plan. Changes apply at the next seasonal boundary. Disabling preserves the entered amount and pays nothing.

Support transfers treasury cash to the aggregate household account before civilian purchases. Existing funding and credit rules apply; accepted military commitments remain protected. The actual transfer is capped by available government cash, with an explicit warning if requested support cannot be funded. Support is paid before discretionary production purchases, development and infrastructure funding, so it can reduce their available budgets.

It does not create money, goods, wages or taxable earned income. Later sales and production retain their own existing accounting. Support can improve purchases when affordability is the constraint, and those sales can encourage private expansion when the existing investment conditions permit it. It cannot guarantee output or growth when goods, inputs, workers, capacity or investment permission are missing. The first pass has one aggregate recipient and no means testing or regional allocation.

## Generic policy and presentation

The definition uses the supported effect `budget.income_support`, recipient `households`, with an amount parameter. Authoring and parameter validation use the existing catalogue machinery; there is no policy-specific choice table, custom formula or per-turn copy of definitions. Actual transfer amounts use the existing seasonal report and history fields.

Budget & Policies has an Income support tab. Spending compares requested and paid support. Civilian economy compares paid/requested transfers, needs fulfilled, commercial purchases and unmet needs, and identifies insufficient household purchasing power separately from supply constraints. Purchases sum recorded public/private purchases; they exclude subsistence and reserve releases. All estimates come from the same authoritative seasonal preview.

Public-expansion funding in both Budget & Policies and the production planner is visibly inactive under Private investment only. Its saved/draft values remain intact and reactivate when Mixed or Public is chosen. Invalid retained values still block saving. This clarifies an existing institutional restriction without changing investment rules.

## Availability and verification

Fresh games receive the civilian-finance v4 template. Game-owned catalogues remain independent. An explicit narrow authoring command can add only the disabled definition to a chosen game:

```bash
php8.3 artisan app:policies list
php8.3 artisan app:policies income-support POLICY_SET_ID --counter=CURRENT_COUNTER
```

No migration or reset is required. The command preserves existing choices, pending changes, economic balances, the current turn and testing permissions; it does not recompute completed seasons. Repeating it is a no-op. The local game #28 catalogue received this disabled, zero-funded addition (policy set #25, counter 1 → 2); no live season was advanced or support enacted.

Verification: 410 coordinated resolver checks; the isolated 20-season two-nation civilian checks followed by income-support preview, three ready-driven seasonal settlements and rollback/replay; and five desktop/French-mobile budget Chromium journeys. Checks cover capped funding, cash conservation, transfers versus earned income, conditional private expansion, neutral defaults, retained policy controls and seasonal submission. Production build, generated client checks and financial history projections also pass. Balance tuning and infrastructure maintenance/improvement clarity remain separate work.
