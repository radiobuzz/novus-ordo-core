# Resource foundation — first implementation

**Historical first-pass record.** The coordinated production economy now replaces the old allocation/income calculation. Retired calculators, bids/facilities and placeholder effects have been removed; use the [current runtime](production-lifecycle-contract.md) and [Package F cleanup/results](production-retirement-results.md). Earlier file names and verification counts below describe that earlier checkpoint.

2026-09-28. Packages A and B are implemented and verified. The breaking schema is now installed in development after disposable games were removed through their lifecycle; accounts and saved map workspaces were preserved and no save conversion or compatibility adapter was added. A forward migration removed retired strategic-AI fields from the already-migrated development schema. Package C's final browser journey and release review remain before calling this build playable.

## Delivered method

- `resource_sets`, `resource_definitions`, `resource_rules`, and `unit_resource_costs` hold templates and game-owned catalogues. A game copies its template once. Seasons reference those definitions; they do not copy them.
- The initial content is `database/resource-templates/foundation.json`: money, recruitment capacity, food, material, ore and oil, with the previous starting stocks, terrain yields and military costs. No Copper, recipes, trade, or new balance model.
- Resource identity uses catalogue keys and database IDs. Treasury, nutrition and recruitment are semantic roles, so the engine also works when their keys are renamed. Currency, stock and capacity have distinct behavior.
- `ResourceRuleRegistry` validates supported handlers, quantities, roles, references and explicit cost phases. Authors can combine existing mechanisms; new mechanisms require code. Templates may change structure. Existing test-game catalogues support parameter/cost/label edits; structural changes start a fresh game.
- `Quantity` uses the already-installed Brick decimal library, now declared as a direct dependency. Stored/transferred quantities and API inputs are six-decimal strings. Worker counts are integers. Continuous economic behavior remains the existing aggregate model; treasury movements are quantized and reconciled with exact decimal arithmetic at the accounting boundary.
- `ResourceSeason` owns physical allocation, demand, capacity and stock projection. `ResourceLedger` supplies game inputs and persists the result. Unit affordability, deployment, operating costs, Guard, grants, terrain potential, rankings and the shared player workspace use the catalogue.
- Recruitment is occupied by active divisions and reserved by pending deployments. It is neither stockpiled nor consumed twice. Treasury is settled once by the fiscal economy. Unallocated labor never becomes money.
- Nation resource reports preserve resolved physical quantities; the economic report remains the treasury ledger. Guard response spending updates the physical report after allocation. Rollback removes seasonal state and restores commitments without copying definitions.

## Player interaction

The existing shared workspace owns definitions, confirmed production plans and resource projections. The header, resource budget, production controls, grants and map production overlays use its catalogue. Resource labels support EN/FR and icons are metadata, not economic identifiers.

Production controls edit extra-output targets and minimum productivity directly, as decimal strings. `GameplayService.previewProduction()` calls the read-only `/nation/production-preview` endpoint; there is no second JavaScript allocator. The feature debounces previews, discards stale responses and retains compatible inputs across refresh. Submission uses the existing serialized command/reconciliation path. Player requests carry the resource edit counter and reject stale definitions.

A production plan cannot remove supply already committed to accepted actions. Deliberate admin test edits can still invalidate commitments. **This first pass rejects the entire seasonal transaction with an actionable error in that case**; adjust the rules/plan or cancel orders, then retry. It does not run unfunded actions for free. This is a small, explicit deviation from the draft's suggested per-action cancellation; it avoids implementing a second order-resolution system solely for destructive test edits.

## Authoring

After the fresh-game rollout, the primitive authoring tool is:

```sh
php8.3 artisan app:resources list
php8.3 artisan app:resources example
php8.3 artisan app:resources create --file=/absolute/path/catalogue.json
php8.3 artisan app:resources export SET_ID
php8.3 artisan app:resources clone SET_ID --name="Experiment"
php8.3 artisan app:resources import SET_ID --counter=CURRENT_COUNTER --file=/absolute/path/catalogue.json
```

Game edits require the existing `policy_testing_enabled` test-edit switch. Import does not reset stock balances or generate an admin forecast. Numeric changes reallocate each current nation's production. Template changes do not propagate into existing games. `Game::createNew(..., resourceTemplateId: ID)` selects a template; a dedicated resource-template selector/editor is not part of this pass.

## Verification

All mutation checks used a separate temporary MariaDB database and isolated uploads/sessions; no live-game data was reset.

- `tests/client/resource-foundation.php`: 41 checks covering validation, template/game isolation, renamed three-resource economy, synthetic additional stock, six-decimal grants and military debit, preview/settlement agreement, recruitment occupancy, history and rollback/retry.
- `tests/client/resource-accounting.php`: 7 checks covering exact treasury identities at zero and large balances, treasury-independent physical allocation, invalid commitments after a test edit, transactional turn failure, and foreign-game state references.
- `tests/client/guard-engine.php`: 11 existing Guard cases converted to catalogue identity; reservations, coverage/read count, renewal, responses, fuel shortages and aircraft return pass.
- `tests/client/resource-grants.php`: grant offer/export/acceptance and scoped game deletion with resource FK ordering, verified inside a rolled-back transaction.
- Client tests: 12 gameplay/service checks, 4 replacement production-contract checks, 2 map-analysis checks.
- `tests/client/resource-browser.mjs`: real Chromium with the synthetic extra good, server preview, decimal submission, retained input identity, invalid input, stale definition rejection, French labels and narrow layout.
- Production bundle built; generated endpoint catalogue checked; PHP source parsed successfully.

Package B removed the old enum runtime and obsolete fixtures. Automated nations now use an explicit pass-only participant path: they submit Ready and make no production, policy, military or diplomacy choices, while ordinary seasonal simulation still applies. Its focused engine suite passed pause/resume, three repeated seasons, exactly-once completion, rollback and replay. The deletion inventory and detailed results are in the [Package B handoff](resource-system-implementation-handoff.md#package-b-result).

## Next task

Complete [Package C](resource-system-implementation-handoff.md#c-fresh-game-release-and-review). The scoped reset, migration and rolled-back creation checks for all four saved maps with passive players are complete; run the retained fresh-game founding → resource view → production/cost edit → season → result browser journey before release.
