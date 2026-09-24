# Policy effects — first vocabulary for discussion

Date: 2026-09-24.

Status: proposed effect families, not accepted mechanics, a database schema, or an implementation task. The high-level economy is accepted; storing policies in a database remains an unevaluated option.

Basis: [economic discussion](economy-and-policies-discussion.md) and [simulation foundations](economy-simulation-foundations.md).

## Purpose

Define what a policy can change before choosing how to store it. Policies compose effects that the simulation understands. Some affect institutional rules immediately when effective; others establish commitments whose realized consequences take time, funding, inputs, and capacity.

The vocabulary below groups economic and institutional responsibilities. These are candidate effect families, not necessarily the final number of software operations. Detailed electoral, diplomatic, or military mechanics may require additional families later.

## Candidate effect families

| Family | Direct change | Example | What still has to be calculated |
| --- | --- | --- | --- |
| Rights and authority | Who may make a decision or exercise a power | Permit provinces to set a tax rate within a national range | Which local choices are lawful and become effective; no automatic prosperity or loyalty bonus |
| Ownership and control | Permitted ownership/provision arrangements, or an authorized transition toward one | Allow mixed ownership of extraction | Existing asset transitions, financing, time, and control of output; existing private capacity does not instantly become free public property |
| Permissions and standards | Whether an activity is allowed and what conditions it must satisfy | Restrict copper exports; establish a pollution standard | Eligible trades or activity, compliance requirements, enforcement/provision assumptions, and resulting output/environmental change |
| Financial transfers | A tax, tariff, subsidy, or benefit rule, with payer, recipient, and basis | Reimburse part of eligible mining investment | Actual eligible activity, affordability, collection/payment, caps, and investment response |
| Service provision | Eligibility, intended coverage, or level of an ongoing service | Provide universal access to basic education | Required funding and resources, achieved delivery, and gradual educational consequences |
| Spending commitments | An allocation toward investment, maintenance, operation, or procurement | Fund infrastructure improvements in a development zone | Actual expenditure, fulfilled inputs, delivery progress, and resulting capacity/condition |
| Allocation priorities | A permitted preference among competing uses | Prioritize available public fuel for food production | Access to stocks, competing needs, fulfilled allocations, and shortages elsewhere |

Financial transfers and spending commitments cooperate. A subsidy rule defines eligible payments; a funding commitment limits what can actually be paid. They are not two independent expenditures for the same payment.

Service entitlements and funding also cooperate. Expanding an entitlement can increase the funding requirement without delivering the expanded service until capacity and resources support it. Actual delivery influences the condition, not the mere presence of the policy.

Priorities cannot override property rights or create supplies. A government directing public stocks and a government prioritizing private supplies may require different legal mechanisms.

## Effect versus consequence

Example: a mining subsidy changes an eligible investor's financial proposition and creates a public payment obligation. Successful investment can later increase extraction capacity, production, income, pollution, and migration pressure.

Those consequences follow the shared economic mechanisms. Do not add separate policy bonuses for every downstream outcome, which would risk double counting and make interactions difficult to explain.

This does not prohibit a policy from changing a defined model parameter, such as a service coverage target or a compliance requirement. The target must have an explicit meaning. Avoid an unrestricted effect that writes arbitrary values into any indicator.

## Common questions for each effect

1. **Subject:** which residents, activities, owners, resources, institutions, or transactions are affected?
2. **Area:** where does the rule apply, and which government has authority there?
3. **Meaning and unit:** is the value a rate, a cap, a standard, an allowed choice, a quantity, or a funding commitment?
4. **Conditions:** when does the effect operate, and when is it suspended or inapplicable?
5. **Timing:** when does it become effective, how long does it last, and what happens on repeal or replacement?
6. **Funding and responsibility:** who pays or delivers, and what happens when actual provision is insufficient?
7. **Combination:** does it replace an inherited choice, establish a bound, add a distinct commitment, or conflict with another effect?
8. **Explanation:** what can the player inspect before enactment, and how will actual results be attributed afterward?

These questions describe a conceptual contract, not a required database record layout.

## Dependencies and blockers are separate from effects

A prerequisite determines whether a policy can be chosen; an effect determines what it changes. For example, provincial taxation authority permits a provincial tax choice, while the chosen rate governs the tax obligation.

Also distinguish enactment conditions from conditions for operating an existing policy. If authority is revoked or funding disappears, decide whether the policy becomes invalid, suspended, ineffective, or subject to a transition. Repealing a program does not erase already built infrastructure or fulfilled transfers; outstanding commitments need explicit treatment.

## Composing familiar policies

| Policy/program | Possible composition |
| --- | --- |
| Universal basic education | Service eligibility/coverage + public funding commitment; any provider ownership arrangements remain distinct |
| Mining development support | Eligible subsidy rule + funding cap; optional infrastructure commitment and permitted land-use conditions |
| River protection | An operating standard or restriction; any enforcement or remediation spending must be explicit |
| Copper export restriction | Trade permission/restriction; exemptions and geographic/ownership applicability must be defined |
| Provincial economic autonomy | Authority to make specified local choices within national bounds; no automatic repeal of national minimum standards |
| State extraction expansion | Permitted public investment + funded development commitment; any transfer of existing private assets requires a separately defined transition |

A development zone defines the footprint. A program bundles choices and commitments affecting that footprint. National and provincial rules continue to apply unless an authorized exception changes them.

## Questions to test before accepting the vocabulary

- Can a policy have immediate costs and delayed benefits without granting the benefits twice?
- Can the same goal use public investment or private incentives while preserving shared physical constraints?
- Can underfunded services and oversubscribed subsidy programs report what was actually delivered?
- Can overlapping areas identify one effective rule and account for each commitment/payment once?
- Can institutional changes affect available actions without inventing economic bonuses?
- Can a policy be explained with its direct effects and separately projected consequences?

The first useful worked example is education: define the entitlement, its requirement for funding/capacity, delivered provision, and seasonal educational change. Mining investment can then test the same distinctions for productive capacity. This is a proposed discussion sequence, not a commitment to implement either system now.
