# NO2 policies — historical extraction and design findings

Date: 2026-09-27.

Status: source-backed research for the new policy system. The user chose to extract the old game's policies before deciding the new storage, editor and runtime design. This does not approve implementation or freeze the old rules and balance values.

## Deliverables and provenance

- [Complete readable catalogue](no2-policy-catalogue.md): every active policy option, original description, default, fields, topic dependencies, reform package and conditional issue.
- [Structured extraction](data/no2-policy-catalogue.json): original identifiers, nested definitions, input metadata, preset definitions, eight indicator definitions/formulas, and assignment-level source lines. Formula strings are evidence only.
- [Reproducible extractor](../../scripts/research/extract_no2_policies.py): parses literal data without executing the old PHP application.
- [Earlier historical inventory](historical-novus-ordo-2010-features.md): broader gameplay context.

Source: the user-provided `no_old_backup_from_20100226.zip`, primarily `no/modules/legal/legal.params.php`. SHA-256: `4e683965efcf8e20b70f9c68cfa102215706c4fc275f283628c0003b6efd4f0f`. The source identifies Copyright 2006 Frédéric Brown and GPL-2.0-or-later.

All archive-member references below use paths beneath `no/` and original line numbers. The old application was not run. Active definitions and their consumers were inspected; no claim is made that every historical gameplay path is bug-free.

The extraction excludes commented-out assignments, preserves original spelling and apparent mistakes, and applies last-assignment-wins semantics. It records 872 literal writes in the legislation file, including five repeated assignments. Runtime-supplied defaults are documented separately. This JSON is a research artefact, not a choice of JSON as the new game's storage system.

Validation: independently compared comment/string handling against PHP's `token_get_all` for both source files without evaluating them; matched all 161 unique option descriptions; checked all 38 declared unlock edges, reform targets and issue targets; confirmed the eight indicator definitions and recorded pollution-field overwrite. Relative documentation links were checked. These are static extraction checks, not gameplay execution tests.

To reproduce from the repository root (substitute the archive's actual path):

```sh
python3 scripts/research/extract_no2_policies.py /path/to/no_old_backup_from_20100226.zip docs/game-design/data/no2-policy-catalogue.json --markdown docs/game-design/no2-policy-catalogue.md
```

## What exists

| Domain | Topics | Options | Main concerns |
| --- | ---: | ---: | --- |
| Constitution | 11 | 39 | Citizenship, constitutional order, executive/legislative/judicial organization, religion, civil rights, motto |
| Law and order | 8 | 23 | Legal protections, punishment, police, forensics, tactical units, identification, curfews |
| Education | 13 | 50 | Curriculum; ownership and tuition at five levels; religious schooling |
| Health | 3 | 13 | Hospital ownership, insurance coverage, unhealthy-food regulation |
| Welfare | 1 | 4 | Assistance, workfare, disability-related support, minimum income |
| Environment | 1 | 6 | Pollution standards |
| Infrastructure | 2 | 8 | Ownership/provision and public investment |
| Economy | 5 | 13 | Currency, ownership of three sectors, industrial priorities |
| Defense | 2 | 5 | Readiness and specialization |
| **Total** | **46** | **161** | |

These are 46 policy questions with 161 selectable measures, not 161 simultaneous laws. There are 13 independent checkbox measures; the other 148 options belong to exclusive-choice topics. The file also defines 30 reform packages (eight hidden from the normal reform listing), four conditional issues, and starting-system presets.

Tax rates and actual program allocations are additional controls in the budget system; they are not included in the 161 catalogue choices. There are six civilian program budgets, with five education sub-budgets, plus a separate army allocation.

## The old system's structure

The catalogue was already data-oriented: PHP arrays defined content, while shared code interpreted particular fields.

```text
Domain: Education
  Topic: Primary education
    Choice: Private / Mixed / Public / Banned
  Dependent topic: Primary tuition
    Choice: None / Partial / High / Full support

Selected choices → combined effect inputs → budget and development calculations
```

The historical identifier `mesures` means measures/options. It is preserved in the extraction for traceability.

### Selection, dependencies and personal values

- A measure defaults to `radio`: one option for its topic. `type = check` permits independent selections, such as freedoms or local/national police.
- A topic defaults to enabled. `enabled = false` hides it until a selected measure lists it in `enables`.
- Dependencies are same-domain topic unlocks, not a general prerequisite expression language or technology tree.
- Choice defaults exist, but initial-system presets and the separate default-initialization path also matter. Do not read all default flags as a fully resolved starting government.
- Some choices take player-entered text: motto, currency, religion, head-of-government title, legislature or judiciary name. These are not economic effects.

Concrete dependencies:

| Parent selection | Enables |
| --- | --- |
| Conventions or written constitution | Judiciary and civil-rights topics |
| Separate, symbolic or ceremonial head-of-state arrangement | Head-of-government selection |
| Separate legislature | Legislature selection |
| An allowed school-provision arrangement | That level's tuition policy |
| Private or mixed schools at any level | Private religious-school policy |
| An allowed hospital-provision arrangement | Health-insurance policy |
| Mixed or state secondary industry | Consumer-goods versus heavy-industry priority |

The normal legislation form rebuilds a domain's selected measures and omits topics no longer enabled. Reform packages take a different path: they replace or add selections directly. The generic effect summation functions do not independently revalidate dependencies. Consequently, an unlock in the form is not proof of a universally enforced simulation constraint.

Evidence: `modules/legal/Legal_Frame.inc.php:43` onward; `modules/legal/legal.params.php:84` onward; `modules/base/Nation.php:2935` and `:2985` onward.

### Combining effects

`Nation::sumEffect` adds matching fields, starting from zero. `Nation::mulEffect` multiplies matching fields, starting from one. Both traverse selected measure entries; they do not filter by the stored `used` flag. The normal form stores selected entries with `used = true`.

The caller decides which operation to use. A field name ending in `_mod` is a convention, not a general formula language. Some calculations filter the effects to a particular domain—for example, education's share of public versus private provision.

The policy definitions do not contain the full economy. Shared calculator and demographic formulas supply the meaning of these values. Adding a new supported coefficient can be content editing; inventing a new mechanism still requires game code.

Evidence: `modules/base/Nation.php:2985–3037`; `Calculator.php:62–123`.

## Effect vocabulary found in the source

| Legacy fields | Actual role / interpretation | Consumer evidence |
| --- | --- | --- |
| `legal_pos`, `political_pos`, `freedom_pos`, `economic_pos`, `social_pos` | Additive political/social classification inputs. Some also feed economic, growth and unrest calculations. They are not all merely labels. | `Calculator.php:62–113`; `modules/demography/ranking.params.php` |
| `political_mod`, `freedom_mod` | Multiply positive political/freedom scores in the calculator. | `Calculator.php:65–71` |
| `hos_political_pos`, `hog_political_pos`, `hos_political_mod` | Weight head-of-state/head-of-government contributions to political classification. | `Calculator.php:72` |
| `cost_health`, `cost_police`, `cost_welfare`, `cost_environment`, `cost_infrastructure`, five `cost_education_*` amounts | Base program cost coefficients per million people, subsequently adjusted; not final treasury charges. | `Calculator.php:116–143` |
| Corresponding `cost_*_mod` values, including `cost_education_mod` | Cost multipliers in the budget calculation. Exact application matters: parent and education sub-budgets are calculated separately. | `Calculator.php:120–123` |
| `tax_treshold` | Adds to the tolerated tax threshold, capped at 0.99 with the configured base. Does not itself set the tax rate. | `Calculator.php:113` |
| `hi_peak_inc`, `hi_peak_dec` | Health target inputs, combined with service funding, environment, education and private provision. | `modules/demography/demography.params.php:349` |
| `li_peak_inc`, `li_peak_dec`, `li_mod` | Education target inputs; the multiplier modifies the funding-related contribution through the generic index path. | `modules/demography/demography.params.php:366`; `modules/base/Ethnic.php:271–279` |
| `ci_peak_dec` | Crime target input, scaled by police funding. Negative values tend to lower the target; actual direction must be read from the value. | `modules/demography/demography.params.php:397` |
| `gi_peak_dec` | Inequality target input, scaled by welfare funding. | `modules/demography/demography.params.php:413` |
| `ii_peak_inc` | Infrastructure target input, scaled by infrastructure funding and combined with modeled private provision. | `modules/demography/demography.params.php:431` |
| `ei_peak_dec` | Economic target input, used here by pollution standards. | `modules/demography/demography.params.php:331` |
| `ni_peak_inc` | Environmental-quality target input. The active environment index has no associated budget key, unlike health/education/police/welfare/infrastructure. | `modules/demography/demography.params.php:440–450`; `modules/base/Ethnic.php:271–279` |
| `ic_support_ratio` | Heavy-industry emphasis; affects industrial support and the economic target. | `Calculator.php:105–106`; `modules/demography/demography.params.php:331` |
| `military_attack_efficiency_mod`, `military_defense_efficiency_mod` | Military efficiency targets used by projected efficiency changes. | `Calculator.php:234–243` |
| `military_cost_mod`, `military_cost` | Multiplicative upkeep adjustment and additive army requirement respectively. | `Calculator.php:146` |
| `show_news` | Allows other players to see local news—a direct information-access effect of press freedom. | `modules/diplomacy/ConferencesFrame.php:177`; `viewer.php:114` |
| `hos_appointment`, `vars` | Descriptive appointment metadata and player-entered values. Institutional option IDs also drive national-profile text. Do not treat descriptive strings as numeric effects. | `modules/legal/legal.params.php:379–400`; `modules/base/Nation.php:3385` onward; `modules/demography/pedia.params.php` |

The eight underlying development indices are economic strength (`ei`), health (`hi`), education (`li`), dynamism (`di`), crime (`ci`), inequality (`gi`), infrastructure (`ii`) and environmental quality (`ni`). The structured extraction includes their active definitions and formula strings, separately from the legislation catalogue.

Importantly, a health policy's `hi_peak_inc = 0.75` is not “gain 75 percentage points this turn.” It contributes to a target; population-group indicators move over turns through the existing variation rules. Cost coefficients also require population and other adjustments before becoming required spending.

## Three examples worth using to design the new system

### Health: ownership, coverage and delivery are separate

Hospitals can be private, mixed, public or banned. Allowed hospital systems enable the health-insurance topic, whose options range from private insurance to universal public coverage.

For example, the `public` insurance option defines `hi_peak_inc = 0.75`, `cost_health = 3750`, `tax_treshold = 0.225`, `economic_pos = 1` and `social_pos = 3`. Hospital ownership separately changes provision assumptions and cost multipliers. Actual health-budget funding then scales the public contribution in the health target formula.

This is already close to our distinction between institutional arrangements, service promises and funded delivery. Its numerical assumptions remain historical balance choices.

Evidence: `modules/legal/legal.params.php:1114–1183`; `Calculator.php:116–164`; `modules/demography/demography.params.php:349`.

### Industry: a rule can expose another decision

Private, mixed and state ownership are chosen independently for primary, secondary and tertiary industry. Mixed/state secondary industry enables a consumer-goods versus heavy-industry priority.

That is a concrete foundation for conditional policy choices. It does not imply individually simulated businesses, output inventories, transition costs or private investment: the old model largely expresses ownership through aggregate alignment and economic formulas.

Evidence: `modules/legal/legal.params.php:1337–1385`.

### Press freedom: policies can alter capabilities

Freedom of the press contributes to civil-liberty classification and sets `show_news = 1`. Other players' access to local news checks that field.

This is a useful real example of a policy affecting what the game exposes, alongside its statistical consequences. A new policy system therefore needs more than a list of indicator increments.

## Packages, issues, budgets and turn state

Reform packages bundle changes across topics and sometimes across domains: government forms, civil rights, privatization, nationalization, welfare, policing and infrastructure. Most packages use shared application code. Tax-cut, intermediate-tax and maximum-tax packages have custom handlers that calculate a rate from the nation's current budget.

The four issues—surplus, deficit, crime and pollution—offer existing reforms when conditions are met. Their conditions are PHP expression strings in the old game. They are preserved as text, not proposed as an executable expression format for the new game.

This supports three distinct concepts: the individual policy choice; a package applying several choices; and a contextual suggestion to enact a package. The initial-system presets add another layer of predefined packages. None requires presenting a giant tree to casual players.

The source also distinguishes:

| Information | Historical representation |
| --- | --- |
| Catalogue definitions | Shared PHP arrays registered through `ModMan` |
| Currently enacted choices | Nation data `legis` |
| Planned choices | Nation data `pNData["legis"]`; falls back to current choices when absent |
| Tax and allocations | Separate nation budget data; allocations may be fixed amounts or percentages of requirements |
| Applying planned law | `updateLegislation` copies planned choices to current choices and clears the plan |
| Historical reporting | General policy-change news and a calculator dump in the nation turn log |

Enactment also calculates affordability: it accepts a plan within the deficit limit or one no worse than the previous deficit, and can automatically adjust taxes under its existing rules. This is consequential behavior, not merely saving a selected option.

The inspected paths do **not establish a versioned, immutable catalogue or a complete per-policy history** of changes and effects. A blanket “next season only” description is also too simple: calculators can read projected legislation, and the turn handler uses a mix of calculated values and the legislation update before index evolution. We should specify the new timing contract explicitly rather than replicate this implicitly.

Evidence: `modules/legal/legal.params.php:41–81`, `:84–169`, `:199–320`, `:1439–1645`; `modules/base/Nation.php:992–1006`, `:1407–1490`, `:1709–1732`, `:1774–1785`, `:2917–2972`; `Calculator.php:37–38`.

## Historical discrepancies to preserve as evidence, not design decisions

1. **Pollution alignment overwrite:** the last pollution assignment writes `economic_pos = 2` to `strict` instead of `severe`. `strict` therefore ends at 2, replacing 1; `severe` has no such field. Both versions and source lines are retained. (`legal.params.php:1265`, `:1278`.)
2. **Severe-pollution reform selects strict:** both the strict and the “most severe” reform target the `strict` option. The latter does not select `severe`. (`legal.params.php:1509–1517`.)
3. **Secondary-school cost points at primary:** private secondary education declares `cost_education_primary_mod = 1.10`. Read literally, it affects primary education costs. (`legal.params.php:892`.)
4. **Education parent multiplier does not wrap sub-budgets:** curriculum's `cost_education_mod = 1.05` multiplies the parent education amount, while each sub-budget is added with its own multiplier. The extracted catalogue defines only sub-budget amounts. The intended curriculum surcharge is therefore not established by the active calculation. (`legal.params.php:739–744`; `Calculator.php:120–123`.)
5. **Environment funding exception:** pollution standards create an environment-budget requirement, but the environment index definition does not link to that budget. Its target's `$mod` consequently defaults to one in the inspected path; environment underfunding can still contribute to general unrest through the total budget. Do not describe this as the same direct funding-scaled benefit used for health or education. (`demography.params.php:440–450`; `Ethnic.php:271–279`; `Calculator.php:177–183`.)
6. **Additive military cost:** general-purpose specialization contains `military_cost = 1.00`, an additive amount, while defensive specialization contains `military_cost_mod = 0.75`. Preserve the actual keys rather than assuming both are multipliers. (`legal.params.php:1411–1419`; `Calculator.php:146`.)
7. **Commented-out rules and stale prose:** positive constitutional rights and many old min/max/growth/unrest modifiers are commented out. Some reform prose still describes earlier effects. Those comments are excluded from the active catalogue; prose alone does not establish a live mechanic.

These findings are a targeted audit, not an exhaustive bug list. For example, four repeated school-default writes are identical and harmless; the extraction records them without calling them distinct choices.

## What this suggests for our next discussion

The old game is a substantial content foundation. We should review these real policy families before designing a generic authoring tool.

The strongest reusable concepts are:

- Topics with exclusive options, optional measures and meaningful defaults.
- Separate institutional ownership, service coverage and actual funding.
- Explicit dependencies, with a defined outcome when their prerequisites disappear.
- Packages that simplify national direction while leaving detailed choices available.
- Shared, named effect mechanisms that give policy data its meaning.
- Distinct current choices, pending changes and turn explanations.

The parts to reconsider are exact coefficients, broad ideology scores that also drive several economic mechanisms, hidden automatic tax changes, dependency enforcement, and the treatment of funding and timing. Local application, provinces and development zones are future extensions; this extracted catalogue is national.

**Suggested next step:** choose health, industrial ownership/priorities, and press freedom as three representative policy examples. Decide which old behaviors to retain or replace, then use those examples to settle the policy/effect contract. Storage and editing decisions can follow that evidence. No new schema or runtime is implemented by this extraction.
