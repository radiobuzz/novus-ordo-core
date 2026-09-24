# Economy and policies — philosophical foundation

Discussion captured: 2026-09-23.

Expanded to include the subsequent discussion of trade, civilian demand, services, policy inheritance, and the V2 world foundation.

Status: the local-economy concept was accepted as the high-level foundation on 2026-09-24. Detailed mechanisms, indicator definitions, balance, and data structures remain open. The acceptance below does not turn every exploratory example in this document into a frozen decision.

## Central direction

Novus Ordo is moving toward a **policy-driven geopolitical economy: the player governs the conditions under which a country develops, and the map shows the resulting economic and demographic changes.**

This high-level direction is now the foundation to realize and develop further. Several detailed choices remain open.

## High-level acceptance — 2026-09-24

The user accepted the following local-economy hypothesis as the basic concept:

- A microcell describes a place where people live and aggregate economic activity occurs. It does not require its own complete market, government, or individually simulated businesses.
- Geographic potential, population, human development, infrastructure, productive capacity, land use, and environmental condition establish local possibilities. The exact scale at which each condition is tracked remains open.
- Productive capacity persists and is distinct from realized seasonal output. Actual activity is constrained by people, accessible inputs, skills, infrastructure, demand, and applicable rules.
- Public and private investment can both develop capacity under shared physical constraints. Funding and incentives influence development; they do not instantly create output. Maintenance and damage affect accumulated development.
- Population and urbanization respond gradually to actual conditions. Migration transfers people between places.
- Policies influence defined parts of this process and interact through shared conditions. Institutions determine authority and ownership.
- Local outcomes support local and national reporting. Geographic summaries do not create additional copies of the underlying activity, money, or resources.

The particular role of dynamism and all numeric formulas remain undecided. Database storage for policies is an idea to evaluate, explicitly not a frozen decision. The next discussion is the [policy-effect vocabulary](policy-effect-vocabulary.md), independently of storage, while the simulation defines what those effects mean.

## 1. The player governs through policies, priorities, and funding

Decisions concern taxation, public services, ownership, environmental rules, infrastructure investment, and regional development programs. Choosing a policy and funding its implementation are separate commitments.

Some decisions influence conditions gradually. Others establish institutions: who owns productive activity, what the government can control, and which powers belong to national or provincial authorities.

## 2. Economic development has a local reality

Geography provides opportunities and constraints: fertile plains, rivers, forests, deposits, difficult terrain. Population, infrastructure, education, health, environmental conditions, and existing development influence what those places can become.

Policies act on those conditions. Much of the national economic and social picture then comes from the combined local results. National averages should therefore be able to conceal—and let us investigate—substantial regional differences.

Some things still belong directly to the nation, including its treasury, debt, and institutions. Those national conditions also influence what can happen locally.

## 3. The economy is represented through aggregate activity

We envision quantities describing agriculture, mining, industry, infrastructure, and other activity. Their exact representation remains open: capacity, shares of land, abstract counts, or some combination.

Individual factories and mines do not need persistent identities. The map can illustrate the intensity and character of economic activity with fields, industrial scenery, and mining features.

**The simulation describes productive activity; the visual layer makes that activity visible.**

## 4. Public and private economies share physical foundations

Development requires investment, suitable resources, people, infrastructure, and time under either ownership system.

What changes is who initiates investment, who pays, what objectives guide it, and who controls the resulting output. Private investment might respond to attractive opportunities. A public development program might commit funds to a strategic priority. Mixed economies could combine both.

This also changes the meaning of resources: **what exists inside the country is not necessarily available for the government to spend or allocate.** National production, commercial supplies, and government reserves are distinct concepts.

## 5. Population and urbanization develop alongside the economy

Economic opportunities and living conditions influence where people concentrate. Development can attract population, while population supplies the workforce and demand that support further development.

Cities would emerge visually from sustained population concentration and local conditions. They would not require building-by-building simulation. Dense settlement and prosperity would remain distinct: a crowded, poorly serviced area is different from a developed urban center.

Migration is important to this vision, but its complexity and level of detail remain open. We have not committed to a full employment or individual household simulation.

## 6. Economic intervention and political administration have different geographies

Development zones could follow farmland, deposits, or other useful areas across existing regional boundaries.

Provinces or states could provide more stable political jurisdictions, reflecting history, communities, identity, and potentially autonomy. They need not coincide with development zones or contain a single population identity.

This would allow national policy to establish broad conditions while selected places receive specific priorities or arrangements.

## 7. Stable simulation concepts support configurable policies

The emerging preference is to define a clear set of underlying concepts and their behavior, then allow policies to be configured using that vocabulary.

Policies could have effects, costs, prerequisites, incompatibilities, and geographic scope. Their interactions would often happen through shared conditions: education affects skills; skills influence development; development changes income and migration pressures.

The legacy indicators provide a starting point. Their final roles remain undecided—particularly whether **dynamism** is an underlying condition, a calculated measure, or something we eventually describe through more specific concepts.

## 8. Development accumulates, consequences persist, and decisions should be understandable

Investment and reforms take time to change a country. War can damage accumulated capacity and infrastructure, kill or displace population, and create problems elsewhere. Recovery also takes time.

Players should be able to inspect existing policies and preview a proposed package before enactment. Immediate commitments can be distinguished from projected consequences, with forecasts showing useful expectations and regional differences without promising certainty.

## 9. Underlying conditions, measurements, and institutions are different

Three concepts must remain distinct:

| Kind | Purpose | Examples discussed |
| --- | --- | --- |
| Underlying conditions | Describe persistent circumstances that influence development | Population, health, education, infrastructure, environmental condition, productive capacity |
| Calculated measurements | Report what those circumstances and economic activity produce | Income per person, national output, growth, national summaries |
| Institutional rules | Establish authority, ownership, rights, and available actions | Economic ownership arrangements, provincial powers, rights to restrict exports or make policy exceptions |

National measurements are not all simple averages. Population and output can be totaled; some conditions can be population-weighted; national inequality requires a representation of distribution and cannot be obtained by averaging provincial inequality.

Dynamism had an economic role in the legacy game. Its future meaning is unresolved. The model should avoid counting the same investment advantage once through its underlying causes and again through a summary score.

## 10. Development programs bundle policies and inherit unchanged rules

A development program can contain several measures applied to a geographic zone. Unchanged settings inherit the applicable higher-level rules; selected settings can establish explicit exceptions where institutions authorize them.

Inheritance remains live: changing an inherited provincial or national rule changes what applies locally. An explicit exception retains its setting while it remains permitted. A smaller area does not automatically have authority to override a higher government.

Replacement, minimum standards, and additional expenditure are different relationships. A local tax exception might replace a rate; additional infrastructure funding supplements a commitment; a national environmental minimum may prohibit a weaker local standard.

Overlapping programs need explicit conflict and stacking rules. A geographic zone is a reporting and intervention scope, not another copy of its population, resources, or output.

## 11. International trade follows policy and economic demand

The proposed direction is for policies to establish trade permissions, tariffs, restrictions, agreements, and priorities. Aggregate economic actors then purchase and sell supplies under those conditions. Individual trading companies and manually negotiated shipments are not required.

Public and private ownership can coexist across a transaction: private industry in one country can purchase exports from another country's public sector. Ownership determines who pays, receives proceeds, and controls the supplies.

Trade must distinguish needs from funded purchases. Prices and fulfilled quantities could respond to accessible supply and funded demand, but the pricing and allocation mechanism remains open. A global reference price, transport effects, and differentiated agreements are possibilities, not selected mechanics.

Military expansion adds demand; it does not automatically prohibit exports. Domestic purchases, imports, reserves, prices, export commitments, and policy restrictions influence the outcome. Shortages may remain even when prices rise.

## 12. Civilian activity gives resources a continuing economic role

Demand can originate from population consumption, operating existing activity, maintaining capacity, expanding development, and military commitments. These uses should have different shortage consequences.

The following six-resource set is a working proposal, not a frozen catalogue:

| Resource | Proposed civilian role | Proposed military role | Main shortage consequences |
| --- | --- | --- | --- |
| Food | Population consumption | Personnel supply | Reserves fall; sustained shortages impair health and stability and can cause displacement and population loss |
| Timber | Construction, reconstruction, selected infrastructure maintenance | Field works and supporting infrastructure | Development and repairs slow; prolonged maintenance deficits can cause deterioration |
| Iron | Machinery, industrial capacity, transport infrastructure, construction | Equipment, vehicles, ammunition, repairs | Investment, manufacturing, and replacement capacity become constrained |
| Copper | Electrical and communications infrastructure, machinery, advanced activity | Communications, electronics, selected equipment and ammunition | Modernization and relevant production become constrained |
| Coal | Heavy industry and an abstract industrial-energy contribution | Inputs to military manufacturing | Dependent industrial output becomes constrained |
| Oil | Transport, mechanized agriculture, selected industrial uses | Vehicle, aircraft, and ship operation; selected manufacturing | Dependent civilian activity and military operations become constrained |

Every included resource should have a distinct purpose. Every country need not consume every resource in the same proportions. Specialization, development, efficiency, and policy influence demand.

Investment inputs are consumed during expansion; they are not charged in full again each turn afterward. Operating and maintenance requirements continue according to activity and installed capacity. Missing construction inputs delay development, while missing operating inputs can reduce current activity.

Deposits in the ground, standing timber, extracted inventories, productive capacity, and per-turn output are separate quantities. Money purchases goods and funds activity; it is not a physical substitute for unavailable material.

## 13. Deliberate limits: energy, processing, and services

The latest working proposal keeps electricity implicit. Industrial activity could consume an allowed coal/oil mix without an independent electricity stockpile, grid, or power-plant simulation. Substitution must be specific to a use: coal does not automatically replace vehicle or aircraft fuel. Whether and how other energy sources enter remains open.

Processing stages can be represented within aggregate productive activity. Separate steel, machine-part, and similar inventories are not required by the current direction.

Services are useful activities rather than stockpiled physical goods: commerce, transport, finance, communications, technical work, and personal/professional services. The proposed initial representation is a broad aggregate sector. It requires customers and purchasing power, people, investment, and supporting conditions; education alone must not generate free money.

Public-service policy and the service sector are different concepts. Health and education retain explicit purposes in the simulation regardless of how their providers are owned or funded. Avoid crediting the same spending or output twice.

## 14. Confirmed V2 and world-development boundaries

- The future change is a V2.0 break. Old savegame compatibility is not required. The intended later transition preserves the current playable version in a separate production instance while V2 develops; that deployment has not been performed by this discussion.
- Map Lab experiments provide evidence and inspiration. Their implementation and demo rules are not automatically production contracts.
- Custom X × Y means region counts: more regions means a larger world. Microcell density is a separate dimension whose physical and gameplay consequences still need definition.
- Terrain V2 is the desired visual direction, but rendering, caching, and interaction performance still need testing.
- The real map workspace should evolve into a world-authoring environment.
- Geographic features should have persistent identities and coherent names, independent of changing political boundaries. A named river is one feature across its course. Exact database representation remains open; features can span multiple regions, cells, or edges.
- Cultural naming influence centers, diminishing with distance and backed by naming datasets with a default, are an agreed direction for exploration. Precise naming rules remain open.
- Population identity, political allegiance, administrative boundaries, and geographic naming are distinct. Provincial and nation-ownership concepts are being taken to the lab for further exploration; no implementation is claimed here.
- Working simulated timescale: one season per turn, following the legacy game's cadence, with four turns per in-world year. An annual turn was considered but raises concerns about military pacing. Exact military action timing within a season remains to be designed.
- Combat could resolve through internal ticks to represent the progression of engagements. This is a possible mechanism within the seasonal turn, not a new player-facing calendar. Detailed combat design is deferred; discuss it here only where necessary for economic consequences.
- Intended play cadence is roughly one or two turns per real day. Longer turn resolution is tolerable, with ten minutes previously described as an undesirable but acceptable upper tolerance. Wall-clock resolution time is separate from the simulated season. Ordinary commands should remain responsive.

## Open decisions and next discussion

The principal unresolved decisions are the persistent local conditions, the meaning of dynamism and other indicators, sector and resource boundaries, public/private investment behavior, monetary accounting, trade settlement, resource depletion and renewal, and the timing of actions within a seasonal turn.

Percentages, facility counts, city thresholds, province powers, and exact geographic/economic simulation scales remain open. No complete employment, company, household, banking, or electricity-grid simulation has been accepted.

The companion [economic simulation foundations](economy-simulation-foundations.md) goes one level deeper. It records the accepted high-level boundary and proposals for the remaining details; not every listed mechanism has been accepted.

## Related background

- [Historical Novus Ordo — gameplay feature inventory](historical-novus-ordo-2010-features.md): evidence about the legacy game, separate from the proposed future direction in this document.
