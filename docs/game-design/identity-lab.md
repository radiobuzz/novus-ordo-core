# Identity Lab — Flag Editor

Date: 2026-09-23. Implemented standalone development experiment at `/dev-panel/identity-lab`, linked from Tools & experiments. The user approved the six-composition proof and expansion to the full Flag Editor. They liked the flags but found detailed editing tedious; the delivered workflow prioritizes independent randomizers, visual patterns and direct dragging.

Flag Editor is enabled. Emblem Editor and Coat of Arms Editor remain disabled, including when a URL requests another tab. Flag symbol overlays do not activate either deferred editor. [Heraldry research](identity-lab-heraldry-research.md) remains available for later. The user expects nation creation to be a likely next consumer; no nation/game data, upload, migration or gameplay integration is included here.

## Using the experiment

Choose one of 15 visual starting recipes spanning 12 pattern families, or use **Randomize shapes**, **Randomize colours** and **Randomize emblem** independently. The first preserves the palette and existing emblem layers, the second changes only palette slots, and the third preserves the background geometry and palette. Undo/redo keeps 40 edits; a complete drag is one edit. Literal layer colours stay literal when a palette changes.

Colour randomization generates monochromatic, analogous, complementary or split-complementary harmonies, varying hue, saturation and lightness. Dark primary, lighter secondary and a tinted pale supporting colour separate tones; the generated primary/secondary and primary/supporting pairs have at least 3:1 relative luminance contrast. This is a palette heuristic, not a guarantee about every touching region, custom colour or emblem. There is no colour-wheel component, network service or dependency. The three resulting swatches remain editable. The initial teal/gold/ivory palette is simply a starting point.

Drag visible shapes on the flag, or use arrow keys on the focused preview (Shift: 10 units). Advanced provides layer selection, exact positions, dimensions, scale, rotation, palette/literal colours, mirroring, visibility, duplication, removal and ordering. Add rectangles, ellipses, triangles, diamonds, chevrons and crescents. Symbols also support row/ring repetition. Symbol selection uses its bounding box; detailed geometry can be selected with the layer menu.

Fourteen original bundled symbols cover star, sun, crescent, disc, diamond, cross, lightning, mountain, tree, tower, anchor, wheat, bird and fleur-de-lis. Select a symbol, choose its colour, or import a supported local SVG. The visual catalog shares the editor bundle; no individual SVG files or icon fonts load.

Six alternatives use a repeatable seed with independent locks for colours, shapes and emblem/placement. Keep-colours and keep-emblem default on. New unlocked emblems choose among several anchors and colour slots using contrast samples of underlying geometry. Existing emblems retain their placement. Locked designs can still have poor contrast after other choices change; manual refinement remains available. Locking everything deliberately produces identical alternatives.

Save up to eight studies in this browser or export PNG and JSON. Download both for an archive: PNG preserves the finished appearance; JSON restores editable data. Browser storage is local to the page origin and can be cleared by browser settings. Nothing is automatically assigned to a nation.

## Source ownership and format

| Source | Owns |
| --- | --- |
| `resources/js/identity-lab/recipe.js` | Strict resolved recipe validation, bounds, v1 compatibility and explicit v2 copies |
| `templates.js`, `generator.js`, `palettes.js` | Starting geometry, deterministic alternatives and colour harmonies |
| `catalog.js`, `import-symbol.js` | Bundled artwork and normalization of constrained local SVG |
| `renderer.js` | Canvas composition, transformed hit testing, immutable JSON/PNG compilation |
| `storage.js` | IndexedDB shelf and atomic record writes |
| `main.js`, `strings.js`, `identity-lab.scss` | Feature-local UI, EN/FR and shared semantic styling |

The shell composes existing Button, Panel, FieldShell, RangeField, native controls and Scope. It adds no shared widget or framework. The route uses the same guest-accessible, development-only guard as Portrait Lab. Vite builds a separate entry; the ordinary client does not import the flag engine. The engine has no server or nation dependency and can be assessed for reuse when integration is separately requested.

Current recipes use `schemaVersion: 2`, `rendererVersion: "flag-canvas-v2"`, `assetLibrary: "flag-geometry-v1"`, kind `flag`, resolved palette, fixed 900 × 600 flag, ordered layers and embedded `customAssets`. Roles distinguish geometry and emblem layers for independent randomization. JSON stores the chosen result, not instructions to rerun generation. Native geometry uses Canvas paths; bundled/imported symbols use data-only paths and transforms. Export is an opaque 3:2 PNG; selection borders are DOM overlays and never enter output.

The earlier proof's schema/renderer v1 still validates and renders unchanged. Simple edits preserve its version. Operations requiring roles or custom symbols create a v2 copy, detach it from any saved original, and display a notice. An unsupported saved recipe disables editing but retains its stored PNG for viewing/download. Stored PNGs are never regenerated merely because the page reloads.

`novus.identity-lab.v1` / `studies` stores `{id, recipe, png, revision, createdAt, updatedAt}`. A save compiles one immutable snapshot, then writes recipe and image together in one transaction. The eight-record limit is checked within that transaction. Render/write failures preserve the old record. Newer editor changes stay visibly unsaved if an earlier save finishes. Imports are fenced against newer edits/selections. Scopes own listeners, object URLs and database cleanup.

## SVG subset and limits

The importer parses XML without mounting markup and normalizes paths, unrounded rectangles, circles, ellipses, polygons, polylines, lines and groups. It accepts bounded matrix/translate/scale/rotate/skew transforms, a finite viewBox, inherited fill/stroke and nonzero/evenodd fill rules. All painted parts become one editable colour; empty regions and holes remain transparent. Symbol aspect ratio is preserved inside its layer dimensions.

Unsupported constructs are rejected rather than fetched or mounted: scripts/events, external resources, raster images, fonts/text, CSS/styles, gradients, masks/clipping, defs/use/references, nested SVG roots, rounded rectangles, partial opacity and nondefault stroke caps/joins. Default SVG miter limit is retained. This intentionally narrow first importer is not a general SVG renderer; simplify artwork to paths before importing.

- JSON: 500,000 UTF-8 bytes; 64 layers; 8 custom symbols.
- SVG: 100,000 UTF-8 bytes; 150 descendant elements; 100 normalized paths per symbol.
- Paths: 50,000 characters total per symbol, bounded coordinates and matrix components.
- Geometry: finite bounded positions, dimensions, scale and rotation; polygons have 3–64 points.

Rejected files keep the current draft and show a localized explanation. Custom normalized artwork travels inside JSON, so no original file or remote URL is needed after import.

## References and provenance

[Dan Carter's ProcGen Fun 8: Fun with flags](https://codingblog.carterdan.net/2026/05/26/PGF-08/) supplied the conceptual reference: layered patterns, contrast, variable composition and pattern-dependent symbols. Its generator is C#. The linked [post-08 source](https://github.com/djcarter85/ProcGenFun/tree/post-08) and reuse terms could not be retrieved during this implementation. No source from that project was copied or ported. `templates.js` contains original JavaScript geometry; `catalog.js` contains original small vector drawings. There are no third-party artwork files/notices for users to manage in this delivery. Armoria, fonts and larger collections remain in the separate research notes.

## Evaluation

The six initial compositions were shown with full-size/48 × 32 previews and solid-primary comparison. The user approved continuing and then requested easier editing, separate randomizers and algorithmic matching colours. The full editor implements that feedback. The user has not yet evaluated the final expanded UI; attractive output and low friction remain subjective review points.

Focused checks cover strict recipes, all templates, deterministic independent randomizers/locks, 1,000 distinct generated palettes with tone separation, v1 compatibility, exact same-browser PNG/JSON restoration, drag/keyboard undo, safe SVG holes, failed/stale imports and saves, local reloads and disabled tabs. EN/FR narrow layout and requests remain bounded to the local application. Coverage is Chromium plus pure Node/PHP contracts, not a cross-browser pixel identity claim or physical-device performance claim.

The isolated proof also passed the nine existing Portrait Lab browser scenarios. Generated-source/PHP contracts and production build pass. Final measurements and test counts are recorded in the progress journal. Current limitations include heuristic composition/contrast, a deliberately small symbol collection, the constrained SVG subset and local-only storage. Nation creation adoption needs its own integration plan, including persistent image/recipe ownership, storage/upload policy and existing flags.
