# 0023 — News ownership comparison

Date: 2026-09-25. Status: implemented.

## Decision

The news section in the turn briefing and Reports offers one **View on map** button in its heading, available after the first turn. Individual headlines have no map action. A native dialog starts fitted to the whole world and alternates every territory’s ownership at the previous and current turn boundaries simultaneously. It holds each state for 3.2 seconds, including an 800ms fade, until Pause or Done. Before/After controls stop autoplay; reduced motion starts manual and removes the fade. Each After phase adds diagonal hatching and an outline over changed land in its new owner’s colour, fading out over 1.2 seconds. Screen-sized stripes stay readable at world zoom; newly neutral land uses the interface text colour. Reduced-motion After shows static hatching. Pause cancels the burst. Text labels the turn and counts territories whose owners changed. Escape/Done restores opener focus, and incompatible game/turn/access changes close the dialog.

The comparison map has its own camera and models. Both frames use complete historical ownership; the user can still pan or zoom. The live world, minimap, selection and camera remain untouched. This avoids making historical state look like the current command context. A full turn-by-turn history player remains separate work.

The initial focused-territory presentation was revised at the user’s request: an unzoomed world view with simultaneous changes makes the overall turn easier to read.

## Boundaries

- `GameplayService.ownershipComparison()` owns a coalesced read of the existing public territory endpoint for both turns, scoped to the world's generation. Marker/revision checks before and after reads and a final generation check fence stale responses. One consumer closing does not cancel another consumer's service-owned read. Missing or malformed rows fail visibly rather than becoming neutral ownership. Returned frames contain immutable ownership values only.
- `app/OwnershipComparison.js` owns news intent, the modal, playback, visibility suspension, localization, retry and Scope cleanup. The existing Panel heading hosts the single news action. `ui/ReportEvent.js` renders headlines without interactive map actions.
- `ui/map/OwnershipMap.js` accepts geography and two territory frames. Two ownership canvases share one camera and crossfade, with a separate transparent canvas for changed-territory hatching; generated frames own separate mutable geometry models. `MapViewport` exposes optional draw notification and image readiness. Existing renderers/layers, assets, buttons and theme tokens are reused.

Actual retained turn snapshots determine owners, not battle participants. Multiple conquests within a turn can end with the original owner. Autoplay is disabled only when no territory changed owner between turn boundaries; changes elsewhere still play. The first turn has no comparison action. No backend endpoint, storage, migration, mutation or transport was introduced. Existing public-read consistency limits still apply; this is not a transactional history API.

## Verification

Focused Node checks cover coalescing, cancellation isolation, immutable frames, missing/wrong-turn records and generation/game fencing. Fixture Chromium covers classic/generated maps, visible ownership differences in distant areas, clipped nation-colour hatching and fade-out, initial fit-to-world framing, playback/manual controls, reduced motion, history retry, mobile French, both news consumers, turn changes, focus restoration, disposal and preserving live canvas/minimap identity and pixels. Broader results are recorded in the progress journal. Physical devices and other browsers remain unverified.
