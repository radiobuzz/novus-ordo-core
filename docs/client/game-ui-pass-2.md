# Game UI pass 2 — compact HUD and turn briefing

Date: 2026-09-20

Status: Implemented and verified in fixtures and isolated classic/beta games. Experimental new client only; no default-interface cutover. See [ADR 0011](decisions/0011-compact-game-hud.md).

## Accepted direction

Replace website-style in-game chrome with a compact status bar: small N, hamburger navigation/settings, turn, resource balances/reserves, readiness and News. Remove links to the classic interface from the game itself, not from unrelated entry/admin pages. Ready submits once without a confirmation; existing freshness/context/duplicate/uncertain-outcome protections remain.

The resource strip displays **net balance per turn** and **reserve held**. Clicking opens unabridged engine values: production, upkeep, order expenses, balance, reserve and available-for-command amount. `balances` already deducts both upkeep and order expenses. Stockpiles are not a second spendable allowance; `available_production` is the engine's command limit. RecruitmentPool is non-stockable and displays “No reserve”, not a fabricated stockpile. Missing values use an em dash. No resource mechanics change.

Map layers move into a compact header disclosure labelled with the active mode. All currently implemented optional geographic layers apply to every mode; this pass does not invent military/economic overlays. Modes still control interaction. Layer controls exist only while World is mounted. Minimap collapse hides its existing canvas, remembers a harmless game-scoped preference and makes space for the contextual panel without changing the main camera.

## Ownership and reusable pieces

- `ui/Disclosure.js`: native details/summary with optional mutually exclusive group, Escape focus return and outside-pointer dismissal. It accepts content and owns no reads or game rules. Shared chrome lives in `_foundations.scss`; header positioning remains shell-specific. Real consumers are menu, resources, readiness and layers.
- `ui/resourceVisuals.js`: lookup of existing bundled resource symbols, no new artwork or resource IDs.
- `app/GameHeader.js`: composes shared controls, consumes the confirmed owner bundle and sends Ready through GameplayService. Resource nodes/details update without replacing controls. Owner-scoped resource subscriptions are disposed on scope changes.
- `app/TurnBriefing.js`: native dismissible modal, triggered once per encountered turn. It defers while another dialog is open, restores focus, supports manual reopening and cancels obsolete detail reads. Only the last seen identity marker is saved, never reports or budgets; unavailable storage falls back to memory. A changed/expired scope clears private content. Summary data uses the same store as the header; detail reads belong to the service.
- `services/GameplayService.js`: scoped, generation-checked `briefing()` and `identities()` reads using existing endpoints. News uses only news, battle logs and identities, not rankings/victory requests. A detail failure leaves gameplay usable and offers read retry; it cannot retry a mutation. No new global store, framework or transport.

## Turn results and small backend addition

The existing private `/client/gameplay` response gains `turn_summary`, exported by `NationDetail::exportTurnSummary()` into the typed `NationTurnSummary` read model. It contains previous nation-turn number (nullable), population and owned-territory totals/differences, and completed deployment counts by existing type. Noncancelled preceding-turn deployments are executed by `Nation::onNextTurn`; cancelled soft-deleted requests are excluded. These are completed deployments, not a promise that every resulting unit survived combat.

Population difference includes gains/losses of territory; it is explicitly not labelled natural growth. A newly created nation has no previous comparison, not a zero change. Briefing shows completed deployments separately from the current affordable deployment maximums, which share a resource pool and update during the turn.

Battle records are queried with the **current result turn**, matching the engine's transition convention, not blindly `turn_number - 1`. Only participant logs are available. Results show territory and victory/defeat/no-victor with expandable existing logs. Public headlines reuse the existing text-safe token resolver. Server-authored markup remains literal text; it is not inserted as HTML. The future newspaper treatment, diplomacy/alliance/war indicators and richer event history are not implemented.

No schema, permissions, command endpoint, game-rule or classic-SPA changes. The durable rollback/reset revision and broader module/inspector migration from the shared-data plan remain open. A browser that misses a reset using the same turn number cannot detect it merely from the seen marker or local request generation.

## Verification and reproduction

Run `npm run build`, `npm run check:client`, `npm run test:client:php`, `npm run test:client`, and browser suites `hud.spec.js client.spec.js commands.spec.js live-data.spec.js entry.spec.js foundations.spec.js`.

`tests/client/hud.test.js` checks resource meanings/unknown values and report context/generation guards. `hud.spec.js` covers the new header interactions, one-click turn transition, report failure/retry/text safety, stable map/minimap identity and narrow French layout. Existing tests enter with the initial briefing already seen where they are testing other interactions.

For real backend checks, use only the isolated setup in the gameplay handoff: seed a fresh classic/beta fixture, then run `node tests/client/hud-browser.mjs` against the fixed localhost test host. It checks first-turn null baseline, deployment/cancellation, completed count, exact population delta, one-click advance, same map canvas and seen/minimap preference persistence. Do not run mutations against live games. Completed checks and remaining limitations are recorded in the progress journal.
