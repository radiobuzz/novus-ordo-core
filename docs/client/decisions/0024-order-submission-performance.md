# 0024 — Military order submission performance

Date: 2026-09-25. Status: implemented; extended disband HTTP verification pending.

## Decision

Remove repeated work from existing move/attack, cancellation and disband submission before considering Guard or multi-turn order queues. No new orders, combat rules, endpoints or migrations are introduced.

`militaryCommands` indexes the current inputs once and calculates one route per origin/type for each preview call. Each outgoing order gets its own path array. The memoization never survives the call, so changed ownership, diplomacy and selection cannot reuse an old route.

`NationCommands` loads selected units, current details/orders and relevant territories in batches. Move batches validate each distinct route and automated-target permission once, retain existing cost reservations, and validate the entire batch before replacing orders. Shared `MovementRules` retains existing individual movement behavior, including coastal and final-step rules. Cancellation/disband validate all selected active owned units before replacement. HTTP request classes validate structure; authoritative ownership and territory checks run in the service inside the existing game mutation lock. `PlayerWorkspace` exports current units/orders through grouped reads. Zero costs skip unnecessary affordability calculations.

## Client safety boundary

Only `sendMoveOrders`, `sendDisbandOrders` and `cancelOrders` omit the preliminary HTTP context check. They still use the local command gate, one-command-at-a-time execution and the existing context payload. Their server routes authenticate, check CSRF and validate game/user/nation/turn/revision under the mutation lock. The preflight could not replace that authoritative check. All other commands keep their existing preflight.

Post-command reconciliation, including rejected or uncertain outcomes, remains unchanged. No mutation retry or optimistic owner snapshot is introduced. Both read-context markers and all changing territory/nation reads remain. `GameDataService` owns a frozen geography cache keyed by game, turn and context revision, fenced by generation/abort checks and cleared on access loss/disposal. This removes one unchanged geography read from same-context refreshes without caching changing ownership or budgets. Existing same-turn consistency limits remain.

## Evidence and limits

Local isolated fixture measurements, not production latency guarantees:

- 50-unit move batch: 2,213 SQL queries / about 1.14 s before; 59 queries / about 87 ms after (57 with warm topology). Authenticated HTTP submission measured about 99 ms.
- Owner workspace with those units: 897 queries / about 689 ms before; 500 / about 347 ms after. Other workspace calculations remain a possible future optimization.
- Core client command/reconciliation: 17 requests before, 12 after; auxiliary mounted-view reads are not included.
- 100 route previews for 500 identical units: about 5.7 s before, 30 ms after.

Passed: 213 Node tests, 17 Chromium command/live-data/unit-control scenarios, production build, generated-client check and PHP contracts. Rollback-only isolated PHP tests cover movement parity across types and diplomacy states, coastal/neutral intent, order replacement, workspace DTO parity, invalid/foreign/inactive units, invalid paths, affordability and a query budget. Isolated HTTP tests passed authentication, CSRF, stale context, 50-unit acceptance, atomic rejection and cancellation.

The subsequent extended HTTP test adds disband ordering/duplicates and mixed-ownership disband/cancellation rejection. Its run was blocked by the automatic approval reviewer's authentication failure. The final request-validator simplification for cancellation/disband and disband response-order preservation have passed syntax/contracts checks but still need that extended HTTP run. Fixture writes are confined to `/tmp/no7-entry-db-*`; no live game was mutated. Guard, queued orders and broader economy-refresh optimization remain separate decisions.

Test helpers: `tests/client/order-overhead.test.js`, `order-performance.php`, `order-http-fixture.php` and `order-http.mjs`. PHP/HTTP helpers require the explicit isolated test root and an existing diplomacy fixture; the HTTP helper targets the isolated server on port 8792. Run its fixture cleanup afterward.
