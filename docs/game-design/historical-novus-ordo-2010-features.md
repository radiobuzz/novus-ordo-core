# Historical Novus Ordo — gameplay feature inventory

Reviewed: 2026-09-18

Source: user-provided `no_old_backup_from_20100226.zip` (backup name dated 2010-02-26; individual files span earlier years).

Scope: game features and economic fundamentals, not interface design or technology assessment. This is historical evidence, not a decision to reintroduce every feature into the current game.

## Executive finding

This version combined territorial warfare with a substantial nation-policy simulation. Its economy was primarily driven by population, social conditions, legislation, taxation, public-service funding, and industrial capacity. It was not primarily a commodity-extraction and crafting-chain economy.

Its central relationship was:

```text
Government policies + actual funding + taxation
                  ↓
Health / education / inequality / crime / infrastructure / environment
                  ↕
Economic strength / dynamism / unrest / population
                  ↓
National income + taxable revenue + industrial capacity + manpower
                  ↓
Public services / borrowing / military production / maintenance / diplomacy
```

The arrows summarize coupled game rules, not a strict execution order or real-world economic claims.

The especially important design distinction: choosing a public service creates a funding requirement; allocating its budget determines whether the nation can actually support that commitment. Laws and budgets are related but separate decisions.

## Evidence and confidence

- **Implemented path:** gameplay action, calculation, or turn-resolution behavior is present. This does not mean the old game was executed or every edge case verified.
- **Defined content:** a policy, item, or description exists; mechanical effects are stated only where supported by calculation/resolution evidence.
- **Historical/partial:** old descriptions or retained logic conflict with active behavior, or the feature is explicitly deprecated.
- **Not established:** no complete implementation was found in the inspected game paths. This is not proof that the feature never existed in another version.

The archive was inspected as data, not executed. Third-party libraries, artwork, generated caches, and installation instructions were not treated as gameplay evidence. File references below identify members inside the original ZIP, under `no/`; line numbers refer to this snapshot. This keeps references usable without depending on a temporary extraction folder.

## 1. National economy and public finances

### 1.1 Economic output and national wealth

Implemented paths include:

- Population and income-per-capita calculations feeding national GNP.
- Separate accounting for national and foreign-origin populations under a nation's control.
- Government funds: a positive balance represents available assets; a negative balance represents debt.
- An underground economy that removes output from the taxable base.
- Income, expenditure, surplus/deficit, and projected next-turn funds.

At the population-group level, income per capita equals the economic index multiplied by a configured maximum of 30,000. GNP is calculated from regional population/income values. Treat these as game-model units, not an independently verified real-world national-accounts model. [E1, E2]

### 1.2 Taxation

The player sets a national tax rate. The game calculates a tax-tolerance threshold from legislation, with a base allowance. Exceeding the threshold contributes to civilian unrest.

Taxes also affect dynamism, economic prospects, and population growth. Raising the rate is therefore not simply a linear increase in useful revenue.

The taxable-income relationship is explicit:

`Tax revenue = (GNP − underground economy) × tax rate`

The underground economy responds to taxation, crime, and unrest, including the situation of foreign-origin populations. [E1]

### 1.3 Public spending: six programs plus military commitments

The controllable public-program budget categories are:

| Program | Policy/funding scope |
| --- | --- |
| Health | Hospitals and health coverage |
| Education | Kindergarten, primary, secondary, vocational, and higher education |
| Police | Law-enforcement institutions and supporting capabilities |
| Welfare | Financial assistance and social support |
| Environment | Environmental-policy costs |
| Infrastructure | Maintenance, expansion, and investment commitments |

The army has its own allocation. Production/training expenses, debt interest, and outgoing grants also contribute to spending.

Program and army allocations can be expressed as fixed amounts or percentages of the required budget. The validation path caps these allocations at the calculated requirement; this is not an unlimited overspending-to-buy-bonuses system.

Required expenditure depends on adopted policies, population, economic conditions, and other modifiers. Underfunding public programs contributes to civilian unrest; underfunding the military contributes to a calculated military-unrest measure. Several development indices explicitly use the funding ratio for their associated program. Not every budget category has an equally direct index linkage. [E1, E3]

### 1.4 Debt and borrowing constraints

Implemented rules include:

- Borrowing through negative government assets.
- Interest increasing with debt relative to borrowing capacity.
- A debt ceiling tied to GNP.
- A per-turn deficit limit, adjusted for available cash and remaining borrowing headroom.
- Validation that rejects spending plans exceeding the allowed deficit.

Snapshot configuration: maximum debt is **50% of GNP**; the base per-turn deficit allowance is **5% of GNP**; configured debt-interest bounds are **1% to 15%**, with the rate rising toward the upper bound as debt approaches the ceiling. These are game-turn calculations, not annualized financial rates.

The FAQ instead mentions 5–10% interest. The report favors the configured calculation for this snapshot, and preserves the discrepancy rather than treating the FAQ as authoritative. [E1, E4]

### 1.5 Public versus private economy

Players choose private, mixed, or state ownership separately for:

- Primary industry: agriculture, mining, and resource gathering in the policy description.
- Secondary industry: manufacturing and construction.
- Tertiary industry: services, research, and information technology in the policy description.

These choices influence an aggregate economic-system position; they do not establish individually simulated farms, firms, mines, or research laboratories.

State involvement in secondary industry enables a choice between consumer-goods emphasis and heavy-industry/war-effort emphasis. The latter affects usable industrial capacity and the modeled economic potential.

Public-service provision also has private/mixed/state choices. Thus ownership of the general economy and organization of public services are distinct policy questions. [E5]

### 1.6 Industrial capacity and technological capability

Industrial capacity is derived from population, income, education, dynamism, unrest, and the share of activity outside the underground economy. Only a configured portion is usable for production, modified by industrial policy.

Equipment has technological requirements. Available production capacity is calculated at different technology thresholds using regional education; existing orders consume that capacity.

This is a link between national development and the ability to manufacture advanced equipment. It is not evidence of a separate player-directed research tree. [E2, E6]

## 2. Society, development, and territorial economics

### 2.1 Eight evolving indicators

| Indicator | Gameplay role supported by the inspected rules |
| --- | --- |
| Economic index | Income per capita and the economic foundation of the nation |
| Health | Population well-being, economic potential, and eligible military manpower |
| Education | Economic prospects, industrial capacity, and technological manufacturing capability |
| Dynamism | Productive activity and modeled private provision of services |
| Crime | Economic damage and growth of the underground economy |
| Gini coefficient | Income inequality, interacting with welfare, health, and education |
| Infrastructure | Economic potential and the results of investment/provision policies |
| Environment | Environmental quality, interacting with development, regulation, and health |

These values exist at population-group/region level and are aggregated for national reporting. They evolve over turns with bounded random variation and policy-dependent target values called “peaks.” The game provides projected variation ranges and directional advice.

This creates delayed consequences: a reform alters development conditions rather than instantly buying a fixed number of index points. The model encodes its own political/economic assumptions; those are historical game-balance choices, not objective economic truths. [E2, E7]

### 2.2 Population and growth

- Population changes each turn.
- The growth calculation responds to taxation, unrest, and rights/social-policy modifiers.
- Population is limited by territory capacity; geography also defines regional capacity.
- Regions can contain multiple national-origin groups with their own population, unrest, and development values.
- The game distinguishes nationals from foreign-origin populations under a nation's rule and tracks national-origin groups outside their home nation.

Important terminology: the budget's “net growth” value feeds **population growth**. It should not be reported as a conventional GDP growth statistic. Economic development also changes separately through the economic index. [E1, E2, E8]

### 2.3 Geography and occupation

Terrain includes plains, river plains, deserts, tundra, mountains, forests, and water. Geography affects population capacity, economic modifiers, movement, openness/engagement conditions, and military upkeep.

Motherland identity, current ownership, and military control are meaningful distinctions. Conquest/transfer changes ownership and unrest; gaining population does not imply immediately obtaining a calm, fully productive population. Stocks and reserves associated with a nation in territory it no longer owns can suffer attrition.

Neutral regions have populations and automatically maintained defenders. [E8, E9]

## 3. Government, legislation, and national identity

### 3.1 Identity and leadership

Features include national short/formal names, leader titles, flag and coat-of-arms imagery, national motto, leader name/portrait/address style/viewpoint, and a named currency.

Leader replacement exists and applies an unrest penalty during resolution. Intelligence and charisma remain in formulas, but normal creation/replacement assigns fixed values and explicitly deprecates customizable attributes. A meaningful player-selected leader-stat build is therefore **historical/partial**, not a confirmed active feature of this snapshot. [E10]

### 3.2 Policy catalogue

The legislation definitions contain **9 policy domains and 46 topics**. Not every individual option has a distinct numeric effect; some describe national identity or institutions.

| Domain | Choices covered |
| --- | --- |
| Constitution | Citizenship restrictions; arbitrary rule, conventions, or written constitution; head-of-state selection; executive structure; head of government; legislature and its selection; judiciary; state religion; civil rights; national motto |
| Law and order | Presumption of innocence, habeas corpus, death penalty, local/national police, forensic capabilities, tactical teams, identity cards, curfews |
| Education | Curriculum; public/private arrangements and tuition support across five educational levels; religion in public/private education |
| Health | Hospital provision, health-insurance coverage up to universal provision, unhealthy-food regulation |
| Welfare | No assistance, workfare, disability-related support, or guaranteed minimum income |
| Environment | Graduated pollution standards |
| Infrastructure | Private/mixed/public maintenance and expansion; levels of public investment |
| Economy | Named currency, ownership of three industrial sectors, consumer-goods versus heavy-industry priority |
| Defense | Wartime/peacetime/reduced readiness, general-purpose versus defensive specialization |

Adopted laws affect fiscal requirements, social/economic indicators, political classifications, or military efficiency where corresponding effects are defined.

Head-of-government and legislative/judicial identity can be described through policy variables. This is not proof of independently simulated cabinet characters, competitive elections, parties, or parliamentary voting. [E5, E11]

### 3.3 Reform packages and policy issues

Players can enact packages rather than change every measure individually. Examples include monarchy, military junta, authoritarian republic, constitutional monarchy, parliamentary democracy, presidential democracy, civil-rights reform, privatization/nationalization, social safety nets, policing, infrastructure support, and tax adjustments.

Conditional policy issues include budget surpluses, deficits, rampant crime, and pollution. They offer concrete reform choices or inaction. Their outcomes are processed during turn resolution, and unaffordable changes can fail to be implemented.

An automatic status report identifies strengths, problems, and improvement/deterioration prospects, with advice tied to the current nation. [E11, E12]

## 4. Military production, organization, and war

### 4.1 Recruiting and manufacturing

- Train conscript, regular, and elite personnel into reserves.
- Training costs funds and takes time: configured durations are 1, 6, and 15 turns respectively.
- Recruitment is constrained by national-origin population, health, selection requirements, current training commitments, and available funds.
- Manufacture equipment subject to funds and technology-appropriate industrial capacity.
- Cancel training/manufacturing orders, release reservists, and scrap equipment.
- Manufacturing orders in this snapshot are completed at the next turn update; personnel training has an explicit multi-turn countdown.
- Maintain both personnel reserves and equipment stocks, with ongoing costs.

The equipment catalogue includes small arms, sniper rifles, machine guns, anti-tank weapons, tanks, infantry fighting vehicles, transports, and some improvised equipment. Real-world equipment models have differentiated characteristics. [E6, E13]

### 4.2 Division design and military budgets

Players compose named divisions from trained personnel and available equipment, select deployment locations, modify composition, and use saved division patterns. Mobilization is limited by actual stocks/reserves.

Costs distinguish reservists, stored equipment, standby divisions, and operating divisions. Readiness and defensive specialization trade military capability against cost. Re-equipment/restoration and demobilization/disbanding are separate from simply purchasing a division. [E6, E14]

### 4.3 Orders and combat

Implemented paths cover movement routes, cancelling orders, restoration, disbanding, and tactical behavior. Five defined tactics are support at safe distance, support, engage at safe distance, engage, and charge.

Combat accounts for weapon range, fire behavior, accuracy/efficiency, penetration, protection, personnel losses, terrain, morale, organization, and movement. Units can flee or surrender; combat can produce captured equipment and territorial control changes. Coastal-to-coastal movement/landing rules exist, but they should not be mistaken for a complete naval-force simulation.

Detailed battle logs explain engagements and losses. Friendly/allied information is more detailed than hostile strength estimates, which are deliberately approximate. [E9, E14, E15]

## 5. Diplomacy and communication

### 5.1 Six formal relationship types

| Relationship | Gameplay consequence |
| --- | --- |
| Peace treaty | Establishes formal peace and requires declaration of war before attacking |
| War declaration | Establishes belligerent status |
| Alliance | Enables allied movement/access and linked war obligations; also prevents directly declaring war while allied |
| Non-aggression pact | Prevents mutual war declarations while in force |
| Independence guarantee | Can bring the guarantor into war when the protected nation is attacked |
| Rogue-state declaration | Can trigger intervention when the designated nation attacks another |

Treaties support proposals, responses, prerequisites, incompatible relationships, and cancellations. Defined cancellation delays are generally one turn for peace/rogue declarations and five for alliances/non-aggression/guarantees. Alliance cancellation also checks for troops remaining in the other nation's territory.

War resolution follows relationship networks rather than treating every conflict as an isolated two-player event. A full edge-case audit of cascading obligations was not performed. [E16]

### 5.2 Grants and territorial cessions

Players can offer money, equipment, and regions. Recipients accept or reject; offers can remain pending. Resolution checks relevant ownership/inventory conditions and publishes results.

This supports negotiated aid and transfers. It is not, by itself, a commodity market, auction house, price-setting trade system, or atomic two-sided exchange. [E17]

### 5.3 Statements and private mail

- Nations prepare public statements called “conferences,” published on turn advancement and retained for later reading.
- Nations exchange private messages, with replies, inbox/sent/archive organization, and unread tracking.
- Messages also carry responses to diplomatic offers and policy issues.

The conference feature is **not a threaded discussion forum**. Separate forum references and a post-count integration exist, but the inspected game does not establish native topics, replies, resolutions, or voting. [E18]

## 6. News, information, progression, and loss

- Turns advance through four named seasons.
- Nations receive reports about population and financial changes.
- Local and world news record military events, diplomatic changes, grants, and relevant national changes.
- Public statements provide player-authored diplomatic narrative.
- The game generates a descriptive national profile from adopted policies and current conditions.
- Comparative information includes population, territory, military-strength classifications, development measures, human development, political rights/civil liberties, and economic freedom.
- Region/nation information distinguishes detailed own-nation values from less precise foreign information in inspected paths.
- Losing all controlled territory marks a nation as annexed/no longer independent.

A global match-winning rule was not established by this inspection. Territorial defeat and power rankings should not be presented as evidence of a particular victory condition. [E8, E12, E19]

## 7. Features to qualify rather than overclaim

| Apparent feature | Finding |
| --- | --- |
| Civil wars, insurgency, loyalist recovery | Historical text and data remain, but nation-turn code identifies removed revolt/loyalist attempts. The inspected troop-raising branch executes for neutral groups only. Active neutral defenders are established; a complete active domestic civil-war loop is not. |
| Custom leader attributes | Formulas remain, but normal creation/replacement fixes intelligence and charisma at 3; replacement calls attributes deprecated. |
| Military unrest causing revolt or forced disbandment | Military unrest is calculated. Former revolt/forced-disband paths are described as historical; their old consequences should not be assumed active. |
| Independent central-bank monetary policy | Currency naming exists. Inflation, exchange markets, money supply, and player-set central-bank rates were not established. |
| Full research system | Equipment tech requirements and education-dependent production exist; a research tree was not established. |
| Civilian production chains | Primary/secondary/tertiary sectors are policy categories. A full commodity supply chain, civilian business simulation, and market-clearing economy were not established. |
| Elections and cabinet simulation | Constitutional selection rules and institution names exist; recurring contested elections and independently simulated officeholders were not established. |
| Diplomatic forum and voting | Public statements and mail exist; a native threaded forum or assembly-voting system was not established. |
| Comprehensive air/naval warfare | Ground equipment and coastal transfer/landing behavior are established; complete air/naval branches were not. |

Exact balance values and inherited bugs need a separate review before reuse. This report establishes historical feature content, not that every calculation is correct or desirable today. [E20]

## 8. What this establishes about the old game's identity

The historical nation had five connected foundations:

1. **People and territory:** population, national origin, geography, control, and unrest.
2. **Institutions and commitments:** laws, public/private arrangements, rights, and public services.
3. **Fiscal capacity:** taxes, taxable output, spending, cash, debt, and interest.
4. **Productive and military capacity:** education, industry, recruitment, equipment, and upkeep.
5. **International relationships:** war obligations, access, aid, cessions, statements, and messaging.

The most distinctive economic feature is the combination of policy choices, actual service funding, evolving social conditions, and military opportunity costs. These are historical findings to discuss, not automatic requirements for the new game's V1.

## Evidence index

Paths below are relative to the archive's `no/` directory. They identify evidence, not suggested technologies or implementation choices.

| ID | Archive members and useful locations |
| --- | --- |
| E1 | `Calculator.php:35` (`setAllocs`): taxation, underground economy, requirements, allocations, deficit, interest, growth; `modules/base/Nation.php:1629` (GNP) and `:1724` (turn application) |
| E2 | `modules/base/Ethnic.php:250` (peaks), `:418` (index updates), `:449` (per-capita income), `:454` (industrial capacity) |
| E3 | `modules/legal/legal.params.php:1425` (budget categories); `modules/budget/BudgetFrame.php:33`; `modules/base/Nation.php:1459` (allocation validation) |
| E4 | `modules/common/common.params.php:47` (money constants); `Calculator.php:131` onward; `Doc/faq_draft.txt` (older interest/civil-war descriptions) |
| E5 | `modules/legal/legal.params.php:1326` (economy), `:1387` (defense), and public/private education/health/infrastructure definitions |
| E6 | `modules/base/Nation.php:83` (IC), `:177` (production limits), `:400` (recruitment), `:704` (training), `:740` (manufacturing), `:783` (expenses) |
| E7 | `modules/demography/demography.params.php:323` onward: all eight indicators, targets, advice; `modules/base/Ethnic.php:418` |
| E8 | `modules/base/Region.php:449` (population), `:482` (capacity), `:799` (turn), `:1032` (motherland), `:1053` (transfer), `:1084` (annexation); `modules/base/Nation.php:932` |
| E9 | `modules/map/map.params.php:23` (terrain); `modules/base/World.php:678` onward (movement/combat/control/capture); `modules/base/Ethnic.php:53` (neutral/rebel raising) |
| E10 | `modules/base/Leader.php:133` onward and `:190`; `NLeaderFrame.php:72`; `modules/legal/StepdownLeaderFrame.php:84`; nation/leader identity in `modules/legal/` |
| E11 | `modules/legal/legal.params.php:326` onward (46 topics), `:1439` (reforms), `:1576` (issues); `modules/base/World.php:538` (issue resolution) |
| E12 | `modules/base/Nation.php:3108` (activity-triggered reporting), `:3115` (report/advice), `:3295` (issue selection), `:3379` (national profile) |
| E13 | `modules/production/ProductionFrame.php:50` (training), `:139` (cancel order), `:162` (manufacture/scrap); `modules/combat/combat.params.php:910` (training levels), `:931` onward (equipment) |
| E14 | `modules/warroom/DeployFrame.php:59` onward; `modules/warroom/json.php:286` (orders), `:377` (tactics); `modules/combat/combat.params.php:2375` |
| E15 | `modules/combat/CEngine.php` (engagements); `modules/combat/Division.php:707` (losses), `:1245`/`:1305` (information detail), `:1419` onward (organization/morale), `:1619` (upkeep) |
| E16 | `modules/diplomacy/diplomacy.params.php:184` onward; `modules/base/Nation.php:2025` onward, `:2243` (alliance cancellation), `:2366` (war obligations); `modules/base/World.php:986` (treaty resolution) |
| E17 | `modules/base/Nation.php:2674` onward (grants); `modules/base/World.php:904` onward (grant resolution); `modules/diplomacy/GrantFrame.php` |
| E18 | `modules/diplomacy/NConferenceFrame.php:26`; `modules/base/Nation.php:1735` onward (statement publication); `modules/mail/NMessageFrame.php:33`; `modules/base/World.php:1309` (external forum reference) |
| E19 | `modules/common/common.params.php:25` (seasons); `modules/news/`; `modules/demography/demography.params.php:75` onward; `modules/demography/ranking.params.php`; `modules/base/Nation.php:932`/`:3472` |
| E20 | `modules/base/Nation.php:1769`, `:1792`, `:1831` (historical removals); `modules/base/Ethnic.php:78` (neutral-only branch); `modules/legal/StepdownLeaderFrame.php` (attribute deprecation); targeted searches of game modules for unestablished systems |

Archive SHA-256: `4e683965efcf8e20b70f9c68cfa102215706c4fc275f283628c0003b6efd4f0f`.
