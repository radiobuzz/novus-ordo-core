# ADR 0020: primitive diplomacy and private nation conversations

Date: 2026-09-25. Status: implemented for new games; user approved the implementation plan and both alliance edge rules.

## Decision

Keep `NationContext`, Eloquent turn snapshots, `NationCommands`, the existing combat engine and the separate AI adapter. Add narrow `DiplomacyService`, `NationCommunicationService` and `NationGrantService` operations. Ordered nation pairs own one private conversation; offer definitions are immutable, and offer/relationship state is copied per turn. Human text survives rollback, while reverted action notices are labelled and removed-turn offers disappear.

Serialize player writes, turn resolution and AI application through `GameMutation`: one game cache lock and transaction, backed by a game row lock for a cache lease that expires during a long operation. Nested operations reuse ownership. Publish ready hints after outer commit. Rotate a durable game context UUID on turn activation/reset; require it on human commands in diplomacy-enabled games, including rollback to a previously seen turn number. Existing games stay opted out when the migration runs.

Use bilateral permissions. NoRelations permits deliberate attacks and starts War on actual combat. Intent records the target's owner (including neutral) so a changed-owner collision does not declare war. Peace forbids attacks; Allied also allows passage and eligible shared defence. Protection against the attacker makes visiting forces sit out. Attacks remain separate: the first allied conqueror owns the territory. Cancellation lasts five turns, resolved after the last protected battle phase and before the next planning turn. Return foreign troops to suitable own territory; disband with notice when none exists. Record actual battle participants for report access.

Only Capital/Food/Material/Ore/Oil are grantable. Reserve queued expenses and upkeep from stored stock; exclude forecast output. Accept immediately in the same transaction as the offer state/notice, rechecking stock. Request keys deduplicate creation and accepted statuses deduplicate transfers. Preserve the existing economy's sub-precision remainder without changing its storage model.

The selected `GameInstance` owns one `DiplomacyService.js`, its read-only store and scope. The world owner retains budgets and relationship permissions; the existing identity owner supplies names. The human command lane handles offers/messages, reconciles both world and communication reads, and never retries automatically. Incoming action-message markers trigger an existing world-owner activity refresh for the receiving player; text alone does not. Conversation drafts and uncertain request keys survive feature navigation. Dispose private data on incompatible scope/session loss. Poll every 20 seconds, plus focus/reconnection refresh; no WebSockets or presence.

AI plans expose private pending peace offers and a bounded 50-message history for that nation's own conversations. The normal runner accepts peace actions plus up to five `send_message` actions per turn, one per recipient, and executes them atomically through the same communication service. Message IDs let scripts remember what they handled without a separate read-state table. Player text is untrusted strategy input, never an authoritative command. The V1 script keeps its deterministic peace policy and does not author free text; custom scripts and the author-kit starter may reply. Alliances and grants remain unavailable for AI nations, and assigning an already allied nation to the initial V1 policy remains rejected.

## Verification and boundary

The [implementation plan](../../game-design/primitive-diplomacy-plan.md#release-handoff-and-current-evidence) lists isolated database, independent-process, HTTP, browser, migration/restore and client regression checks. These checks establish implementation behavior, not long campaign balance. The running game database was not migrated. Flag Editor embedding and Leon deployment remain separate stable-release work.
