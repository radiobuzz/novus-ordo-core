# Production/development Package B — definitions and seasonal storage

**Integration update:** [Package D](production-lifecycle-contract.md) now activates this storage in fresh-game founding and live turns. The boundaries below describe the original Package B delivery.

Date: 2026-09-29. Implements Package B of the [production/development plan](production-development-implementation-plan.md). The accounting primitives remain in [Package A](production-accounting-contract.md).

## Delivery boundary

This package adds validated definitions, database storage, catalogue-bound policy effects, and explicit founding/snapshot operations. **It does not activate the new production economy in live turns.** `ProductionStateStore` is exercised by isolated integration tests; automatic world/nation seeding and coordinated settlement are connected at the Package D cutover after Package C provides the resolver. There is no dual-write adapter between old production bids and new acquisitions.

The existing game can continue to run on the new schema. Its resource accessors, grants, Guard allocation and treasury history now explicitly select government inventory. This prevents future private rows from leaking into public reserves. Existing agriculture and fiscal resolution still run until replacement; do not interpret the new catalogue coefficients as already changing gameplay.

## Resource rule contracts

All contracts live in the existing `resource_rules` table, and use existing resource import/export, independent game cloning and test editing. All physical producers must declare the four stock contracts below. Unsupported fields/formulas are rejected. Decimal values use the existing six-place quantity type.

| Handler | Parameters and units |
| --- | --- |
| `production.operating` | `wage_per_unit`: currency paid to households per produced unit, nonnegative. Other input costs/recipes are not implemented. |
| `exchange.reference_price` | `price`: positive currency per delivered unit. This is a fixed reference-price contract, not a market-clearing price. |
| `development.capacity` | `capital_cost`: positive currency per added unit of seasonal output capacity; `construction_workers`: positive worker-seasons per added unit; `max_growth_fraction`: bounded seasonal expansion coefficient, 0–1. The coordinated resolver will define/apply the expansion allocation. |
| `production.founding` | `core_developed_fraction`, `neutral_developed_fraction`, `public_share`: 0–1 fractions. `private_inventory_per_million`: opening goods per million founding inhabitants. `private_inventory_unit_cost`: cost carried per opening private unit. These are one-time opening assets, not output, taxable earnings or recurring subsidies. |
| `finance.civilian_founding` | Required on the treasury definition only. `household_cash_per_million` and `producer_cash_per_million`: explicit one-time civilian currency balances per million founding inhabitants. Treasury is not copied into these accounts. |

The existing physical handler still specifies output per million workers and saved geographic potential. Installed capacity is expressed in **output units per season**, independently of how many workers or operating funds are available. The Package C adapter must keep actual workers, worker-seasons and output-per-million productivity consistent with Package A; it must not treat a million-worker yield as output per single worker.

The default resource template has provisional explicit values. These are configuration starting points, not balanced estimates or the numerical catalogue from Package A's demonstrations. Existing templates are not rewritten or converted. The template's new name avoids accidentally selecting an older stored template as the fresh default.

## Seasonal state

| Table | Identity and meaning |
| --- | --- |
| `territory_production_states` | Territory × turn × resource × `government`/`producer`. `installed_capacity` stores physical productive assets. National ownership follows that season's `territory_details`; neutral territories also have assets. |
| `nation_resource_stockpiles` | Nation × turn × resource × `government`/`producer`. `available_quantity` and **total** `cost_basis` belong to that pool. Government currency remains the only treasury balance. Currency is not stored in the private goods pool; recruitment remains non-stored. |
| `nation_economic_accounts` | Nation × turn × `household`/`producer`, with exact `cash`. No government row and no duplicate treasury. |
| `nation_resource_acquisitions` | Nation × planning turn × priced stock resource. `requested_quantity`, currency `spending_limit`, integer `priority`. A saved intent is neither a payment nor received inventory. Priority ordering and funded delivery belong to Package C. |

Definitions and immutable geography are not copied each turn. `copySeason` copies only changing state into an empty consecutive destination. It rejects foreign games, absent opening production state and already-populated destinations. Resolver changes must happen under the same outer game transaction as this copy. The existing live turn loop does not call it yet.

`snapshot` returns deterministic row content without surrogate IDs/timestamps, useful for replay comparisons. It is an internal persistence read, not a player-visible payload exposing civilian accounts or foreign nations.

## Founding and territorial continuity

1. `initializeWorld` seeds neutral physical capacity once in the first season from saved resource potential × the neutral developed fraction. Both owner pools have rows, including zero capacity where no potential exists.
2. `foundNation` applies the core developed fraction to explicitly supplied owned homeland territories, replacing their neutral seed. It creates household/producer cash and private opening inventory once. Existing government founding reserves/treasury remain with the current nation creation path until cutover.
3. Public capacity is rounded once; private capacity is the remainder. Their sum cannot exceed the shared developed amount or independently claim the same potential.
4. Annexation and capture **must not call founding**. Physical capacity follows territorial ownership; pooled national inventory/cash stays with its nation. No nation foreign key is stored on physical capacity that would erase it when the former nation disappears. Damage and institutional ownership conversion are future explicit settlement operations.

The persistence API does not authorize player actions by itself. HTTP context checks, current-season lock checks, previews and combined policy/acquisition submission belong to Package D. Do not expose these internal seeding/copy methods directly as player endpoints.

## Policy targeting

Two generic effect contracts are available:

- `production.development_funding`: `{resource, funding_ratio}`; the ratio uses `fraction_of_program_requirement` and can bind an existing bounded policy parameter.
- `allocation.production_priority`: `{resource, priority}`; supported choices are `potential`, `regional`, `population`.

`resource` is a catalogue key or `role:nutrition` selector. Template validation checks syntax; game cloning and editing bind all options to that game's resource definitions and reject missing/incompatible targets. Gameplay compilation resolves selectors to concrete keys, so a role and an explicit key cannot evade exclusive-effect conflict detection. Currency and recruitment cannot receive production-development effects. Game creation now installs resources before attaching policies.

These effects are definition contracts for the forthcoming resolver. No default playable policy pretends their economic consumers are already active. Existing fixed agriculture/industry effects are removed/replaced at the planned cutover, not bridged to these effects. This package does not introduce a live ownership conversion selector.

## Lifecycle and operations

Migration: `2026_10_01_000000_create_production_economy_state.php`. Requires an empty games table and refuses conversion. The replacement inventory index is installed before removing the old unique index so InnoDB retains an index for its nation foreign key.

Local application database rollout completed on 2026-09-29 after explicit approval to remove game #21. The normal lifecycle deleted the game and its generated files; the migration ran successfully, the saved map definition remained, and maintenance mode was verified off. No save conversion was performed. This records the local environment only, not a separate deployment on Leon.

New changing-state tables have game/turn deletion cascades. Resource foreign keys are restrictive; the existing game lifecycle explicitly clears those references before deleting a game catalogue. Teardown checks for the new tables so it can remove disposable games **before** applying this fresh-world migration. This is migration ordering, not an old-save runtime path. The existing world-reset service discovers the new tables through foreign keys.

No historical definition versioning, save conversion, independent factory rows, private-stock-to-public fallback, background top-up of civilian funds, or alternate economic runtime is added.

## Verification and remaining work

Executable database contract: `tests/client/production-state.php`, using `tests/client/isolated-app.php` and a disposable MariaDB instance. It exercises private/public/mixed founding, renamed nutrition, an additional resource, precise owner/cost balances, configuration bounds, independent templates, policy binding and conflict detection, repeated snapshot copying, real rollback and replay, game deletion and world-reset discovery. Its world facts are held constant during storage transitions; this is not a claim that the new economy already resolves live seasons.

Verification passed: **3,684 production-state assertions**, **264 pure accounting assertions**, **41 resource**, **38 agriculture**, **42 fiscal economy**, and **43 passive-player checks**. The isolated all-world reset also passed; PHP syntax and `git diff --check` were clean. Passive-player checks exercise the currently active economy, while production-state checks exercise the new persistence explicitly. No browser/UI or new live economic resolver result is claimed.

[Package C is now implemented](production-resolver-contract.md): one pure coordinated allocation/settlement/development resolver uses these definitions and Package A's accounting primitives. Package D then wires creation, turns, actions and authoritative workspace data; E supplies the reviewed UI; F removes superseded production/fiscal paths. Reference values still require gameplay balance testing.
