# ADR 0022 — Administration game activation and deletion

Status: Accepted and implemented

Date: 2026-09-25

The user approved Activate, Deactivate and Delete controls for the selected administration game, including confirmation before permanent deletion.

Overview composes the existing Button and ConfirmDialog controls. Confirmation names the game and consequences. Deactivation retains all data but removes the game from play/join access and prevents further turns or AI commands. Activation resumes its existing turn, readiness and deadline; it does not reset progress or change other games. An expired deadline can be processed on the next scheduled check. Deletion is available for active and inactive games and explicitly states that it cannot be undone.

`POST /client/admin/api/games/{game}/lifecycle` stays within the existing authenticated, development-only administration boundary. It accepts an explicit action and the existing game context revision. `AdminGameService` uses `GameMutation` and its row lock, rejects stale confirmations, rotates human and AI context on activity changes, and preserves AI readiness, memory and pause settings. Nation creation finalization now takes the same game lock and rechecks activity; interrupted pending identity remains recoverable.

Deletion first removes the target game's territory snapshots because their nation-ownership FK is restrictive. The remaining game data cascades within that same transaction, including AI and diplomacy. Global accounts, saved map-library entries and other games remain. Game-scoped cache records expire. Only after commit are known generated identity uploads and the game's turn-status file removed; an image still referenced elsewhere is retained. File-removal failure is logged and reported separately from the successful database deletion. No foreign-key checks are disabled.

The admin reloads the game directory after a confirmed action, selects an available game after deletion, or shows the creation screen if none remain. A successful write followed by a failed directory read is reported as such, and old controls are retired until Refresh status. Unknown command outcomes are never automatically retried. No new schema, generic store, permissions system or UI framework was needed.

Verification used only the guarded temporary database: independent-process confirmation races, stale AI/context rejection, cascade rollback after an injected failure, image/status cleanup, preserved global/other-game data, interrupted nation creation and authenticated Chromium HTTP/UI failure recovery. Administration remains English-first; physical devices and non-Chromium behavior were not checked.
