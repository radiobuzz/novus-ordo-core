# Live economy playtest — 2026-09-29

The user authorized playing their own nation while spectating. Game 24, nation 45 was advanced through three seasonal settlements, from turn 1 to turn 4, using curl against the normal player HTTP endpoints. During this original diagnostic, no economic definitions, formulas, balances or map values were edited directly. The subsequent authorized fixes and retest are recorded at the end of this document. A separate temporary authenticated session was used; the user's credentials and browser session were untouched.

## Original diagnostic: actions and actual results

Seasons one and two used all starting defaults: tax 25%, infrastructure 100%, agricultural development 50%, mixed investment, half-season food reserve target and emergency reserve release. For season three, infrastructure funding changed to 60% and the reserve policy to **Current needs only**. All other policies remained unchanged. No military units, acquisitions or territory changes were ordered.

| After settlement | Treasury | Debt | Food supplied / demand | Population | Unrest |
| --- | ---: | ---: | ---: | ---: | ---: |
| Opening, turn 1 | 20.000000 | 0 | — | 5,000,000 | 3.00% |
| Turn 2, defaults | 16.842991 | 0 | 2.041688 / 5.000000 | 4,961,250 | 7.13% |
| Turn 3, defaults | 18.741572 | 13.454207 | 2.313997 / 4.961250 | 4,931,440 | 9.98% |
| Turn 4, adjusted | 14.183587 | 13.454207 | 2.574549 / 4.931440 | 4,910,045 | 11.80% |

Actual economic results matched the immediately preceding forecasts; settlement adds an empty `deserted_divisions` list. The second season's rising treasury is financed by borrowing, not a recurring surplus. The third season avoids new borrowing but still spends 16.038033 against recurring receipts of 11.480048. The next forecast would borrow again; the adjustment is not a sustainable solution. Testing stopped at turn 4 with no pending policy changes.

## Findings

### 1. Founding geography, population and food are not calibrated together

Five selected territories receive one million people each. Food demand is one unit per million people per season. Core productive capacity starts at 60% of mapped potential, with no opening food inventory. This homeland's total mapped food potential is **3.402814**, below its starting demand of **5**, even at full development. Budget changes cannot remove that geographic limit. Trade cannot fill the gap in the current implementation.

The selected territories include two plains, two forests and a mountain. One forest territory is only 47.4% land but receives the same founding population as a full land territory. Land fraction alone is not the explanation: the full-land mountain and one forest have food potentials of only 0.032318 and 0.189030.

Across the map's **687 individually eligible founding territories**, median food potential is 0.615012 and mean potential is 0.932166. Only 165 have enough founding capacity (60% of potential) to feed one million people individually; 287 could do so at full mapped potential. These are individual-region figures, not a survey of valid contiguous five-region homelands. Fertile regions can support their neighbours.

Recommendation: keep the agreed equal founding population fixed and calibrate developed capacity, consumption and map production together before making food self-sufficiency a hard setup gate. Show total starting demand, achievable initial output, development potential and warnings in the homeland selection step. With no trade yet, a normal starting homeland should have a viable peaceful path rather than unavoidable immediate hunger. Increasing opening food stocks alone would only postpone this homeland's structural shortfall.

### 2. Maintenance is prioritized per territory, not across the country

First-season infrastructure maintenance totals **13**, and actual infrastructure spending is **13.75**. Nevertheless, three territories receive 4.60, 4.60 and 4.55 while the last two receive zero. The first territories improve and the last two deteriorate. The allocation loop funds each territory's combined maintenance-and-improvement request before moving to the next.

Recommendation: fund maintenance across territories before allocating improvements; define an explicit distribution when maintenance itself is unaffordable. Also warn when maintenance is not met, separately from whether the player-selected funding target was met. In the 50% funding preview, all requested spending was fulfilled while maintenance remained underfunded, so the infrastructure-shortfall warning disappeared.

### 3. Impossible purchases inflate the financing requirement

At turn 2, the default reserve policy budgets **4.961250** to buy food, while producers cannot satisfy civilian demand. Actual reserve purchases are zero. A read-only preview with the reserve target removed reduces borrowing from **13.454207** to **8.492957**, exactly the unused purchase budget, with identical food output, infrastructure spending and capacity development. The unused cash remains in treasury; it has not disappeared, but the country borrowed for an unfulfilled request.

Public operating budgets have a related issue: the opening public civilian target is based on ownership share of demand without capping that target to installed public capacity. In season one, that target is 1.25 food while public capacity produces only 0.510423. Conservative reserved cash can crowd out other programmes.

Recommendation: distinguish requested spending, feasible funded activity and settlement spending. Avoid retaining borrowing solely for impossible/unspent purchases; release or reconcile unused commitments through the existing settlement. This should remain a generic resource mechanism, not a food-only exception.

### 4. More public agricultural funding need not mean more total development

At the identical turn-2 state, 50% public agricultural funding adds 0.130276 public plus 0.130276 private capacity. At 100%, public development is 0.260552 and private development is zero. Total capacity growth is unchanged, while government development expenditure doubles from 1.302760 to 2.605520.

This follows the shared territorial growth limit and public-first allocation. It can be a valid ownership outcome, but is a poor emergency-growth lever if that consequence is invisible. Public ownership also affects future sales receipts, so this is not proof that public investment is useless.

Recommendation: show additional **total** capacity alongside its public/private ownership. Decide explicitly whether public funding buys a share of already-feasible development, accelerates development when private investment is insufficient, or funds a different supported effect. Do not simply remove physical limits to make the slider look effective.

### 5. Recurring fiscal balance remains inadequate

Even after reducing infrastructure funding to 60% and suspending food reserve accumulation, recurring income cannot cover spending. Lowering infrastructure also reduces taxable construction wages immediately; it does not create a compensating increase in other civilian sales. Resource productivity already benefits from infrastructure, but the residual civilian-services model has fixed per-person demand and no infrastructure productivity effect.

Recommendation: correct allocation/financing defects first, then tune a sustainable default maintenance budget against civilian income. Present recurring revenue minus spending separately from treasury movement and new borrowing. Starting with more cash, raising taxes indiscriminately, or adding a hard homeland restriction would conceal rather than resolve these distinct issues.

## Same-state policy preview comparison

All rows below used turn 2 before any submitted changes. They are alternative forecasts, not additional seasons played. Defaults are tax 25%, infrastructure 100%, agriculture 50% and a half-season food reserve target.

| Change from defaults | Closing cash | New borrowing | Infrastructure paid | Public agricultural spending |
| --- | ---: | ---: | ---: | ---: |
| None | 18.741572 | 13.454207 | 22.938835 | 1.302760 |
| Infrastructure 50% | 16.177755 | 1.984791 | 11.469419 | 1.302760 |
| Infrastructure 60% | 16.690519 | 4.278673 | 13.763301 | 1.302760 |
| Tax 35% | 20.000000 | 13.454207 | 22.938835 | 1.302760 |
| Agriculture 100% | 18.741572 | 14.756967 | 22.938835 | 2.605520 |
| No reserve accumulation | 13.780322 | 8.492957 | 22.938835 | 1.302760 |
| Infrastructure 50%, no reserve accumulation | 14.192964 | 0 | 11.469419 | 1.302760 |
| Infrastructure 50%, agriculture 100%, no reserve accumulation | 12.890204 | 0 | 11.469419 | 2.605520 |
| Tax 35%, infrastructure 60%, no reserve accumulation | 15.819616 | 0 | 13.763301 | 1.302760 |

All nine alternatives supply the same 2.313997 food against demand of 4.961250 in that season. Construction affects later capacity, not immediate output. The higher-tax preview increases unrest and automatically repays some principal after reaching the treasury reserve; its closing debt is therefore below gross new borrowing.

Evidence was saved locally under `/tmp/no7-live-economy-24/`; authentication material was removed after testing. Source reference: `ProductionEconomySeason.php`, `ProductionStateStore.php`, `NewNation.php`, `MapResourcePotential.php` and the current resource/policy templates. The original diagnostic above predates the fixes recorded below.


## Implemented correction and small rebalance

The player explicitly retained **five million starting people: one million in each founding territory**. No extra founding money, free production, opening food grant, new economic subsystem or compatibility bridge was introduced.

- National maintenance is funded before improvements. Scarce funding is distributed proportionally to authorized maintenance needs; actual workers still constrain each payment. A separate red maintenance warning exposes deterioration even when the selected policy budget is fully paid.
- Public operating targets cannot exceed installed public capacity. Private procurement funding cannot exceed potential surplus after civilian needs; unmet orders remain visible.
- Unspent current-season loans are returned at settlement, including below the ordinary treasury reserve. Gross borrowing and actual principal repayment remain separate accounting events with a funded lender.

| Provisional tuning parameter | Before | After |
| --- | ---: | ---: |
| Food consumption per million people per season | 1 | 0.35 |
| Civilian service demand per person | 0.25 | 0.4 |
| Infrastructure upkeep coefficient | 4 | 2 |
| Maximum infrastructure improvement per season | 0.02 | 0.005 |

Tax remains 25%, infrastructure funding 100%, agriculture funding 50%, reserve target half a season. Service purchases still need actual household cash and available labor; this tuning creates no money. Lower infrastructure growth reduces the automatic improvement bill while preserving development.

### Fresh-opening resolver verification

The same original five-region geography and five-million population were replayed against the new defaults, without the damage or debt from the earlier live experiment. First three seasonal cash changes were **+1.942314, +1.617313 and +2.009457**, with no borrowing and no civilian food shortfall. Reserve purchases initially fill only part of the desired buffer; that is distinct from hunger.

The 24-season stress case maintains food and infrastructure with no debt and closes with **18.679739** treasury. It deliberately grows population without the live terrain population cap. This is not a promise of perpetual surplus: later seasons turn negative as population and maintained infrastructure rise. It gives the player time to respond using existing fiscal/funding choices. Extremely infertile homelands still need a later setup viability indication; no universal self-sufficiency guarantee or setup restriction was added.

### Verification commands

- `php8.3 tests/client/production-accounting.php`: 270 checks.
- `php8.3 tests/client/production-economy.php`: 367 checks, including maintenance priority, short-budget warnings, unavailable procurement, unused credit and public capacity limits.
- `php8.3 tests/client/peaceful-economy.php`: 101 checks across 24 seasons.
- `bash tests/client/run-production-checks.sh lifecycle --browser`: 135 lifecycle checks, 43 passive-player checks, and browser checks including forecast/settlement, rollback/replay, policy and production editing.
- Geographic-production check, production-plan JS test and production asset build passed.

These tests use independent or pure fixtures; the local application game was changed only by the explicitly authorized tuning and HTTP playtest below.


### Live retest, turns 4–7

The user authorized fixing the observed problems and a small rebalance while preserving equal starting population. The local game 24 production-rule coefficients and nutrition demand were explicitly retuned; its default resource template was retuned for new games. No current or historical population, money or debt was rewritten. The temporary test-editing flag was restored to its previous value. Existing historical results still describe the old rules.

The two earlier experimental policy choices were queued back to their original defaults through the normal HTTP policy endpoints: infrastructure 100%, food reserve half a season. Three more seasons were played through the readiness endpoint, without military expenses:

| Resulting turn | Opening cash | Closing cash | New borrowing | Food unmet | Infrastructure paid / requested |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 | 14.183587 | 15.025990 | 0 | 0 | 9.104059 / 9.104059 |
| 6 | 15.025990 | 16.667440 | 0 | 0 | 9.244680 / 9.244680 |
| 7 | 16.667440 | 18.649747 | 0 | 0 | 9.387202 / 9.387202 |

All three settled reports match their preceding forecasts exactly, except the normal settlement-only empty deserted-divisions list. Maintenance is fully covered, all warning lists are empty, and unrest falls from 11.8037% to 6.0435%. Earlier debt remains 13.454207; the next forecast reaches the 20-unit treasury reserve and starts repaying it. The game is left at turn 7 with no pending policies. The temporary authentication session was removed; the player's browser session was untouched.

Remaining design work: starting-location food/capacity visibility, longer-term balance across varied homelands, and clearer presentation of total public-plus-private development. This patch does not invent trade, change ownership rules, guarantee every barren location a viable economy, or implement those future UI features.


A separate pure continuation checked policy responsiveness: reducing infrastructure funding to 85% after season 24 alone still accumulates debt by season 40. Combining that with a 30% tax rate reaches season 40 with no debt, no food/maintenance shortfall and 21.558537 cash. Later seasonal cash flow is slightly negative again, so this is evidence of available choices, not permanent equilibrium. These hypothetical changes were not applied to the live nation.

## Follow-up: fertile homeland exposes an aggressive default

The player created game 25, nation 46 on more fertile land and still saw an opening deficit. Read-only inspection confirmed the earlier resource/production tuning was present. This was not a stale ruleset or military spending.

Opening installed food capacity was **7.707560**, against civilian demand **1.750000**. Yet the default 50% agricultural development policy funded **5.139980** of public expansion in the first season. The previous, less fertile homeland funded about 1.31. The program finances a share of feasible construction, so richer geographic potential increases its budget even when installed supply already exceeds domestic need. Private expansion correctly stays at zero when additional supply has no demand.

| Opening agricultural funding | Public construction spending | Closing treasury from 20 | New borrowing | Food unmet |
| --- | ---: | ---: | ---: | ---: |
| 0% | 0 | 22.411399 | 0 | 0 |
| 10% | 1.027990 | 21.613502 | 0 | 0 |
| 25% | 2.569990 | 20.416645 | 0 | 0 |
| 50% | 5.139980 | 18.421891 | 0 | 0 |

The correction is limited to the **starting agricultural expansion policy: 50% → 10%**, plus a clearer description of how geographic potential affects expenditure. No further engine coefficients changed. Existing farms continue producing, public ownership and deliberate higher investment remain available, and food provision is not tied to this construction slider. Starting population stays five million.

The source policy template, local default DB template and game 25 policy definitions were updated. Through the normal HTTP preview/save endpoints, only the nation's agricultural funding was queued to 10%; other current and pending choices were preserved. At turn 6, with the player's existing 95% infrastructure funding, this changes the forecast from **15.262532 → 14.905544** (including 0.105507 borrowing) to **15.262532 → 18.107221**, with no borrowing, full food and infrastructure funding, and no warnings. No turn was advanced, no historical balances were rewritten, and the temporary authentication session was removed.

Validation now compiles the real source policy defaults instead of relying on captured policy settings. Two anonymized geographic fixtures cover the original modest-potential homeland and this fertile one. `peaceful-economy.php` passes 154 assertions: 24 seasons for the original homeland (closing treasury 18.429746) and 12 seasons for the fertile homeland (27.347515), with food, maintenance, no debt and conserved cash. The isolated policy suite also exercises default compilation and founding.

The longer fertile scenario is **not indefinitely self-balancing**: leaving the new defaults untouched begins borrowing in season 22. This is recorded explicitly rather than claiming the opening fix proves permanent solvency. Continued public expansion, rising population and upkeep still need fiscal choices; demand-aware public expansion or a spending-envelope policy would be a separate design decision, not silently added here.
