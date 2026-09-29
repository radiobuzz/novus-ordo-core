# Resource replacement — bounded implementation handoff

## Production cleanup — Package F (2026-09-29)

The superseded economic calculators, bid/facility models and placeholder effects are retired. Generic acquisitions, funded production, owned stocks and the Package E UI remain the active path. Useful catalogue/policy/accounting checks now target that path; passive seasons and rollback remain covered. No application database changes or Git publication. See [results and rollout](production-retirement-results.md).

Map integration update (2026-09-28): [persistent microcell world results](map-v2-implementation-results.md) connect saved geographic potential to catalogue production, forecasts and public resource information. Foundation/passive/seasonal tests pass; default-map browser founding and custom-map HTTP creation pass. The live reset also removes old saved maps and database-authored gameplay templates; source defaults and resource code remain. Deployment configuration and remaining combined browser/release checks are documented there. Do not add compatibility work for the obsolete map format.

2026-09-28. Packages A and B are implemented. The breaking schema was applied to the development database after its disposable games were removed; no save conversion was attempted. Accounts and saved map workspaces were preserved. Package C's final founding-to-season browser journey and release review remain. See [implementation, checks and deviations](resource-system-first-pass.md). Read [the schema/contract](resource-system-schema.md) and [the source audit](resource-system-audit.md) first. The user wants current resources, no balancing project, no old-save compatibility, and passive automated players during the rebuild. Keep changes within each assignment; do not reopen agreed scope or add future markets/recipes.

## A. Foundation and active consumer replacement

Implement the four definition tables, current-content seed, clone/validation/import/export, precise quantity helper and game-owned state references. Implement the supported producer/demand/capacity handlers, unit cost lookup and authoritative resource calculation. Keep fiscal behavior and useful allocation mathematics; remove money-as-labor assumptions from the replacement.

Wire new-game founding, seasonal processing, affordability and commitments, production controls/previews, grants, Guard, public potential, rankings and shared player state through the catalogue. Convert the actual callers rather than creating adapters that keep enum contracts alive. No new per-view store or broad UI redesign. Use the existing client-data/UI skills for implementation.

Do not maintain strategic AI. Its active execution is not an acceptance target. If the development build cannot safely run it while this package is being integrated, make that boundary explicit and prevent that path from executing; do not present a stalled AI match as playable. Package B provides the required passive opponents before release.

Verify on disposable new-game data:

1. Seed and clone two games; edits to a template/game do not mutate another game.
2. Current goods work from founding through production, unit costs, grants, seasonal accounting and rollback.
3. Missing/cross-game resource references fail transactionally; a removed cost is not silently free.
4. A reduced optional-goods template runs through the same engine with explicit replacement costs.
5. A synthetic additional stock with a supported producer and deployment cost works without source edits naming it. It appears in definitions, production, storage, command affordability, UI and history. Do not add Copper to player rules for this test.
6. Preview/resolution agree under low cash, competing production and resource-definition edits. No Capital fallback changes physical production.
7. Decimal debit/credit identities, stock conservation, capacity reservation/release and turn rollback pass. Prevent double treasury settlement and double recruitment consumption.
8. UI uses the shared snapshot, retains compatible inputs through refresh, rejects stale edits and handles dynamic catalogue size in EN/FR and narrow layouts.

No benchmark or large balancing sweep is required. Run focused meaningful tests; record actual results and limitations. Keep the single-runtime release blocked until Package B is complete.

## B. Separate cleanup and passive AI task

This is the bounded follow-up intended to be handled without redesigning the foundation.

- Replace strategy execution with an explicit pass/ready path. Automated nations make no production, policy, deployment, movement, attack or diplomacy choices. Their ordinary national simulation still runs.
- Retain only participation/ready/turn completion and necessary lifecycle context. Test repeated seasons and rollback, including a paused/resumed test match; passive players must not prevent normal advancement.
- Ensure old/custom strategic scripts cannot execute accidentally. Do not update their economic forecasts or preserve their API payloads. Remove unsupported entry paths and explain the temporary passive status in the existing admin control surface.
- Remove `ResourceType`/`ResourceTypeMeta` and their enum conversions after the active caller conversion. Remove the resource-bearing `ResourceProduction`/TerrainType yield arrangement once the replacement owns it; retain TerrainType for geography.
- Remove old Capital facility creation, catch-all bids, free-labor exclusions, reserve fallback and old/new economy selection. Remove AI-only obsolete forecasts once unused; retain any shared allocator still used by the replacement.
- Remove fixed-name validation/UI lists, Material-only planner branching, old `resource_type` fields/casts, enum-indexed cost arrays, obsolete generated API contracts and the inverse labor-unit quantity interface replaced by the new contract.
- Replace planner explanations about unassigned workers producing money. Update default fixtures/examples and current documentation to the actual new interface. Historical records and independent map/economy labs need not be rewritten or deleted.
- Remove orphan imports/helpers/files and tests that exist only to preserve deleted behavior. Keep or rewrite tests protecting still-required affordability, history, geography and command correctness.

Search first in the paths listed by the audit. Do not delete every occurrence of a resource name: seed content, labels/assets, historical documents and illustrative tests legitimately name goods. No `ResourceType` references in live runtime is a useful exit check; zero occurrences of “Food” is not.

Record the deletion list and targeted check results. Do not add compatibility shims in order to make old tests pass.

### Package B result

Implemented 2026-09-28 without a migration of existing games or a compatibility runtime.

- Automated participants now have one operation: submit Ready. The retained setup, runner and game adapter store only participation, completion, pause state and generation context. Administration describes the temporary passive behavior and permits step, bounded batch, pause/resume and assignment/release. Passive nations cannot initiate or accept diplomatic offers.
- Removed the strategy loader, V1 policy, plans, memory, script catalogue/runtime, custom scripts, author kit, snapshots, preview/download routes and strategic database fields/migration. Completion results contain only passive mode, explanation and elapsed time.
- Removed `ResourceType`, `ResourceTypeMeta`, `ResourceProduction`, the old forecast/allocation/constants classes, obsolete bid request/read models, old `ProductionPanel`, inverse labor payload helper, fixed resource-name gate and orphan aggregate cost helpers. Runtime resource identity is now catalogue key/ID only; terrain itself remains geographic.
- Deleted strategy-only, legacy planner and old allocator tests. Rewrote retained economy, grants, diplomacy, command performance, terrain-public and default client fixtures around catalogue keys, decimal strings and `resource_id`.
- `tests/client/passive-player-engine.php` passed 43 checks: pause/resume and context rotation, two passive nations over three full seasons, no production/policy/military/diplomacy commands, exactly-once completion, ordinary national/resource simulation, rollback readiness restoration and replay.
- Package A remained green after cleanup: 41 resource-foundation checks and 7 accounting checks. The updated seasonal economy suite passed 40 checks; updated diplomacy passed its conversation/grant/conservation/advance/rollback journey. Generated routes/contracts, all changed PHP parsing, all 240 Node tests and the production build passed. Five focused passive-player browser journeys and all nine updated persistent-panel journeys passed after removing assertions for the retired planner interface.
- Source exit searches found no retired resource classes, `resource_type`, inverse labor interface, production-bid endpoint, strategy loader or strategic field in live application/module/client code. Resource names remain only where they are content labels, icon keys, historical documentation or independent labs.

The Package C reset/migration portion is complete in development: games were removed through the lifecycle, 23 accounts and four saved map workspaces remained, and the resource migration was applied. A follow-up migration removed strategic-AI columns left by the previously applied historical migration. Rolled-back creation checks for all four saved maps, each with one passive nation, produced both a game resource set and passive participant. Remaining work is the retained fresh-game founding-to-season browser journey and release review.

## C. Fresh-game release and review

Use fresh games. Provide an explicit scoped recreation/reset operation for affected game state; preserve accounts and saved map workspaces. No historical enum mapping, turn-balance conversion or whole-database wipe. Use existing supported game deletion lifecycles where practical so resource FK ordering, uploads and caches are handled coherently.

Before calling the work playable: one runtime, dynamic catalogue, passive opponents, no active legacy AI economic caller, one treasury meaning, valid rollback, and a browser journey through founding → resource view → production/cost change → season → result. Update the living client docs and economic handoff, and state which schema recommendations changed during implementation.

## Not part of these tasks

Copper, new physical goods, services, transformation chains, civilian/private inventory ownership, international trade, market prices, migration, detailed employment, province budgets, a visual catalogue editor, strategic AI redevelopment, and comprehensive balancing.
