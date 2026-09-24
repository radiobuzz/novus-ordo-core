# Two countries and copper — worked economic hypothesis

Date: 2026-09-24.

Status: illustrative proposal, not accepted balance, a selected pricing algorithm, or an implemented game mechanic. Quantities and prices are invented to expose dependencies and accounting requirements.

Basis: [economic discussion](economy-and-policies-discussion.md), [simulation foundations](economy-simulation-foundations.md), and [policy effects](policy-effect-vocabulary.md).

## Purpose and boundary

Follow a normal season and an alternative military-buildup season from the same opening situation. The alternatives are comparisons, not consecutive turns reusing the same supplies. They demonstrate public/private ownership, civilian demand, funded military procurement, international exchange, scarcity, and political choices.

This is a copper production-and-allocation slice of the seasonal economy, not a complete circular economy. Other inputs, production expenses, wages, household spending, taxes, interest, transport, and exchange rates are outside the arithmetic. Copper is assumed produced with those requirements already satisfied, and the opening cash balances are measured after that prior activity. Satisfying the copper requirement alone does not guarantee completion of military equipment.

Use abstract copper units and a common accounting currency. Supplies are immediately accessible, all participants observe the same market information, and there are no tariffs, freight costs, or delivery losses in this example. None of these simplifications is a decision for the full game.

## 1. The countries

**Aurelia (A)** has predominantly private productive activity. Its private mines supply copper, civilian producers buy it, and its national government procures copper for public military production or supplies it to contractors. This direct procurement arrangement is chosen to make ownership and payments explicit; the game could alternatively represent government purchases of completed equipment.

**Borealis (B)** has a state-directed copper sector. Its government allocates part of production to domestic uses and offers the remainder for export. Public production and foreign market sales are compatible.

| Season's copper supply | Aurelia | Borealis |
| --- | ---: | ---: |
| Copper produced and available at market opening | 40 | 60 |
| Public allocation to Borealis's domestic uses | — | 40 |
| Offered to the market accessible to Aurelia's buyers | 40 | 20 |

World copper output is 100. Forty units are allocated to B's domestic activity; 60 are available to A's civilian and military buyers. No strategic reserve is released initially. Deposits in the ground are not additional spendable inventory.

B's domestic allocation is a policy choice, not an automatic market privilege granted to every country. Domestic uses compete for resources even when no sale occurs between public departments.

## 2. Needs and purchasing limits

In Aurelia, two groups of civilian uses each want 20 units. Essential here is the label for the modeled use, not an enforced legal priority.

| Use | Normal-season need | Buildup-season need | Maximum purchase price in this example |
| --- | ---: | ---: | ---: |
| Existing civilian operation and maintenance | 20 | 20 | 18 per unit |
| Additional civilian development | 20 | 20 | 10 per unit |
| Military procurement | 20 | 40 | 15 per unit |
| Total desired copper | 60 | 80 | — |

Maximum prices represent willingness and ability to fund a use; they are authored assumptions here. A future model must derive them from budgets, expected value, input needs, and policy. Players need not manually bid for every private transaction.

The aggregate civilian purchasing pool has 600 currency units. Its full requests at their respective maximum prices cost at most 560. The government has 600 available, enough to fund its expanded 40-unit request at its maximum price. Money is therefore sufficient to submit these requests, but copper supply is insufficient to fulfill all of them in the buildup case.

A's mines offer 40 units at a minimum price of 8; B's public exporter offers 20 at a minimum price of 9. These are reservation prices for existing supplies, not modeled production-cost accounts.

## 3. An explicit illustrative pricing rule

For this example only:

1. Rank funded unit bids from highest to lowest and offers from lowest to highest.
2. Match bids and offers while the buyer's maximum covers the seller's minimum.
3. Charge every accepted unit the lowest accepted buyer bid.

This uniform-price convention produces reproducible numbers and acceptable prices for every matched party in the examples. It is not being recommended as a finished market algorithm: bid derivation, strategic manipulation, ties, partial orders, transport, interacting inputs, and price stability still require design.

## 4. Normal season

Sixty units are offered and all 60 requested units are accepted. The lowest accepted bid is the civilian-development bid of 10, so the common transaction price is 10.

| A's purchases | Copper received | Payment |
| --- | ---: | ---: |
| Existing civilian activity | 20 | 200 |
| Civilian development | 20 | 200 |
| Military procurement | 20 | 200 |
| Total | 60 | 600 |

A's private mines receive 400 for their 40 units. B's public account receives 200 for its 20 exports. B also uses its 40-unit domestic allocation. All 100 units are used or incorporated into activity in this simplified season; no copper inventory remains.

## 5. Alternative season: Aurelia expands military procurement

The government increases the military copper requirement from 20 to 40. Existing productive capacity has not expanded, so available supply remains 60 for A's buyers.

The 20 civilian-operation bids at 18 and the 40 military bids at 15 take the available supply. The 20 civilian-development bids at 10 are not filled. The new transaction price is 15.

| A's purchases | Copper wanted | Copper received | Payment |
| --- | ---: | ---: | ---: |
| Existing civilian activity | 20 | 20 | 300 |
| Civilian development | 20 | 0 | 0 |
| Military procurement | 40 | 40 | 600 |
| Total | 80 | 60 | 900 |

The military receives twice the copper but pays three times the normal-season amount. Existing civilian users pay more for the same quantity. Civilian expansion is postponed: some money remains, but those projects do not purchase copper above their assumed acceptable price.

A's private mines receive 600. B's public exporter receives 300. These are sale receipts, not net profits. Higher private mining receipts are not automatically government funds; taxes are deliberately absent from this example.

B has not stopped trading. It earns more from the same export quantity. A's buildup has changed demand and price without requiring a special bilateral transaction or automatically banning exports.

## 6. Cash reconciliation

The two alternatives start with identical cash balances. B's producer/exporter and treasury are represented by one consolidated public account for this example. No funds are created by repricing the copper.

| Account | Opening cash | Closing: normal season | Closing: buildup season |
| --- | ---: | ---: | ---: |
| A civilian buyers | 600 | 200 | 300 |
| A treasury | 600 | 400 | 0 |
| A private mines | 100 | 500 | 700 |
| B public account | 100 | 300 | 400 |
| Total | 1,400 | 1,400 | 1,400 |

Each scenario's buyer payments equal seller receipts. A's net monetary transfer to B is 200 normally and 300 during the buildup. Domestic transactions redistribute money inside A; exports transfer money to B. Valuing production or inventories more highly does not itself credit a cash account.

This still leaves the next-season income cycle to design: household income, taxation, producer expenses, civilian final sales, service receipts, and reinvestment must supply coherent reasons for future purchasing power.

## 7. A possible policy response from Borealis

Suppose B instead caps exports at 10, retaining the other 10 units as a public reserve while maintaining its 40-unit domestic use. Only 50 units are then accessible to A's buyers.

With the same funded bids and illustrative rule:

- A's existing civilian activity receives 20 units and pays 300.
- Its military receives 30 of the requested 40 and pays 450.
- Civilian development receives none.
- A's mines receive 600; B's exports bring in 150.
- The price remains 15 because the marginal accepted bid has not changed. Scarcity does not have to produce an unlimited price increase; unfulfilled demand can increase instead.
- Copper reconciles as 50 used in A, 40 used in B, and 10 added to B's reserve, totaling the original 100.

The policy trades export receipts for reserves and strategic influence. It does not create a bonus supply. Diplomacy can now concern future export access, a supply commitment, assistance with capacity expansion, or policy concessions.

## 8. Governing choices and later development

A might reduce procurement, increase its willingness to pay, release an existing reserve, seek additional suppliers, or encourage more extraction. Each affects a different constraint. In the baseline buildup all accessible stock is already bought: a larger budget alone cannot create more copper. A price ceiling without an allocation or supply response also does not resolve the physical shortage.

New extraction and infrastructure take time and require their own funding, inputs, and people. High prices may encourage investment, but geology, expectations, operating costs, infrastructure, and policy still determine the response. Public programs can commit development funds; they cannot instantly bypass those constraints.

Provincial consequences depend on where the activity occurs. Mining areas may benefit while regions awaiting investment experience delays. Repeated, visibly uneven priorities could contribute to unrest, but neither a military purchase nor a fiscal transfer automatically applies an unrest penalty.

## 9. Domestic and international prices

In this deliberately frictionless accessible market, domestic and imported copper trade at the same price. Domestic and international prices should not be two unrelated numbers generated independently.

Tariffs, transport costs, trade access, delivery limits, and public allocation can later produce different accessible prices and quantities. B's public domestic allocation has an opportunity cost even though no internal cash payment is shown. A public accounting price or subsidy is not necessarily an external market-clearing price.

## 10. What this example establishes and leaves open

It demonstrates a possible common market across ownership systems, civilian competition with military demand, a funded-request constraint, physical shortages, and conserved money/material flows. The arithmetic was checked for the normal, buildup, and restricted-export cases; this is not a game-engine test or proof of balance.

The next major questions are how aggregate buyers earn income and derive bids; how production obtains several inputs without circular or order-dependent allocation; how domestic access connects to international trade; how supply responds over time; and which policy tools stay legible to the player.
