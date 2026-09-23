# Generated-map beta

Status: implemented experiment. The structure, format and choices below describe this beta, not a fixed future plan. They can change as we test.

## Try it

In a development environment, sign in as an administrator and open `/client/map-generation`. The new interface has a **New game map** link; the development panel also links to the generator. The laboratory's **Use these settings for a game (beta)** link carries its applied settings into the generator.

Tune the existing seed, continents, land target, coastal detail, island/lake abundance, polar extent, snowline, mountains, scale and wetness controls. Generate and inspect the preview. Save named presets in this browser if useful. Changed controls must be regenerated before starting a game. The current beta uses the full 600-region world with 19 cells per region.

**Start new game with this map** explicitly confirms replacing the active game. The previous game's saved data is retained. No game is started by opening the preview or changing its settings. Starting saves the exact sampled geography as well as its seed, settings and generator version. Future generator changes do not silently regenerate an existing game.

The generated geography appears in the new `/client` world and `/client/entry` homeland selector. The classic SPA is not adapted; links to its fixed-map view are hidden in the new world's shell for beta games. Games with the old map still use the existing rectangular renderer.

## Current experimental boundary

- One region remains one game territory. Every region with a dry cell counts as land, including tiny islands.
- Terrain/resource enums, production formulas, population rules, stocks, division movement budgets, combat and territory-count victory rules are unchanged. A region receives a dominant existing terrain category and its dry-cell land fraction. This can change resource distribution; it is not a new resource simulation.
- Ground connections join the largest connected land component in each neighbouring region. Detached islands still belong to their region and contribute land, but are not independent army positions. Ocean shoreline supplies sea access; lakes do not.
- Existing movement behavior, including the engine's coastal shortcut and permissive final adjacent step, remains. Weighted microcell movement, travel progress, cell occupation and cell economies are deferred.
- Homeland choices exclude free connected groups smaller than the existing required five territories. The server rejects a new map with no possible starting group and revalidates territory selection when a nation is founded.
- Existing fixed initial population and two-decimal land-ratio storage remain. Small regions can expose existing population/balance assumptions; these are testing topics, not silently redesigned economics.
- Military/economy command screens in the new client remain separate work. Demo formations, simulated oil/food and naval experiments are not live-game features.

## Implementation

The shared generator, geometry, hydrology, terrain artwork rendering and snapshot codec live in `resources/js/map/`. The lab layers its optional simulation over this code through thin compatibility modules. The production viewer does not import the demo's military/economy simulation. World and homeland use the same `HexMapPicker` and `HexMapRenderer`, with caller-owned selection and overlays.

The browser submits an administrator-authored, bounded `hex-beta-1` snapshot. PHP validates the 11,400 unique cell coordinates against the expected region geometry, field types, settings and segment bounds; it derives legacy terrain, usable area, ocean access and reciprocal connections itself. It does not accept client-supplied territory IDs, ownership or connection lists.

`GeneratedMapData` bridges into the existing `MapData`/`TerritoryData` objects. A `game_maps` row holds each beta game's immutable snapshot and fingerprint. Game creation is protected by the existing lock and a transaction; a stale previous-game ID cannot silently start a second game. Legacy game creation remains supported without a map row.

`GET /game/map?game_id=…` returns the active game's snapshot or `map: null` for an old map, rejecting a different game ID. The world service caches geography by game and keeps turn-specific ownership separate. Each world mount rebuilds its ownership projection so overview caches cannot retain the previous turn's colours. Database territory identity is mapped by region column/row, not array position or axial coordinates.

The experimental generator is administrator-only, authenticated, CSRF-protected and development-only. It uses the new client build. No Node process is required by the PHP game server.

## Verification

`tests/client/map-beta.test.js` covers unchanged geography relative to the lab, snapshot round trips, absence of demo state, identity/ownership mapping, tiny-island homeland filtering and per-game snapshot caching.

For real persistence and HTTP checks, use the explicit temporary MariaDB setup described in `docs/client/entry-experience-handoff.md`, never the active database:

```
node tests/client/map-beta-fixture.mjs | NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-XXXXXX php8.3 tests/client/map-beta-integration.php
NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-XXXXXX php8.3 -S 127.0.0.1:8792 tests/client/map-beta-server.php
node tests/client/map-beta-browser.mjs
NO7_ENTRY_TEST_ROOT=/tmp/no7-entry-db-XXXXXX php8.3 tests/client/map-beta-turn.php
```

The integration helper requires a fresh isolated fixture. It verifies exact persistence, all default-map land including tiny islands, reciprocal connections, previous-game preservation, stale-start rejection and injected rollback. The browser journey covers parameter regeneration/presets, access and CSRF guards, saving the preview, world picking/reload, homeland selection, nation creation and live ownership. Normal lab/new-client regressions remain applicable.

Verified on 2026-09-19: production build, generated endpoint check, PHP syntax/contracts, existing Node suites and new map checks, 30 distinct browser regression journeys, the complete isolated beta HTTP journey, and one real turn with a test nation. The turn preserved the map fingerprint and produced all 600 territory records. Screenshots of the new world and homeland selector were inspected; a false loading banner found during visual review was corrected and the final zoom/fit controls and clear loading notice were rechecked. Temporary test services were stopped after verification.

Schema addition: `0001_01_01_000026_create_game_maps_table.php`. Install it before serving the new map endpoint. This migration only adds map storage; it does not regenerate or replace the active game.
