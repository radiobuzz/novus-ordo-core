# Policy effect catalogue — working vocabulary and lever inventory

Date: 2026-09-27. Version: discussion draft 0.1.

The user has agreed that an effect catalogue is the next design priority: identify existing levers, missing mechanisms and where each applies. The vocabulary and proposed adaptations below are recommendations to review, not approved formulas, a database schema or an implementation instruction.

Basis: [NO2 extraction](no2-policy-extraction.md), [complete legacy catalogue](no2-policy-catalogue.md), [economic foundations](economy-simulation-foundations.md), [candidate effect families](policy-effect-vocabulary.md), and a read-only inspection of the current NO7 workspace on the date above.

## 1. Vocabulary: stop using “level” for several different things

| Term | Question it answers | Example |
| --- | --- | --- |
| Authority | Who makes the decision? | National government |
| Scope | Where does the decision apply? | Whole country, a province, or a development zone |
| Target | Which people, activities, resources or institutions does it concern? | Primary education; copper extraction; public industry |
| Simulation scale | At what granularity are consequences calculated? | Nation account; territory population; local activity/resource aggregate; division |
| Reporting scale | At what granularity are results displayed? | Local education values summarized as a national average |
| Account | Whose money or goods change? | Treasury pays; eligible producers receive a subsidy |

These are independent dimensions. A nationally enacted education program can apply to one province, concern residents needing education, be resolved across local service/population units, and be reported nationally. The province's existence does not make its government the decision-maker.

Storage granularity is a later technical choice. “Applies to every microcell” does not require copying the policy definition to every cell or calculating every subsystem separately in every cell.

### Geographic and administrative nouns

| Term | Working meaning |
| --- | --- |
| Nation | Political entity, national rules and national accounts; owns/controls territory under the game's rules |
| Territory | Main strategic map unit, currently called a region in some discussion; propose using “territory” consistently for this unit |
| Microcell | Fine geographic unit within the map; no governmental authority is implied |
| Province | Administrative grouping for reporting and budget allocation initially; “state” can be a national naming variant |
| Development zone | Selected geographic footprint for a program; may cross territory/province boundaries; not a government tier |
| Geographic feature | River, lake, forest, bay, etc.; a natural feature identity, not an administrative tier |
| Urban centre | An emerging population/development concentration; not initially an independent jurisdiction |

Province and zone boundaries are conceptually selected over microcells in the future map. Exact overlap rules and economic resolution remain open. A hierarchy of nation → province → territory → microcell must not be assumed: provinces may cut across strategic territories, and zones can overlap administrative geography.

### What is a lever?

“Lever” is useful conversationally, but the catalogue distinguishes:

| Kind | Meaning | Example |
| --- | --- | --- |
| Decision | A government/player input | Coverage policy, funding allocation, export restriction |
| Effect | A supported instruction produced by a decision | Establish coverage entitlement; authorize an eligible payment; limit exports |
| Model parameter | A designer-controlled relationship | Construction delay or response speed; not automatically a player setting |
| State | Something that exists and evolves | Population, education, installed capacity, stored copper |
| Flow | Something realized during a season | Production, spending, consumption, migration |
| Indicator | A measurement derived for reporting | Income per person, national education average, unmet demand |

Health is a condition, not a government slider. A health policy changes coverage, funding or provision; actual service delivery changes health. Likewise, an observed market price is not automatically a policy-set value. A model may retain a calibrated index-target mechanism where useful, but it must be explicitly named and understood.

## 2. Evidence labels

- **Current:** behavior exists in the inspected NO7 game. This does not mean it is connected to a policy effect handler.
- **Legacy:** behavior exists in NO2; available as historical design evidence, not active NO7 functionality.
- **Lab:** a separate experiment demonstrates a mechanism or visual representation; not live-game integration.
- **Proposed:** required or suggested for the new direction; details are unfinished.
- **Deferred:** outside the initial agreed scope.

The current-game review covers policy-relevant economic, demographic, military-cost and access mechanisms. It is not an inventory of every combat coefficient, UI command or server setting. No general national-policy catalogue/runtime was identified in the inspected current models, domain rules or migrations.

## 3. Existing NO7 mechanisms and possible connection points

| Mechanism | Current lever/state and control kind | Current scope, target and simulation scale | Adaptation question | Evidence |
| --- | --- | --- | --- | --- |
| Production requests | Player sets maximum quantity and maximum labor per output unit for eligible resources | National request for a resource; allocation across territory labor pools/facilities | Which requests remain direct public orders, and which should emerge from private/civilian demand? | C1 |
| Allocation priorities | Code-defined upkeep/command priorities and reserved labor | National allocation process across local resource opportunities | Introduce permitted priorities without treating every private resource as state property | C1, C2 |
| Local productivity | Terrain-defined productivity and facility capacity; design inputs, not policy controls | Territory × resource; actual production from allocated labor | Separate natural suitability, built capacity, operating inputs and productivity | C2 |
| Available labor | Pool size derives from population and owner loyalty | Territory × owning nation; competes across resource uses | Define participation/workforce constraints; current pool is not a full employment model | C2 |
| Population growth | Base growth parameter multiplied by a food-stock-dependent national factor | Population stored and updated per territory; food factor at nation scale | Replace or adapt stock-surplus growth with explicit consumption/conditions; add migration separately | C3 |
| Population ceiling | Land area and terrain-density constraints | Territory | Decide how fine geography and development affect settlement capacity; not an unrestricted “population bonus” | C3 |
| Loyalty | Initial allegiance, owner gain and rival decay; model rules | Nation–territory relationship; affects labor and recruitment | Preserve distinction between loyalty, identity and future unrest; unrest is not simply 1 − loyalty | C4 |
| Recruitment capacity | Derived from loyal population, existing divisions and pending deployments | National recruitment pool | Define which military policies can alter eligibility/commitments without duplicating people | C3 |
| Civilian food requirement | Population-based food upkeep | National resource requirement | Add fulfilled consumption and shortage consequences; do not assume current upkeep proves a complete nutrition simulation | C5 |
| Stockpiles and balances | Production, upkeep, command expenses and carried inventories | Nation × resource × turn | Distinguish public/private ownership and accounts before applying the same bar to every economic regime | C5 |
| Military costs | Unit-type deployment, upkeep and attack costs; orders generate expenses | Division/order requirements aggregated to nation resource budgets | Candidate connection for a national readiness policy; no such generalized policy is established here | C6 |
| Military capability | Unit-type attack/defense power, movement and operating orders | Division/battle | Determine permitted policy modifiers; do not turn every tactical order into a national law | C6 |
| Diplomatic access and grants | Player treaties/relations affect passage and hostilities; grants transfer eligible stored resources | Nation pair; movement rules inspect territories; grants change national accounts | Existing examples of permissions/transfers, not an international commodity market | C7 |
| National identity | Names, leader/flag presentation and related identity data | Nation and leader | Keep expressive values distinct from invented economic bonuses | C3 |

Current resource types are Capital, RecruitmentPool, Food, Material, Ore and Oil. The proposed Food/Timber/Iron/Copper/Coal/Oil vocabulary is not the same resource model. Capital currently also participates in labor-based production; it is not evidence of the proposed tax/household/producer money circulation.

The current `LaborPoolFacility` records are allocation/productivity structures generated from territory terrain and labor capacity. Their existence does not establish persistent individual factories or a completed investment/construction system.

## 4. Legacy effects to carry into the adaptation review

All rows are **Legacy**, not current NO7 policy handlers. Exact original fields and values remain in the extracted catalogue.

| Legacy lever | Where it applies in NO2 | Proposed destination / unresolved choice |
| --- | --- | --- |
| Political, legal, freedom, economic and social alignment; executive weighting | National classifications; several scores also enter development formulas | National institutions and descriptive classifications; decide which explicit mechanisms replace causal use of broad ideology scores |
| Program cost coefficients and multipliers | National public-budget requirements scaled by population and conditions | Cost of provision for a named program/target; local needs may contribute to a national funding requirement |
| Tax tolerance | National tolerated-tax calculation, unrest and economic formulas | Keep as a calibrated mechanism or replace with more specific grievances; do not assume it is an objective universal constant |
| Health and education target contributions; education multiplier | Population-group development with national policy and funding inputs | Local condition evolution from service delivery; initial simplified targets remain an option to discuss |
| Crime and inequality target contributions | Population-group development and public funding | Define local society model and meaningful inequality aggregation before selecting effects |
| Infrastructure target contribution | Local development with national public/private assumptions | Local maintenance and investment outcomes; retain existing assets on repeal |
| Environmental and economic target contributions | Local indicator targets influenced by national pollution standards | Activity standards, compliance/enforcement, emissions and environmental change; avoid duplicate economic penalties |
| Industrial priority | National heavy-industry/industrial-capacity calculations | Priorities for eligible public activity; private behavior requires a separate influence mechanism |
| Military upkeep and efficiency adjustments | National policy influences army cost/efficiency | Supported national posture effects consumed by military rules |
| News visibility | National press-freedom choice affects other players' access | National information-access permission, dependent on current news visibility design |
| Topic unlocks, choices, defaults and text values | National policy catalogue/form | Shared policy structure and dependency validation, separate from simulation effects |

NO2's exceptions and apparent mistakes—including the environmental-funding exception—are documented in the [extraction findings](no2-policy-extraction.md). They are not silently adopted here.

## 5. Proposed effect catalogue: what is missing from the live game

These are candidate effect contracts, not final code identifiers. Initial authority is the national government unless explicitly stated otherwise. “Local” below leaves the territory/microcell resolution decision open; “activity” means an aggregate sector/resource activity, not individual firms.

| Candidate effect | Scope and target | Responsible system / simulation scale | Parameter meaning and missing work |
| --- | --- | --- | --- |
| Establish institutional arrangement | Nation; public institutions | Institutions / nation | Enumerated choices and permissions; retain expressive government styles without initial simulated legislative consent |
| Permit ownership/provision arrangements | Nation; named sector or service | Institutions and investment / national rule, local activity | Allowed arrangements; distinguish permission from achieved ownership; transitions remain to define |
| Establish service eligibility and coverage | National scope initially; residents and named program | Public services / local population and service delivery | Eligibility and intended coverage; need service capacity, costs and realized delivery |
| Allocate public funding | Nation, province or zone; named program | Public finance / paying account plus recipient programs | Explicit amount or percentage with a named denominator; decide whether it is a cap, commitment or share |
| Set a tax or contribution | National rule; defined income/activity/transaction base | Public finance / liable aggregate accounts | Rate, assessment base, payer and receiving account; taxable income and collections are missing |
| Authorize a subsidy or benefit | Nation or zone; eligible investment/activity/residents | Public finance and relevant activity / accounts and recipients | Rate/amount, eligibility, ceiling and funding source; avoid counting the authorization and payment as two expenses |
| Commit development investment | Nation, province or zone; infrastructure or productive activity | Development / local capacity and projects | Funding and priority; requires build time, input fulfillment and completion accounting; copper lab is supporting evidence |
| Fund maintenance/provision | Selected area; existing assets/services | Development/services / local condition | Required versus fulfilled upkeep; define deterioration and recovery |
| Establish an activity standard or permission | National baseline; named activity in its applicable area | Economic activity/environment / local activity | Prohibition or measurable requirement, compliance and enforcement; regional exceptions are a later design decision |
| Limit resource exports or foreign access | Nation, resource and potentially partner | Exchange / national market/account aggregates initially | Quantity cap, permission or restriction; trade lab demonstrates a simple export cap; production market integration missing |
| Prioritize eligible resource uses | Applicable national/program scope; public or otherwise authorized supplies | Allocation / competing requests | Priority rule; cannot manufacture goods or override ownership implicitly |
| Set military operating posture | Nation; eligible military units | Military / unit requirements and capabilities | Upkeep adjustments and readiness target; timing/transition/funding response to define |
| Establish information access | Nation; named information/observers | Information rules / visibility checks | Explicit permission; old press-freedom effect is evidence, current feature needs an integration decision |
| Authorize an unrest response | Nation or selected area; disturbances and enforcement | Society/security / local unrest | Response intensity, actual resources, consequences and backlash; details open and not a free “reduce unrest” operation |

Separate missing mechanisms consume these decisions: household/producer purchasing power, civilian resource needs, shortages, market prices, private investment, local health/education/environment evolution, infrastructure condition, migration and emerging urban centres. Those are simulation systems and outcomes, not automatically additional policy sliders.

Extraction requires distinguishing deposits, installed extraction capacity, output and stocks. Forestry/agriculture require land suitability and potentially renewal/conversion. Geography is an input to these mechanisms; enacting a policy does not change a mineral deposit or create a bay.

### Lab evidence and scope limits

- The [copper lab](economy-lab.md) implements aggregate demand allocation, posted-price adjustment, export limits and delayed private investment in a standalone browser model. Its investment share, margin threshold, construction delay and other coefficients are experiment/model parameters, not automatically policy controls.
- The Map Lab contains geographic/resource and administrative experiments plus development artwork. The inspected `living-settlement.js` explicitly describes a visual study, not a settlement simulation. Visible urban/industrial artwork does not establish a working migration or economic-development loop. This review does not audit every recent Map Lab change.
- Initial migration and urban-centre simulation remain in scope for the future economic system. Ports, physical shipments, naval trade routes and blockades remain deferred. Provinces begin with reporting/budget allocation; autonomous provincial legislation is deferred.

## 6. Minimum specification for each accepted effect

Every effect needs these questions answered before it is considered implementable:

1. **Meaning:** what direct decision does it express, and which downstream outcomes belong to the simulation?
2. **Authority, scope and target:** who can set it, where, for whom/what?
3. **Input and unit:** enum, boolean, money, quantity, rate, proportion of a defined requirement, or bounded multiplier?
4. **Combination:** exclusive replacement, addition of distinct commitments, multiplier, bound or explicit priority? Do not allow generic stacking by default.
5. **Timing:** when effective, how often evaluated, and what happens on replacement/repeal? Existing assets and funded commitments do not automatically vanish.
6. **Accounting:** who pays, receives, owns or consumes? What happens if funding or inputs are insufficient?
7. **Consumer and scale:** which simulation mechanism reads it and at what granularity?
8. **Explanation/history:** definition version, pending/current decision, effective value, reasons, realized spending/delivery and relevant outcomes.
9. **Readiness:** current connection point, legacy evidence, lab demonstration or new work? Unsupported effects cannot be presented as working gameplay.

Example: **education funding for a province**. Authority: national government. Scope: selected province. Target: public education program. Input: proposed fraction of its calculated funding requirement. Account: national treasury. Consumer: finance/service systems. Simulation scale: local population/service units, exact resolution open. Outputs: actual spending and delivered service; education changes through the demographic mechanism. Reporting: province and national views.

Province/zone allocations must not duplicate national expenditure. If a zone overlaps another allocation, the combination rule must say whether it partitions the original budget, adds a separate commitment, or replaces an allocation. National, provincial and local reporting should describe the same reconciled spending.

Aggregation depends on the quantity: population is summed; a compatible per-person education measure may use population weights; national inequality cannot generally be obtained by averaging local inequality indices; prices and institutional rules are not ordinary territorial averages.

## 7. Decisions to settle next

1. Adopt or adjust the vocabulary, especially territory/province/zone and authority/scope/target/simulation scale.
2. Mark each legacy mechanism **retain**, **adapt** or **retire**; identify which proposed effects are necessary for the first slice.
3. Complete the effect specifications before choosing a generalized editor or database layout. An unfinished formula may remain an explicit open item; it must not be disguised as an implemented effect.

No need to implement every missing system at once. This catalogue should show the intended reach and the dependencies, while the first working set stays small.

## Current-source references

- **C1:** [ProductionController](../../app/Http/Controllers/ProductionController.php), [ProductionBid](../../app/Models/ProductionBid.php), [ProductionAllocation](../../app/Domain/ProductionAllocation.php), [NationDetail](../../app/Models/NationDetail.php) (`placeProductionBid`, `allocateLabor`).
- **C2:** [LaborPool](../../app/Models/LaborPool.php), [LaborPoolFacility](../../app/Models/LaborPoolFacility.php), [LaborPoolAllocation](../../app/Models/LaborPoolAllocation.php), [TerritoryDetail](../../app/Models/TerritoryDetail.php) (`resetLaborPool`), [ResourceType](../../app/Domain/ResourceType.php), [TerrainTypeMeta](../../app/Domain/TerrainTypeMeta.php).
- **C3:** [TerritoryDetail](../../app/Models/TerritoryDetail.php) (`onNextTurn`, `getPopulationGrowthRate`), [Territory](../../app/Models/Territory.php) (`calculateMaxPopulationSize`), [NationDetail](../../app/Models/NationDetail.php) (`getPopulationGrowthMultiplier`, `getRecruitmentPoolRaw`, `export`).
- **C4:** [NationTerritoryLoyalty](../../app/Models/NationTerritoryLoyalty.php), [TerritoryDetail](../../app/Models/TerritoryDetail.php) (`conquer`, `assignHomeToOwner`).
- **C5:** [NationDetail](../../app/Models/NationDetail.php) (`getProductionRaw`, `getUpkeepRaw`, `getBalanceRaw`, `onNextTurn`), [ResourceType](../../app/Domain/ResourceType.php).
- **C6:** [DivisionTypeMeta](../../app/Domain/DivisionTypeMeta.php), [DivisionDetail](../../app/Models/DivisionDetail.php), [NationCommands](../../app/Services/NationCommands.php), [Order](../../app/Models/Order.php).
- **C7:** [DiplomacyService](../../app/Services/DiplomacyService.php), [NationCommunicationService](../../app/Services/NationCommunicationService.php), [NationGrantService](../../app/Services/NationGrantService.php), [MovementRules](../../app/Domain/MovementRules.php).
- Lab references: [copper model](../../resources/js/economy-lab/model.js), [Map Lab natural resources](../../resources/js/map-lab/natural-resources.js), [administration](../../resources/js/map-lab/administration.js), [living-settlement visual](../../resources/js/map-lab/living-settlement.js).
