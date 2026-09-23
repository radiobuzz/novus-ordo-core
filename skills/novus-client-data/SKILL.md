---
name: novus-client-data
description: Plan, implement or review Novus Ordo client stores, shared reads, refresh lifecycles and command reconciliation. Use when changing data ownership, subscriptions, scope handling or live view updates; not styling-only work or unrelated backend game rules.
---

# Novus Ordo client data

Keep confirmed game information shared and views persistent, using small service-owned stores. Protect responsibilities and safety while allowing the design to evolve. This project-specific skill does not authorize implementation for a diagnosis/planning request, or authorize the remaining migration merely because its plan exists.

## Read the maintained contract

Locate the Novus Ordo workspace. Read `docs/client/live-data-plan.md`, starting with delivered contracts and explicit remaining work; its original staged design is not a completion claim. For architecture changes, also read `docs/client/decisions/0010-shared-game-data.md`, the current `docs/client/README.md` and latest progress-journal entry. Resolve paths from the project root, not the installation directory. Report missing sources rather than inventing guarantees.

Inspect the affected implementation and consumers before editing. Current starting points are `resources/js/client/runtime/Store.js`, `runtime/Scope.js`, `services/GameDataService.js`, `services/GameplayService.js` and `app/GameShell.js`. These paths guide discovery, not permanent naming requirements. Use the companion `novus-game-ui` skill when changing shared presentation/interaction contracts; data-only work need not load the UI catalog.

## Reuse the right owner

- Search existing services before adding reads, caches or stores. Confirmed shared values have one service owner; components consume its read-only store, not competing endpoint caches or writable snapshots. Independent domains can justify separate stores with explicit scope and coordination.
- Keep confirmed values, command outcomes, editable drafts and saved UI preferences separate. Laravel owns authoritative rules and validation. Generic controls take values and emit intent; they do not fetch game APIs or adjust confirmed balances.
- Subscribe through the existing lifetime/Scope contract. Current subscriptions deliver synchronously and immediately: initialize callback dependencies first. Keep publication owner-only, related values committed together, subscriber failures isolated and disposed listeners inactive. Async work needs its own cancellation/error handling; a subscription does not provide it.
- Shared reads belong to the service, not the first requesting panel. Combine overlapping refreshes; closing one consumer must not cancel work other consumers need. Retain request-generation checks even when requests can be aborted.

## Refresh safely, without restarting interaction

- Routine same-scope updates change existing views, not route/host lifetimes. Preserve compatible camera, mode, selection, focus, scroll and drafts. Navigation, changed geography and incompatible scope can legitimately replace views. Track nonmigrated consumers explicitly rather than claiming all screens already update in place.
- Update derived data too: map ownership, picking, overlays and minimap must agree with the confirmed publication while unchanged geographic resources remain reusable.
- Recoverable read failure retains a visibly stale last-confirmed display and gates unsafe submissions. Session/access loss or changed player/game/nation clears incompatible private state; never keep it as an offline view for another scope. Private snapshots remain in memory, separate from harmless saved preferences.
- Distinguish scope, turn context, map identity and local request/publication order. Snapshot object identity is not turn identity. Local revision is not a server version; a reused turn number does not detect every rollback/reset. Client batch publication is not an atomic database read. Verify backend guarantees before relying on them.

## Commands are explicit; refresh is not retry

Use the existing command service and context/freshness gates. A new command invalidates pre-command reads; reconciliation starts after its outcome, even if its originating panel has closed. Preserve the existing one-at-a-time submission rule unless an approved change replaces it with tested safeguards.

Distinguish accepted-and-refreshed, accepted-but-refresh-failed, rejected and unknown outcomes. Never automatically resend a mutation after a lost response or failed refresh. Retry reads only; uncertainty requires deliberate review, not invented proof that an order failed. Aborting a request does not undo server work.

Preserve rejected drafts and newer edits made during submission; clear only the accepted submitted draft when still applicable. Confirmations retain their original context. Revalidate changed eligibility and turn-bound selections with an explanation rather than silently submitting or clamping them. Existing server authorization, CSRF and command checks remain necessary.

## Evolve with evidence

Propose an extension when a real consumer cannot fit the existing contract, correctness exposes a gap, or measurement justifies a different read/update strategy. Briefly state the need, existing options, smallest useful boundary, owner/scope/failure behavior, affected consumers, migration and verification. Prefer composition or focused extension before another state framework, event bus or dataset/query abstraction.

Routine compatible work within the approved task can proceed. Ask before an unapproved breaking contract, dependency, backend/storage expansion or changed safety guarantee. Later push notifications should enter the same service refresh path; pushed patches require an explicit server ordering/version contract. Do not implement WebSockets, admin migration or deferred mechanics just because this skill mentions them.

## Verify and maintain

Choose checks for the behavior changed: shared read counts/publication; late and out-of-order responses; scope/access loss; disposal; rejected/uncertain/accepted-but-unrefreshed commands; newer drafts and stale confirmations. View changes need actual input/canvas identity and focus/camera checks, not screenshots alone; map changes cover classic and generated formats plus the minimap. Existing starting tests are `tests/client/store.test.js`, `live-data.test.js`, `gameplay.test.js` and `tests/client/browser/live-data.spec.js`. Use isolated fixtures for mutation tests, not live games.

Update the living plan and progress journal with delivered behavior, actual checks and remaining limitations. Record accepted architectural direction changes in an ADR; update the UI catalog only when shared presentation contracts change. Revise this skill when real use reveals an enduring rule or an agreed rule changes—not for every new field or API. Keep detailed inventories in maintained docs. Skill maintenance happens during relevant work, not automatically in the background.
