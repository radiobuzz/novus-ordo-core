# 0025 — Primitive Guard orders

Date: 2026-09-26. Status: implemented; migration requires operator application.

## Decision

Add an optional `guard_enabled` rule per game. Existing games default to disabled and can be changed directly in the database while they are running. Newly created games enable Guard. There is deliberately no administration toggle.

An active idle division standing in territory owned by its nation can receive a persistent Guard order. Guard reserves 25% of that division type's ordinary extra attack costs each turn: infantry and artillery therefore cost nothing extra, while armored and air units currently reserve 0.25 Oil. When a Guard unit is selected to respond, it must pay the remaining 75% from the nation's settled stockpile before relocating, bringing its total operation cost for that turn to 100%. An unaffordable unit stays in place and the allocator continues looking for another reachable, affordable Guard. A Guard order is operating and cannot be replaced by movement. Releasing it creates a non-cancellable Stand Down order for the remainder of the current turn; the division is free again next turn. Disband remains available as an explicit terminal replacement.

Guard assignment is idempotent for a mixed selection: divisions already on Guard are returned unchanged, receive no second readiness charge and do not prevent idle selected divisions from entering Guard. Any selected division with another order still rejects the complete batch before mutation.

After ordinary movement and before randomized attack resolution, the engine examines every attack group. It calculates each owned target's deficit against the strongest incoming group, then assigns reachable Guard units to the largest deficit first. It sends only enough defense to meet that projected attacking power. Each Guard division relocates at most once in the turn. Ground units follow connected owned land within their normal range and do not use the global coastal transport shortcut; aircraft may cross water but must finish in owned territory. Responders become ordinary stationary defenders at the destination and can participate in later sequential battles there. Surviving ground responders remain on Guard at the battle location. Surviving aircraft return after the complete combat phase to their original base, or to the nearest owned territory if that base was captured; they disband with a news notice only if their nation owns no territory.

This preallocation prevents many one-unit attacks from repeatedly drawing the same reserve while preserving the existing randomized, sequential combat system. Combat is not made simultaneous. The first resolved battle receives the Guard response note; subsequent attackers encounter the surviving divisions already standing there.

Only the territory owner's Guard force responds in this first version. AI scripts do not issue Guard orders. Allied guard sharing, queued multi-turn orders and player-defined priorities are deferred.

## Data and client boundary

The additive migration adds `games.guard_enabled`, default false. It adds no order table or historical snapshot column: `Guard` and `StandDown` are new values in the existing order type field, and normal turn-scoped order history records them. The current game DTO exposes the flag. World and the dedicated Military screen show the Guard action only when it is enabled; pending Guard orders use Release wording and Standing Down has no cancellation control. The flag itself has no UI.

After applying migrations, an operator can enable any selected game other than the protected game 10 with an explicit ID:

```sql
UPDATE games SET guard_enabled = 1 WHERE id = <game_id> AND id <> 10;
```

Setting the value to `0` immediately stops further Guard responses and prevents Guard renewal into the next turn. Existing orders still contribute their already-reserved current-turn cost until resolution.

## Evidence and limits

Focused isolated MariaDB tests cover the quarter-cost reservation, response top-up, refusal without fuel, affordable fallback selection, owned/idle validation, release and mandatory Stand Down, persistence, runtime disable, largest-deficit allocation independent of attack shuffle, one-time relocation, aircraft return after combat, captured-base fallback, ground responders holding position, the ground coastal restriction and a bounded allocator query count. The existing diplomacy combat suite passes unchanged, including ordinary sequential battles, accidental combat, allied defense, treaty expiry, rollback and victory. Focused client projection/pending-order tests and five Chromium command scenarios pass, including flag-gated visibility, confirmation and the submitted division/context payload. Generated API checks, PHP syntax and the production build pass.

The allocator batches division details, orders, owners and static topology for the turn; route results are memoized inside one allocation. Diplomacy/participant checks remain authoritative per threatened group. No performance claim is made for future allied Guard sharing or player-authored priority policies.
