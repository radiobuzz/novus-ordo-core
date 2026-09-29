# Policy system — first playable foundation and decisions

Date: 2026-09-27.

Status: accepted direction and design decisions. The user subsequently approved the schema and authorized the [first implementation pass](policy-system-first-pass.md). The [effect catalogue](policy-effect-catalogue.md) remains the expansion reference; economic consumers are still subsequent work.

The [big-picture diagrams](policy-system-diagram.md) show the proposed relationships between templates, game-owned rules, national choices, seasonal resolution and history, followed by the player change workflow. They describe responsibilities rather than a finalized SQL schema.

The [approved database schema](policy-system-schema.md) makes this concrete with eight tables, example records and an integration contract for the existing turn/rollback structure. The first backend pass implements these tables, authoring APIs/tools and national choice resolution.

The subsequent [first economic season dry run](economy-season-dry-run.md) records the accepted taxation, borrowing, repayment, infrastructure-priority, local-reinvestment and probabilistic-desertion decisions. It includes worked fiscal examples and executable accounting checks. Those economic consumers remain discussion work; the dry run does not change any game or policy template. In particular, readiness is not being introduced as the first military-underfunding mechanism.

## First objective

Create a nation with a constitutional identity, an initial homeland and a simple tax-funded economy. Each season, its territories evolve, its treasury receives revenue and pays expenses, and the player can understand why things changed.

The user accepted beginning with a small working loop while focusing on generic policy machinery. Initial scope can abstract material resources and use money, while preserving room for later resource requirements. This is new-version design; it does not direct removal of the existing game's resource mechanics.

Working first-slice proposal: founding choices and identity, developed starting territories, taxation, military expenses and infrastructure as the first civilian program. Proposed initial local state is population, productive capacity, infrastructure condition and unrest, with taxable income calculated from conditions and geography. These detailed fields and formulas still need specification. Starting development can be initialized explicitly rather than simulated through decades of prehistory.

The full future effect inventory is not a prerequisite. Specify and implement a bounded supported set, then expand it. Completion means founding a nation, changing taxes/funding, advancing seasons, observing coherent treasury/local changes, and inspecting their causes and history.

## Accepted policy structure and authoring direction

- A policy is a topic with selected options and/or parameters. Enabled/disabled choices can represent simple laws.
- Policies have effects on defined internal mechanisms, dependencies, restrictions and supported rules.
- Authors compose supported effects with validated parameters. New causal mechanisms require code; arbitrary author-written executable formulas are not the chosen starting direction.
- Database-backed authoring is the direction the user wants to try. It remains subject to implementation validation; no physical schema is frozen.
- A game must retain its own rules even when its originating template changes. Ruleset cloning and eventual reusable templates are planned capabilities.

## Game-owned rulesets

The user's required behavior is an independent set of policy definitions for each game, initialized from a template. Editing the template must not change an existing game, either immediately or next season. Definitions, options, effect parameters and dependency references must remain coherent within the game's ruleset.

Implemented foundation: shared physical database tables contain separate ruleset-owned rows, with a unique game-owned policy set. This provides game-owned data without creating a new set of SQL tables for every game. See the [schema](policy-system-schema.md).

Conceptual lifecycle:

```text
Template revision → create game → independent game ruleset snapshot
Template edited   → later games can use the newer revision
Game ruleset      → clone to a draft → balance or prepare another template
```

The snapshot should include rule definitions and relevant balance parameters, not just the list of selected policy IDs. Template provenance remains useful for comparison, but gameplay does not read mutable template values as a fallback.

Each nation separately records its current and pending choices under the game's rules. Game-owned definitions do not imply a separate policy catalogue per nation.

Normal games retain their game-owned definitions so that template edits cannot change an ongoing match. Administrative mutation of a test game's definitions is a separate development workflow. The user explicitly rejects spending initial implementation effort on immutable edit histories, ruleset migration or publication procedures for that workflow. Earlier recommendations requiring a retained definition revision for every test edit are superseded by this clarification.

### No catalogue copies per turn; a direct testing workflow

User clarification: policy definitions must not be copied every turn. Creating the game establishes its independent catalogue. Ordinary turns reference the applicable definitions and record national choices/results; a nation selecting a different option does not create another copy of the policy definition.

The user requires easy balancing in ADMIN during testing: edit policy definitions, apply the edit, undo a turn when needed, and retry. These are edits to what policies do, not changes to nations' selected options. This is a testing requirement, not a promise that the current rollback code already covers future policy state.

ADMIN definition editing has no indicator-preview requirement. Applying an edit can rebuild effective policy settings for all nations in that test game and recalculate affected derived values/caches using the new definitions. Nations retain their choices where still applicable. The exact recalculation implementation remains open; this does not mean silently executing another season or charging past expenditures again.

No manual publishing, clean migration between definitions, exact reproduction of every experimental state, or immutable per-edit revision system is required for V1 testing. The resulting test game may be inconsistent or economically broken; this is deliberately not a supported way to modify normal matches. Ordinary turn history/rollback still matters, but it must not expand into an elaborate ruleset-editing system. Definitions are not copied each season; turn records retain the necessary national choices and results.

Desired retry behavior: undo a season, retain deliberate definition edits, and rerun from the restored game state under the adjusted rules. Detailed rollback integration remains implementation work. No dedicated historical-rules restoration tool is required initially.

Structural validation still applies: known effect types, correctly typed parameters and resolvable references. Negative economic/political outcomes alone do not make a definition invalid. This does not remove the agreed handling of dependent policy choices; it separates valid but harmful decisions from malformed data.

Future tooling effort should prioritize a useful interface for viewing and editing policy sets. The user prefers that investment over polishing the intentionally rough test-game mutation process.

## Dependencies and warnings

Accepted: when a proposed policy change affects other policies, the interface shows the consequences during editing and before submission. The proposed package includes the necessary dependent changes. If there is no obvious valid replacement, the player chooses one; avoid silently retaining an active but inapplicable policy.

Future questions include transition delays, reversal costs and how easily a government can change direction. These are explicitly deferred, not assumed to be free or instantaneous forever.

A hard restriction makes a choice unavailable. A consequence permits the choice but produces costs or reactions. Preserve this distinction so that governing styles are not accidentally forbidden merely because they create unrest.

## Promises, funding and outcomes

Accepted: the government may select full coverage while allocating no funding. A promise alone must not grant its funded service benefit. For a wholly funding-dependent public program, 100% intended coverage with 0% funding delivers no new funded contribution from that program.

This does not mean population health or education becomes zero, privately provided services disappear, existing infrastructure vanishes, or the law has no other consequences. Existing conditions persist and evolve; an unfulfilled promise can still affect unrest. Already paid commitments remain distinct from new allocations.

The relationship at partial funding remains open. Agreement about zero funding does not establish a universal linear rule such as 50% spending = 50% total benefit. Funding cannot guarantee delivery when other required capacity/inputs are unavailable.

## National terminology — accepted future requirement

Each nation should eventually customize roleplay terminology: for example, a generic decree may be presented as a Presidential Decree or Royal Proclamation. The user explicitly asked to retain this requirement in the plan while using generic language initially.

Recommended interpretation: nation-specific terminology overrides keyed by stable semantic identifiers. They change presentation, not policy identity, effect dispatch, permissions or history references. A terminology override is distinct from interface-language translation; locale handling and how broadly labels are customizable remain future work.

Initial implementation should use stable identities and generic display terms. The terminology editor, dedicated persistence structure and customization workflow are deferred. No naming tables are created by this decision.

## Nation policy-choice previews — desired direction

The user wants an approximate range of future indicator changes when a NATION changes its selected policy option or parameter, before enactment. This is a player gameplay feature under the existing game ruleset. It does not apply to ADMIN editing the policy definitions. Exact cost and implementation remain open.

Recommended separation:

- Explain direct rules and dependency changes exactly when known.
- Estimate requirements and affordability from current state with explicit assumptions.
- Forecast indicator direction or a range only where the simulation supports it, using a stated horizon and comparison baseline.

Distinguish next-season effects from longer-term development. A scenario range is not automatically a statistical confidence interval. Do not invent numerical precision for an unimplemented mechanism. Previewing a proposal must not enact it, spend funds or rewrite current state. The mechanism need not initially simulate every future microcell interaction.

## Accepted effective timing

The user confirmed that ordinary policy changes become effective together at the next seasonal boundary. Pending choices remain editable until the turn locks. Current and pending choices must be distinguishable; history records the package that actually took effect. A policy becoming effective does not mean its development or transition outcomes are instantaneous.

## Still open

- Detailed initial effect contracts, numeric units and partial-funding behavior.
- Visual editor workflow and integration with the player interface. Game-owned storage and template/cloning tools now exist; elaborate revision/migration tooling for test edits remains outside V1 scope.
- Future transition costs, cooldowns and existing-commitment handling for each mechanism.

These decisions should be taken in small rounds rather than requiring the user to design the entire future economy at once.
