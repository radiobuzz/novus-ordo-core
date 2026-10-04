# Infrastructure: policy commitment and funding

Implemented 2026-10-03. This extends the [indicator economy](indicator-economy-replacement-results.md); it does not restore NO2's formulas verbatim.

## Player rule

Choose a named **Infrastructure investment** policy, then choose how fully to fund its assessed requirement. A lower ambition, fully funded, is not underfunding.

| Choice | Public development target | Default funding |
| --- | ---: | ---: |
| None | 0%: no new public expansion | 100% of existing upkeep |
| Minimal | 25% | 100% |
| Moderate | 50% | 100% |
| High | 75% | 100% |
| Very high | 100% | 100% |

These percentages are internal starting values. Players choose the words, not a numerical ambition slider. The infrastructure indicator is a game development index, not the percentage of roads in existence. NO2 used these words and target contributions; our first pass uses them as public construction targets.

Public construction progresses gradually below the target, tapers in its final step, and stops at the target. Private development retains its own dynamism-driven target and can exceed the public commitment. A policy change does not erase existing assets or instantly change the indicator. All existing infrastructure still requires upkeep, including under **None** or a target below its present condition. Existing funding/worker constraints and investment efficiency remain.

**High at 75% funding** still targets a 75% standard, but requests only 75% of the work requirement. It can therefore underfund upkeep and development. **Moderate at 100% funding** fully requests its more modest commitment, including upkeep. Actual delivery can still be restricted by treasury/credit or available construction workers.

Undelivered assessed public upkeep/development adds a small unrest pressure. Gradual construction that is fully funded and carried out does not count as a broken promise merely because the final target is not reached yet. The default target penalty is `0.04 × public share × undelivered share`; unrest approaches that combined target through the existing seasonal rate. Under **None**, neglected existing upkeep can still create that pressure.

## Authored definitions and calculation

No schema changes, new tables, per-turn definition copies, conversion engine or arbitrary formulas.

`database/policy-templates/economy.json` is the **founding v2** source. New games copy its validated definitions into their own `policies`, `policy_options`, `policy_effects` and `policy_parameters`. Each named option combines:

- `budget.program_target`: infrastructure `level`, a fraction between zero and one.
- `budget.program_cost`: `infrastructure_maintenance` and `infrastructure_development` coefficients.
- Existing `budget.program_funding`: independent funding ratio parameter.

The initial cost coefficients are the same across options: maintenance `0.9 × population in millions × existing infrastructure`; public construction `40 × population in millions × assessed seasonal public growth`, with the existing public share applied. A higher target requires construction for longer, not an instant flat charge for reaching it. Coefficients can be authored separately for each option. Construction prices must be positive; ratios and parameter bindings are validated. Settings remain exclusive rather than adding several competing targets/costs.

The generic assessment starts from the game-owned base coefficients and applies explicit option overrides. This also supports intentionally authored catalogues without those overrides; the runtime does not recognize old option names. Default values are not substituted for an explicitly selected zero target. Private construction retains its existing base cost coefficient.

`TerritorialIndicators` assesses required upkeep and progress from the selected target and costs. Funding determines requested allocations separately. `IndicatorEconomySeason` allocates actual funds and workers, records delivery, and uses the same result for previews and settlement. Maintenance and development warnings report distinct shortages and authoritative causes: chosen funding, treasury/credit, absent workforce or scarce construction workers. The existing verified annexation explanation remains.

Health, education and other service commitments are the next candidates, but these new target/cost contracts currently admit only implemented infrastructure consumers. They do not yet promise healthcare ownership, coverage or education systems.

## Presentation and history

`EconomyPanel` reuses its native option selector, percentage parameter, FieldShell, click-only policy help and shared seasonal draft/save. It displays the selected option's DB-authored description and updates it without replacing controls. Budget spending compares the assessed infrastructure requirement, chosen requested allocation and actual funded spending. The named choice and funding remain separate through review, save, refresh and reload.

Each territorial report records target, funding ratio, required/requested/paid work and delivery ratio; the national report includes total required and requested infrastructure spending. Existing seasonal history stores these actual observations. Older completed reports are not rewritten; new fields in earlier seasons are unavailable rather than reconstructed. Definitions and template edits remain independent of nation choices.

## Verification and local application

- Pure resolver: 50,683 checks, including every named commitment, independent funding, maintenance above a lower target, tapering, configurable costs, small unrest pressure and funding/cash/workforce warning distinctions, plus the existing 100-season economy scenarios.
- Isolated real lifecycle: 320 checks after three passive seasons and 20 additional seasons; named choices remain pending until the boundary, different nations retain their own targets, previews match settlement, and rollback/replay matches stocks, capacity, reports and indicators.
- Relational policy suite: 81 checks, including target/cost storage, invalid and zero construction prices, exclusive-effect conflicts, explicit template cost editing and independence of existing game copies.
- Six budget/policy Chromium journeys pass, including the new named-choice/funding save/reload path and existing desktop/mobile, financial controls, retained edits, history and chart enlargement. The real production browser journey passes. Client suite: 284 checks. Generated definitions, maintenance explanations, PHP syntax and production build pass.

Local game **#30** explicitly received the new definition through the existing `PolicyCatalogue::edit` authoring service. Its old funding-only policy was retired by the normal catalogue writer; the new topic initialized to **High / 100%**. Its other definitions, existing economic reports, economy state and stocks were preserved; the temporary testing flag was restored. Policy edit counter is now **2**. The new shortfall coefficient was explicitly stored in that game's own economy rules. No season was advanced by the authoring operation.

Read-only verification at season 4 found a 75% target, 100% funding and complete assessed delivery in all five territories of both nations, with **no infrastructure warnings**. Pre-edit catalogue and economy-rule documents were retained under `/tmp` as local authoring backups, not committed game saves.

No reset or migration is needed. Refresh the local client after the catalogue edit. Fresh games use founding v2 automatically; other instances and game-owned catalogues require deliberate authoring or a fresh game to select the new definitions. Source deployment alone does not modify their policy choices or catalogues.

Next: test this pattern in play before adapting named healthcare, education and welfare commitments. Targets, costs and the unrest coefficient are starting balance values.
