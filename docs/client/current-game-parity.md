# Current-game feature parity — experimental gameplay port

Status: Main gameplay loop ported into the new interface as a revisable experiment

Date: 2026-09-19

The new `/client` now includes nation/economy views, production bids, unit deployment/cancellation, movement/attack/disband/cancel orders, readiness/turn advancement, news, battle history, rankings and victory progress. Both classic map data and saved generated-map beta data are supported. Login/full creation remain at `/client/entry`. See [the gameplay experiment handoff](gameplay-experiment.md) for delivered behavior, safety checks, verification and explicit gaps. The matrix below retains the original migration boundaries as an audit checklist, not a claim that these features are still unimplemented.

| Area | Existing entry points/evidence | Migration boundary / work to verify |
| --- | --- | --- |
| Login/logout | `/login`, `/login-user`, `/logout` | Preserve existing auth first; return-to-client and session-expiry handling |
| Player/setup status | `/user`, `/user/nation-setup-status` | Current game/session context, no-nation/setup states |
| Initial game/bootstrap | `/game`; separate authenticated `/client` bootstrap | `/game` now named `ajax.get-game-info`; session data stays in private HTML, not generated assets |
| Turn/readiness | `/game/ready-status`, `/ready-for-next-turn` | Request turn number, current participants, upkeep transitions, poll policy, response identity |
| Victory/rankings | `/game/victory-status`, `/game/rankings` | Actual response shapes versus annotations, game-finished behavior |
| Territory/map data | `/territories`, `/territories/base-infos`, `/territories/base-infos/ref`, `/territories/turn-infos`, individual base/turn-info routes | Static versus turn-specific data, current map assets, cache identity, hidden/owner fields |
| Owned territories | `/nation/territories/turn-infos` | Ownership restrictions and reconciliation after turn changes |
| Nation details | `/nation`, `/nations/{nationId}`, dashboard bootstrap | Public route now named `ajax.get-public-nation-info`; inspector displays public nation identity. Full nation/leader/flag view remains later work |
| Nation creation/setup | `/client/entry`, authenticated `/client/setup`, multipart `/create-nation`; older two-stage `/nation` API | Full wizard bridges the existing form operation, with identity, leader, images and home selection verified against isolated data. Legacy form retained. The narrower API's signature mismatch remains outside this path. No post-creation editing contract assumed. |
| Current economy | `/nation/budget`, `/nation/production-bids` | Labor pools, production, stocks, upkeep, expenses, bids/priorities and response reconciliation; no old-economy mechanics |
| Divisions/orders | `/nation/divisions`, individual division, move/disband/cancel order routes | Nested request validation, permitted paths/actions, partial-failure/uncertain outcome handling |
| Deployments | Deployment list, territory deployments, deploy/cancel routes | Availability, resource effects, upkeep restrictions, duplicate-action guards |
| Battle logs | `/nation/battle-logs?turn_number=...` | Participant-only data, history, content format and safe display |
| Turn news | `/game/news` | Turn selection, visibility, returned content format |
| Asset information | `/assets/{encodedUri}` | Existing special encoding convention, access and errors; do not normalize encoding blindly |
| Administrative tools | `/dev-panel/*` | Remain legacy and restricted; never expose generated dev services through the player bundle |
| Diplomacy/forum | No module established in current-game inspection | Future work; not V1 parity, despite historical reference or mockup navigation |

## Expand each row before implementing it

- Current player journey and all actions, including keyboard/validation/error paths.
- Route name, verb, exact params/query/body, success envelope, empty responses, field errors, and session/upkeep/permission behavior.
- Data source: endpoint, static definition, or initial Blade data; whether the generated client actually covers it.
- Who may see/write each field and at which game stage.
- Game/turn identity, invalidation, concurrency, and retry policy.
- Test fixture, integration test, new feature/host destination, migration status, and verification evidence.

The initial matrix is not exhaustive merely because routes were enumerated. Phase 0 must compare against the actual current UI so convenience actions and multi-step flows are not lost.
