# Production economy retirement — Package F

2026-09-29. Package F removes the superseded runtime and keeps the coordinated production economy as the single live calculation. No new economic mechanism, balancing pass, compatibility adapter or application-data conversion is introduced.

## Removed and retained

- Removed `EconomicSeason`, `ResourceSeason`, `BidType`, `ProductionBid`, `LaborPoolFacility` and `LaborPoolAllocation`. Removed the unused `NationDetail` production-plan wrappers and the nutrition-excluding `manualProducers()` helper. All produced goods use the same acquisition contract.
- Removed agricultural development's old scalar-capacity helpers. The nutrition fulfillment/growth consequence remains, because demographics still consumes it. Generic production capacity and development belong to `ProductionEconomySeason`.
- Removed unsupported ownership/public-industry placeholder effects and the retired agriculture funding/priority contracts. Public/private **new investment** permission and resource-bound development effects remain supported. No asset-conversion mechanism is implied.
- Removed automatic/extra bid priorities from territorial production definitions. Acquisition priority and population-demand priority retain their actual uses. Unknown territorial production parameters are rejected rather than silently accepted as ineffective settings.
- The policy CLI example now exports the real economy template, and admin metadata reports that the economic consumers are available. The dependency/authoring example lives only in `tests/client/fixtures/policy-dependencies.json`, using supported effects.
- Added `2026_10_02_000000_drop_retired_production_tables.php`: drops allocations, facilities and bids in foreign-key order. Historical migrations remain migration history; a fresh full migration finishes without those tables. No rows are copied into the new tables.
- Resource teardown now deletes the current seasonal accounts, capacities, acquisitions and stocks directly. It no longer supports partial pre-production schemas.

Labor pools still represent shared workers. Read-only geographic/production projections still support the map and inspection; they are not the deleted facility/allocation database models. Game-owned policy/resource definitions, owned inventories and cost basis, civilian accounts, passive players and seasonal history remain intact in the new runtime.

## Tests moved forward

The old income-calculator/old-economy browser suites are retired in favor of the coordinated accounting, lifecycle and presentation suites. The useful default/desertion/rollback scenario is retained in `production-lifecycle.php`. Geographic identity/worker bounds and nutrition-growth consequences retain small focused tests. Catalogue isolation, renamed/reduced resources, a synthetic resource, exact costs, grants, invalid commitments and foreign-state rejection now exercise the new system. Policy tests retain validation, dependencies, atomic saves, rollback, definition edits and authorization.

Verification performed in guarded disposable databases, never application credentials:

- 264 accounting and 349 coordinated resolver checks; geographic and nutrition-growth checks.
- 3,690 storage checks, including absence of all three retired tables.
- 72 policy foundation assertions and policy HTTP authorization, preview, save and admin-edit checks.
- 41 resource catalogue checks, 7 additional accounting checks and grant offer/accept/deletion checks. Synthetic-resource browser preview/save, exact inputs, French and narrow layout pass.
- Full client suite: 275 tests. Generated definitions, route contracts and production build pass.
- 135 lifecycle checks, including passive seasons, rollback/replay, atomic acquisitions/policies, bankruptcy and desertion. The coordinated economy browser journey checks real saves, input identity across refresh, stale/invalid requests, territorial inspection, EN/FR and narrow layouts.

The repeatable Linux harness requires MariaDB command-line tools, PHP 8.3 and the existing client test dependencies. Browser runs use port 8792; run them one at a time. Logs and isolated state remain under the printed `/tmp/no7-entry-db-*` path for diagnosis; database/server processes stop on exit.

```bash
php8.3 tests/client/production-accounting.php
php8.3 tests/client/production-economy.php
php8.3 tests/client/geographic-production.php
php8.3 tests/client/agriculture-season.php
bash tests/client/run-production-checks.sh state
bash tests/client/run-production-checks.sh policies --browser
bash tests/client/run-production-checks.sh resources --browser
bash tests/client/run-production-checks.sh lifecycle --browser
```

## Server rollout remains an operator action

No application migration, reset, deployment or Git publication was performed for this package. Continue with fresh worlds and definitions; old saves/templates are not converted. On the existing Package E installation, after updating source, this sequence deletes disposable worlds and policy/resource/map definitions through the lifecycle, applies the retirement migration and rebuilds the client. Accounts and site access remain. The exit trap restores access even if a step fails; inspect the failure before proceeding.

```bash
cd /var/www/no7
(
    set -e
    php8.3 artisan down
    trap 'php8.3 artisan up' EXIT
    php8.3 artisan game:reset-worlds --execute
    php8.3 artisan migrate --force
    npm run build
)
```

This is not an upgrade path for partially installed pre-production schemas. No automatic rollback of the retired tables or old-save compatibility is provided.

## Remaining work

Packages A–F are implemented and verified. Remaining product work is playtesting/balancing and future planned systems, including market/trade behavior and local earned-income attribution. Those are not hidden dependencies of this cleanup. Browser coverage is Chromium, with other browsers/devices still unverified.
