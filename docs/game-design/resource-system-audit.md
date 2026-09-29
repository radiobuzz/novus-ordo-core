# Resource system audit and replacement direction

2026-09-28. Audit of the current working tree, including the uncommitted seasonal-economy implementation. This is a source review and replacement proposal, not an implemented resource schema.

## Agreed objective and boundary

Establish a configurable resource system and route the current game through it. Start with the existing entries: Capital (money), RecruitmentPool, Food, Material, Ore and Oil. Copper, services, transformed goods, markets and extensive balancing are not prerequisites.

The user explicitly rejects old-save compatibility and wants obsolete code removed promptly. The intended release has one resource implementation, fresh games, updated clients and passive AI opponents. Do not build enum-to-catalogue adapters, dual writes, old-save conversion, legacy endpoint shapes or a switch selecting old versus new resource engines. Implementation can proceed in development steps, but the delivered runtime must not preserve both paths. No game data is deleted by this audit.

## Accepted AI simplification

The user approved the replacement steps and narrowed AI scope: during the rebuild, automated nations only mark themselves ready/pass each season. They make no economic, policy, deployment, military or diplomatic decisions. Their ordinary nation simulation still resolves under the same rules as everyone else; doing nothing does not freeze their economy.

Retain only the participation/turn-completion path needed to test against passive nations. Do not maintain the current strategy, forecasts or custom script contract through resource changes. Old scripts must not execute accidentally or force compatibility payloads. Delete obsolete AI-only economic helpers when their callers are removed; rebuilding strategic AI is later work. Acceptance: passive opponents can complete repeated seasons, including after rollback, without running strategic code or preventing a normal turn from finishing. This is an implementation requirement, not a claim that passive behavior is already installed.

## What exists today

| Area | Evidence and finding | Replacement implication |
| --- | --- | --- |
| Catalogue | `app/Domain/ResourceType.php` fixes six integer cases. `ResourceTypeMeta.php` fixes stocks and behavioral flags in PHP. | Replace the resource enum and metadata with game-owned definitions. Adding a supported kind of good must not require editing an enum. |
| Balances | `NationResourceStockpile.php` and migration `0001_01_01_000017` already store one row per nation/turn/resource. `resource_type` is an enum number and quantity is a double; the founding migration has no unique nation/turn/resource constraint. | Retain the row-per-resource principle, replace identity with a real definition reference, enforce uniqueness and decide precision explicitly. No column per new good. |
| Production state | Labor pools, facilities, allocations and bids are rows scoped to game/nation/territory/turn. Facilities and bids also store integer enum values. | These are aggregate capacities/allocations, not individually simulated factories. Reuse useful concepts and the pure allocator; replace enum coupling and dead money facilities. |
| Geography | `TerrainType.php` embeds fixed yields for all six entries. `LaborPool::create()` creates a facility for every entry, including money and recruitment. `GeneratedMapData.php` derives one representative terrain per region plus usable land. | Move yield definitions out of the terrain enum. A geography-to-potential calculation should initially use current regional geography. This pass need not introduce microcell economic simulation. |
| Demand | `NationDetail::getUpkeepRaw()` hardcodes food demand from population. Recruitment derives from loyal population and is not stored. | Give these mechanisms named roles/handlers with explicit resource bindings; do not equate every catalogue item with a stockpile. |
| Military costs | `DivisionType.php` embeds deployment, upkeep and attack quantities. Deployment, Order, NationCommands and defense coverage iterate/convert ResourceType values. Guard response payments use stockpile resource numbers. | Costs must resolve against the game's catalogue. Moving only the catalogue while leaving these arrays global would not deliver configurable rules. Combat power/movement definitions need not be rebuilt in this pass. |
| Money | `EconomyService` collects tax and settles treasury/debt. Money is still stored as Capital in the old stockpile table. `NationDetail::hasEconomy()` selects different money/allocator/settlement behaviors. | Keep the new fiscal calculation; remove the old money-producing alternative and its branch machinery. Money can participate in common cost presentation without becoming industrial output. |
| Grants | Diplomacy controller/UI contain a literal list of five transferable entries. NationOffer enum-casts the resource; its migration uses a tiny integer. NationGrantService reads stock, commitments and upkeep. | Resolve transferable resources from the game catalogue and use definition references. Preserve real authorization and affordability checks, not the old identifier contract. |
| Client/API | PlayerWorkspace exports resource definitions, which some views already iterate. Icons/translations, Material-only planner handling, default Capital selection and Oil/Capital order summaries remain hardcoded. | Continue using the shared owner snapshot. Publish catalogue labels, presentation metadata and capabilities; convert every consumer. No second resource store or separate per-view catalogue requests. |
| AI | `modules/ai-player/Plan.php:66` requires exactly Food/Material/Oil/Ore. The bundled experimental script reads those keys and Capital forecasts directly. `GameAdapter::forecast()` calls ProductionForecast. | Replace active strategy execution with pass-only participation. Do not port the strategy, forecast or old script payload. Remove AI-only obsolete resource consumers; strategic AI will return later. |
| Rankings/public map | RankingHistoryService reads Capital rows. TerritoryDetail exports terrain-derived production potential for fixed resources; this is not measured seasonal output. | Include rankings, treasury history, map potential layers and public/private projections in the conversion. Keep potential distinct from actual production. |
| Policies | Existing policy catalogues are copied once to the game. PolicyEffectRegistry supports named, validated handlers; resource production modifiers are not implemented there yet. | Reuse the game-owned authoring pattern. Add resource bindings to supported handlers when they have a real consumer, with same-game reference validation. |

Current military deployment costs use money, recruitment and, for several unit types, Ore. Some operation costs use Oil. Food serves civilian demand and influences population growth. Material is producible, stockpilable and transferable, but this review found no current military or infrastructure consumption of it; infrastructure spending currently consumes money. Retaining Material does not require inventing a new use during this structural pass.

There is no live generic price, recipe, goods-input or market-clearing mechanism in the reviewed resource path. A deployment's resource quantities are requirements, not market prices. The current production “bid” is a labor allocation request, not a monetary market bid.

## Concrete cleanup findings

1. **The previous economy remains reachable in code.** `NationDetail.php` retains the labor-produced Capital route, its reserve fallback and conditional settlement. The new path suppresses money production but still creates Capital facility metadata and a zero-quantity Capital command bid. These are removal candidates, not architectural requirements.
2. **Forecasts have already diverged.** `app/Domain/ProductionForecast.php` always adds a Capital production bid and retries allocation when projected Capital closes negative. The current real allocator gates that fallback with `!hasEconomy()`; the JS preview gates it with `Capital.produced_by_labor`. The PHP forecast also omits the tax-funded fiscal model. The AI consumes that forecast.
3. **Player explanations still describe the old economy.** The EN/FR `planner.help` and `planner.hint` strings say unused workers produce Capital. The active planner uses these strings. Hiding its Capital metric did not remove those assumptions.
4. **Money has two budget representations.** The general BudgetInfo calculation still exposes Capital production/upkeep/balance in resource terms, while the header uses the separate economy forecast. AI consumers reading the former can make different financial judgments. The replacement must expose one authoritative treasury meaning to active consumers. Passive AI does not need an economic forecast.
5. **Physical shortages are not represented as a complete demand ledger.** Existing stock settlement clamps balances to prevent negative stock. Food stocks influence growth, but there is no generic requested/fulfilled/unmet consumption record. Generic definitions alone will not create a shortage simulation; that belongs in an explicit settlement contract.
6. **Natural deposits in the Map Lab are a separate experiment.** `natural-resources.js` defines Oil/Iron/Copper/Coal/Timber, but current game labor facilities use TerrainType yields. Do not silently treat those deposits as implemented extraction or expand the resource list by importing the lab wholesale.

### Calculation-only verification

A PHP 8.3 invocation loaded only the pure ProductionForecast class through Composer; it did not bootstrap Laravel or access a database. Inputs: one million workers; food productivity 4; food upkeep 1; food stock 10; extra food target 1; Capital upkeep 1; `Capital.produced_by_labor = false`.

| Treasury | PHP forecast food output | PHP forecast Capital balance |
| --- | --- | --- |
| 0 | 1 | -1 |
| 2 | 2 | -1 |

Only treasury changed. The old Capital fallback changed food output despite money production being disabled. This confirms the pure forecast defect; it is not an end-to-end measurement of actual AI decisions or actual seasonal food production. It also corrects the broader impression in the previous delivery notes that all labor-money forecasting had been removed: the player metric was hidden and the JS path adjusted, but the PHP/AI path remains.

## Recommended replacement boundaries

These are design recommendations to take into the schema draft, not frozen table names.

- **Definitions:** a game-owned catalogue with stable keys, localized labels, units/precision, display order/icon and a constrained behavior kind. The initial distinction is currency, stockable goods and non-stored capacity. Store defaults in a seed/template; the active game reads its copied definitions.
- **Mechanisms:** a small code registry supplies production, population demand, recruitment capacity and treasury settlement. Definitions choose supported mechanisms and parameters. Do not allow arbitrary executable formulas in resource records.
- **Production/cost rules:** game-owned yield mappings, population demand bindings and unit deployment/upkeep/operation requirements reference the catalogue. Share a consistent cost-quantity representation and rounding rule across commands, previews, grants and turns.
- **State/history:** quantities, commitments and resolved flows belong to nation/territory seasonal state. Definitions are copied at game creation, never every turn. Keep snapshot rollback for games created under the replacement; dropping old-save compatibility does not mean dropping gameplay rollback.
- **Ownership meaning:** the current physical reserves are commandable national stocks. Preserve that limited meaning explicitly for this pass. They are not evidence of privately owned national supply. Later civilian markets must distinguish economic availability from government reserves; do not silently give the government private output for free.
- **Consumers:** publish definitions and resolved resource/fiscal values through the current shared workspace. Active UI/command consumers read the same catalogue and authoritative affordability/forecast results. Passive AI only needs the participation contract. Keep generic arithmetic reusable; remove duplicated legacy assumptions.

One typed catalogue may represent all six initial entries without requiring identical storage and production behavior. The schema draft should settle where currency and recruitment state live; it must not create two competing treasury balances. Required semantic roles such as food and currency should be explicit bindings, not special string comparisons scattered through the code.

Transformation recipes and non-storable services can later become supported production mechanisms. Do not introduce dormant recipe engines, private inventories, trade graphs or market-price tables just to claim extension points. First prove that existing goods and costs use the catalogue everywhere.

## Replacement and deletion sequence

1. **Draft the bounded contract/schema.** Specify catalogue identity, currency/goods/capacity roles, quantity precision, yield/demand/cost definitions and seasonal balance ownership. Seed the current entries and coefficients. No balancing project.
2. **Replace the live resource foundation in one development change set.** New-game initialization, state, production allocation, affordability, unit costs, settlement, history and policy bindings use game definitions. Preserve the pure fiscal model and useful allocation arithmetic, not the enum-facing interfaces. Remove the old money economy and dead Capital facilities/bids during this step.
3. **Convert every caller before delivery.** Player APIs, validation, UI/planner, map potential, diplomacy, Guard, rankings and fixtures use the new contract. AI becomes pass-only; obsolete strategy/script economic callers are removed from execution rather than ported. Delete old DTO fields/endpoints/helpers only when their actual callers are converted; one-by-one caller conversion during development is not a permanent compatibility layer.
4. **Release with fresh game data.** Provide an explicit scoped reset/recreation step for disposable games and dependent seasonal state, preserving unrelated accounts and saved map workspaces. Do not map historical enum IDs or migrate old turn balances. No reset is performed by this audit. Historical migration files need not be erased to eliminate a runtime branch; fresh-install/schema cleanup should not cause collateral feature rewrites.
5. **Close with a deletion check.** No live ResourceType enum usage, Capital-as-labor allocation, fixed resource lists or old/new economy switches. Update contradictory UI help and clearly retire active AI examples from the supported runtime. Keep historical discussion and independent Map Lab experiments clearly labeled; they are not live compatibility code.

## Acceptance tests for the method

- A fresh game with the current catalogue can found nations, produce food/ore/oil/material, deploy and operate units, grant allowed stocks, settle taxes/debt and advance/roll back a season.
- A second template with fewer optional goods works through the same runtime. All references must be valid; removing a required cost/input rejects the template until explicitly replaced. It must never make a unit free by silently ignoring missing goods. Currency and food can remain required in the first ruleset contract.
- Add one synthetic test good using an already supported producer and bind it to a real test cost. It appears in output, storage, UI, affordability, consumption and history without a source-code resource-name branch. This is a fixture, not a player-facing Copper feature.
- Template edits do not alter an already-created game's definitions; each season changes state without cloning definitions.
- Two games can use the same resource key with different definitions without crossing quantities, references or caches.
- Forecast and authoritative allocation agree for the supported cases, including low treasury, non-produced money and varying catalogue size. Passive AI completes turns without invoking the removed money calculation; strategic AI compatibility is not tested or maintained.
- Quantity rounding, concurrent command commitments, grants and rollback cannot duplicate or overspend stocks. These are correctness checks, not balancing or old-save compatibility.

## Scope of this audit

Source/schema/consumer inspection plus the isolated pure calculation above. No production code, migration, running game or database was changed; no browser journey or full test suite was run for this documentation-only audit. Step 1 is now drafted in [the resource schema and runtime contract](resource-system-schema.md). The [implementation handoff](resource-system-implementation-handoff.md) separates foundation/active callers from the later cleanup and passive-AI task. Runtime implementation has not begun.
