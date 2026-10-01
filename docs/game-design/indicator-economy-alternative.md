# Indicator-led economy — alternative under consideration

Drafted 2026-09-29; status revised 2026-09-30. **Unselected possibility, not an approved replacement or implementation task.** No runtime, schema or game data changed.

The user has paused the replacement decision after discussing the economy with a friend experienced in macroeconomics. Improving the existing system remains an option; neither its viability nor this alternative's superiority has been established. Preserve the current system while comparing approaches. The packages and removals below describe what this alternative would entail **if selected**, not work to begin automatically.

## Objective and candidate boundary

Restore an understandable policy-driven economy: territorial conditions generate income, taxes finance government activity, and public and private development improve future conditions through different mechanisms. Keep the generic resource and policy systems. Remove civilian-wallet accounting rather than adding another income source beside it.

Retained design interests: the eight NO2 indicators, plus unrest and informal activity, belong in the economic discussion; loyalty remains distinct. Public development must function without strong private dynamism. Those goals do not require choosing this replacement. This alternative proposes gradual indicator targets, economic strength as the broad income multiplier, territory-level simulation using aggregated microcell geography, and an abstract inequality index initially.

**The detailed contracts below are conditional design proposals, not implementation authorization or claims about current behavior.** If selected, they would first need proof in Package I1. Exact coefficients remain tunable. UI design is deferred to the user's later brief; the earlier conversation sketch is not an accepted layout.

## 1. Complete indicator vocabulary

Use validated numeric values in `[0,1]`. The registry defines meaning, direction, seed, target inputs, response rate and reporting method. Program requirements and policy coefficients belong to game-owned rules/definitions, not scattered constants. No arbitrary formulas or executable code in policy records.

| Stable key | Meaning; high value means… | Initial target influences and role |
| --- | --- | --- |
| `economic_strength` | Greater broad income-generating performance | Health, education, infrastructure, crime, unrest and actual public/private development; sole broad per-person income multiplier |
| `health` | Healthier population | Delivered health provision, nutrition and environmental condition; influences productive performance |
| `education` | Better educational development | Delivered education provision; improves productive performance gradually |
| `dynamism` | Stronger private initiative | Institutions, taxation and local conditions; drives private provision/reinvestment, not public investment |
| `crime` | More crime | Social conditions, deprivation and delivered policing; affects economic conditions and informal activity |
| `inequality` | More unequal distribution | Ownership/social arrangements and delivered redistribution; influences social pressure, not a fictitious household distribution |
| `infrastructure` | Better infrastructure condition and provision | Funded public/private maintenance and improvements toward assessed need; supports productive performance |
| `environment` | Better environmental quality | Configured activity pressures, standards and recovery; affects health and local conditions |
| `unrest` | More disruption | Deprivation, inequality, tax/service mismatch and supported political events; distinct from crime and allegiance |
| `informal` | Larger share of income outside taxation | Tax pressure, crime, unrest and compliance response; reduces the tax base, not automatically the entire economy |

Keep loyalty in `nation_territory_loyalties`; do not duplicate it in this object or set unrest to `1 - loyalty`. Population, productive capacity, resource quantities and government finances retain their own units and storage.

All ten indicators get seeds, persistence, validation and a documented consumer. Basic health, education, policing and welfare program effects are included so the public-development story can be tested. A mechanism deliberately held fixed in an intermediate package is explicitly marked as such; never imply it is responding to policies. No unemployment system, individual people, new migration simulation or general institutional overhaul is required here.

National population and income are sums. Per-person income is total income divided by population. Condition summaries use appropriate population weighting, with zero-population handling. Initially report inequality as **average local inequality**, not a mathematically calculated national Gini. Environmental summaries must identify their weighting; an area-weighted map summary and a resident-weighted exposure measure are different quantities. Pollution is initially pressure on environmental quality, not a second automatic damage multiplier.

## 2. Database and definition changes

| Location | Planned change |
| --- | --- |
| `territory_details.economy_state` | Retain the JSON column with a strict ten-indicator schema. Replace the old generic `capacity`/`background_capacity` civilian-service scaffolding. Do not duplicate physical resource capacities here. |
| `territory_production_states` | Retain seasonal resource capacity and public/private owner. New capacity becomes productive next season. |
| `nation_economic_accounts` | Drop household/producer cash accounts after all runtime references are replaced. |
| `nation_resource_stockpiles` | Retain government/producer quantities and ownership. Drop `cost_basis`; remove inventory-profit accounting from grants, actions and captures. Treasury remains the government currency stock, never duplicated in an economy balance. |
| `nation_resource_acquisitions` | Retain quantity, spending limit and priority as intent, not prepaid stock. |
| `nation_details.economy_state` | Keep debt and fiscal episode/credit history; remove the simulated lender wallet. Credit remains explicitly limited by fiscal rules, not unlimited borrowing. |
| `nation_details.economy_report` / `resource_report` | Replace wage/profit/account-transfer reports with territorial income, tax, program delivery, development, shortages and reconciled treasury/resource flows. |
| `games.economy_rules` | Store validated indicator rules, response rates, income scale, service requirements, founding profiles and fiscal parameters. No copying definitions per turn. |
| Policy and resource catalogue tables | Keep their structure and game-owned copies. Extend validated effects/rules; retire private-wallet seeds, realized-profit and wage-transfer parameters. Preserve meaningful resource operating/development costs with explicit new semantics. |

Use a forward breaking migration and fresh games, not save conversion, fallback defaults for old saves or two economic runtimes. Existing migration history can remain; runtime cleanup must stop querying retired tables. Inspect disposable-game/reset scope during implementation. Accounts/login, saved geographic assets and unrelated workspace changes are outside the replacement.

Keep per-turn condition/capacity/stock snapshots and compact results for replay. Targets and their contributing factors can be reported without becoming another authoritative state copy. Physical quantities and settled money continue to use `Quantity` and explicit rounding.

## 3. Two development paths, one set of constraints

**Private contribution:** after-tax aggregate income permits a bounded investment/provision allocation; dynamism, ownership permissions and opportunities determine uptake. Allocate the pool once across private services, infrastructure and resource expansion. No persistent private wallet. Do not give each sector the whole pool.

**Public contribution:** policies assess service and development requirements. Actual funded delivery determines results. Public construction does not multiply by private dynamism. It still faces money, workers, geography and seasonal build limits.

**Mixed provision:** combine contributions against one assessed need. Funding the same service twice must not grant twice its maximum benefit. Define private operating requirements before allocating discretionary investment; removing wallets must not turn resource operation into unconstrained free capacity. A national worker budget also reserves civilian/service and construction activity so everyone cannot simultaneously work in mines.

Infrastructure funding is a standing fraction of assessed need. Maintenance continues; repair/expansion need tapers as the supported target is reached. The target reflects local population/activity and the selected provision standard, not an obligation to bring every cell to 100%. Education and health retain recurring service requirements even once their indicators stabilize.

Provide reproducible founding profiles with identical total population and comparable geographic/capacity endowments: private-led, public-led and mixed. Public-led fixtures must actually own and operate public assets and provide services. The existing `production_investors` option only permits new investment; it does **not** nationalize existing assets. Ownership conversion is outside this pass and must not be implied by a renamed policy or test. Starting profile/configuration is sufficient to prove both paths; no new creation UI is assumed.

High taxation reduces private initiative and increases avoidance/social pressure, but adequate public provision can support a viable state-led economy. Test a roughly 90% tax public-led case rather than hardcoding an exemption for a regime name. Low-tax private-led cases should be able to develop with selective public funding. Neither path is guaranteed to succeed everywhere, and laissez-faire is not hardcoded as the universal winner.

## 4. Seasonal calculation: explicit timing

Keep one deterministic pure resolver used by previews and settlement. Resolve against frozen opening state plus effective seasonal choices. No iteration until a budget/income equilibrium appears.

1. **Open:** validate definitions and policy/acquisition intent; load population, all indicators, capacities, owned goods, cash, debt and accepted commitments. Freeze the current owner and geographic inputs.
2. **Income and receipts:** opening economic strength × opening population × the configured income scale yields territorial income. Apply current tax policy and a same-season avoidance response; aggregate taxes once. Rising tax pressure responds promptly, recovery after reductions is gradual. Newly promised services cannot instantly justify higher tax tolerance.
3. **Assess and fund:** determine recurring service/operating requirements, maintenance, feasible improvement and resource needs. Allocate treasury plus permitted borrowing to obligations and programs using a documented deterministic priority order. Borrow for actual spending, not an unspent wish list. Respect already accepted action commitments.
4. **Operate and allocate goods:** use opening installed capacity, actual operating provision, workers and geography. Honor ownership, civilian needs, government acquisition limits and authorized reserve releases. No resource can be consumed, acquired and retained simultaneously. Supply/need and delivered quantities are separate report fields.
5. **Develop and evolve:** allocate public/private development within remaining funding/worker constraints. Compute all closing indicator targets from the frozen indicators plus this season's delivered services, shortages and activity. Move toward targets at configured bounded rates; write updates simultaneously. Closing physical capacity and new infrastructure do not produce opening-season output retroactively.
6. **Close:** settle interest, debt/default/recovery and automatic debt repayment after the configured reserve according to the explicit fiscal order. Save closing stocks, capacity, indicators and reports. Apply demographic consequences once through the existing lifecycle. Later combat/reactive payments update cash and event reports without manufacturing wages, taxable income or a second economic season.

This chooses a deliberate lag: **new shortages and improvements affect future economic strength/income; current tax choices affect current collection.** It refines the earlier conversational ordering, which did not define how public operating costs could be funded before production. Do not also apply health/infrastructure/unrest multipliers to income after economic strength already incorporates them. Each physical-resource modifier must have a separately documented purpose, not another addition to national income.

Resource demand initially represents physical needs, not purchases constrained by household cash. This is the explicit abstraction that permits a high-tax country with public provision; it does not claim to simulate household affordability. Subsequent trade/price work must respect that boundary.

## 5. Money and goods boundary to prove in I1

Recommended first contract:

- National income measures economic activity. It is not a government deposit or a resource stockpile.
- Taxes transfer the modeled tax share into treasury exactly once. Detailed resource sales, private purchases and public payroll do not create additional taxable income.
- Public operation costs real treasury funding. Public output is publicly owned; allocation to civilians is in-kind provision with no invented sale receipt. That avoids assuming households can pay again after 90% taxation.
- Private civilian consumption uses available private supply. Government purchases of remaining private goods cost money at configured prices and transfer ownership; the payment is not a second discretionary investment pool in the same season.
- Authorized public reserve release covers unmet civilian need without paying the government for its own goods. Direct internal public allocations are not purchases.
- No automatic cash revenue from unsold public output. State-enterprise sales receipts and international trade are deferred, rather than approximated by creating money for every unit produced.

The private economy is an abstract boundary; global wallet conservation is intentionally no longer an invariant. Treasury must still reconcile exactly: opening cash + taxes + real transfers + borrowing − actual spending − interest − repayments = closing cash. Every stock must also reconcile by owner. Basic service provision cannot exceed the money/real capacity assigned to it.

Prove private, public and mixed worked seasons with numbers before committing the schema/runtime replacement. If this boundary prevents the agreed high-tax public-development story or breaks meaningful resource ownership, revise I1 before proceeding—not after connecting the live UI.

## 6. Policy authoring and genericity

Extend `PolicyEffectRegistry` with a small fixed vocabulary for program provision/funding and bounded named target contributions. Every effect must declare its target, unit, range, consumer and composition rule. No direct writes to closing indicators, arbitrary JSON paths or formulas stored in the DB.

The current compiler rejects multiple effects on the same exclusive setting. Keep that for ownership/rates; explicitly support bounded additive contributions only where the contract calls for them, so a health program and an environmental policy can both influence health without overwriting each other. Recompilation starts from neutral settings and is idempotent.

Seed only the policies needed to exercise taxation, ownership/provision, health, education, police, welfare, infrastructure and existing resource/food mechanisms. Avoid importing the entire NO2 law tree. Resource-specific development/demand/operating behavior resolves through catalogue keys/roles, not `food`/`ore` branches. Add optional environmental pressure metadata with a documented default; do not fabricate unmodeled downstream water pollution.

## 7. Delivery packages

| Package | Work | Completion gate |
| --- | --- | --- |
| **I1 — Executable foundation** | Indicator contracts/targets, strict configuration, pure seasonal resolver and worked public/private/mixed fixtures. Extend the existing research experiment where useful; no second live engine. | All ten indicators have declared behavior; timing, public supply, budget priorities and income/stock reconciliation are demonstrated. |
| **I2 — Policy and long-run proof** | Minimal policy templates/effects; delivery, private reinvestment, infrastructure taper and credit/default. Run real geographic fixtures for at least 80 seasons with frozen policies. | Private low-tax and public high-tax paths both viable under documented conditions; failures and sensitivity visible, no regime exemption or repeated manual rescue. |
| **I3 — Fresh-game cutover and removal** | Forward schema changes; adapt input/store/service/lifecycle, founding, capture, grants, deployments and reactive costs. Replace tests that assert retired accounting. | One resolver; no runtime use of private cash, cost basis, simulated lender cash, service-sale wages/profits or duplicate income. Rollback/replay passes. |
| **I4 — Playable verification** | Adapt existing payload consumers and labels only as needed to remain truthful; preserve combined drafts, forecasts and command fencing. New UI design awaits the user's brief. | Game loads, policy edits/forecasts work, repeated seasons reconcile, income layers use real territorial values, no stale wage/profit presentation. |

Primary integration points: `ProductionEconomySeason`, `ProductionEconomyInput`, `EconomyService`, `ProductionStateStore`, `ResourceLedger`, `ResourceCatalogue`, `PolicyEffectRegistry`, `Game`/`Nation`/`Territory` turn hooks, stockpile models and rules/templates. Retire `ProductionAccounts` once all callers are removed; preserve useful quantity/allocation routines without wrapping the old ledger as a compatibility layer.

Do not apply a migration while active code still requires dropped fields. Prepare I3 as one coherent deployable change; inspect/reset disposable worlds through the existing lifecycle at cutover. No reset, migration or deployment is part of writing this plan.

## 8. Required evidence

- Equal founding populations; private/public/mixed profiles on both ordinary and fertile geography. Report income, conditions, taxes, service delivery, treasury, debt and shortage history—not only closing cash.
- Fixed-policy 80-season runs plus population growth, infrastructure damage and recovery. Underfunding must hurt future conditions; diminishing construction demand must leave meaningful maintenance.
- Low taxes can support private growth; high taxes can support funded public development. Weak dynamism alone must not shut down the public path. Unfunded public promises grant no service benefits.
- Extremely low revenue with large commitments, excessive military spending, resource scarcity and punitive taxes without provision produce understandable deterioration/default. No universal solvency guarantee.
- No guaranteed first-season windfall from repeatedly spiking and lowering taxes; test the same-season avoidance response and slow recovery explicitly. Legitimate administrative rollback/retry remains supported.
- One shared labor/funding constraint; no private investment pool reused by several sectors. All indicators bounded, no loop-order dependence, empty/neutral/captured territories handled without fresh founding gifts.
- A renamed nutrition resource and an additional configured resource work without source branches. Verify acquisitions, public consumption, grants, upkeep and opening-owned action availability.
- Forecast equals settlement given the same inputs; one state copy per season and no definition copying. At least three passive seasons and rollback/replay restore indicators, debt, stocks and capacity. Combat randomness remains outside deterministic economic replay claims.
- UI adapters retain focus/scroll and actual/saved/draft distinctions. Browser checks cover existing flows, EN/FR and narrow layout; this is integration maintenance, not approval of a new UI layout.

The [earlier experiment](economy-baseline-experiment.md) supports the aggregate-income direction only. It does not prove these public/private, indicator, ownership or lifecycle contracts. Preserve its limitations when reporting progress.

## References and precedence

[NO2 extraction](no2-policy-extraction.md) · [NO2 feedback review](no2-economic-feedback-review.md) · [Alternative overview](aggregate-economy-alternative-overview.md) · [Currently implemented lifecycle](production-lifecycle-contract.md).

Within this alternative, the full foundational social indicators replace the overview's earlier suggestion to defer them. This document does not supersede the currently implemented transactional economy or authorize its retirement. Its different accounting assumptions apply only if the alternative is selected. Broader migration, provincial and international-trade goals remain future work, not silently cancelled.
