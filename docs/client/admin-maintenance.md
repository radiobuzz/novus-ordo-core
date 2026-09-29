# Administration maintenance and logout

Implemented 2026-09-29.

Administration → Overview includes a small Maintenance panel for administrators, including when there are no games. It contains:

- **Reset all worlds:** reads a current preview, confirms the global deletion scope and counts, then deletes all games, saved maps and database-authored policy/resource templates. Accounts, admin access, homepage/site data, migration history and source assets remain. It uses a temporary maintenance interval and restores access in `finally` on success or handled failure. No migrations, shell commands or permission changes are executed.
- **Clean leftover turn-status files:** removes only strictly named `public/var/turn-status/game-N.json` files whose game no longer exists. It does not remove live-game hints or unrelated files. Failed filenames are shown; filesystem permissions remain an operator responsibility.

The admin header also includes **Sign out**, using the existing logout route. The controller now declares `RedirectResponse`, fixing the logged TypeError/500 when redirecting to the entry page. Session invalidation and CSRF-token regeneration remain unchanged.

## Implementation

`WorldResetService` is shared by the UI and `game:reset-worlds`. It retains the database-scoped foreign-key domain discovery and existing per-game lifecycle cleanup. A preview token incorporates domain counts, game revisions and root row identities; stale confirmation returns 409. The existing game-creation lock serializes creation and reset. Game deletion retains per-game command/turn locks. There is no automatic retry or new background job.

The three maintenance endpoints are authenticated, development-environment restricted and explicitly administrator-only. POSTs retain ordinary web CSRF middleware. Reset requires the matching preview token and confirmation value.

The admin feature uses existing Panel, Button, ConfirmDialog, Scope and AdminService. The server owns deletion and cleanup. Successful reset refreshes the game directory and retires the selected view. Accepted-but-refresh-failed and uncertain results explicitly direct the user to refresh rather than repeat the mutation.

A reset can be partially completed if a later deletion fails; this is a destructive development operation, not a backup or an all-games undo transaction. File-cleanup failures are reported separately after database reset. CLI reset still requires maintenance mode and does not bring an operator-maintained application up. The HTTP path restores only maintenance mode it entered. A killed PHP process cannot execute `finally`; if that happens, inspect reset status on the server before using `php8.3 artisan up`.

## Verification

- 14 isolated database/filesystem checks: read-only preview; stale confirmation; live versus orphan hint cleanup; injected deletion failure and restored access; complete domain deletion; preserved accounts, homepage and migrations; pre-existing maintenance ownership; shared CLI path.
- Three Chromium fixture journeys: cancellation and explicit global confirmation, refreshed empty-game state/narrow layout/logout link, cleanup failure feedback, and no automatic retry of an uncertain reset.
- Real PHP/Chromium HTTP journey: admin reset, CSRF rejection, successful logout redirect, cleared session, unauthenticated rejection and non-admin rejection of all maintenance endpoints.
- Production build, PHP syntax and client contract checks passed.

All destructive checks used the disposable test database and temporary public/storage directories. No live reset, filesystem permission changes, or server maintenance operation was performed.
