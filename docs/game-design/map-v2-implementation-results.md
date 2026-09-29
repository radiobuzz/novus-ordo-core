# Persistent microcell world — implementation results

2026-09-28. **First implementation is in the working tree. Live reset and migration have not been executed.** Existing unrelated changes were preserved; no Git commit/push was made by this implementation run.

The [accepted plan](map-v2-implementation-plan.md), [ADR 0032](../client/decisions/0032-persistent-microcell-world.md) and [persisted format](map-v2-format.md) describe the foundation. This report separates implementation from release readiness.

## Delivered

- Configurable region columns/rows, defaults 30 × 20, uniform 7/19/37 microcells per region. A 40 × 30 world works at every resolution. Region area, deposits and capacity do not multiply with resolution. Host limit: `MAP_MAX_CELLS`, initially 50,000.
- Complete sampled geography: climate, biomes/deserts, elevation/depth, drainage graph, lakes/rivers, coastal faces/assessments, feature identities/relationships and saved fictional English names. Shared geography and Terrain V2 modules now serve both production and the lab; lab development/army/economy fixtures remain separate.
- Immutable definitions shared by map-library entries and game references; named features and selected resource profiles have static tables. No legacy-format reader, conversion, per-turn map cloning or replacement of the resource/policy foundation.
- Data-defined resource profiles with explicit selection, Ore versus Iron/Copper exclusions, applicable distribution controls, resource overlays and area-normalized geographic production limits. Territorial climate/land/resource aggregates derive from the microcells. Missing required profiles fail game creation transactionally; intentionally zero abundance remains valid.
- Map workspace with retained category instances behind **left sidebar icon tabs**, a **collapsible right inspector**, worker generation/cancellation, dimension counts, presets, feature selection/rename/search, resource summaries, analysis legends and per-shore inspection. Resource-only edits retain geography, names and camera/layer selection. Saved-map library is a disclosure to keep the canvas prominent.
- Explicit `game:reset-worlds` preview/execute command and a forward migration. Reset uses game lifecycle cleanup and the selected database's foreign-key domain; it preserves accounts, site data and source assets. A two-database rehearsal caught and corrected unscoped table enumeration before any live use.

## Verification actually completed

All database/browser mutation was confined to an explicit temporary MariaDB server and loopback PHP server. Their HTTP limits were deliberately raised for the tests. No live database/configuration/reset was touched.

| Check | Result |
| --- | --- |
| 30 × 20 and 40 × 30, each at 7/19/37 | Eight Node cases passed, including exact round trips, area normalization, resource exclusion/zero abundance and agricultural responses. Fixtures regenerated after preserving the original default generator proportions. |
| Server import/persistence | 30 integration checks passed: six configurations, malformed format/topology/drainage/resource rejection, immutable deduplication, library/game references, exact restored values and atomic resource incompatibility rejection. All six also passed the final stricter geographic/profile validation. |
| Geographic production | Capacity, tiny deposits, separate metal identity and shared allocation ceilings passed. |
| Existing resource/economy foundation | 41 foundation, seven accounting and 40 economy checks passed. The accounting-only fixture explicitly disables geography to test accounting independently; geographic capacity has dedicated tests. |
| Passive players | 43 checks across pause/resume, three seasons, ordinary simulation and rollback/replay passed. |
| Browser-founded nation | Real generator, presets/reload, dirty guard, auth/CSRF, game creation, exact saved map, game scope, homeland selection, founding and live ownership passed. The resulting nation advanced, rolled back and replayed with unchanged map fingerprint and definition count. |
| Custom-world HTTP | Authenticated save/reopen/create and exact public map response passed for 40 × 30/7; admin/game mounted without JavaScript errors. |
| Map workspace/browser rendering | Six initial Chromium cases passed across workspace, water depth and coastal artwork; final two workspace cases passed with resource-only regeneration, retained edited names/layer, cancellation, EN/FR and narrow layout. Screenshots in `test-results/client/`. |
| Wider Node checks | 48 of 50 test files passed initially. The two failures were resolved and rerun separately: default-map lab geography (13 cases passed) and flag-design PHP subprocess blocked in the sandbox (three cases passed with isolated execution permission). The entire 50-file set was not rerun after those targeted corrections. |
| Reset/upgrade | Reset preview/execution on the new schema preserved accounts and emptied the game/map/template domain. Separate old-schema rehearsal rejected retained maps, previewed without mutation, reset and applied the forward migration successfully. |
| Build/contracts | Production build and `npm run check:client` passed. Relevant PHP syntax and diff whitespace checked. |

The new reset discovery is deliberately scoped to the current database. It does not enumerate or delete a sibling production instance on the same server.

## Measurements and deployment blocker

These are development measurements, not server SLAs. Timings below include generating/exporting each fixture in Node, not HTTP saving; PHP peaks are validation-process high-water marks and can include retained memory from preceding cases.

| Regions | Cells/region | Total cells | JSON bytes | Generate/export |
| --- | ---: | ---: | ---: | ---: |
| 30 × 20 | 7 | 4,200 | 4,119,720 | 1.4 s |
| 30 × 20 | 19 | 11,400 | 10,875,899 | 2.3 s |
| 30 × 20 | 37 | 22,200 | 20,964,806 | 4.0 s |
| 40 × 30 | 7 | 8,400 | 8,126,331 | 1.5 s |
| 40 × 30 | 19 | 22,800 | 21,542,516 | 4.3 s |
| 40 × 30 | 37 | 44,400 | 41,719,294 | 8.1 s |

PHP validation reached approximately **565 MiB** at 40 × 30/37. The isolated HTTP server used **1 GiB PHP memory and 64 MiB request bodies**; only the smaller custom world was saved through HTTP. An earlier 80 × 60/7 probe generated 33,600 cells in about 6.2 seconds with approximately 264 MB Node heap and 32.7 MB JSON. It was not a complete large-world browser/game acceptance test.

Installed FPM defaults inspected in this environment are `memory_limit=128M`, `post_max_size=8M`, `upload_max_filesize=2M`. Those do not support the intended matrix. The actual serving pool/proxy on the deployment host must be checked; CLI PHP limits are not evidence of FPM limits. A suggested first test-host configuration is 1 GiB per PHP request, 64 MiB JSON body allowance throughout PHP/proxy/web server and database packet allowance sufficient for the saved payload. Worker concurrency must fit available RAM. File upload limits are separate from JSON bodies. No host configuration was changed.

**Release blocker:** choose and apply suitable deployment limits, then test the largest enabled configuration through real HTTP on that host. Alternatively, choose a separately scoped compact/chunked transport change. Do not reset live data first and discover that map creation cannot ingest its own maps. A 300 × 200 world is not verified or supported by the current default ceiling.

## Rehearsed rollout ordering — not executed live

After deployment limits are resolved, prepare the current client build before resetting data. Run `npm run build` in the build environment with the project's dependencies installed, and deploy the complete `public/build` directory, including its manifest, to the PHP host. Node/npm need not run on the PHP host when built assets are deployed from elsewhere. A missing `npm` command on that host is not a migration failure.

Stop scheduled turn/AI execution and other game writers. From the application directory, use this fail-fast subshell; if a command fails, subsequent commands do not run:

```bash
(
set -e
php8.3 artisan down
php8.3 artisan game:reset-worlds
php8.3 artisan game:reset-worlds --execute
php8.3 artisan migrate --force
php8.3 artisan up
)
```

Read the reset preview before the execute step. This removes **all games, saved maps and database-authored policy/resource templates**; it preserves account/admin access, site data and migration history. Current source templates are initialized by the new-game/template path; no old definitions are converted. If an operation fails, keep writers stopped and diagnose before reopening. Re-enable automation only after a fresh default and custom game can be created and the checks below pass.

The command's required maintenance state is a guard for the actual reset, not permission to discard unrelated files or another database. Source-controlled naming/resource/policy packs survive. The new browser settings namespace ignores retired presets without importing them.

## Remaining work

1. Deployment configuration, actual reset/forward migration, fresh production smoke checks. This is the material blocker.
2. Complete the combined **custom-map** browser journey through founding, policy preview/save, deployment and seasons. These subsystems passed separate browser/backend checks, not one exhaustive custom-map UI run. Multi-game viewport switching, failed-save recovery and more extreme aspect ratios deserve focused checks before raising limits.
3. Editor refinement: full localization of dynamic inspector/admin explanations; additional naming-pack selection and explicit names-only regeneration. The initial names panel selects/searches/renames existing generated features and uses one English pack. No cultural influence editor is implied.
4. Rendering/performance review on the actual host/browser, especially maximum enabled worlds, close-up texture memory and label readability. Existing bounded chunk caches and shared renderer are in place; physical-device and non-Chromium checks remain.

No economics balancing, migration/cities, ports/trade routes, new combat mechanics or strategic AI were introduced. These remain later game-design work.

## Reproduction entry points

Use the isolated database setup in `docs/client/entry-experience-handoff.md`. The scripts require `NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-…` and explicitly override database/public/session paths.

- `MAP_V2_FIXTURES=1 node tests/client/map-v2.test.js` writes the six temporary JSON fixtures.
- `tests/client/map-v2-integration.php`, `map-v2-reset.php`, `map-v2-upgrade.php`, `geographic-production.php` cover persistence/reset/capacity. The upgrade script recreates **only** `no7_map_upgrade_test` inside the explicit temporary server.
- Updated `map-beta-integration.php`, `map-beta-browser.mjs`, `map-beta-turn.php` retain the actual founding journey while removing obsolete fixed-resolution assertions.
- `map-v2-http.mjs` covers the custom HTTP path using the economy fixture's test admin.
- `node_modules/.bin/playwright test -c tests/client/browser/playwright.config.js map-workspace-v2.spec.js` covers the workspace fixture.
