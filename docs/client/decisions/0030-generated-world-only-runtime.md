# 0030 — Generated-world-only runtime

Status: Accepted and implemented

Date: 2026-09-27

## Context

Version 7.1 continues from the Version 7 Git checkpoint, but it does not need runtime compatibility with Version 7 games or its rectangular raster map. Keeping two map definitions, pickers, renderers, overlays, creation paths and URL surfaces made every map change carry an obsolete branch. Source history and compatible database backups remain the recovery mechanism for Version 7.

## Decision

- Every new game requires a validated immutable generated-map snapshot and a `game_maps` record. Administration creates games only from saved generated maps; server commissioning provisions the database and administrator but does not invent a default game.
- `MapViewport`, minimap, ownership comparison, homeland selection, military layouts and analysis overlays use one generated-world geometry, picker and renderer contract. The rectangular picker/renderer, raster layers and bundled fixed-map images are removed.
- The current client and administration are the only application interfaces. `/dashboard`, GET `/create-nation` and `/dev-panel` are removed rather than redirected. The nation-creation submission lives at `/client/setup/nation`; development laboratories retain their explicit `/dev-panel/...` routes.
- Requests must carry explicit game identity. `SelectedGame` no longer chooses the sole active game, and the model-level `Game::getCurrent*` compatibility helpers are removed.
- Vite cleans its output directory so deleted interface chunks cannot remain deployable. Historical plans and ADRs stay in Git as evidence, but their classic-map or fallback statements are superseded by this decision.

The persisted snapshot identifier `hex-beta-1` remains unchanged. It is a storage schema identifier, not a user-facing beta status, and renaming stored snapshots would add migration risk without improving the runtime model.

## Consequences

Version 7 databases containing games without generated geography are not compatible with the 7.1 runtime. Upgrade preparation therefore requires the existing source tag plus a compatible database backup, or creation of a fresh 7.1 generated world. The application fails explicitly when a selected game has no map row instead of silently drawing another interface.

There is now one camera, picking, ownership and overlay path to test. Generated terrain still uses Canvas 2D internally; this decision removes the old rectangular/raster map system, not the Canvas rendering technology.

## Verification boundary

Source contracts assert that retired URLs are absent, generated client definitions contain the new nation-setup path, and old renderer/assets are absent. Node tests use generated geography and generated picker fixtures. PHP integration fixtures create generated-map games only. A production build runs with normal Vite output cleanup.
