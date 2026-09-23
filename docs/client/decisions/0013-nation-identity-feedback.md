# ADR 0013 — Nation identity, map feedback and existing production

Status: Accepted; post-setup editing superseded 2026-09-23

Date: 2026-09-20

Superseding follow-up: nation colours are now selected only during nation creation. The catalogue, transactional reservation and confirmed presentation remain; the post-setup editor and mutation endpoint were removed.

## Decision

The approved polish pass distinguishes persistent national identity from browser-local presentation. Maintain a backend catalogue of 24 chromatic colours: one unique primary per nation within a game, reusable secondary. Reserve defaults transactionally during nation creation and backfill existing nations. Use the existing authenticated, context-fenced command/reconciliation path for changes; do not store authoritative nation colours in localStorage.

Compose a themed native-radio palette with local preview and explicit save. Use confirmed identity for strong exterior national bands and restrained unit markings, while preserving terrain, internal territory boundaries and river visibility. Remove the private sidebar palette; keep the miniature/flat display preference in the menu.

Centralize authored vector action/resource symbols and slightly larger typography in the UI foundations. Add optional browser-local sound through a small lifecycle-owned service; silent by default, independently switchable categories, remembered volume and no sound replay on ordinary refresh. Reuse existing fields for settings.

Expose the current production-bid system from Economic map mode using a persistent feature composition shared with Economy. Do not change resource semantics, allocation formulas, prices or game mechanics.

## Consequences

This is a narrow approved storage addition, not a new permissions system, state framework or general backend revision scheme. The database constraint and game-row locking protect colour reservations; they do not establish server-wide command concurrency guarantees. Twenty-four reserved primaries impose a capacity limit, including unfinished nations. Nation colours are not rolled back with turns.

Palette controls emit intent and do not fetch or enforce game rules. Confirmed values remain in GameDataService; command drafts and optional sound/display preferences remain separate. The main map stays mounted during identity/production updates; remaining dedicated-module remounts are documented rather than hidden.

Visual treatments, colour selections and sound synthesis remain experiments. See [pass 4](../game-ui-pass-4.md) for implementation, migration, verification and limitations.
