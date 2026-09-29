# First economic season — worked examples and accounting checks

Date: 2026-09-27. **Discussion experiment only.** No game, database, policy template, or application economy was changed. Game 9 was not used. The numbers are illustrative, not approved balance settings.

This follows the implemented [policy machinery](policy-system-first-pass.md) and tests the subsequent economic decisions. The reproducible [standalone Python exercise](../../scripts/research/economy_season_dry_run.py) produces [the full result file](data/economy-season-dry-run.json).

## What the exercise established

The proposed fiscal sequence can reconcile treasury cash, debt, actual program spending and local reinvestment. There is a useful early warning before bills become unaffordable. Infrastructure priorities change the destination of improvements without diverting upkeep. Recovery is possible under an explicitly improved budget/income scenario.

Three findings need to inform implementation:

1. **Delayed tax evasion can reward tax switching.** A slow, symmetric response rewarded repeatedly alternating very high and low tax rates in the revenue-only trial. A tested alternative responds to higher taxes within the season and returns to formal activity more slowly; none of the tested recurring schedules beat the best constant tax rate under that alternative. This is a potential exploit to investigate with growth and unrest feedback, not proof that switching taxes dominates in a complete economy.
2. **Financial distress is broader than debt default.** With interest paid first, an oversized army loses funding before the nation misses interest payments. Infrastructure cuts and desertion risk must be visible even when the treasury has not formally defaulted. The exercise treats unpaid interest as default; it does not grant debt forgiveness whenever a development request cannot be funded.
3. **Income settlement remains an explicit implementation boundary.** The exercise starts from assumed, funded civilian income. It proves how that income is split and transferred, not how buyers, production and income generation balance in an endogenous economy. Output value must not silently become newly minted treasury cash or a second spendable private balance.

## Decisions agreed in the discussion

These are gameplay directions, independent of the sample coefficients below:

- Tax revenue replaces labor-produced government money in the first economic implementation. Other existing resource mechanics remain in place during this step.
- Borrowing can finance the requested seasonal budget, including infrastructure, up to a limited capacity. Debt carries interest; bankruptcy and recovery are possible.
- Payment order is **interest → military upkeep → infrastructure**.
- New deployments between turns require available cash; they do not automatically draw loans.
- Retain a treasury reserve, then automatically use excess cash to repay principal.
- Excessive taxation encourages a black market and unrest. Informal activity escapes tax but still supports livelihoods. Separate crime mechanics are deferred.
- Infrastructure funding and infrastructure investment priority are separate policies. Initial priorities: population, regional development, and economic concentration. Regional development is the provisional default.
- Fund existing infrastructure upkeep first. Allocate the remaining program funds to improvements under the priority policy. Underfunded upkeep causes gradual deterioration.
- Domestic reinvestment is included from the first economic pass. It initially remains in its originating territory. Interterritorial investment flows and dedicated incentives come later.
- Bankruptcy can provide partial debt relief with consequences. Approaching financial trouble must be visible early.
- Underfunded divisions have a **chance to disband through desertion**, producing news. Do not add a readiness system in this pass.

Implementation recommendations used by this exercise, not separately frozen user decisions: equal percentage military funding, a graded desertion probability, no refund upon desertion, one restructuring per continuous default episode, and no obligation to immediately repay principal merely because borrowing capacity fell. These make the above directions concrete enough to test.

## Seasonal order used for the accounting exercise

1. Activate the submitted national policies at the boundary. Capture opening local state, cash, debt and debt-service obligations.
2. Establish earned civilian income using opening productive conditions. For this experiment it is an externally supplied, funded scenario input. Existing informality supplies the baseline split; the timing comparison below tests the reaction to a newly changed tax rate.
3. Transfer taxes from formal income to the treasury. Leave untaxed income with the civilian economy, including informal earnings. Account for consumption, local investment and retained civilian savings separately.
4. Calculate infrastructure need: upkeep plus a bounded, feasible improvement program. The funding policy requests a fraction of that requirement. A 100% setting is not permission to spend unlimited money.
5. Calculate affordable borrowing from the deficit and opening credit capacity. The sample uses recent realized receipts, not this season's newly selected tax rate. Borrowing is not revenue and is not taken simply to refill the desired reserve.
6. Pay interest, military upkeep, then the infrastructure program. Divide scarce military funding proportionally. Within infrastructure, pay upkeep before improvements.
7. Record unpaid interest explicitly. If it causes a new default, restructure once and restrict new credit. Debt relief reduces the liability; it does not put cash in the treasury.
8. Retain available reserve cash and repay debt from any excess. Apply the desertion check to the already-calculated funding shortfall. Do not refund this season's expenditure because a division deserted.
9. Commit local infrastructure, capacity, informality and unrest changes. New productive capacity and infrastructure improvements affect subsequent seasons, not a recursive second pass through this season's tax collections.
10. Produce the closing cash/debt ledger, territorial results, news and financial warnings.

For future game integration, place desertion at an explicit point before the division's subsequent actions and remove its pending commands consistently. This script does not execute combat, deployment commands or game rollback. Its named event seeds are for repeatable research, not a new promise about production-game random replay.

## Illustrative inputs

Money is in arbitrary game units. One turn is one season. Population is constant in this exercise.

| Territory | Population | Earned income | Informal share | Opening infrastructure | Tax at 25% |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core | 4,000 | 6,000.00 | 10% | 80/100 | 1,350.00 |
| Interior | 4,000 | 3,000.00 | 15% | 50/100 | 637.50 |
| Frontier | 2,000 | 1,000.00 | 20% | 20/100 | 200.00 |
| **Total** | **10,000** | **10,000.00** | — | — | **2,187.50** |

Trial coefficients:

- Basic civilian consumption need: 0.40 per person per season. Twenty percent of the positive remainder after tax and those needs funds local investment, subject to a construction cap; other income remains civilian savings.
- Infrastructure upkeep: level × population / 10,000. Total upkeep here is 56.00. Improvements cost population / 100 per infrastructure point, with a maximum two points per season and an overall level cap of 100. Full program requirement is 256.00: 56.00 upkeep plus 200.00 improvements.
- Interest: **5% per season** for these worked stress examples, not a recommended normal rate. Annual-versus-seasonal calibration still needs care. Only opening principal bears this season's charge; new borrowing starts accruing next season.
- Credit limit: three times the mean of the previous four seasons' realized tax receipts. With an assumed historical mean of 2,000, the opening limit is 6,000. The multiplier, history window, founding initialization and inclusion of economic strength remain provisional.
- Desired treasury reserve: 500. Its production rule still needs calibration to meaningful between-turn costs.
- Desertion chance: 35% × the unpaid military fraction, checked once per division per season. Even total nonpayment does not guarantee immediate disbanding in this trial.
- First default in an episode: capitalize explicitly unpaid interest, write off 50% of the resulting debt, add an unrest shock, and block borrowing for at least four seasons. Continuing default does not grant a fresh haircut every turn. These particular penalties and percentages are not adopted game balance.

## Four fiscal situations

All except the bankruptcy case use the income table above and request the full infrastructure program. The bankruptcy case assumes civilian income collapsed to 4% of normal and historical receipts have also deteriorated; this is a supplied shock, not a modeled result of the current tax policy.

| Item | Affordable | Borrowed budget | Credit exhausted | Bankruptcy |
| --- | ---: | ---: | ---: | ---: |
| Opening cash | 200.00 | 100.00 | 100.00 | 10.00 |
| Opening debt | 500.00 | 4,000.00 | 5,900.00 | 6,000.00 |
| Tax receipts | 2,187.50 | 2,187.50 | 2,187.50 | 87.50 |
| New borrowing | 0.00 | 1,668.50 | 100.00 | 0.00 |
| Interest due | 25.00 | 200.00 | 295.00 | 300.00 |
| Interest paid | 25.00 | 200.00 | 295.00 | 97.50 |
| Military requested | 1,000.00 | 3,500.00 | 3,500.00 | 3,500.00 |
| Military paid | 1,000.00 | 3,500.00 | 2,092.50 | 0.00 |
| Infrastructure paid | 256.00 | 256.00 | 0.00 | 0.00 |
| Principal repaid | 500.00 | 0.00 | 0.00 | 0.00 |
| Unpaid interest added to debt | 0.00 | 0.00 | 0.00 | 202.50 |
| Debt relief | 0.00 | 0.00 | 0.00 | 3,101.25 |
| **Closing cash** | **606.50** | **0.00** | **0.00** | **0.00** |
| **Closing debt** | **0.00** | **5,668.50** | **6,000.00** | **3,101.25** |

**Affordable:** every request is funded; repayment clears the debt. Cash can remain above the desired reserve once there is no principal left to repay. No division has a financial-desertion risk.

**Borrowed budget:** every request is still funded, but only 331.50 of opening-limit credit remains. Another comparable deficit would exceed that headroom. This is the early warning the user requested: it appears before a missed payment. The warning holds the budget/income approximately constant and is explicitly not a prediction of an exact bankruptcy date.

**Credit exhausted:** interest is paid, but the military receives about 59.79% of requested upkeep. Each division has about 14.075% desertion risk under the trial curve. Infrastructure receives nothing and gradually deteriorates. This is serious fiscal distress without a contractual debt default. Different research seeds produce both desertion and no-desertion outcomes; the treasury calculation is identical either way.

**Bankruptcy:** funds cannot cover interest. Relief halves the debt including the recorded interest arrears, with zero cash created. The named sample event disbands the artillery division and produces news. Under continued depressed income the following season, interest again goes unpaid and debt rises to 3,167.56; there is no second automatic haircut. Relief does not itself restore income or make an oversized army affordable.

### A possible recovery, not a guaranteed one

For a separate recovery branch, explicitly restore the assumed income, reduce military upkeep to 500 per season, and select 50% infrastructure funding. No new borrowing is available during the four-season restriction. The result is:

| Recovery season | Tax receipts | Principal repaid | Closing debt | Closing cash | Credit restriction seasons remaining |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2,218.75 | 936.19 | 2,165.06 | 500.00 | 3 |
| 2 | 2,242.19 | 1,506.08 | 658.98 | 500.00 | 2 |
| 3 | 2,259.77 | 658.98 | 0.00 | 1,439.61 | 1 |
| 4 | 2,272.95 | 0.00 | 0.00 | 3,083.98 | 0 |

The small changes in receipts reflect the provisional informality response. The large income recovery was an explicit fixture assumption; this does **not** show that economic recovery will happen automatically in four turns.

## Infrastructure priorities produce a meaningful choice

At 50% funding, the program receives 128.00. Upkeep takes 56.00 regardless of investment priority. The remaining 72.00 goes to improvements:

| Priority | Core | Interior | Frontier | Total improvements |
| --- | ---: | ---: | ---: | ---: |
| Population | 28.80 | 28.80 | 14.40 | 72.00 |
| Regional development | 14.69 | 32.33 | 24.98 | 72.00 |
| Economic concentration | 43.20 | 21.60 | 7.20 | 72.00 |

The trial weights are population; population × (0.05 + infrastructure gap); or opening earned income. Each destination is capped at feasible improvement. Excess shares are redistributed. If all remaining preference weights are zero, remaining eligible needs supply a fallback rather than leaving money accidentally stranded.

At full funding all three territories can receive the two-point target, so the priority need not change that result. Priority matters when available money or implementation capacity is scarce.

Local domestic investment is separate. In the affordable case, Core reinvests 610.00, Interior 152.50, and Frontier zero after taxes and basic needs. This illustrates why a public catch-up priority can matter: a poor territory need not generate a private surplus merely because it belongs to the same nation. Zero public funding also does not delete civilian activity or existing productive capacity.

## Tax-switching finding

With real income held at 10,000, the trial informal target rises with the tax rate. We compared 180 recurring high/low schedules for each of three timing rules, after a warm-up, against the best constant rate on a 1% grid. This isolates a timing weakness; it deliberately omits longer-run income, unrest and investment feedback.

| Tax-response rule | Best recurring cycle receipts per season | Cycles beating the best constant rate |
| --- | ---: | ---: |
| Collect using the opening informal share; adjust afterward | 3,828.57 | 47 of 180 |
| Move 25% toward the target before collecting | 3,371.43 | 19 of 180 |
| Move 75% toward greater evasion before collecting; return toward formality at 10% | 2,641.40 | 0 of 180 |

The best constant rate under these **arbitrary** coefficients was 43%, collecting 2,816.50. This is not a recommended tax rate or a prediction of the eventual optimum.

Recommendation: tax avoidance should react within the season being taxed, while rebuilding formal compliance takes longer. Keep unrest and productive investment persistent. The faster-response candidate passed this limited schedule comparison; it still needs testing with an actual income model. No new policy cooldown or restriction on the player's right to change taxes is being adopted here.

## Accounting boundaries and checks

Every executed season checks:

```text
Closing treasury = opening treasury + taxes + borrowing
                 − paid interest − paid military − paid infrastructure − principal repayment

Closing debt = opening debt + borrowing + explicit interest arrears
             − debt relief − principal repayment

Local earned income = taxes + civilian consumption + domestic investment + retained civilian savings
```

The audit also transfers actual cash between temporary counterparty buckets: income payers, civilians, treasury, lenders, suppliers and military. Their total cash is conserved. Borrowing debits lender cash and increases government debt. Debt relief changes liabilities, not cash; the implied creditors take the corresponding claim loss. These buckets do not prescribe a future schema.

**Limits:** the initial payer funds and earned-income amounts are supplied. There are no endogenous customers, wages/profits, prices, private-credit markets, or sector demand. Government purchases do not generate another immediate income/tax pass. Accumulated civilian savings are reported but not used to finance future consumption in the recovery illustration. Public/private industry ownership differences, growth feedback into earned income, natural resources, demography and combat are not modeled here. These are not gaps to hide behind the phrase “the accounts balance.”

Reproduction:

```bash
python3 scripts/research/economy_season_dry_run.py \
  --output=docs/game-design/data/economy-season-dry-run.json
```

Result: **37 named checks passed**, plus per-season accounting/priority/bounds checks in 250 deterministic mixed-condition stress cases, 12 interest/credit combinations, and 80 desertion seeds. The response comparison explored **540 recurring tax schedules** across three rules. Reversing territory/division enumeration leaves outcomes unchanged; rerunning a named research seed repeats its event outcome. No game-engine integration, performance, balance, full economic forecast, or monetary-system completeness is claimed.

## Recommended next implementation boundary

Keep the confirmed governing rules. Before writing economic consumers, make three currently implicit contracts explicit:

1. **Earned income and settlement:** define the smallest aggregate mechanism that turns productive conditions into funded income, including treatment of retained civilian funds and public purchases. Keep output value distinct from cash. This does not require individual companies or a full banking system.
2. **Same-season tax avoidance:** use a response that does not grant a guaranteed first-season windfall whenever taxes are raised. The tested asymmetric candidate is a starting hypothesis.
3. **Crisis lifecycle:** distinguish budget shortfall from default; define one restructuring per episode, arrears, a credit restriction and recovery conditions. Preserve early warnings and deliberate player freedom.

The desertion integration point, reserve size, funding targets and coefficients can then be specified alongside implementation. This dry run does not freeze them or activate the new economy in any game.
