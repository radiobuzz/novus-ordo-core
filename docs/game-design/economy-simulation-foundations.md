# Economic simulation foundations — first proposal

Status: high-level local-economy concept accepted on 2026-09-24; detailed systems, coefficients, and schema remain proposals for discussion. No gameplay implementation is authorized by this document.

Basis: [Economy and policies — philosophical foundation](economy-and-policies-discussion.md), including the subsequent trade and civilian-demand discussion.

Purpose: give the discussion a concrete vocabulary for persistent conditions, turn activity, systems, and configurable policies. Distinguish recommendations below from already established direction. Numeric units, coefficients, exact storage, and balance remain undecided.

## 1. Accepted high-level model boundary

The accepted scope is recorded in the [philosophical foundation](economy-and-policies-discussion.md). Acceptance establishes the aggregate local-economy concept, not every candidate field, effect, or algorithm below.

Simulate aggregate people, productive activity, inventories, investment, public commitments, and exchanges across a geographic world. Individual factories, firms, workers, households, and shipments need not exist as separate actors.

Use shared physical constraints for public and private activity. Institutions determine authority and ownership; policies influence choices and commitments within those constraints.

Microcells provide geographic precision. They need not independently execute every national or regional process. The exact resolution of social and economic state must be chosen deliberately; changing administrative borders must not create resources, people, or productive capacity.

## 2. First distinction: conditions, flows, measurements, and rules

| Category | Meaning | Examples |
| --- | --- | --- |
| Persistent state | What exists at the opening of a turn and survives unless changed | Population, deposits, extracted inventories, education, infrastructure, installed capacity, money balances |
| Turn flows | What actually happens during a turn | Production, consumption, purchases, migration, expenditure, completed investment |
| Derived measurements | Reports calculated from state and actual flows | National output, income per person, demand coverage, growth, trade balance |
| Institutional rules | Powers and arrangements under which decisions occur | Ownership, provincial authority, national minimum standards, trade restrictions |
| Policy choices and commitments | Decisions made under those rules | Tax rates, service provision, investment programs, incentives, funding allocations |

Stored indices such as education need a defined meaning and mechanism for change. Derived measurements should not silently become extra causal bonuses. Monetary output is a valuation of activity, not newly created spendable money.

## 3. Candidate persistent foundations

This is a candidate inventory to refine, not an instruction to implement every row at once.

| Domain | Candidate state | Important distinction |
| --- | --- | --- |
| Physical geography | Area, landform, water access, climate/fertility potential, resource deposits | Opportunity is not developed capacity or output |
| Population | Population quantities and spatial distribution; group identity where needed | Population is not automatically an available workforce; migration is a transfer |
| Human conditions | Health and education | Persistent conditions with delayed change, rather than instantaneous policy bonuses |
| Built environment | Infrastructure and installed productive capacity | Existing assets need maintenance; new funding does not instantly create assets |
| Environmental condition | Pollution or environmental quality, land cover/use | Decide the direction and meaning of the measure; do not charge the same harm twice through duplicate indices |
| Material holdings | Extracted inventories with an owner and a defined accessibility scope | Reserves in the ground, goods in storage, and production per turn are different |
| Financial position | Government funds/debt and aggregate nongovernment purchasing/investment funds | National wealth is not a government wallet; household and producer funds may need separate aggregate accounts |
| Political condition | Applicable institutions, jurisdiction membership, potentially grievances/allegiance | Identity alone must not determine loyalty or rebellion; detailed political mechanisms remain deferred |

Workforce availability can initially be an aggregate constraint rather than a full employment market. The same people and funds must not be fully allocated to several activities simultaneously.

Ownership can be represented as public/private portions of aggregate activity without creating individual enterprises. Whether public enterprises retain separate funds is still a design choice.

## 4. Candidate economic activities

Start by testing whether five broad activity families are enough:

1. Agriculture: food-producing capacity and output.
2. Forestry: timber harvesting and potentially renewal, constrained by land use and standing stock.
3. Extraction: capacity for each relevant mineral/fuel deposit.
4. Industry: aggregate conversion and manufacturing capacity supporting civilian goods, investment, maintenance, and military production.
5. Services: aggregate useful activity purchased by households, producers, and government.

These are economic roles, not necessarily five independent meters on every cell. Heavy/advanced industry can be separated later if one industrial category cannot explain meaningful differences in input requirements and skills.

Health, education, and other public programs keep explicit outcomes. Their providers can contribute to economic activity, but their expenditure/output must not be counted twice.

Civilian manufactured goods and services still need a concept of delivered output and customers even if they are not individually stockpiled. The treatment of that final consumption is a major open detail, not something to hide inside a free-income multiplier.

## 5. Demand, production, and investment

For each use, distinguish:

- **Need:** the quantity desired to sustain consumption, operation, maintenance, or expansion.
- **Funded request:** what a buyer can actually purchase under its budget and access constraints.
- **Fulfilled use:** what is obtained and actually consumed or delivered.

Production depends on installed capacity, allocated people, accessible inputs, and local conditions. Investment competes for money, material, and available implementation capacity. A government commitment or attractive private opportunity creates intended investment, not immediate output.

Different shortages affect different outcomes. Operating shortages constrain current activity; investment shortages delay expansion; maintenance deficits accumulate deterioration; sustained food deficits affect people. Buffers and rates remain to be designed.

Recommend that completed new productive capacity first contribute output in a later turn. This makes development legible and prevents a single investment from recursively generating unlimited additional activity within the same turn.

Dynamism is still unresolved. A recommendation to test is a report of investment responsiveness and realized expansion, rather than an extra universal growth bonus. Retaining it as underlying state is also possible if its distinct meaning and causal role can be specified.

## 6. Money, ownership, and trade

Track who owns inventories, who is making a purchase, and who receives payment, at an aggregate level. A treasury, households, and producers cannot all spend the same funds. Public enterprises can either have separate accounts or operate through an explicitly budgeted public account; decide before balancing.

Sales, wages/income distributions, taxes, grants, and public purchases transfer funds. A production value or national prosperity statistic is not itself a cash transfer. Borrowing or other money-creation assumptions must be explicit if allowed; a full banking simulation is not required.

Needs without purchasing power remain unmet needs rather than unlimited market bids. Trade uses accessible offers and funded requests, subject to restrictions and agreements. Physical delivery and payment must agree.

Decisions still needed include domestic-versus-international allocation, how prices form, transport/access limits, contract priority, shortage allocation, and the aggregate income mechanism that funds household consumption and private reinvestment.

An industrial-energy requirement may consume an allowed coal/oil mix. Electricity is not proposed as a separate stored commodity initially. Substitution belongs to particular uses, not a universal equivalence between fuels.

## 7. Systems have defined responsibilities

| System | Responsibility |
| --- | --- |
| Institutions and policy | Determine authority, effective settings, prohibitions, and commitments for each affected area/activity |
| Public finance | Determine affordable public commitments and reconcile receipts, expenditure, and authorized financing |
| Economic activity | Establish feasible production, operating input requirements, and use of shared people/capacity |
| Exchange and allocation | Match funded requests with accessible supplies and account for ownership/payment changes |
| Development and maintenance | Turn fulfilled investment into future capacity and account for upkeep/deterioration |
| Demography and society | Change population and human conditions from actual conditions, provision, and shortages |
| Environment and land use | Account for extraction, harvesting, pollution, renewal, and conversion where modeled |
| Reporting and forecasting | Summarize actual results and compare policy scenarios with a baseline |

These are conceptual responsibilities, not a prescribed set of services, tables, or execution order. Military events interact through explicit casualties, damage, displacement, resource use, and access changes; their within-turn timing remains to be agreed.

## 8. Policies configure established mechanisms

A policy definition should describe its meaning, valid choices, allowed geographic scope, authority required, prerequisites, incompatible choices, funding implications, timing, and effects on mechanisms the simulation understands.

The effect vocabulary should be deliberately limited. Candidate effects include setting a rate, establishing a service entitlement, committing funding, offering an incentive, imposing a restriction, changing a permitted ownership arrangement, or setting a permitted priority.

For example, an education measure changes provision and funding requirements; actual funding and capacity determine gradual educational outcomes. It should not simply write an arbitrary national education score.

Configurable policies cannot introduce entirely new causal concepts without extending the simulation. Balance parameters can be settings while the semantics of population, money, capacity, and resources remain defined by the game.

Separate a policy definition from the player's enacted choice, and from a funded implementation commitment. A development program bundles several such choices/commitments in a zone.

Effective local rules come from inheritance and authorized exceptions. Some rules replace a default, some establish a minimum, some add funding, and some cannot vary locally. Overlapping zones must not silently double benefits or charge the same commitment twice. A conflict should have an explicit rule or be surfaced before enactment.

### Policy catalogue storage idea — 2026-09-24

The user proposed storing policy definitions, effects, prerequisites, and blockers as data to make balancing easier, then explicitly clarified that database storage is not frozen and needs more implementation understanding before choosing it. The following are considerations for evaluating that option, not an accepted storage direction or schema. The next design step is the storage-independent [policy-effect vocabulary](policy-effect-vocabulary.md).

- The simulation implements a defined vocabulary of effects with precise meanings. Catalogue data selects those effects and supplies validated parameters, targets, conditions, and timing.
- Store policy identity and choices separately from their effect entries, eligibility/dependency rules, and enacted game decisions. Development programs bundle policies; they do not duplicate their definitions.
- Support numeric and institutional effects: rates, funding requirements, incentives, standards, permissions, and ownership arrangements. Effects need not all be direct changes to an indicator.
- Preserve causal consequences in the simulation. A subsidy may change an investment cost and create a public spending obligation; successful investment later changes capacity and other outcomes. Do not independently grant all those downstream benefits again as policy bonuses.
- Validate parameters, units, applicable scopes, dependency consistency, and combination rules. Define when effects replace defaults, add commitments, apply bounds, or conflict.
- A database can represent every configured effect that the engine supports. An entirely new behavior still requires a new supported mechanism; storing an arbitrary name or expression does not make the simulation understand it.
- Prefer versioned catalogue releases. An editor can prepare and compare a draft balance set; each game uses a selected version, with any mid-game rule change explicit. Existing V2 games should not silently change behavior when a catalogue row is edited. This is separate from the agreed lack of compatibility with pre-V2 saves.
- Keep definitions exportable and reviewable, for example as versioned JSON snapshots. The editor and catalogue persistence do not require database access for every individual effect evaluation on every cell.

Catalogue editing can make tuning easier, but balance must still be evaluated through representative scenarios and explanations of actual outcomes. The database layout, authoring interface, price model, and exact effect list remain open.

## 9. Illustrative copper-development program

This example connects the concepts without settling coefficients or final mechanics:

1. A zone covers copper-bearing microcells across two provinces. The deposit exists independently of the zone and its political borders.
2. National institutions determine ownership options, provincial powers, environmental obligations, and available policy exceptions.
3. The player prepares a program. A public approach commits public investment; a private approach offers permitted incentives. A mixed approach can combine them.
4. Existing policies remain inherited unless the program establishes an authorized exception. The player can inspect the source of each effective rule.
5. Planned development creates funded requests for construction inputs, infrastructure work, and available people/capacity. Deposits are not yet spendable copper stocks.
6. Access, actual funding, and fulfilled inputs determine progress. Missing materials delay the program; attractive incentives do not guarantee a private response.
7. Completed capacity supports later copper production. Operating needs, extraction constraints, and an explicit depletion rule govern realized output.
8. The resulting copper has an owner. Sale or allocation follows the relevant market/institutional rules; private receipts are not automatically treasury revenue.
9. Actual activity influences local income, environmental condition, and potential migration pressure. A population center can grow gradually if the demographic rules support it.
10. Zone, province, and nation reports describe the same underlying activity through different geographic scopes; none creates a second copy of it.

## 10. Turn-resolution contract before a detailed algorithm

An initial design should establish a common opening state and reconcile actual flows into one closing state. Policy choices and commitments must have an explicit effective turn.

Production, input purchases, trade, and prices depend on one another. Merely listing them in sequence does not solve that dependency. Before implementing the economy, choose explicit rules for same-turn availability, settlement, and bounded recalculation so processing nations in a different order does not accidentally give one first access to everything.

Minimum accounting conditions:

- Inventories close as opening holdings plus additions minus removals; a sale must not also be counted as consumption or fresh production.
- Extraction transfers material from deposits into extracted holdings if finite depletion is selected; forestry renewal and losses are separately accounted for.
- Population closes as opening population plus births and arrivals minus deaths and departures. Internal migration conserves the national population.
- Capacity closes as opening capacity plus completed development minus damage, retirement, and deterioration as modeled.
- Material, available labor, capacity, and funds cannot be promised repeatedly to incompatible uses.
- Money transfers identify both payer and recipient. Any allowed source or sink outside transfers is explicit.
- Every national/provincial/zone summary counts each underlying quantity according to its actual membership, without adding overlapping views together.

The working simulated timescale is now one season per turn, or four turns per in-world year. Tune migration, infrastructure development, forest growth, education, operating consumption, and maintenance with that duration in mind; annual rates must not be applied unchanged every season. Rates and balance remain undecided.

Recommended military interpretation, still to be designed: orders can resolve through movement and engagements within the seasonal window. A season need not be an indivisible unit for each action or a mandatory delay between deployment, movement, and combat. Training, readiness, distance, and other actual constraints should determine what fits within it. This does not introduce additional player turns or establish a combat algorithm.

Combat ticks are a discussed candidate for representing engagement progression within that resolution. Their duration, synchronization, and mechanics remain open. The economy does not automatically need to run on every combat tick. For this discussion, define only the necessary exchange of outcomes such as resource consumption, casualties, damage, displacement, and changes in access/control; develop combat itself separately unless an economic decision requires it.

One or two player turns per real day allows more resolution work than an action game, but it does not excuse slow ordinary commands. Ten minutes is a tolerance previously mentioned, not a performance target; processing time is separate from the simulated season.

## 11. Forecasts and explanations

Preview a proposed package against continuing current policy. Use the same mechanisms as resolution, with explicit assumptions about external behavior, prices, and conflict. Exact obligations under stated current conditions and uncertain future outcomes should be distinguished.

A useful preview can show costs, affected areas, expected constraints, direction of change, and timing without pretending to predict every foreign decision. Saved drafts and visible enacted choices remove the need for players to memorize their previous settings.

## 12. Suggested order for the next decisions

1. Use the working seasonal timescale to define action timing; separately clarify the physical relationship between world extent and microcell resolution.
2. Agree the minimum persistent conditions and the geographic scale at which each is tracked; decide what dynamism means.
3. Test the activity/resource set and civilian final-demand model against a few contrasting economies.
4. Define public/private purchasing power, income flows, and investment commitments clearly enough to close the accounts.
5. Establish policy authority, inheritance, permitted effect types, and funding relationships.
6. Work through one complete turn in a small illustrative world, then decide exchange, timing, and shortage rules exposed by that example.

This sequence is a recommendation for discussion. It is not a request to build every system or a declaration that the candidate model is final.
