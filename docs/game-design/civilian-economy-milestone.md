# Civilian economy milestone — implementation contract

**Subsequent playable integration, 2026-10-01:** the authorized [live integration](civilian-economy-live-integration.md) now carries these mechanisms into actual new games and the economy panel. The isolated boundary below records the first milestone; it is not the current delivery limit.

2026-09-30. Authorized first implementation milestone following the economic reevaluation. This is an isolated, executable domestic economy using the shared `ProductionAccounts` ledger. The current live resolver, game definitions, database and UI remain in service. This does not select the earlier indicator-led replacement.

## Purpose and finish line

Demonstrate recurring civilian livelihoods without military demand, population growth, new construction, outside customers or replenished cash. Run supplied, subsistence-heavy, interrupted-supply, punitive-tax and unaffordable-public-budget scenarios across repeated seasons. Report both physical requirements and affordable/fulfilled requests, maintenance condition, paid work, income and cash circulation. Failure cases must remain visible; reconciliation alone is not success.

The broader destination remains eight goods (food, timber, iron, copper, fuel, construction materials, equipment, household goods), automatic public/private development, services, trade and situation-driven UI. This milestone uses only food, copper, equipment and household goods. Recipes and numeric fixtures are illustrative game assumptions, not approved live balance.

## Decisions for this milestone

- Population and installed capacity are fixed. Asset condition can fall when maintenance is missed and recover when funded maintenance resumes. Capacity is not silently rebuilt or expanded.
- Households are territorial groups. Enterprises are accounting counterparties and existing production sites; no company-management gameplay is introduced.
- Local subsistence uses a declared sustainable food ceiling and the same finite workers as paid employment. It creates household-owned food, no cash, wages or taxable sale. It reduces the household's remaining market requirement.
- Food and household-goods needs derive from population. Equipment demand derives from maintenance of existing sites. Recipe inputs derive from planned production. There is no exogenous military or construction order keeping copper sales alive.
- Each season uses opening inventories for business input purchases. New output supplies household consumption now and business inputs in the following season. This gives a bounded, explicit supply-chain delay without recursively restarting work after sales.
- Production targets use remaining civilian needs and derived business requirements, plus one season of intermediate-use inventory, less existing inventory, capped by effective capacity. This buffer matters: industrial stock sold this season must be replaced for next season's work. Funding, workers and available inputs further constrain delivery. Prices are fixed in this milestone; a target is not a promise of a sale or a funded order.
- Public support and public-service budgets are explicit choices paid from existing treasury funds. Public service work uses finite staff and capacity. No loans, automatic treasury recycling, deficit rescue or money creation are added.
- Taxes apply to paid wages and positive realized business earnings. After-tax profits are distributed subject to an explicit operating-cash reserve; retained money and household savings carry forward. Support and dividends are transfers, not newly earned income.
- Production costs include consumed inputs and wages. Equipment upkeep is an operating expense; unsold output retains its cost basis. Subsistence output has zero monetary cost basis but a recorded labor and physical cost.
- Essential food purchases precede discretionary household goods. Subsistence, upkeep, public services and production have declared allocation priorities. Stable IDs break ties; input array enumeration cannot change results. This is a simple allocator, not a claim of a competitive labor market or fair multi-region rationing.
- Reports distinguish actual results, selected policy, unmet requirements and recorded constraints. All quantities and money settle through six-place decimal accounting.

## Seasonal sequence

1. Validate the complete opening state, definitions and policy. Determine population needs, attainable subsistence and production/input targets. Set public support and service funding from opening funds.
2. Buy maintenance equipment and recipe inputs from owned opening inventories, with maintenance first. No buyer can spend another account's money or a seller's tax provision.
3. Perform subsistence and upkeep using shared labor. Prepare funded public services. Produce goods using owned inputs and wages within remaining workers, effective installed capacity and working capital.
4. Households consume their subsistence food and buy remaining food, then household goods. Public services are delivered without invented internal sales.
5. Pay permitted dividends and business tax, reconcile all flows, update maintenance condition for next season and carry the resulting state forward.

## Implementation and verification

1. Extend shared settlement with opt-in input recipes, opening input purchases, bounded subsistence, equipment upkeep and public-service delivery. Existing callers must retain their behavior.
2. Add a write-free `CivilianEconomySeason` orchestrator and explicit fixtures. It is an integration candidate, not a second deployed game mode.
3. Add a command-line report runner with plain-text and JSON output, backed by the same resolver used by tests.
4. Test multi-season survival, finite subsistence, civilian-driven copper use, shared labor, money/material/cost reconciliation, deterministic replay/order, interrupted supply and recovery, cash starvation, maintenance deterioration, taxes and public budget limits.
5. Run the existing pure accounting, production and peaceful-opening regressions. Record observed results and limitations below when complete.

No live cutover is part of this milestone. Integration later requires a single chosen resolver, state persistence/rollback, forecast parity, resource/policy catalogue adaptation and player UI verification. Full trade, prices, investment, migration, detailed health/education, environmental change and political consequences remain subsequent work.

## Implemented checkpoint — 2026-10-01

The five implementation steps above are complete for this bounded milestone. The live resolver and DB policy representation were not switched or replaced by this work.

- [CivilianEconomySeason](../../app/Domain/Economy/CivilianEconomySeason.php): pure, one-region seasonal orchestration, using the existing [ProductionAccounts](../../app/Domain/Economy/ProductionAccounts.php) settlement ledger with opt-in additions.
- [Scenario definitions](../../tests/client/fixtures/civilian-economy/scenarios.php): explicit opening accounts, inventories, population, installed sites, rules, policies and dated shocks.
- [Report runner](../../scripts/research/civilian-economy.php): seasonal text summaries and complete JSON reports, without a Laravel application boot or database connection.
- [Checks](../../tests/client/civilian-economy.php): multi-season scenarios, independent flow reconstruction, deterministic replay, validation and boundary cases.

Run from the repository root:

```bash
php8.3 scripts/research/civilian-economy.php
php8.3 scripts/research/civilian-economy.php --scenario=supply-shock --seasons=40 --full
php8.3 scripts/research/civilian-economy.php --scenario=supplied --json
php8.3 tests/client/civilian-economy.php
```

The default report runs all five scenarios for 80 seasons. `--full` shows every season; `--json` includes opening assumptions, inventories, constraints, accounts and every seasonal report. No report command changes game state.

### Observed behavior

Each fixture has 100 people and a fixed total money stock of 1,500. The figures below are game assumptions and experimental results, not claims about real-world economic policy.

| Scenario | Observed result |
| --- | --- |
| Supplied civilian economy | Food 100/100, household goods 10/10 and services 10/10 throughout 80 seasons. Recurring civilian demand sustains 6 copper and 2 equipment units per season. Accounts and inventories are unchanged between seasons 40 and 80: survival is not funded by steadily depleting opening reserves. |
| Subsistence-heavy economy | Households produce 70 food themselves and buy 30. All modeled requirements remain supplied for 80 seasons, using more worker time than the supplied fixture. |
| Copper supply interruption | Mine availability is zero in seasons 8–13. Household-goods shortages begin in season 9; missing equipment then damages maintenance and food output. Civilian shortages occur in seasons 9–22, with all needs met again in season 23. Asset condition has fully recovered by season 40, without reseeding stocks, money or installed capacity. |
| High tax, unchanged spending | At a 65% tax setting, season 80 has approximately 1,078.51 in the treasury but only 31.55/100 food consumption and no household-goods consumption. The report distinguishes insufficient purchasing power from unavailable goods. |
| Unaffordable public promises | Requested support of 500 is capped at the opening treasury of 400 in season 1. Support has priority, so public services receive no funding. Later spending is limited to available receipts; no deficit rescue is invented. |

The new suite passes 11,790 checks, including 400 main scenario-seasons and 180 additional tax/workforce sensitivity seasons. It checks money and physical conservation, reconstructed worker use, fixed assets, condition bounds, unmet-need accounting, preview purity, replay and input ordering. Targeted ledger checks cover input cost basis, phase restrictions, atomic rollback, finite subsistence and service delivery. Existing pure accounting (270 checks), production (367 checks) and peaceful-opening (154 checks) regressions also pass.

### Limits and next boundary

- Four goods, one region, pooled households and one existing site per resource. No autonomous investment, trade, migration, construction, variable prices or live UI is implemented here.
- The supplied fixtures deliberately calibrate taxes, spending, profit distributions and reserves for stationary circulation. Passing them does not establish that arbitrary fiscal choices or starting inventories are viable. The high-tax case holds public spending fixed; it is not a general verdict on taxation.
- The subsistence fixture still includes paid farming, mining and manufacturing. It demonstrates a constrained mixed livelihood, not self-sufficiency for every tundra region or a mapping from actual terrain to yields.
- Business inputs have an explicit one-season pipeline and finite founding buffers. Allocation follows fixed priorities, not price discovery or fair-market competition.
- Fully delivered upkeep includes bounded repair of lost condition. Partial upkeep only slows deterioration. Recovery from the tested interruption is demonstrated; recovery from every possible collapse is not. A completely disabled input chain may require intervention.
- Public services represent funded work and delivery only. Health, education, demographics and their downstream productivity effects are not modeled yet.
- The scenario policy is a small explicit input, not a replacement for DB policy definitions. Catalogue adapters, persistence, forecast parity and player-facing explanations remain integration work.

The next implementation decision is whether to extend this tested core with autonomous investment and the remaining resource chain. A live switch must explicitly choose one resolver and retire the replaced path; this experiment must not silently become a second deployed economy.
