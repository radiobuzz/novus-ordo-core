# Gameplay port experiment — 2026-09-19

This is a best-effort, playable port into **the new client**, not the classic SPA. It is deliberately revisable: implementation choices here are not an approved future architecture or a commitment to final game rules.

## Try it

Update 2026-09-20: [the national production planner](decisions/0014-national-production-planner.md) replaces the mounted per-resource forms described in the original handoff. Click World → Economic, or Economy → Open production planner. The centred dialog compares extra Food/Ore/Oil targets, labour demand, current/forecast production and net balances. Materials, productivity cutoffs and territorial forecasts are secondary. One Apply action saves the complete plan transactionally; it does not change production rules or introduce economic map layers. The old individual-bid endpoint remains compatible.

Update 2026-09-20: the [shared-data implementation](live-data-plan.md) and subsequent persistence pass keep World, dedicated Economy/Nation/Military/Reports and territory inspectors mounted through compatible data refreshes. Values update through existing subscriptions; drafts, controls, focus and disclosures are retained. Healthy polling no longer disables command buttons. Recoverable read failures retain a visibly stale display with commands gated; uncertain submissions require explicit review in World before another command. The durable rollback-context marker remains open. Shared `?` tooltips now carry optional instructions, and long player notices have a short visible summary with complete hover/focus/tap detail.

Update 2026-09-20: [Game UI pass 1](game-ui-pass-1.md) adds Military mode directly to World, with a minimap, selectable own-force stacks, unit-card deployment and contextual orders. The dedicated screens described below remain available. This supersedes the original roster-only selection limitation for the World screen, not the existing gameplay rules.

Open `/client` after signing in (or `/client/entry` to sign in/create a nation). The navigation now includes World, Nation, Economy, Military and Reports. Existing games retain their original map; beta games use their saved generated geography. There is no default-route cutover and no replacement of the active game.

- **Nation:** flag, formal name, leader, public/owner statistics, owned territories and command summary.
- **Economy:** production, reserves, upkeep, expenses, availability and balances; production bids with linked target/cutoff sliders and exact numeric fields. Each national target previews the eligible territorial facilities, currently free local labor, current allocation, estimated demand and output ceiling; the preview is not a promise about final allocation against food, upkeep or other bids. Each resource saves separately; set its target to zero to cancel. Unsubmitted bid fields survive navigation and refresh within the same game/turn/nation, in memory only.
- **Military:** the shared map, own-force counts, pending deployments, accepted order lines and draft routes; selectable division roster; move/attack, cancel and disband orders; deployment with unit costs and cancellation. The engine decides whether a move becomes movement, attack or raid. Use “Focus your forces” to zoom to the selected/first force or homeland. Roster and destination controls also work without map interaction.
- **Reports:** current-turn news, participant-only battle history, rankings, victory progress and a public nation directory. Engine news tokens resolve to text; user content is never inserted as HTML.
- **Turns:** readiness count and deadline tooltip; explicit confirmation before declaring ready. When everyone is ready the existing server operation advances the turn, and the client reloads its authoritative state. Same-turn readiness polling does not destroy unfinished forms.

## Boundaries retained

No resource types, production algorithms, costs, combat calculations, victory thresholds or movement budgets were redesigned. No demo armies or demo economy enter real gameplay. Movement is still regional: microcells define the beta geography and its stored adjacency, not a new weighted movement system. All dry regions, including small islands, remain eligible as land under the map beta adapter.

Movement preview follows `DivisionDetail::canMoveTo`: owned intermediate territories (aircraft may cross water), unit move limits, the engine's existing unrestricted coastal transport shortcut, and its existing final-step connection rule. It uses graph traversal, not rectangular coordinates. The server remains authoritative; accepted order lines show origin/destination because the existing read models do not return their complete stored paths. Draft lines do show the proposed intermediates.

## Backend integration

- `ClientGameplayController` adds one authenticated, non-cacheable current-nation read (`/client/gameplay`) and a public identity read (`/game/identities`). It exports existing models and domain metadata rather than duplicating balance values in JavaScript. The owner read contains no opponent-private divisions or budget.
- Existing mutation URLs, payloads and operations are reused. New-client requests add `client_context` (game, turn, nation and user IDs). `EnsureClientCommandContext` rejects stale/foreign contexts and upkeep with 409/503 before dispatch. Legacy requests without that optional field retain their existing behavior.
- Fixed an existing read-model mismatch: `BudgetInfo.turn_number` previously exported the turn database ID; it now exports the turn number. No budget calculation changed.
- Client commands are single-flight, never automatically retried, and reconcile after success or failure. Lost responses get an explicit uncertain-outcome message. This is **not** a new server-wide transaction/idempotency system; existing engine concurrency limitations still apply.
- No new schema/migration is required for the gameplay port. The separate map-beta storage migration remains the only schema addition from this experiment.

## Still experimental

- New gameplay forms/messages are English-first. Existing entry/world/inspector localization remains; completing French gameplay copy is follow-up work.
- This is functional parity for the main loop, not a pixel-for-pixel recreation. No dedicated economy/battle heatmap, drag-select armies, or automated multi-resource bid submission is claimed. Use the tables/roster/history controls.
- Army markers deliberately show only the player's own units/deployments. Orders are selected from the roster, not by clicking counters. Accepted routes are endpoint lines, not replay animations.
- Bid drafts are discarded on a turn/game/nation change and on a full page reload. Military selections are disposable; no unsent order is restored or submitted automatically.
- Report history applies to battles. News stays on the current turn because the existing news operation does not implement historical selection, despite its old description.
- Existing non-idempotent, multi-command server operations and turn/write races are not comprehensively redesigned. The context fence detects stale arrivals; it does not claim atomic serialization against every concurrent turn transition.
- Game victory is displayed using the existing engine status. No new “finished game” lifecycle or enforcement has been invented.

## Verification and reproduction

Standard checks: `npm run generate:client`, `npm run check:client`, `npm run test:client`, `npm run test:client:php`, `npm run build`, and the existing Playwright client/entry regressions.

Completed verification: all 13 Node test files, PHP syntax/contracts, generated-definition check and production build passed; all 16 client/entry browser regressions passed. The real HTTP gameplay journey passed on separate fresh beta and original-map fixtures, including turn advancement. A resolved beta battle was independently confirmed in the isolated database. `gameplay-guards.mjs` additionally passed owner-read authentication, public-read privacy, CSRF, each of the four identity-fence fields, and an unaffordable deployment with unchanged bids/deployments/expenses. Desktop/mobile screenshots were inspected. The application remained game 2, turn 1 in a final read-only check.

`tests/client/gameplay.test.js` covers topology/range/ownership/air/coast cases, numeric bid conversion, safe news tokens, stale command prevention, single-flight mutation behavior, uncertain outcomes without retry, and turn-scoped drafts.

For real integration, use `tests/client/isolated-app.php` with an explicitly configured `/tmp/no7-entry-db-*` MariaDB instance and separate local PHP server on port 8792 (see the existing entry/map-beta test setup). Never point these scripts at the application database:

```sh
# NO7_ENTRY_TEST_ROOT must already refer to the isolated database directory.
node tests/client/map-beta-fixture.mjs | php8.3 tests/client/gameplay-seed.php
node tests/client/gameplay-browser.mjs
php8.3 tests/client/gameplay-seed.php classic
node tests/client/gameplay-browser.mjs
node tests/client/gameplay-guards.mjs
```

The seed script bootstraps only the isolated database, creates a fresh game and connected homeland, and provides `map-player` with the test password `fixture-password`. The browser script targets only `http://127.0.0.1:8792` and performs actual bids/cancellations, stale-command rejection, deployments/cancellations, ready/turn advancement, move/cancel/disband orders, a battle when a neutral neighbor is available, report history, draft navigation and mobile layout checks. Fresh fixtures make repeated runs independent of army/resource accumulation.

The live game's nations, orders, resources, turn and geography are not test fixtures and were not mutated.
